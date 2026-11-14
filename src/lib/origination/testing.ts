/**
 * Test fixtures for the origination modules. Imported only by `*.test.ts`.
 *
 * The keys are generated per run; nothing here is a real operator. The wallet
 * port signs with a viem local account, which hashes EIP-712 typed data and
 * EIP-191 messages exactly as an EOA wallet does.
 */
import {
  boxPublicKey,
  encodeKeyBindingSignature,
  keyFingerprint,
  PILOT_QUOTE_PROVIDER_ID,
  QUOTE_DIRECTION_CMM,
  quoteId,
  renderKeyBindingStatement,
  toBase64,
  type ExecutableQuoteV1,
  type KeyBindingWire,
} from '@sawaswap/crypto'
import { ScnRequestError, type LookupResult } from '@sawaswap/scn-client'
import type { Address, Hex } from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import type { ChainPort, OriginationDeps, ScnPort, WalletPort } from './flow'
import { localCheckpointStore, type AnchorSet } from './keyBinding'
import { memoryOriginationStore } from './record'
import { encodeQuoteRecord, type AuthorisedQuoteRecord } from './quoteRecord'

export const CHAIN_ID = 84532
export const SETTLEMENT = '0x9645827808E25b4e19B1B8A05B075606dfF86331' as Address
export const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address
/** 2026-11-14T00:00:00Z. */
export const NOW_SECONDS = 1_794_614_400

const key = (byte: number): Hex => `0x${byte.toString(16).padStart(2, '0').repeat(32)}`

export interface TestOperator {
  account: PrivateKeyAccount
  address: Address
  box: { secretKey: Uint8Array; publicKey: Uint8Array }
}

export function operator(byte: number): TestOperator {
  const account = privateKeyToAccount(key(byte))
  const secretKey = new Uint8Array(32).fill(byte + 1)
  return {
    account,
    address: account.address,
    box: { secretKey, publicKey: boxPublicKey(secretKey) },
  }
}

export const RELAY = operator(0x11)
export const BRIDGE = operator(0x22)
export const ORIGINATOR = operator(0x33)
export const SCA = operator(0x44)

export async function signedBinding(
  op: TestOperator,
  overrides: {
    sequence?: bigint
    issuedAt?: number
    chainId?: bigint
    settlement?: string
    publicKey?: Uint8Array
  } = {},
): Promise<KeyBindingWire> {
  const statement = renderKeyBindingStatement({
    operator: op.address.toLowerCase() as `0x${string}`,
    x25519PublicKey: overrides.publicKey ?? op.box.publicKey,
    chainId: overrides.chainId ?? BigInt(CHAIN_ID),
    settlement: (overrides.settlement ?? SETTLEMENT).toLowerCase() as `0x${string}`,
    sequence: overrides.sequence ?? 1n,
    issuedAt: overrides.issuedAt ?? NOW_SECONDS - 3600,
  })
  const signature = encodeKeyBindingSignature(await op.account.signMessage({ message: statement }))
  return { statement, signature }
}

export async function lookupEntry(
  op: TestOperator,
  binding?: KeyBindingWire | null,
  publicKey: Uint8Array = op.box.publicKey,
): Promise<LookupResult> {
  const keyBinding = binding === null ? undefined : (binding ?? (await signedBinding(op)))
  return {
    address: op.address.toLowerCase() as Address,
    registered: true,
    encPubKey: toBase64(publicKey),
    ...(keyBinding === undefined ? {} : { keyBinding }),
  }
}

export function anchorsFor(
  ...entries: { op: TestOperator; role: 'BRIDGE' | 'RELAY'; sequence?: bigint }[]
): AnchorSet {
  return {
    anchors: entries.map(({ op, role, sequence }) => ({
      chainId: BigInt(CHAIN_ID),
      settlement: SETTLEMENT,
      role,
      operator: op.address,
      sequence: sequence ?? 1n,
      fingerprint: keyFingerprint(op.box.publicKey),
    })),
  }
}

