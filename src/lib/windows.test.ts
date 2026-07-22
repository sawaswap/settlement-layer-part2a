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

  it('EscalationL1 advances TW2 → TW3 by the tw2 deadline', () => {
    // Deployed semantics: invokeDRP is atomic, so nothing rests in
    // EscalationL2_DRP — a claimed row lives its TW3 span inside EscalationL1.
    // Before tw2Deadline (1_000_300) it is the TW2 claim window…
    const inTw2 = windowInfo(SettlementState.EscalationL1, committedAt, tw1, tw2, tw3, 1_000_250)
    expect(inTw2.label).toBe('TW2')
    expect(inTw2.endsAt).toBe(1_000_300)
    // …past it, the row is in its TW3 (DRP / default-reverse) span, still EscalationL1.
    const inTw3 = windowInfo(SettlementState.EscalationL1, committedAt, tw1, tw2, tw3, 1_000_400)
    expect(inTw3.label).toBe('TW3')
    expect(inTw3.endsAt).toBe(1_000_600) // committedAt + tw1 + tw2 + tw3
    expect(inTw3.expired).toBe(false)
  })

  it('EscalationL1 flips at the exact tw2Deadline second (strict >)', () => {
    // Pins the boundary to the second — the check above uses a before/after pair
    // with a gap. Convention matches the tw3Deadline/expired boundary: strict >.
    const tw2Deadline = 1_000_300 // committedAt + tw1 + tw2
    const at = windowInfo(SettlementState.EscalationL1, committedAt, tw1, tw2, tw3, tw2Deadline)
    expect(at.label).toBe('TW2') // AT the deadline it is still TW2
    const past = windowInfo(SettlementState.EscalationL1, committedAt, tw1, tw2, tw3, tw2Deadline + 1)
    expect(past.label).toBe('TW3') // one second past, it is TW3
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
