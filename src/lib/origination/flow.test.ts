import {
  decodePublicFields,
  decodeTransportedConsumerContext,
  fromMailboxCiphertext,
  identityHash,
  momoLegHash,
  openPayoutMaterial,
  openPreimageMaterial,
  operationalHash,
  publicHash,
  verifyConsumerContext,
} from '@sawaswap/crypto'
import { ScnRequestError } from '@sawaswap/scn-client'
import type { Hex } from 'viem'
import { describe, expect, it } from 'vitest'
import { OriginationRefusal } from './errors'
import {
  commitOrigination,
  deliverOrigination,
  prepareOrigination,
  releaseCommitRequest,
  resumeOrigination,
  type OriginationInput,
} from './flow'
import {
  BRIDGE,
  CHAIN_ID,
  harness,
  lookupEntry,
  ORIGINATOR,
  RELAY,
  SCA,
  SETTLEMENT,
  quoteRecord,
  quoteRecordText,
} from './testing'

const input = (overrides: Partial<OriginationInput> = {}): OriginationInput => ({
  quoteRecordText: quoteRecordText(),
  ssid: 'SSID-1',
  userCMomoEndpoint: '+243810000000',
  escrowAmount: 2_200_000n,
  executionInstructions: 'Pay the recipient in full.',
  ...overrides,
})

async function refusalOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    if (error instanceof OriginationRefusal) return error.code
    throw error
  }
  return 'ACCEPTED'
}

describe('origination end to end', () => {
  it('prepares, commits the selected pair and delivers what Relay, the Bridge and the SCA can each verify', async () => {
    const h = await harness()
    const prepared = await prepareOrigination(input(), h.deps)
    expect(prepared.phase).toBe('PREPARED')
    expect(prepared.mode).toBe('STRICT')
    expect(h.wallet.commits).toHaveLength(0)

    const committed = await commitOrigination(prepared, h.deps)
    expect(committed.phase).toBe('COMMITTED')
    expect(h.wallet.commits).toEqual([
      {
        beneficiary: BRIDGE.address,
        eligibleClaimant: RELAY.address,
        escrowAmount: 2_200_000n,
        momoLegHash: prepared.momoLegHash,
      },
    ])
    expect(h.wallet.approvals).toEqual([2_200_000n])

    const delivered = await deliverOrigination(committed, h.deps)
    expect(delivered.phase).toBe('DELIVERED')
    expect(delivered.secret).toBeUndefined()
    expect(delivered.sealed).toBeUndefined()
    expect(h.scn.posts.map((post) => post.split(':')[0])).toEqual([
      'preimage',
      'payout',
      'introduction',
    ])

    const stid = committed.stid!
    // Relay opens its object and reconstructs the committed hash from it.
    const preimage = openPreimageMaterial(
      fromMailboxCiphertext(h.scn.mailboxes.preimage.get(stid)!),
      RELAY.box,
    )
    expect(preimage.stid).toBe(stid)
    expect(
      momoLegHash({
        publicHash: publicHash(preimage.publicFields),
        operationalHash: operationalHash(preimage.operational),
        identityHash: preimage.identityHash,
      }),
    ).toBe(prepared.momoLegHash)

    // The Bridge opens its object: same commitment, the Identity plaintext, the pair.
    const payout = openPayoutMaterial(fromMailboxCiphertext(h.scn.mailboxes.payout.get(stid)!), {
      keys: [BRIDGE.box],
      expectedStid: stid,
    })
    expect(identityHash(payout.identity)).toBe(preimage.identityHash)
    expect(payout.identity.userCMomoEndpoint).toBe('+243810000000')
    expect(payout.identity.agentBAddress.toLowerCase()).toBe(BRIDGE.address.toLowerCase())
    expect(payout.identity.userAAddress.toLowerCase()).toBe(ORIGINATOR.address.toLowerCase())
    expect(payout.identity.momoReference).toBe(prepared.stcn)
    expect(payout.publicFields.momoAmount).toBe(219n)
    expect(payout.publicFields.createdBy).toBe('sawalabs:operator-console')

    // The SCA: the seven checks pass, and the Introduction's Public fields and
    // two hashes recompute the hash it carries.
    const intro = h.scn.intros.get('SSID-1') as unknown as {
      version: number
      stid: Hex
      consumerContext: Record<string, unknown>
      public: unknown
      operationalHash: Hex
      identityHash: Hex
    }
    expect(intro.version).toBe(3)
    expect(intro.stid).toBe(stid)
    const verdict = verifyConsumerContext({
      transported: decodeTransportedConsumerContext(intro.consumerContext),
      domain: { chainId: BigInt(CHAIN_ID), verifyingContract: SETTLEMENT },
      sca: SCA.box,
    })
    expect(verdict.accepted).toBe(true)
    expect(
      momoLegHash({
        publicHash: publicHash(decodePublicFields(intro.public)),
        operationalHash: intro.operationalHash,
        identityHash: intro.identityHash,
      }),
    ).toBe(prepared.momoLegHash)

    // The record says what happened, mode included.
    expect(delivered.log.map((entry) => entry.event)[0]).toMatch(/^Prepared in STRICT mode/)
  })
})

