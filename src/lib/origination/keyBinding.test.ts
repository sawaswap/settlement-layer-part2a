import { keyFingerprint, type KeyAnchor } from '@sawaswap/crypto'
import { describe, expect, it } from 'vitest'
import { OriginationRefusal } from './errors'
import {
  anchorFor,
  keyBindingMode,
  localCheckpointStore,
  parseKeyAnchors,
  verifyOperatorKey,
  type AnchorSet,
  type KeyBindingPolicy,
} from './keyBinding'
import {
  anchorsFor,
  BRIDGE,
  CHAIN_ID,
  lookupEntry,
  memoryStorage,
  NOW_SECONDS,
  RELAY,
  SETTLEMENT,
  signedBinding,
} from './testing'

function policy(overrides: Partial<KeyBindingPolicy> = {}): KeyBindingPolicy {
  return {
    mode: 'STRICT',
    anchors: anchorsFor({ op: RELAY, role: 'RELAY' }),
    checkpoints: localCheckpointStore(memoryStorage()),
    ...overrides,
  }
}

const check = (
  input: Partial<Parameters<typeof verifyOperatorKey>[0]> & { policy: KeyBindingPolicy },
) =>
  verifyOperatorKey({
    entry: undefined,
    role: 'RELAY',
    operator: RELAY.address,
    chainId: CHAIN_ID,
    settlement: SETTLEMENT,
    now: NOW_SECONDS,
    ...input,
  })

async function codeOf(run: () => unknown): Promise<string> {
  try {
    await run()
  } catch (error) {
    if (error instanceof OriginationRefusal) return error.code
    throw error
  }
  return 'ACCEPTED'
}

describe('§5.2 enforcement mode', () => {
  it('is STRICT unless SYNTHETIC is set on Base Sepolia', () => {
    expect(keyBindingMode(undefined, 84532)).toBe('STRICT')
    expect(keyBindingMode('synthetic', 84532)).toBe('STRICT')
    expect(keyBindingMode('SYNTHETIC', 84532)).toBe('SYNTHETIC')
    expect(keyBindingMode('SYNTHETIC', 8453)).toBe('STRICT')
  })

  it('SYNTHETIC relaxes only the anchor gate: an unbound or mismatched entry is still refused', async () => {
    const synthetic = policy({ mode: 'SYNTHETIC', anchors: { anchors: [] } })
    const ok = check({ entry: await lookupEntry(RELAY), policy: synthetic })
    expect(ok.mode).toBe('SYNTHETIC')
    expect(
      await codeOf(async () => check({ entry: await lookupEntry(RELAY, null), policy: synthetic })),
    ).toBe('KEY_BINDING_MISSING')
    expect(
      await codeOf(async () =>
        check({ entry: await lookupEntry(RELAY, await signedBinding(BRIDGE)), policy: synthetic }),
      ),
    ).toBe('KEY_BINDING_MISMATCH')
  })
})

describe('checks 1–8 before sealing', () => {
  it('returns the directory key, its checkpoint and scope', async () => {
    const verified = check({ entry: await lookupEntry(RELAY), policy: policy() })
    expect(verified.encPubKey).toEqual(RELAY.box.publicKey)
    expect(verified.checkpoint.sequence).toBe(1n)
    expect(verified.checkpoint.fingerprint).toBe(keyFingerprint(RELAY.box.publicKey))
    expect(verified.scope).toBe(
      `key-binding-checkpoint:84532:${SETTLEMENT.toLowerCase()}:${RELAY.address.toLowerCase()}`,
    )
  })

  it('refuses an unregistered operator, a binding for another chain, and a key the binding does not sign', async () => {
    expect(await codeOf(() => check({ entry: undefined, policy: policy() }))).toBe(
      'OPERATOR_NOT_REGISTERED',
    )
    const otherChain = await lookupEntry(RELAY, await signedBinding(RELAY, { chainId: 8453n }))
    expect(await codeOf(() => check({ entry: otherChain, policy: policy() }))).toBe(
      'KEY_BINDING_MISMATCH',
    )
    const swappedKey = await lookupEntry(RELAY, undefined, BRIDGE.box.publicKey)
    expect(await codeOf(() => check({ entry: swappedKey, policy: policy() }))).toBe(
      'KEY_BINDING_MISMATCH',
    )
  })

  it('check 8: a lower sequence after a higher one is STALE; the same sequence with another issuedAt is CONFLICT', async () => {
    const storage = memoryStorage()
    const synthetic = policy({ mode: 'SYNTHETIC', checkpoints: localCheckpointStore(storage) })
    const second = check({
      entry: await lookupEntry(RELAY, await signedBinding(RELAY, { sequence: 2n })),
      policy: synthetic,
    })
    synthetic.checkpoints.put(second.scope, second.checkpoint)

    // A fresh store over the same storage: the checkpoint survives a reload.
    const reloaded = policy({ mode: 'SYNTHETIC', checkpoints: localCheckpointStore(storage) })
    const first = await lookupEntry(RELAY, await signedBinding(RELAY, { sequence: 1n }))
    expect(await codeOf(() => check({ entry: first, policy: reloaded }))).toBe('KEY_BINDING_STALE')
    const resigned = await lookupEntry(
      RELAY,
      await signedBinding(RELAY, { sequence: 2n, issuedAt: NOW_SECONDS - 60 }),
    )
    expect(await codeOf(() => check({ entry: resigned, policy: reloaded }))).toBe(
      'KEY_BINDING_CONFLICT',
    )
    const identical = await lookupEntry(RELAY, await signedBinding(RELAY, { sequence: 2n }))
    expect(await codeOf(() => check({ entry: identical, policy: reloaded }))).toBe('ACCEPTED')
  })

  it('checkpoints are scoped by chain and Settlement Contract', async () => {
    const storage = memoryStorage()
    const synthetic = policy({ mode: 'SYNTHETIC', checkpoints: localCheckpointStore(storage) })
    const high = check({
      entry: await lookupEntry(RELAY, await signedBinding(RELAY, { sequence: 5n })),
      policy: synthetic,
    })
    synthetic.checkpoints.put(high.scope, high.checkpoint)
    const otherSettlement = '0x1111111111111111111111111111111111111111'
    const entry = await lookupEntry(
      RELAY,
      await signedBinding(RELAY, { sequence: 1n, settlement: otherSettlement }),
    )
    expect(
      await codeOf(() => check({ entry, policy: synthetic, settlement: otherSettlement })),
    ).toBe('ACCEPTED')
  })

  it('an unreadable checkpoint refuses rather than counting as none', async () => {
    const storage = memoryStorage()
    const scope = `key-binding-checkpoint:84532:${SETTLEMENT.toLowerCase()}:${RELAY.address.toLowerCase()}`
    storage.setItem(`sawaswap.console.${scope}`, '{"sequence":"x"}')
    const broken = policy({ checkpoints: localCheckpointStore(storage) })
    expect(
      await codeOf(async () => check({ entry: await lookupEntry(RELAY), policy: broken })),
    ).toBe('KEY_BINDING_CONFLICT')
  })
})

