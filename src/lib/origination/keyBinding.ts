import {
  checkKeyAnchor,
  fromBase64,
  keyBindingCheckpointScope,
  resolveKeyBindingMode,
  verifyKeyBinding,
  type KeyAnchor,
  type KeyAnchorRole,
  type KeyBindingCheckpoint,
  type KeyBindingMode,
} from '@sawaswap/crypto'
import type { LookupResult } from '@sawaswap/scn-client'
import type { Hex } from 'viem'
import { refuse } from './errors'

/**
 * The Console half of operator key binding — ADR 123n15h7v6d v0.3.2 §5, §5.1,
 * §5.2. The checks themselves live in `@sawaswap/crypto` and are the ones the
 * test script and SCN use; this module supplies what only the Console has:
 *
 *  - the checkpoint of check 8, persisted per chain, Settlement Contract and
 *    operator, so it survives a reload;
 *  - the anchors of §7.1, from deployment configuration the administrator sets
 *    (`VITE_KEY_ANCHORS`) — never from SCN;
 *  - the enforcement mode of §5.2 (`VITE_KEY_BINDING_MODE`), `STRICT` unless
 *    `SYNTHETIC` is set and the chain is Base Sepolia.
 */

/* -------------------------------------------------------------------------- */
/* Checkpoints (check 8)                                                       */
/* -------------------------------------------------------------------------- */

export interface CheckpointStore {
  get(scope: string): KeyBindingCheckpoint | undefined
  put(scope: string, checkpoint: KeyBindingCheckpoint): void
}

const CHECKPOINT_PREFIX = 'sawaswap.console.'

interface CheckpointWire {
  sequence: string
  fingerprint: string
  statementDigest: string
}

/**
 * Checkpoints in `localStorage`. An entry that cannot be read is treated as a
 * refusal rather than as no checkpoint: falling back to "none" would accept a
 * rolled-back binding, which is exactly what check 8 exists to stop.
 */
