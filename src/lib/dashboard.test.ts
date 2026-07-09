import { describe, expect, it } from 'vitest'
import { filterRows, matchesStateFilter, matchesWindowFilter, type AgentTxRow } from './dashboard'
import { SettlementState, Direction } from './state'

function row(state: SettlementState): AgentTxRow {
  return {
    stid: ('0x' + '00'.repeat(32)) as `0x${string}`,
    direction: Direction.CMM,
    state,
    escrowAmount: 0n,
    originator: '0x0000000000000000000000000000000000000001',
    beneficiary: '0x0000000000000000000000000000000000000002',
    eligibleClaimant: '0x0000000000000000000000000000000000000003',
    committedAt: 0n,
    tw1: 0n,
    tw2: 0n,
    tw3: 0n,
    porSubmitted: false,
    drpInvoked: false,
  }
}

describe('dashboard filtering', () => {
  it('state filter groups Active/Escalated/terminal correctly', () => {
    expect(matchesStateFilter(SettlementState.PoICommitted, 'active')).toBe(true)
    expect(matchesStateFilter(SettlementState.ExecutionOpen, 'active')).toBe(true)
    expect(matchesStateFilter(SettlementState.EscalationL1, 'escalated')).toBe(true)
    expect(matchesStateFilter(SettlementState.EscalationL2_DRP, 'escalated')).toBe(true)
    expect(matchesStateFilter(SettlementState.Settled, 'settled')).toBe(true)
    expect(matchesStateFilter(SettlementState.Reversed, 'reversed')).toBe(true)
    expect(matchesStateFilter(SettlementState.Settled, 'active')).toBe(false)
    expect(matchesStateFilter(SettlementState.PoICommitted, 'all')).toBe(true)
  })

  it('window filter maps to the active window of the state', () => {
    expect(matchesWindowFilter(SettlementState.PoICommitted, 'TW1')).toBe(true)
    expect(matchesWindowFilter(SettlementState.EscalationL1, 'TW2')).toBe(true)
    expect(matchesWindowFilter(SettlementState.EscalationL2_DRP, 'TW3')).toBe(true)
    expect(matchesWindowFilter(SettlementState.EscalationL1, 'TW1')).toBe(false)
    expect(matchesWindowFilter(SettlementState.Settled, 'TW1')).toBe(false) // terminal has no window
    expect(matchesWindowFilter(SettlementState.Settled, 'all')).toBe(true)
  })

  it('combines state + window filters', () => {
    const rows = [
      row(SettlementState.PoICommitted),
      row(SettlementState.EscalationL1),
      row(SettlementState.Settled),
      row(SettlementState.Reversed),
    ]
    expect(filterRows(rows, 'all', 'all')).toHaveLength(4)
    expect(filterRows(rows, 'escalated', 'all')).toHaveLength(1)
    expect(filterRows(rows, 'all', 'TW2')).toHaveLength(1)
    expect(filterRows(rows, 'active', 'TW2')).toHaveLength(0) // active is TW1, not TW2
  })
})
