import {
  encodePublicFields,
  fromBase64,
  generateBoxKeypair,
  identityHash as computeIdentityHash,
  operationalHash,
  randomBoxNonce,
  sealPayoutMaterial,
  sealPreimageMaterial,
  toMailboxCiphertext,
  type KeyBindingCheckpoint,
} from '@sawaswap/crypto'
import { ScnRequestError, type ScnClient } from '@sawaswap/scn-client'
import { bytesToHex, hexToBytes, type Address, type Hex } from 'viem'
import { isForbiddenParty } from '@/lib/slots'
import { sealAndSignConsumerContext, type ConsumerContextTypedData } from './consumerContext'
import { OriginationRefusal, refuse } from './errors'
import { verifyOperatorKey, type KeyBindingPolicy } from './keyBinding'
import { buildMaterial, freshEntropy } from './material'
import {
  acceptQuote,
  assertCommittedPair,
  encodeQuoteRecord,
  messageOf,
  parseQuoteRecord,
  type AuthorisedQuoteRecord,
} from './quoteRecord'
import {
  decodeMaterial,
  encodeMaterial,
  isOpenPhase,
  type OriginationRecord,
  type OriginationStore,
} from './record'

/**
 * C01 origination, the Console's half of the five-step sequence (answers of
 * 2 November 2026, Q3), in three calls the screen makes one after another:
 *
 *   `prepareOrigination` — everything that can fail without spending gas;
 *   `commitOrigination`  — approve if needed, then `commitPoI`, and the STID;
 *   `deliverOrigination` — the preimage material to Relay, the payout
 *                          material to the Bridge, the Introduction to the SCA.
 *
 * Each call reads and writes the local record, so `resumeOrigination` can
 * continue any of them after a reload. The wallet, the chain and SCN come in
 * as ports, which is what lets the sequence be tested without any of them.
 */

export const TERMINAL_STATES = [4, 5] as const // Settled, Reversed

export interface ChainPort {
  chainId: number
  settlement: Address
  tokenAddress: Address
  tokenSymbol: string
  tokenDecimals: number
  blockNumber(): Promise<bigint>
  transactionExists(stid: Hex): Promise<boolean>
  transactionState(stid: Hex): Promise<number>
  /**
   * The STID of a `PoICommitted` by `originator` from `fromBlock` whose
   * committed `momoLegHash` is this one, if any.
   */
  findCommitted(input: {
    originator: Address
    fromBlock: bigint
    momoLegHash: Hex
  }): Promise<Hex | undefined>
}

export interface WalletPort {
  address: Address
  signTypedData(typedData: ConsumerContextTypedData): Promise<Hex>
  /** Approve the Settlement Contract for `amount` if the allowance is short. */
  ensureAllowance(amount: bigint): Promise<void>
  /** Submit `commitPoI` and return the transaction hash. */
  commitPoI(args: {
    beneficiary: Address
    eligibleClaimant: Address
    escrowAmount: bigint
    momoLegHash: Hex
  }): Promise<Hex>
  /** Wait for the receipt; the STID from its `PoICommitted` event, or `reverted`. */
  waitForCommit(hash: Hex): Promise<{ stid: Hex } | { reverted: true }>
  /** True when the error means the user declined in the wallet, so nothing was sent. */
  isUserRejection(error: unknown): boolean
}

export type ScnPort = Pick<
  ScnClient,
  | 'initiationRequest'
  | 'fetchScaKey'
  | 'fetchTransactionIntroduction'
  | 'storePreimageCiphertext'
  | 'storePayoutMaterial'
  | 'storeTransactionIntroduction'
>

export interface OriginationDeps {
  chain: ChainPort
  wallet: WalletPort
  scn: ScnPort
  store: OriginationStore
  policy: KeyBindingPolicy
  /** Unix milliseconds. */
  now(): number
  random(length: number): Uint8Array
  sleep(ms: number): Promise<void>
}

