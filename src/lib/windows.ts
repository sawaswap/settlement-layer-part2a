import { SettlementState } from './state'

/**
 * Time-window derivation (Agreement C.2 Screen 2 — "active time window with a
 * live countdown based on block.timestamp").
 *
 * Windows are locked at PoI (committedAt, tw1/tw2/tw3) and stack:
 *   TW1 ends at committedAt + tw1                  (state PoICommitted)
 *   TW2 ends at committedAt + tw1 + tw2            (state EscalationL1)
 *   TW3 ends at committedAt + tw1 + tw2 + tw3      (state EscalationL2_DRP)
 * Terminal states (Settled/Reversed) have no active window.
 */
export type WindowLabel = 'TW1' | 'TW2' | 'TW3' | null

export interface WindowInfo {
  label: WindowLabel
  /** Unix seconds when the active window ends, or null in terminal states. */
  endsAt: number | null
  /** Seconds remaining, clamped to >= 0. */
  remaining: number
  /** True once the active window has elapsed. */
  expired: boolean
}

export function windowInfo(
  state: SettlementState,
  committedAt: bigint,
  tw1: bigint,
  tw2: bigint,
  tw3: bigint,
  nowSeconds: number,
): WindowInfo {
  const c = Number(committedAt)
  const t1 = Number(tw1)
  const t2 = Number(tw2)
  const t3 = Number(tw3)

  let label: WindowLabel = null
  let endsAt: number | null = null

  switch (state) {
    case SettlementState.PoICommitted:
    case SettlementState.ExecutionOpen:
      label = 'TW1'
      endsAt = c + t1
      break
    case SettlementState.EscalationL1:
      label = 'TW2'
      endsAt = c + t1 + t2
      break
    case SettlementState.EscalationL2_DRP:
      label = 'TW3'
      endsAt = c + t1 + t2 + t3
      break
    default:
      return { label: null, endsAt: null, remaining: 0, expired: false }
  }

  return {
    label,
    endsAt,
    remaining: Math.max(0, endsAt - nowSeconds),
    expired: nowSeconds > endsAt,
  }
}