export function localCheckpointStore(storage: Storage = window.localStorage): CheckpointStore {
  return {
    get(scope) {
      const raw = storage.getItem(CHECKPOINT_PREFIX + scope)
      if (raw === null) return undefined
      try {
        const wire = JSON.parse(raw) as CheckpointWire
        if (
          !/^[1-9][0-9]*$/.test(wire.sequence) ||
          !/^0x[0-9a-f]{64}$/.test(wire.fingerprint) ||
          !/^0x[0-9a-f]{64}$/.test(wire.statementDigest)
        ) {
          throw new Error('malformed')
        }
        return {
          sequence: BigInt(wire.sequence),
          fingerprint: wire.fingerprint as `0x${string}`,
          statementDigest: wire.statementDigest as Hex,
        }
      } catch {
        return refuse(
          'KEY_BINDING_CONFLICT',
          `The stored key-binding checkpoint ${scope} cannot be read. Nothing is sealed until it is ` +
            'restored or deliberately cleared.',
        )
      }
    },
    put(scope, checkpoint) {
      const wire: CheckpointWire = {
        sequence: checkpoint.sequence.toString(),
        fingerprint: checkpoint.fingerprint,
        statementDigest: checkpoint.statementDigest.toLowerCase(),
      }
      storage.setItem(CHECKPOINT_PREFIX + scope, JSON.stringify(wire))
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Anchors (§5.1, §7.1)                                                        */
/* -------------------------------------------------------------------------- */

export type AnchorSet = { anchors: KeyAnchor[] } | { invalid: string }

const ANCHOR_MEMBERS = ['chainId', 'settlement', 'role', 'operator', 'sequence', 'fingerprint']

/**
 * `VITE_KEY_ANCHORS`: a JSON array, one entry per selected operator and role,
 * written by the pilot selection script from values read on each operator's
 * AgentOS Network screen. Unset means no anchors (every lookup is
 * `KEY_ANCHOR_MISSING` in `STRICT` mode); unreadable means every lookup is
 * `KEY_ANCHOR_INVALID`.
 */
export function parseKeyAnchors(raw: string | undefined): AnchorSet {
  if (raw === undefined || raw.trim() === '') return { anchors: [] }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { invalid: 'VITE_KEY_ANCHORS is not JSON' }
  }
  if (!Array.isArray(value)) return { invalid: 'VITE_KEY_ANCHORS is not a JSON array' }
  const anchors: KeyAnchor[] = []
  for (const [index, entry] of value.entries()) {
    const where = `VITE_KEY_ANCHORS[${String(index)}]`
    if (typeof entry !== 'object' || entry === null) return { invalid: `${where} is not an object` }
    const record = entry as Record<string, unknown>
    const keys = Object.keys(record).sort()
    if (JSON.stringify(keys) !== JSON.stringify([...ANCHOR_MEMBERS].sort())) {
      return { invalid: `${where} must have exactly: ${ANCHOR_MEMBERS.join(', ')}` }
    }
    const { chainId, settlement, role, operator, sequence, fingerprint } = record
    if (typeof chainId !== 'string' || !/^[1-9][0-9]*$/.test(chainId)) {
      return { invalid: `${where}.chainId is not a positive decimal string` }
    }
    if (typeof sequence !== 'string' || !/^[1-9][0-9]*$/.test(sequence)) {
      return { invalid: `${where}.sequence is not a positive decimal string` }
    }
    if (role !== 'BRIDGE' && role !== 'RELAY')
      return { invalid: `${where}.role is not BRIDGE or RELAY` }
    if (typeof settlement !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(settlement)) {
      return { invalid: `${where}.settlement is not an address` }
    }
    if (typeof operator !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(operator)) {
      return { invalid: `${where}.operator is not an address` }
    }
    if (typeof fingerprint !== 'string') return { invalid: `${where}.fingerprint is not a string` }
    anchors.push({
      chainId: BigInt(chainId),
      settlement,
      role,
      operator,
      sequence: BigInt(sequence),
      fingerprint,
    })
  }
  return { anchors }
}

/** The anchor for one operator in one role, as `checkKeyAnchor` takes it. */
export function anchorFor(
  set: AnchorSet,
  role: KeyAnchorRole,
  operator: string,
): KeyAnchor | { invalid: string } | undefined {
  if ('invalid' in set) return { invalid: set.invalid }
  const matches = set.anchors.filter(
    (anchor) => anchor.role === role && anchor.operator.toLowerCase() === operator.toLowerCase(),
  )
  if (matches.length > 1) return { invalid: `more than one anchor for the ${role} ${operator}` }
  return matches[0]
}

/* -------------------------------------------------------------------------- */
/* The check before sealing                                                    */
/* -------------------------------------------------------------------------- */

export interface KeyBindingPolicy {
  mode: KeyBindingMode
  anchors: AnchorSet
  checkpoints: CheckpointStore
}

/** §5.2: the mode in force for this chain, from the raw setting. */
export function keyBindingMode(setting: unknown, chainId: number): KeyBindingMode {
  return resolveKeyBindingMode(setting, BigInt(chainId))
}

export interface VerifiedOperatorKey {
  role: KeyAnchorRole
  operator: `0x${string}`
  /** The 32 bytes to seal to — the directory key the binding signs. */
  encPubKey: Uint8Array
  checkpoint: KeyBindingCheckpoint
  scope: string
  mode: KeyBindingMode
}

/**
 * Checks 1–8, then the anchor gate in `STRICT` mode, for one selected operator.
 * Run on every origination, immediately before sealing (§5). Fails closed:
 * there is no unsigned fallback in either mode.
 *
 * The checkpoint is returned, not stored: the caller stores it once the key is
 * used, so a refused origination leaves the checkpoint where it was.
 */
export function verifyOperatorKey(input: {
  entry: LookupResult | undefined
  role: KeyAnchorRole
  operator: string
  chainId: number
  settlement: string
  /** Unix seconds. */
  now: number
  policy: KeyBindingPolicy
}): VerifiedOperatorKey {
  const { entry, role, policy } = input
  const operator = input.operator.toLowerCase() as `0x${string}`
  const label = role === 'BRIDGE' ? 'Bridge' : 'Relay'
  if (entry?.registered !== true || entry.encPubKey === undefined) {
    return refuse(
      'OPERATOR_NOT_REGISTERED',
      `The ${label} ${operator} has no SCN registration, so there is no key to seal to.`,
    )
  }
  let encPubKey: Uint8Array
  try {
    encPubKey = fromBase64(entry.encPubKey)
  } catch {
    return refuse('KEY_BINDING_MISMATCH', `The ${label} ${operator}'s directory key is not base64.`)
  }
  const scope = keyBindingCheckpointScope({
    chainId: BigInt(input.chainId),
    settlement: input.settlement,
    operator,
  })
  const lastAccepted = policy.checkpoints.get(scope)
  const verified = verifyKeyBinding({
    binding: entry.keyBinding,
    expected: {
      operator,
      chainId: BigInt(input.chainId),
      settlement: input.settlement.toLowerCase(),
      encPubKey,
      ...(lastAccepted === undefined ? {} : { lastAccepted }),
    },
    now: input.now,
  })
  if (!verified.ok) {
    return refuse(
      verified.code,
      `The ${label} ${operator}'s key binding fails check ${String(verified.check)}: ${verified.reason}.`,
    )
  }
  if (policy.mode === 'STRICT') {
    const anchored = checkKeyAnchor({
      anchor: anchorFor(policy.anchors, role, operator),
      expected: { chainId: BigInt(input.chainId), settlement: input.settlement, role, operator },
      verified: verified.checkpoint,
    })
    if (!anchored.ok) {
      return refuse(anchored.code, `The ${label} ${operator}: ${anchored.reason}.`)
    }
  }
  return { role, operator, encPubKey, checkpoint: verified.checkpoint, scope, mode: policy.mode }
}
