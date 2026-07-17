import { describe, expect, it } from 'vitest'
import { filterRows, matchesStateFilter, matchesWindowFilter, type AgentTxRow } from './dashboard'
import { SettlementState, Direction } from './state'

type Windows = { committedAt?: bigint; tw1?: bigint; tw2?: bigint; tw3?: bigint }

function row(state: SettlementState, w: Windows = {}): AgentTxRow {
  return {
    stid: ('0x' + '00'.repeat(32)) as `0x${string}`,
    direction: Direction.CMM,
    state,
    escrowAmount: 0n,
    originator: '0x0000000000000000000000000000000000000001',
    beneficiary: '0x0000000000000000000000000000000000000002',
    eligibleClaimant: '0x0000000000000000000000000000000000000003',
    committedAt: w.committedAt ?? 0n,
    tw1: w.tw1 ?? 0n,
    tw2: w.tw2 ?? 0n,
    tw3: w.tw3 ?? 0n,
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

  it('window filter is time-aware: EscalationL1 is TW2 before its tw2 deadline, TW3 after', () => {
    const w = { committedAt: 1000n, tw1: 100n, tw2: 200n, tw3: 300n } // tw2Deadline 1300, tw3Deadline 1600
    const esc = row(SettlementState.EscalationL1, w)
    const poi = row(SettlementState.PoICommitted, w)

    // PoICommitted is TW1 regardless of the clock.
    expect(matchesWindowFilter(poi, 'TW1', 1050)).toBe(true)
    expect(matchesWindowFilter(poi, 'TW2', 1050)).toBe(false)

    // EscalationL1 before tw2Deadline → the TW2 claim window.
    expect(matchesWindowFilter(esc, 'TW2', 1200)).toBe(true)
    expect(matchesWindowFilter(esc, 'TW3', 1200)).toBe(false)

    // EscalationL1 past tw2Deadline → its TW3 (DRP / default-reverse) span — the
    // row a "TW3" filter must surface. A state-only mapping would miss it.
    expect(matchesWindowFilter(esc, 'TW3', 1400)).toBe(true)
    expect(matchesWindowFilter(esc, 'TW2', 1400)).toBe(false)

    // Terminal states have no active window.
    expect(matchesWindowFilter(row(SettlementState.Settled, w), 'TW1', 1400)).toBe(false)
    expect(matchesWindowFilter(row(SettlementState.Settled, w), 'all', 1400)).toBe(true)
  })

  it('combines state + window filters using the time-aware window', () => {
    // Two claimed EscalationL1 rows with different deadlines: at now=1200 one has
    // passed its tw2Deadline (→ TW3), the other has not (→ TW2).
    const early = row(SettlementState.EscalationL1, { committedAt: 0n, tw1: 100n, tw2: 200n, tw3: 300n }) // tw2Deadline 300
    const late = row(SettlementState.EscalationL1, { committedAt: 1000n, tw1: 100n, tw2: 200n, tw3: 300n }) // tw2Deadline 1300
    const rows = [
      early,
      late,
      row(SettlementState.PoICommitted, { tw1: 5000n }), // TW1 at now=1200
      row(SettlementState.Settled),
    ]
    const now = 1200
    expect(filterRows(rows, 'all', 'all', now)).toHaveLength(4)
    expect(filterRows(rows, 'escalated', 'all', now)).toHaveLength(2)
    expect(filterRows(rows, 'all', 'TW3', now)).toHaveLength(1) // only `early` has passed its tw2Deadline
    expect(filterRows(rows, 'all', 'TW2', now)).toHaveLength(1) // `late` is still in its claim window
    expect(filterRows(rows, 'active', 'TW2', now)).toHaveLength(0) // active rows are TW1, not TW2
  })
})