export interface OriginationInput {
  quoteRecordText: string
  ssid: string
  userCMomoEndpoint: string
  escrowAmount: bigint
  executionInstructions: string
}

const seconds = (deps: OriginationDeps): bigint => BigInt(Math.floor(deps.now() / 1000))

function logged(
  record: OriginationRecord,
  deps: OriginationDeps,
  event: string,
): OriginationRecord {
  const next = { ...record, log: [...record.log, { at: deps.now(), event }] }
  deps.store.put(next)
  return next
}

function scnFailure(cause: unknown, what: string): never {
  if (cause instanceof OriginationRefusal) throw cause
  if (
    cause instanceof ScnRequestError &&
    cause.code !== 'TRANSPORT' &&
    cause.code !== 'STORE_UNAVAILABLE'
  ) {
    return refuse('SCN_UNREACHABLE', `${what}: SCN answered ${cause.code} (${cause.message}).`)
  }
  return refuse('SCN_UNREACHABLE', `${what}: SCN did not answer (${messageOf(cause)}).`)
}

/* -------------------------------------------------------------------------- */
/* CR-CONSOLE-5                                                                */
/* -------------------------------------------------------------------------- */

/**
 * CR-CONSOLE-5: an SSID may not have a second transaction pending. Two sources:
 *
 *  - this Console's own open records for the SSID, which cover the minutes
 *    between its commit and its Introduction post;
 *  - the SSID's Introduction slot on SCN, which is single-slot and readable
 *    without being consumed: the STID it names must be terminal on chain.
 *    This is what catches a transaction another Console originated.
 *
 * An STID unknown to this Settlement Contract does not block (another
 * deployment's Introduction). The residual gap is another Console's
 * commit-to-Introduction interval.
 */
export async function assertSsidFree(ssid: string, deps: OriginationDeps): Promise<void> {
  const open = deps.store.list().find((record) => record.ssid === ssid && isOpenPhase(record.phase))
  if (open !== undefined) {
    refuse(
      'SSID_PENDING',
      `This Console has an unfinished origination for ${ssid} (${open.phase}). Finish it first.`,
    )
  }
  let stid: Hex
  try {
    stid = (await deps.scn.fetchTransactionIntroduction(ssid)).intro.stid as Hex
  } catch (cause) {
    if (cause instanceof ScnRequestError && cause.code === 'NOT_YET_POSTED') return
    if (cause instanceof ScnRequestError && cause.code === 'BAD_REQUEST') {
      return refuse('INVALID_INPUT', `${ssid} is not a valid SSID.`)
    }
    return scnFailure(cause, `Reading the Introduction slot of ${ssid}`)
  }
  if (!(await deps.chain.transactionExists(stid))) return
  const state = await deps.chain.transactionState(stid)
  if (!(TERMINAL_STATES as readonly number[]).includes(state)) {
    refuse(
      'SSID_PENDING',
      `${ssid} already has a pending transaction (${stid}). CR-CONSOLE-5 allows one at a time.`,
    )
  }
}

/* -------------------------------------------------------------------------- */
/* 1. Prepare — no gas                                                         */
/* -------------------------------------------------------------------------- */

