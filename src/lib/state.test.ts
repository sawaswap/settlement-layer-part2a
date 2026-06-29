import { describe, expect, it } from 'vitest'
import {
  SettlementState,
  activeWindow,
  isTerminal,
  stateLabel,
} from './state'

describe('settlement state machine', () => {
  it('labels each state per Agreement C.2 Screen 2', () => {
    expect(stateLabel[SettlementState.PoICommitted]).toBe('Pending')
    expect(stateLabel[SettlementState.ExecutionOpen]).toBe('Active')
    expect(stateLabel[SettlementState.EscalationL1]).toBe('Escalated')
    expect(stateLabel[SettlementState.Settled]).toBe('Settled')
    expect(stateLabel[SettlementState.Reversed]).toBe('Reversed')
  })

  it('maps states to the active time window', () => {
    expect(activeWindow[SettlementState.ExecutionOpen]).toBe('TW1')
    expect(activeWindow[SettlementState.EscalationL1]).toBe('TW2')
    expect(activeWindow[SettlementState.EscalationL2_DRP]).toBe('TW3')
    expect(activeWindow[SettlementState.Settled]).toBeNull()
  })

  it('identifies terminal states', () => {
    expect(isTerminal(SettlementState.Settled)).toBe(true)
    expect(isTerminal(SettlementState.Reversed)).toBe(true)
    expect(isTerminal(SettlementState.ExecutionOpen)).toBe(false)
  })
})
