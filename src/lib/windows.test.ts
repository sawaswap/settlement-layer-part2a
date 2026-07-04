import { describe, expect, it } from 'vitest'
import { windowInfo } from './windows'
import { SettlementState } from './state'

const committedAt = 1_000_000n
const tw1 = 100n
const tw2 = 200n
const tw3 = 300n

describe('time-window derivation', () => {
  it('TW1 is active in PoICommitted and counts down', () => {
    const w = windowInfo(SettlementState.PoICommitted, committedAt, tw1, tw2, tw3, 1_000_040)
    expect(w.label).toBe('TW1')
    expect(w.endsAt).toBe(1_000_100)
    expect(w.remaining).toBe(60)
    expect(w.expired).toBe(false)
  })

  it('TW1 expires after committedAt + tw1', () => {
    const w = windowInfo(SettlementState.PoICommitted, committedAt, tw1, tw2, tw3, 1_000_150)
    expect(w.remaining).toBe(0)
    expect(w.expired).toBe(true)
  })

  it('TW2 stacks on TW1 in EscalationL1', () => {
    const w = windowInfo(SettlementState.EscalationL1, committedAt, tw1, tw2, tw3, 1_000_000)
    expect(w.label).toBe('TW2')
    expect(w.endsAt).toBe(1_000_300) // committedAt + tw1 + tw2
  })

  it('TW3 stacks on TW1+TW2 in EscalationL2_DRP', () => {
    const w = windowInfo(SettlementState.EscalationL2_DRP, committedAt, tw1, tw2, tw3, 1_000_000)
    expect(w.label).toBe('TW3')
    expect(w.endsAt).toBe(1_000_600) // committedAt + tw1 + tw2 + tw3
  })

  it('terminal states have no active window', () => {
    for (const s of [SettlementState.Settled, SettlementState.Reversed]) {
      const w = windowInfo(s, committedAt, tw1, tw2, tw3, 1_000_000)
      expect(w.label).toBeNull()
      expect(w.endsAt).toBeNull()
    }
  })
})
