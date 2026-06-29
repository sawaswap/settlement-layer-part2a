/**
 * Settlement state machine — mirror of src/types/Types.sol `State` in
 * settlement-layer-part1. Enum ordering IS the ABI; do not reorder.
 * See FIS b (State Machine Mapping).
 */
export enum SettlementState {
  PoICommitted = 0, // escrow locked / entry
  ExecutionOpen = 1, // TW1
  EscalationL1 = 2, // TW2
  EscalationL2_DRP = 3, // TW3 / DRP
  Settled = 4, // terminal
  Reversed = 5, // terminal
}

export type TimeWindow = 'TW1' | 'TW2' | 'TW3' | null

/** UI-facing labels per Agreement C.2 Screen 2 (Pending/Active/Escalated/Settled/Reversed). */
export const stateLabel: Record<SettlementState, string> = {
  [SettlementState.PoICommitted]: 'Pending',
  [SettlementState.ExecutionOpen]: 'Active',
  [SettlementState.EscalationL1]: 'Escalated',
  [SettlementState.EscalationL2_DRP]: 'Escalated (DRP)',
  [SettlementState.Settled]: 'Settled',
  [SettlementState.Reversed]: 'Reversed',
}

/** Tailwind colour token (see tailwind.config.ts `state.*`) for a given state. */
export const stateColor: Record<SettlementState, string> = {
  [SettlementState.PoICommitted]: 'state-pending',
  [SettlementState.ExecutionOpen]: 'state-active',
  [SettlementState.EscalationL1]: 'state-escalated',
  [SettlementState.EscalationL2_DRP]: 'state-escalated',
  [SettlementState.Settled]: 'state-settled',
  [SettlementState.Reversed]: 'state-reversed',
}

/** Which time window is active in a given state (null for terminal states). */
export const activeWindow: Record<SettlementState, TimeWindow> = {
  [SettlementState.PoICommitted]: 'TW1',
  [SettlementState.ExecutionOpen]: 'TW1',
  [SettlementState.EscalationL1]: 'TW2',
  [SettlementState.EscalationL2_DRP]: 'TW3',
  [SettlementState.Settled]: null,
  [SettlementState.Reversed]: null,
}

export const isTerminal = (s: SettlementState) =>
  s === SettlementState.Settled || s === SettlementState.Reversed

export enum Direction {
  CMM = 0, // Crypto → Mobile Money
  MMC = 1, // Mobile Money → Crypto
}

export const directionLabel: Record<Direction, string> = {
  [Direction.CMM]: 'CMM (Crypto → Mobile Money)',
  [Direction.MMC]: 'MMC (Mobile Money → Crypto)',
}
