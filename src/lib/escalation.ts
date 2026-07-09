import { SettlementState } from './state'

/**
 * Escalation-action derivation for Screen 3 (Dispute and Escalation).
 *
 * Derived strictly from the DEPLOYED Settlement contract (settlement-layer-part1,
 * M3 deployment of record), NOT the amended C.2 wording — the two diverge and
 * the deployed contract is the acceptance target (see
 * docs/frontend/notes/part2a-m2-plan.md §2 and 20260708_alex_screen3-spec-vs-deployed):
 *
 *   - A claimed transaction RESTS in EscalationL1 for the whole TW2+TW3 span;
 *     `invokeDRP` is atomic (EscalationL1 → DRP.resolve → terminal in one tx),
 *     so EscalationL2_DRP is never a persisted resting state.
 *   - `expireTW3` is guarded on EscalationL1 (claim on record, full window
 *     elapsed) and always Reverses — it makes no DRP call.
 *
 * Preconditions mirrored from Settlement.sol, with `now <= deadline` allowing an
 * action and `now > deadline` reverting (matching the contract's strict `>`):
 *   submitClaim  — EscalationL1, eligibleClaimant, no claim,   now <= tw2Deadline
 *   updateClaim  — EscalationL1, eligibleClaimant, claim,      now <= tw2Deadline
 *   invokeDRP    — EscalationL1, eligibleClaimant, claim,      now <= tw3Deadline, !drpInvoked
 *   expireTW2    — EscalationL1, permissionless,   no claim,   now >  tw2Deadline  → Reversed
 *   expireTW3    — EscalationL1, permissionless,   claim,      now >  tw3Deadline  → Reversed
 */
export type EscalationActionKey =
  | 'submitClaim'
  | 'updateClaim'
  | 'invokeDRP'
  | 'expireTW2'
  | 'expireTW3'

export interface EscalationAction {
  key: EscalationActionKey
  /** True when the deployed contract would accept the call in the current state. */
  available: boolean
  /** Any wallet may call (the two expiry pokers); false = eligibleClaimant-only. */
  permissionless: boolean
  /** Short reason the action is unavailable (empty when available) — for tooltips/notes. */
  reason: string
}

export interface EscalationInput {
  state: SettlementState
  claimExists: boolean
  drpInvoked: boolean
  isEligibleClaimant: boolean
  committedAt: bigint
  tw1: bigint
  tw2: bigint
  tw3: bigint
  nowSeconds: number
}

export interface EscalationView {
  /** In an actionable escalation state (EscalationL1). */
  inEscalation: boolean
  claimExists: boolean
  /** committedAt + tw1 + tw2 — end of the TW2 claim window. */
  tw2Deadline: number
  /** committedAt + tw1 + tw2 + tw3 — end of the full DRP/TW3 envelope. */
  tw3Deadline: number
  tw2Expired: boolean
  tw3Expired: boolean
  actions: Record<EscalationActionKey, EscalationAction>
}

function action(
  key: EscalationActionKey,
  permissionless: boolean,
  available: boolean,
  reason: string,
): EscalationAction {
  return { key, permissionless, available, reason: available ? '' : reason }
}

export function deriveEscalation(input: EscalationInput): EscalationView {
  const { state, claimExists, drpInvoked, isEligibleClaimant, nowSeconds } = input
  const c = Number(input.committedAt)
  const t1 = Number(input.tw1)
  const t2 = Number(input.tw2)
  const t3 = Number(input.tw3)

  const tw2Deadline = c + t1 + t2
  const tw3Deadline = c + t1 + t2 + t3
  const tw2Expired = nowSeconds > tw2Deadline
  const tw3Expired = nowSeconds > tw3Deadline
  const inEscalation = state === SettlementState.EscalationL1

  // Outside EscalationL1 nothing here is actionable (PoICommitted → Screen 2's
  // pokeTW1; EscalationL2_DRP is transient; terminal states are done).
  if (!inEscalation) {
    const na = (key: EscalationActionKey, permissionless: boolean) =>
      action(key, permissionless, false, 'Not in the claim/escalation window.')
    return {
      inEscalation: false,
      claimExists,
      tw2Deadline,
      tw3Deadline,
      tw2Expired,
      tw3Expired,
      actions: {
        submitClaim: na('submitClaim', false),
        updateClaim: na('updateClaim', false),
        invokeDRP: na('invokeDRP', false),
        expireTW2: na('expireTW2', true),
        expireTW3: na('expireTW3', true),
      },
    }
  }

  const submitClaim = action(
    'submitClaim',
    false,
    !claimExists && isEligibleClaimant && !tw2Expired,
    claimExists
      ? 'A claim has already been submitted.'
      : !isEligibleClaimant
        ? 'Only the eligibleClaimant wallet can submit the claim.'
        : 'The TW2 claim window has expired.',
  )

  const updateClaim = action(
    'updateClaim',
    false,
    claimExists && isEligibleClaimant && !tw2Expired,
    !claimExists
      ? 'No claim to update yet.'
      : !isEligibleClaimant
        ? 'Only the eligibleClaimant wallet can update the claim.'
        : 'The TW2 window for editing the claim has expired.',
  )

  const invokeDRP = action(
    'invokeDRP',
    false,
    claimExists && isEligibleClaimant && !drpInvoked && !tw3Expired,
    !claimExists
      ? 'A claim must be submitted before invoking the DRP.'
      : !isEligibleClaimant
        ? 'Only the eligibleClaimant wallet can invoke the DRP.'
        : drpInvoked
          ? 'The DRP has already been invoked.'
          : 'The DRP window has expired — this transaction now default-reverses via expireTW3.',
  )

  const expireTW2 = action(
    'expireTW2',
    true,
    !claimExists && tw2Expired,
    claimExists
      ? 'A claim is pending — resolution runs through the DRP, not a TW2 default-reverse.'
      : 'TW2 has not elapsed yet.',
  )

  const expireTW3 = action(
    'expireTW3',
    true,
    claimExists && tw3Expired,
    !claimExists
      ? 'No claim on record — the TW2 default-reverse (expireTW2) applies instead.'
      : 'The full TW3 window has not elapsed yet.',
  )

  return {
    inEscalation: true,
    claimExists,
    tw2Deadline,
    tw3Deadline,
    tw2Expired,
    tw3Expired,
    actions: { submitClaim, updateClaim, invokeDRP, expireTW2, expireTW3 },
  }
}
