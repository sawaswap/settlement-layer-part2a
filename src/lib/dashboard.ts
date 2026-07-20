import type { Hex } from 'viem'
import { SettlementState, Direction, type TimeWindow } from './state'
import { windowInfo } from './windows'

/**
 * A row in the Agent B dashboard (Agreement C.2 Screen 4). Discovery is by the
 * connected wallet's indexed slots in PoICommitted (originator / beneficiary),
 * which is where Agent B always sits — beneficiary in CMM, originator in MMC
 * (lib/slots). Fields are the on-chain monitoring set; identifying participant
 * metadata is the encrypted-preimage design item and shown as pending.
 */
export interface AgentTxRow {
  stid: Hex
  direction: Direction
  state: SettlementState
  escrowAmount: bigint
  originator: Hex
  beneficiary: Hex
  eligibleClaimant: Hex
  committedAt: bigint
  tw1: bigint
  tw2: bigint
  tw3: bigint
  porSubmitted: boolean
  drpInvoked: boolean
}

export type StateFilter = 'all' | 'active' | 'escalated' | 'settled' | 'reversed'
export type WindowFilter = 'all' | Exclude<TimeWindow, null>

export const stateFilterOptions: { key: StateFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'settled', label: 'Settled' },
  { key: 'reversed', label: 'Reversed' },
]

export const windowFilterOptions: { key: WindowFilter; label: string }[] = [
  { key: 'all', label: 'Any window' },
  { key: 'TW1', label: 'TW1' },
  { key: 'TW2', label: 'TW2' },
  { key: 'TW3', label: 'TW3' },
]

export function matchesStateFilter(state: SettlementState, f: StateFilter): boolean {
  switch (f) {
    case 'all':
      return true
    case 'active':
      return state === SettlementState.PoICommitted || state === SettlementState.ExecutionOpen
    case 'escalated':
      return state === SettlementState.EscalationL1 || state === SettlementState.EscalationL2_DRP
    case 'settled':
      return state === SettlementState.Settled
    case 'reversed':
      return state === SettlementState.Reversed
  }
}

/**
 * The time window a row is effectively in, by the deadlines rather than by state
 * alone. This is the same derivation the TxCard uses (windowInfo), so the filter
 * and the card never disagree — in particular a claimed EscalationL1 row past its
 * tw2Deadline reports TW3 (its DRP / default-reverse span), not TW2.
 */
export function rowWindow(row: AgentTxRow, now: number): TimeWindow {
  return windowInfo(row.state, row.committedAt, row.tw1, row.tw2, row.tw3, now).label
}

export function matchesWindowFilter(row: AgentTxRow, f: WindowFilter, now: number): boolean {
  return f === 'all' ? true : rowWindow(row, now) === f
}

export function filterRows(
  rows: AgentTxRow[],
  stateFilter: StateFilter,
  windowFilter: WindowFilter,
  now: number,
): AgentTxRow[] {
  return rows.filter(
    (r) => matchesStateFilter(r.state, stateFilter) && matchesWindowFilter(r, windowFilter, now),
  )
}