/** The Kinshasa pilot quote shape: 1:1 reference, 10 bps margin, valid one hour. */
export function kinshasaQuote(overrides: Partial<ExecutableQuoteV1> = {}): ExecutableQuoteV1 {
  return {
    direction: QUOTE_DIRECTION_CMM,
    sourceExecutionContext: 'crypto:base-sepolia/USDC',
    destinationExecutionContext: 'momo:+243/vodacom/USD',
    inputAsset: { rail: 'crypto', tokenAddress: USDC },
    outputAsset: { rail: 'momo', momoCurrency: 'USD' },
    inputDecimals: 6,
    outputDecimals: 2,
    minInputAmount: 1_000_000n,
    maxInputAmount: 1_000_000_000n,
    rateNumerator: 99_900_000n,
    rateDenominator: 100_000_000n,
    inputFee: 0n,
    outputFee: 0n,
    quotedAt: BigInt(NOW_SECONDS - 60),
    expiresAt: BigInt(NOW_SECONDS - 60 + 3600),
    quoteProviderId: PILOT_QUOTE_PROVIDER_ID,
    ...overrides,
  }
}

export function quoteRecord(overrides: Partial<ExecutableQuoteV1> = {}): AuthorisedQuoteRecord {
  const quote = kinshasaQuote(overrides)
  return {
    quote,
    quoteId: quoteId(quote),
    bridge: { address: BRIDGE.address, momoEndpoint: '+243820000000' },
    relay: { address: RELAY.address },
  }
}

export const quoteRecordText = (record: AuthorisedQuoteRecord = quoteRecord()): string =>
  JSON.stringify(encodeQuoteRecord(record))

/* -------------------------------------------------------------------------- */
/* Ports                                                                       */
/* -------------------------------------------------------------------------- */

export interface FakeScn extends ScnPort {
  lookup: Map<string, LookupResult>
  scaKeys: Map<string, string>
  intros: Map<string, { stid: string }>
  mailboxes: { preimage: Map<string, string>; payout: Map<string, string> }
  posts: string[]
  /** Throw this many TRANSPORT errors before each kind's next success. */
  failures: { preimage: number; payout: number; introduction: number }
}

export function fakeScn(): FakeScn {
  const scn: FakeScn = {
    lookup: new Map(),
    scaKeys: new Map(),
    intros: new Map(),
    mailboxes: { preimage: new Map(), payout: new Map() },
    posts: [],
    failures: { preimage: 0, payout: 0, introduction: 0 },
    async initiationRequest(request) {
      return {
        mode: 'LOOKUP',
        warnings: [],
        results: request.candidates.map(
          (candidate) =>
            scn.lookup.get(candidate.address.toLowerCase()) ?? {
              address: candidate.address,
              registered: false,
            },
        ),
      }
    },
    async fetchScaKey(ssid) {
      const encPubKey = scn.scaKeys.get(ssid)
      if (encPubKey === undefined) throw new ScnRequestError('NOT_YET_POSTED', 'no key', 404)
      return { ssid, encPubKey } as never
    },
    async fetchTransactionIntroduction(ssid) {
      const intro = scn.intros.get(ssid)
      if (intro === undefined) throw new ScnRequestError('NOT_YET_POSTED', 'empty', 404)
      return { ssid, intro } as never
    },
    async storePreimageCiphertext(stid, ciphertext) {
      return store('preimage', stid, ciphertext)
    },
    async storePayoutMaterial(stid, ciphertext) {
      return store('payout', stid, ciphertext)
    },
    async storeTransactionIntroduction(ssid, intro) {
      scn.posts.push(`introduction:${JSON.stringify(intro)}`)
      if (scn.failures.introduction > 0) {
        scn.failures.introduction -= 1
        throw new ScnRequestError('TRANSPORT', 'no answer', 0)
      }
      scn.intros.set(ssid, intro as { stid: string })
      return { ssid, intro, warnings: [] }
    },
  }
  async function store(kind: 'preimage' | 'payout', stid: string, ciphertext: string) {
    scn.posts.push(`${kind}:${ciphertext}`)
    if (scn.failures[kind] > 0) {
      scn.failures[kind] -= 1
      throw new ScnRequestError('TRANSPORT', 'no answer', 0)
    }
    const held = scn.mailboxes[kind].get(stid)
    if (held !== undefined && held !== ciphertext)
      throw new ScnRequestError('SLOT_OCCUPIED', 'occupied', 409)
    scn.mailboxes[kind].set(stid, ciphertext)
    return { kind, stid, outcome: held === undefined ? 'STORED' : 'IDEMPOTENT' } as never
  }
  return scn
}