export async function prepareOrigination(
  input: OriginationInput,
  deps: OriginationDeps,
): Promise<OriginationRecord> {
  const { chain, wallet, policy } = deps
  const ssid = input.ssid.trim()
  if (ssid.length === 0) refuse('INVALID_INPUT', 'The SSID is empty.')

  // §2.4c.3 steps 1–6, and the pair it selected.
  const record: AuthorisedQuoteRecord = parseQuoteRecord(input.quoteRecordText)
  const accepted = acceptQuote({
    record,
    escrowAmount: input.escrowAmount,
    escrow: {
      chainId: chain.chainId,
      tokenAddress: chain.tokenAddress,
      tokenSymbol: chain.tokenSymbol,
      tokenDecimals: chain.tokenDecimals,
    },
    now: seconds(deps),
  })
  const beneficiary = record.bridge.address
  const eligibleClaimant = record.relay.address
  assertCommittedPair({
    record,
    beneficiary,
    eligibleClaimant,
    consumerContextRelay: eligibleClaimant,
  })
  // KRAIT-001: escrow naming the Settlement Contract, the token or the zero
  // address as a party is locked for good.
  for (const party of [beneficiary, eligibleClaimant]) {
    if (isForbiddenParty(party, [chain.settlement, chain.tokenAddress])) {
      refuse(
        'INVALID_INPUT',
        `${party} cannot be a party: escrow naming it would be locked permanently.`,
      )
    }
  }

  await assertSsidFree(ssid, deps)

  // Both operators' keys, verified against the addresses about to be committed.
  let lookup
  try {
    lookup = await deps.scn.initiationRequest({
      mode: 'LOOKUP',
      candidates: [
        { address: eligibleClaimant.toLowerCase() as Address },
        { address: beneficiary.toLowerCase() as Address },
      ],
    })
  } catch (cause) {
    return scnFailure(cause, 'LOOKUP of the Bridge and Relay')
  }
  const entryFor = (address: string) =>
    lookup.results.find((result) => result.address.toLowerCase() === address.toLowerCase())
  const keyCheck = {
    chainId: chain.chainId,
    settlement: chain.settlement,
    now: Number(seconds(deps)),
    policy,
  }
  const relay = verifyOperatorKey({
    ...keyCheck,
    entry: entryFor(eligibleClaimant),
    role: 'RELAY',
    operator: eligibleClaimant,
  })
  const bridge = verifyOperatorKey({
    ...keyCheck,
    entry: entryFor(beneficiary),
    role: 'BRIDGE',
    operator: beneficiary,
  })

  let scaKey: Uint8Array
  try {
    scaKey = fromBase64((await deps.scn.fetchScaKey(ssid)).encPubKey)
  } catch (cause) {
    if (
      cause instanceof ScnRequestError &&
      cause.code !== 'TRANSPORT' &&
      cause.code !== 'STORE_UNAVAILABLE'
    ) {
      return refuse('SCA_NOT_REGISTERED', `No SCA key is registered for ${ssid} (${cause.code}).`)
    }
    return scnFailure(cause, `The SCA key for ${ssid}`)
  }

  const material = buildMaterial({
    accepted,
    userCMomoEndpoint: input.userCMomoEndpoint.trim(),
    originator: wallet.address,
    chainId: chain.chainId,
    settlement: chain.settlement,
    tokenAddress: chain.tokenAddress,
    executionInstructions: input.executionInstructions,
    entropy: freshEntropy(deps.random),
    createdAt: seconds(deps),
  })

  // The wallet's first prompt. Nothing is spent if the signature is wrong.
  const consumerContext = await sealAndSignConsumerContext({
    momoLegHash: material.momoLegHash,
    endpointSalt: material.identity.endpointSalt,
    relayAddress: eligibleClaimant,
    relayX25519PublicKey: relay.encPubKey,
    scaX25519PublicKey: scaKey,
    domain: { chainId: BigInt(chain.chainId), verifyingContract: chain.settlement },
    originator: wallet.address,
    signTypedData: (typedData) => wallet.signTypedData(typedData),
  })

  // Both keys are now bound to this origination: their checkpoints advance.
  for (const verified of [relay, bridge]) {
    policy.checkpoints.put(verified.scope, verified.checkpoint as KeyBindingCheckpoint)
  }

  const created: OriginationRecord = {
    version: 1,
    id: material.momoLegHash,
    phase: 'PREPARED',
    createdAt: deps.now(),
    mode: policy.mode,
    chainId: chain.chainId,
    settlement: chain.settlement,
    originator: wallet.address,
    ssid,
    quoteRecord: encodeQuoteRecord(record),
    corridor: accepted.corridor,
    escrowAmount: accepted.escrowAmount.toString(),
    momoAmount: accepted.momoAmount.toString(),
    beneficiary,
    eligibleClaimant,
    momoLegHash: material.momoLegHash,
    stcn: material.publicFields.stcn,
    secret: {
      material: encodeMaterial(material),
      relayKey: bytesToHex(relay.encPubKey),
      bridgeKey: bytesToHex(bridge.encPubKey),
      consumerContext,
    },
    posted: {},
    log: [],
  }
  return logged(
    created,
    deps,
    `Prepared in ${policy.mode} mode: Relay ${eligibleClaimant} (sequence ${relay.checkpoint.sequence.toString()}), ` +
      `Bridge ${beneficiary} (sequence ${bridge.checkpoint.sequence.toString()}), Consumer Context signed.`,
  )
}