describe('refusals before any gas', () => {
  it('CR-CONSOLE-5: an SSID whose Introduction names a pending STID is refused; a terminal one is not', async () => {
    const h = await harness()
    const pending = `0x${'99'.repeat(32)}`
    h.scn.intros.set('SSID-1', { stid: pending })
    h.chain.transactions.set(pending, {
      state: 0,
      momoLegHash: '0x',
      originator: ORIGINATOR.address,
      block: 1n,
    })
    expect(await refusalOf(() => prepareOrigination(input(), h.deps))).toBe('SSID_PENDING')
    h.chain.transactions.get(pending)!.state = 4
    expect(await refusalOf(() => prepareOrigination(input(), h.deps))).toBe('ACCEPTED')
  })

  it("CR-CONSOLE-5: an STID unknown to this Settlement Contract does not block; this Console's own open record does", async () => {
    const h = await harness()
    h.scn.intros.set('SSID-1', { stid: `0x${'98'.repeat(32)}` })
    await prepareOrigination(input(), h.deps)
    expect(await refusalOf(() => prepareOrigination(input(), h.deps))).toBe('SSID_PENDING')
  })

  it('an unregistered SSID, an unbound Relay and an unanchored Bridge are refused, and no wallet prompt is shown', async () => {
    const h = await harness()
    expect(await refusalOf(() => prepareOrigination(input({ ssid: 'SSID-2' }), h.deps))).toBe(
      'SCA_NOT_REGISTERED',
    )
    h.scn.lookup.set(RELAY.address.toLowerCase(), await lookupEntry(RELAY, null))
    expect(await refusalOf(() => prepareOrigination(input(), h.deps))).toBe('KEY_BINDING_MISSING')
    h.scn.lookup.set(RELAY.address.toLowerCase(), await lookupEntry(RELAY))
    h.deps.policy.anchors = { anchors: [] }
    expect(await refusalOf(() => prepareOrigination(input(), h.deps))).toBe('KEY_ANCHOR_MISSING')
    expect(h.deps.store.list()).toHaveLength(0)
  })

  it('KRAIT-001: a selected operator that is the Settlement Contract or the token is refused', async () => {
    const h = await harness()
    const record = quoteRecord()
    record.bridge.address = SETTLEMENT
    expect(
      await refusalOf(() =>
        prepareOrigination(input({ quoteRecordText: quoteRecordText(record) }), h.deps),
      ),
    ).toBe('INVALID_INPUT')
    expect(h.deps.store.list()).toHaveLength(0)
  })

  it("a User C number outside the quote's corridor, or not canonical E.164, is refused", async () => {
    const h = await harness()
    expect(
      await refusalOf(() =>
        prepareOrigination(input({ userCMomoEndpoint: '+242060000000' }), h.deps),
      ),
    ).toBe('INVALID_INPUT')
    expect(
      await refusalOf(() => prepareOrigination(input({ userCMomoEndpoint: '0810000000' }), h.deps)),
    ).toBe('INVALID_INPUT')
  })

  it('a quote that expired between preparation and commitment stops the commit', async () => {
    const h = await harness()
    const prepared = await prepareOrigination(input(), h.deps)
    h.clock.now += 3600 * 1000
    expect(await refusalOf(() => commitOrigination(prepared, h.deps))).toBe('QUOTE_EXPIRED')
    expect(h.wallet.commits).toHaveLength(0)
  })

  it('advances the key-binding checkpoints only when the keys are used', async () => {
    const h = await harness()
    h.deps.policy.anchors = { anchors: [] }
    await refusalOf(() => prepareOrigination(input(), h.deps))
    expect(h.storage.length).toBe(0)
    h.deps.policy.mode = 'SYNTHETIC'
    await prepareOrigination(input(), h.deps)
    expect(h.storage.length).toBe(2)
  })
})

