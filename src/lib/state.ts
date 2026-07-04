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

/**
 * UI-facing labels per Agreement C.2 Screen 2 (Pending/Active/Escalated/
 * Settled/Reversed).
 *
 * Mapping note: the deployed contract's entry state is `PoICommitted` — escrow
 * locked, TW1 running, `submitPoR` accepted (see Settlement.submitPoR/pokeTW1).
 * Per C.2 Screen 1 ("State indicator: confirms transition to Active state")
 * this entry state surfaces as "Active". C.2's "Pending" is the brief
 * pre-confirmation (unmined commit) state, shown by Screen 1 while the tx is in
 * flight — it is not a distinct on-chain enum value. `ExecutionOpen` is a
 * reserved enum value not entered in the Part 1 flow; labelled "Active" too.
 */
export const stateLabel: Record<SettlementState, string> = {
  [SettlementState.PoICommitted]: 'Active',
  [SettlementState.ExecutionOpen]: 'Active',
  [SettlementState.EscalationL1]: 'Escalated',
  [SettlementState.EscalationL2_DRP]: 'Escalated (DRP)',
  [SettlementState.Settled]: 'Settled',
  [SettlementState.Reversed]: 'Reversed',
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