/* -------------------------------------------------------------------------- */
/* 2. Commit                                                                   */
/* -------------------------------------------------------------------------- */

export async function commitOrigination(
  record: OriginationRecord,
  deps: OriginationDeps,
): Promise<OriginationRecord> {
  if (record.phase !== 'PREPARED') {
    return refuse(
      'INVALID_INPUT',
      `This origination is ${record.phase}; it cannot be committed again.`,
    )
  }
  if (record.originator.toLowerCase() !== deps.wallet.address.toLowerCase()) {
    return refuse(
      'INVALID_INPUT',
      `This origination belongs to ${record.originator}; connect that wallet.`,
    )
  }
  // The quote window is a client duty (§2.4c.3 step 4, D11): checked again at
  // the moment of commitment, not only when the record was prepared.
  const quoteRecord = parseQuoteRecord(JSON.stringify(record.quoteRecord))
  acceptQuote({
    record: quoteRecord,
    escrowAmount: BigInt(record.escrowAmount),
    escrow: {
      chainId: deps.chain.chainId,
      tokenAddress: deps.chain.tokenAddress,
      tokenSymbol: deps.chain.tokenSymbol,
      tokenDecimals: deps.chain.tokenDecimals,
    },
    now: seconds(deps),
  })
  // §2.4c.4(c) and CR-CONSOLE-4 on the exact arguments about to be sent.
  const args = {
    beneficiary: record.beneficiary,
    eligibleClaimant: record.eligibleClaimant,
    escrowAmount: BigInt(record.escrowAmount),
    momoLegHash: record.momoLegHash,
  }
  assertCommittedPair({
    record: quoteRecord,
    beneficiary: args.beneficiary,
    eligibleClaimant: args.eligibleClaimant,
    consumerContextRelay: record.eligibleClaimant,
  })

  await deps.wallet.ensureAllowance(args.escrowAmount)

  const requestedAtBlock = await deps.chain.blockNumber()
  let current = logged(
    {
      ...record,
      phase: 'COMMIT_REQUESTED',
      commit: { requestedAtBlock: requestedAtBlock.toString() },
    },
    deps,
    `commitPoI requested at block ${requestedAtBlock.toString()}.`,
  )
  let hash: Hex
  try {
    hash = await deps.wallet.commitPoI(args)
  } catch (cause) {
    if (deps.wallet.isUserRejection(cause)) {
      // Declined in the wallet: nothing was sent, so the record may commit later.
      const { commit: _dropped, ...rest } = current
      void _dropped
      logged({ ...rest, phase: 'PREPARED' }, deps, 'commitPoI declined in the wallet.')
    }
    throw cause
  }
  current = logged(
    { ...current, commit: { requestedAtBlock: requestedAtBlock.toString(), txHash: hash } },
    deps,
    `commitPoI sent: ${hash}.`,
  )
  return awaitCommit(current, hash, deps)
}