describe('the commit is never sent twice', () => {
  it('a declined commit returns the record to PREPARED', async () => {
    const h = await harness()
    const prepared = await prepareOrigination(input(), h.deps)
    h.wallet.nextCommit = 'reject'
    await expect(commitOrigination(prepared, h.deps)).rejects.toThrow('User rejected')
    expect(h.deps.store.get(prepared.id)!.phase).toBe('PREPARED')
  })

  it('a reverted commit abandons the record and deletes its material', async () => {
    const h = await harness()
    const prepared = await prepareOrigination(input(), h.deps)
    h.wallet.nextCommit = 'revert'
    const abandoned = await commitOrigination(prepared, h.deps)
    expect(abandoned.phase).toBe('ABANDONED')
    expect(abandoned.secret).toBeUndefined()
  })

  it('a commit whose hash never came back is found on chain by its momoLegHash, not sent again', async () => {
    const h = await harness()
    const prepared = await prepareOrigination(input(), h.deps)
    h.wallet.nextCommit = 'lose-hash'
    await expect(commitOrigination(prepared, h.deps)).rejects.toThrow('connection lost')
    const stuck = h.deps.store.get(prepared.id)!
    expect(stuck.phase).toBe('COMMIT_REQUESTED')
    expect(await refusalOf(() => commitOrigination(stuck, h.deps))).toBe('INVALID_INPUT')

    const resumed = await resumeOrigination(stuck, h.deps)
    expect(resumed.phase).toBe('DELIVERED')
    expect(h.wallet.commits).toHaveLength(1)
  })

  it('a hash-less request with nothing on chain is released only explicitly', async () => {
    const h = await harness()
    const prepared = await prepareOrigination(input(), h.deps)
    h.wallet.nextCommit = 'lose-hash'
    await expect(commitOrigination(prepared, h.deps)).rejects.toThrow()
    h.chain.transactions.clear()
    const stuck = h.deps.store.get(prepared.id)!
    expect(await refusalOf(() => resumeOrigination(stuck, h.deps))).toBe('INVALID_INPUT')
    const released = await releaseCommitRequest(stuck, h.deps)
    expect(released.phase).toBe('PREPARED')
  })

  it('a record belongs to the wallet that prepared it', async () => {
    const h = await harness()
    const prepared = await prepareOrigination(input(), h.deps)
    h.deps.wallet = { ...h.wallet, address: RELAY.address }
    expect(await refusalOf(() => commitOrigination(prepared, h.deps))).toBe('INVALID_INPUT')
  })
})

describe('delivery retries send the same bytes', () => {
  it('retries a post SCN did not answer, with the object already sealed', async () => {
    const h = await harness()
    const committed = await commitOrigination(await prepareOrigination(input(), h.deps), h.deps)
    h.scn.failures.preimage = 2
    await deliverOrigination(committed, h.deps)
    const preimagePosts = h.scn.posts.filter((post) => post.startsWith('preimage:'))
    expect(preimagePosts).toHaveLength(3)
    expect(new Set(preimagePosts).size).toBe(1)
  })

  it('after a delivery that gave up, the next attempt resends the stored objects and SCN answers IDEMPOTENT', async () => {
    const h = await harness()
    const committed = await commitOrigination(await prepareOrigination(input(), h.deps), h.deps)
    h.scn.failures.payout = 5
    expect(await refusalOf(() => deliverOrigination(committed, h.deps))).toBe('SCN_UNREACHABLE')
    const partial = h.deps.store.get(committed.id)!
    expect(partial.posted).toEqual({ preimage: 'STORED' })

    const sealedPayout = partial.sealed!.payout
    const delivered = await resumeOrigination(partial, h.deps)
    expect(delivered.phase).toBe('DELIVERED')
    const payoutPosts = h.scn.posts.filter((post) => post.startsWith('payout:'))
    expect(new Set(payoutPosts)).toEqual(new Set([`payout:${sealedPayout}`]))
  })

  it('a refusal SCN actually gave is not retried', async () => {
    const h = await harness()
    const committed = await commitOrigination(await prepareOrigination(input(), h.deps), h.deps)
    h.scn.storePreimageCiphertext = async () => {
      throw new ScnRequestError('SLOT_OCCUPIED', 'occupied', 409)
    }
    expect(await refusalOf(() => deliverOrigination(committed, h.deps))).toBe('SCN_UNREACHABLE')
    expect(h.scn.posts).toHaveLength(0)
  })
})
