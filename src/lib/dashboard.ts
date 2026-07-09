import type { Hex } from 'viem'
import { SettlementState, activeWindow, Direction, type TimeWindow } from './state'

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

export function matchesWindowFilter(state: SettlementState, f: WindowFilter): boolean {
  return f === 'all' ? true : activeWindow[state] === f
}

export function filterRows(
  rows: AgentTxRow[],
  stateFilter: StateFilter,
  windowFilter: WindowFilter,
): AgentTxRow[] {
  return rows.filter(
    (r) => matchesStateFilter(r.state, stateFilter) && matchesWindowFilter(r.state, windowFilter),
  )
}