async function awaitCommit(
  record: OriginationRecord,
  hash: Hex,
  deps: OriginationDeps,
): Promise<OriginationRecord> {
  const outcome = await deps.wallet.waitForCommit(hash)
  if ('reverted' in outcome) {
    const { secret: _secret, ...rest } = record
    void _secret
    return logged(
      { ...rest, phase: 'ABANDONED' },
      deps,
      `commitPoI reverted in ${hash}; nothing was escrowed.`,
    )
  }
  return logged(
    { ...record, phase: 'COMMITTED', stid: outcome.stid },
    deps,
    `Committed: STID ${outcome.stid}.`,
  )
}

/* -------------------------------------------------------------------------- */
/* 3. Deliver                                                                  */
/* -------------------------------------------------------------------------- */

const RETRYABLE = new Set(['TRANSPORT', 'STORE_UNAVAILABLE'])
export const POST_ATTEMPTS = 5

async function posted<T>(what: string, post: () => Promise<T>, deps: OriginationDeps): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await post()
    } catch (cause) {
      const retryable = cause instanceof ScnRequestError && RETRYABLE.has(cause.code)
      if (!retryable || attempt === POST_ATTEMPTS) {
        throw new OriginationRefusal(
          'SCN_UNREACHABLE',
          `${what}: ${messageOf(cause)}. The transaction is committed; retry the delivery — the same ` +
            'objects are sent again.',
        )
      }
      await deps.sleep(2000 * attempt)
    }
  }
}

/**
 * The three objects that need the STID, sealed once and kept in the record
 * before the first post (layouts §4.1 step 4), then posted in order: the
 * preimage for Relay, the payout material for the Bridge, the Introduction for
 * the SCA. Idempotent — call it again after any failure.
 */
export async function deliverOrigination(
  record: OriginationRecord,
  deps: OriginationDeps,
): Promise<OriginationRecord> {
  if (record.phase !== 'COMMITTED' || record.stid === undefined) {
    return refuse(
      'INVALID_INPUT',
      `This origination is ${record.phase}; there is nothing to deliver.`,
    )
  }
  let current = record
  const stid = record.stid
  if (current.sealed === undefined) {
    const { secret } = current
    if (secret === undefined)
      return refuse('INVALID_INPUT', 'The material for this origination is gone.')
    const material = decodeMaterial(secret.material)
    // The Identity plaintext and the hash the other two objects carry must be
    // one transaction's, or the Bridge could not reconstruct the commitment.
    if (computeIdentityHash(material.identity) !== material.identityHash) {
      return refuse(
        'INVALID_INPUT',
        'The stored Identity material does not hash to its identityHash.',
      )
    }
    const quote = parseQuoteRecord(JSON.stringify(record.quoteRecord)).quote
    const preimage = sealPreimageMaterial({
      material: {
        stid,
        publicFields: material.publicFields,
        identityHash: material.identityHash,
        quote,
        operational: material.operational,
      },
      relayX25519PublicKey: hexToBytes(secret.relayKey),
      sender: generateBoxKeypair(),
      nonce: randomBoxNonce(),
    })
    const payout = sealPayoutMaterial({
      material: {
        stid,
        publicFields: material.publicFields,
        operational: material.operational,
        identity: material.identity,
        quote,
      },
      bridgeX25519PublicKey: hexToBytes(secret.bridgeKey),
      sender: generateBoxKeypair(),
      nonce: randomBoxNonce(),
    })
    current = logged(
      {
        ...current,
        sealed: {
          preimage: toMailboxCiphertext(preimage),
          payout: toMailboxCiphertext(payout),
          introduction: {
            version: 3,
            stid,
            consumerContext: { ...secret.consumerContext },
            public: { ...encodePublicFields(material.publicFields) },
            operationalHash: operationalHash(material.operational),
            identityHash: material.identityHash,
          },
        },
      },
      deps,
      'Preimage material, payout material and Introduction v3 sealed.',
    )
  }
  const sealed = current.sealed!

  if (current.posted.preimage === undefined) {
    const stored = await posted(
      'Preimage material',
      () => deps.scn.storePreimageCiphertext(stid, sealed.preimage),
      deps,
    )
    current = logged(
      { ...current, posted: { ...current.posted, preimage: stored.outcome } },
      deps,
      `Preimage material ${stored.outcome}.`,
    )
  }
  if (current.posted.payout === undefined) {
    const stored = await posted(
      'Payout material',
      () => deps.scn.storePayoutMaterial(stid, sealed.payout),
      deps,
    )
    current = logged(
      { ...current, posted: { ...current.posted, payout: stored.outcome } },
      deps,
      `Payout material ${stored.outcome}.`,
    )
  }
  if (current.posted.introduction === undefined) {
    const stored = await posted(
      'Introduction',
      () => deps.scn.storeTransactionIntroduction(current.ssid, sealed.introduction),
      deps,
    )
    const warnings = stored.warnings.map((warning) => warning.code).join(', ')
    current = logged(
      { ...current, posted: { ...current.posted, introduction: 'STORED' } },
      deps,
      `Introduction v3 posted to ${current.ssid}${warnings ? ` (${warnings})` : ''}.`,
    )
  }
  const { secret: _secret, sealed: _sealed, ...summary } = current
  void _secret
  void _sealed
  return logged(
    { ...summary, phase: 'DELIVERED' },
    deps,
    'Delivered; the unsealed material was deleted.',
  )
}