describe('§5.1 anchor gate (STRICT)', () => {
  it('missing, invalid and mismatched anchors are three separate refusals', async () => {
    const entry = await lookupEntry(RELAY)
    expect(await codeOf(() => check({ entry, policy: policy({ anchors: { anchors: [] } }) }))).toBe(
      'KEY_ANCHOR_MISSING',
    )
    expect(
      await codeOf(() => check({ entry, policy: policy({ anchors: { invalid: 'unreadable' } }) })),
    ).toBe('KEY_ANCHOR_INVALID')
    const bridgeRole = anchorsFor({ op: RELAY, role: 'BRIDGE' })
    expect(await codeOf(() => check({ entry, policy: policy({ anchors: bridgeRole }) }))).toBe(
      'KEY_ANCHOR_MISSING',
    )
    for (const sequence of [2n]) {
      const ahead = anchorsFor({ op: RELAY, role: 'RELAY', sequence })
      expect(await codeOf(() => check({ entry, policy: policy({ anchors: ahead }) }))).toBe(
        'KEY_ANCHOR_MISMATCH',
      )
    }
    const behind = await lookupEntry(RELAY, await signedBinding(RELAY, { sequence: 3n }))
    expect(await codeOf(() => check({ entry: behind, policy: policy() }))).toBe(
      'KEY_ANCHOR_MISMATCH',
    )
    const [relayAnchor] = (anchorsFor({ op: RELAY, role: 'RELAY' }) as { anchors: KeyAnchor[] })
      .anchors
    const otherKey: AnchorSet = {
      anchors: [{ ...relayAnchor!, fingerprint: keyFingerprint(BRIDGE.box.publicKey) }],
    }
    expect(await codeOf(() => check({ entry, policy: policy({ anchors: otherKey }) }))).toBe(
      'KEY_ANCHOR_MISMATCH',
    )
  })
})

describe('VITE_KEY_ANCHORS', () => {
  const entry = {
    chainId: '84532',
    settlement: SETTLEMENT,
    role: 'RELAY',
    operator: RELAY.address,
    sequence: '1',
    fingerprint: keyFingerprint(RELAY.box.publicKey),
  }

  it('parses the selection script output and finds an anchor by role and operator', () => {
    const set = parseKeyAnchors(JSON.stringify([entry]))
    expect(set).toEqual({
      anchors: [{ ...entry, chainId: 84532n, sequence: 1n }],
    })
    expect(anchorFor(set, 'RELAY', RELAY.address.toLowerCase())).toBeDefined()
    expect(anchorFor(set, 'BRIDGE', RELAY.address)).toBeUndefined()
  })

  it('unset is no anchors; unreadable, malformed or duplicated is invalid', () => {
    expect(parseKeyAnchors(undefined)).toEqual({ anchors: [] })
    expect(parseKeyAnchors('')).toEqual({ anchors: [] })
    expect('invalid' in parseKeyAnchors('{')).toBe(true)
    expect('invalid' in parseKeyAnchors(JSON.stringify([{ ...entry, extra: 1 }]))).toBe(true)
    expect('invalid' in parseKeyAnchors(JSON.stringify([{ ...entry, sequence: 1 }]))).toBe(true)
    expect('invalid' in parseKeyAnchors(JSON.stringify([{ ...entry, role: 'relay' }]))).toBe(true)
    const twice = parseKeyAnchors(JSON.stringify([entry, entry]))
    expect(anchorFor(twice, 'RELAY', RELAY.address)).toHaveProperty('invalid')
  })
})