export interface FakeChain extends ChainPort {
  transactions: Map<string, { state: number; momoLegHash: Hex; originator: Address; block: bigint }>
  block: bigint
}

export function fakeChain(): FakeChain {
  const chain: FakeChain = {
    chainId: CHAIN_ID,
    settlement: SETTLEMENT,
    tokenAddress: USDC,
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
    transactions: new Map(),
    block: 100n,
    blockNumber: async () => chain.block,
    transactionExists: async (stid) => chain.transactions.has(stid),
    transactionState: async (stid) => chain.transactions.get(stid)?.state ?? 0,
    findCommitted: async ({ originator, fromBlock, momoLegHash }) => {
      for (const [stid, tx] of chain.transactions) {
        if (
          tx.originator.toLowerCase() === originator.toLowerCase() &&
          tx.block >= fromBlock &&
          tx.momoLegHash === momoLegHash
        ) {
          return stid as Hex
        }
      }
      return undefined
    },
  }
  return chain
}

export interface FakeWallet extends WalletPort {
  commits: {
    beneficiary: Address
    eligibleClaimant: Address
    escrowAmount: bigint
    momoLegHash: Hex
  }[]
  approvals: bigint[]
  /** What the next `commitPoI` does. */
  nextCommit: 'mine' | 'reject' | 'revert' | 'lose-hash'
}

export function fakeWallet(
  chain: FakeChain,
  account: PrivateKeyAccount = ORIGINATOR.account,
): FakeWallet {
  const pending = new Map<Hex, Hex>()
  const wallet: FakeWallet = {
    address: account.address,
    commits: [],
    approvals: [],
    nextCommit: 'mine',
    signTypedData: (typedData) => account.signTypedData(typedData),
    ensureAllowance: async (amount) => void wallet.approvals.push(amount),
    commitPoI: async (args) => {
      if (wallet.nextCommit === 'reject') throw new Error('User rejected the request.')
      wallet.commits.push(args)
      const index = wallet.commits.length
      const hash = `0x${index.toString(16).padStart(64, 'c')}` as Hex
      const stid = `0x${index.toString(16).padStart(64, 'a')}` as Hex
      if (wallet.nextCommit !== 'revert') {
        chain.transactions.set(stid, {
          state: 0,
          momoLegHash: args.momoLegHash,
          originator: account.address,
          block: chain.block + 1n,
        })
      }
      pending.set(hash, wallet.nextCommit === 'revert' ? '0x' : stid)
      if (wallet.nextCommit === 'lose-hash') throw new Error('connection lost')
      return hash
    },
    waitForCommit: async (hash) => {
      const stid = pending.get(hash)
      return stid === undefined || stid === '0x' ? { reverted: true } : { stid }
    },
    isUserRejection: (error) => error instanceof Error && error.message.startsWith('User rejected'),
  }
  return wallet
}

export function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (k) => values.get(k) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (k) => void values.delete(k),
    setItem: (k, v) => void values.set(k, v),
  }
}

export interface Harness {
  deps: OriginationDeps
  scn: FakeScn
  chain: FakeChain
  wallet: FakeWallet
  storage: Storage
  clock: { now: number }
}

/** A registered pair, an SCA key for `SSID-1`, anchors for both, STRICT mode. */
export async function harness(): Promise<Harness> {
  const scn = fakeScn()
  scn.lookup.set(RELAY.address.toLowerCase(), await lookupEntry(RELAY))
  scn.lookup.set(BRIDGE.address.toLowerCase(), await lookupEntry(BRIDGE))
  scn.scaKeys.set('SSID-1', toBase64(SCA.box.publicKey))
  const chain = fakeChain()
  const wallet = fakeWallet(chain)
  const storage = memoryStorage()
  const clock = { now: NOW_SECONDS * 1000 }
  let counter = 0
  const deps: OriginationDeps = {
    chain,
    wallet,
    scn,
    store: memoryOriginationStore(),
    policy: {
      mode: 'STRICT',
      anchors: anchorsFor({ op: RELAY, role: 'RELAY' }, { op: BRIDGE, role: 'BRIDGE' }),
      checkpoints: localCheckpointStore(storage),
    },
    now: () => clock.now,
    random: (length) => {
      counter += 1
      return new Uint8Array(length).fill(counter)
    },
    sleep: async () => undefined,
  }
  return { deps, scn, chain, wallet, storage, clock }
}