/* -------------------------------------------------------------------------- */
/* Resume                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Continue a record after a reload. A `COMMIT_REQUESTED` record with a hash
 * waits for that receipt; one without a hash looks for its own `momoLegHash` on
 * chain and never commits again by itself — `releaseCommitRequest` is the only
 * way back to `PREPARED`.
 */
export async function resumeOrigination(
  record: OriginationRecord,
  deps: OriginationDeps,
): Promise<OriginationRecord> {
  if (record.phase === 'COMMIT_REQUESTED') {
    if (record.commit?.txHash !== undefined) {
      const committed = await awaitCommit(record, record.commit.txHash, deps)
      return committed.phase === 'COMMITTED' ? deliverOrigination(committed, deps) : committed
    }
    const found = await findOwnCommit(record, deps)
    if (found === undefined) {
      return refuse(
        'INVALID_INPUT',
        'No commitPoI for this origination is on chain yet. If the wallet shows none was sent, release ' +
          'the request and commit again.',
      )
    }
    const committed = logged(
      { ...record, phase: 'COMMITTED', stid: found },
      deps,
      `Found on chain: STID ${found}.`,
    )
    return deliverOrigination(committed, deps)
  }
  if (record.phase === 'COMMITTED') return deliverOrigination(record, deps)
  return record
}

async function findOwnCommit(
  record: OriginationRecord,
  deps: OriginationDeps,
): Promise<Hex | undefined> {
  return deps.chain.findCommitted({
    originator: record.originator,
    fromBlock: BigInt(record.commit?.requestedAtBlock ?? '0'),
    momoLegHash: record.momoLegHash,
  })
}

/**
 * Back to `PREPARED` after a commit request that produced no hash, once the
 * chain shows no transaction carrying this `momoLegHash`. The operator confirms
 * from the wallet's own activity that nothing is pending before calling it.
 */
export async function releaseCommitRequest(
  record: OriginationRecord,
  deps: OriginationDeps,
): Promise<OriginationRecord> {
  if (record.phase !== 'COMMIT_REQUESTED' || record.commit?.txHash !== undefined) {
    return refuse(
      'INVALID_INPUT',
      'Only a commit request without a transaction hash can be released.',
    )
  }
  const found = await findOwnCommit(record, deps)
  if (found !== undefined) {
    return logged(
      { ...record, phase: 'COMMITTED', stid: found },
      deps,
      `Found on chain: STID ${found}.`,
    )
  }
  const { commit: _commit, ...rest } = record
  void _commit
  return logged(
    { ...rest, phase: 'PREPARED' },
    deps,
    'Commit request released; nothing was found on chain.',
  )
}
