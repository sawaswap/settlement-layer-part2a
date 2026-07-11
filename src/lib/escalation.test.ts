import { describe, expect, it } from 'vitest'
import { deriveEscalation, type EscalationInput } from './escalation'
import { SettlementState } from './state'

// committedAt + tw1 + tw2 = 1_000_300 (TW2 deadline)
// committedAt + tw1 + tw2 + tw3 = 1_000_600 (TW3 deadline)
const base: Omit<EscalationInput, 'state' | 'claimExists' | 'drpInvoked' | 'isEligibleClaimant' | 'nowSeconds'> = {
  committedAt: 1_000_000n,
  tw1: 100n,
  tw2: 200n,
  tw3: 300n,
}

const IN_TW2 = 1_000_250 // <= tw2Deadline
const IN_TW3 = 1_000_400 // > tw2Deadline, <= tw3Deadline
const PAST_TW3 = 1_000_700 // > tw3Deadline

function derive(over: Partial<EscalationInput>) {
  return deriveEscalation({
    state: SettlementState.EscalationL1,
    claimExists: false,
    drpInvoked: false,
    isEligibleClaimant: true,
    nowSeconds: IN_TW2,
    ...base,
    ...over,
  })
}

describe('escalation-action derivation (deployed-contract semantics)', () => {
  it('computes the TW2/TW3 deadlines from committedAt + windows', () => {
    const v = derive({})
    expect(v.tw2Deadline).toBe(1_000_300)
    expect(v.tw3Deadline).toBe(1_000_600)
  })

  it('exposes the two pokers as permissionless and the claim/DRP actions as claimant-only', () => {
    const v = derive({})
    expect(v.actions.expireTW2.permissionless).toBe(true)
    expect(v.actions.expireTW3.permissionless).toBe(true)
    expect(v.actions.submitClaim.permissionless).toBe(false)
    expect(v.actions.updateClaim.permissionless).toBe(false)
    expect(v.actions.invokeDRP.permissionless).toBe(false)
  })

  it('outside EscalationL1 nothing is actionable', () => {
    for (const state of [
      SettlementState.PoICommitted,
      SettlementState.EscalationL2_DRP,
      SettlementState.Settled,
      SettlementState.Reversed,
    ]) {
      const v = derive({ state })
      expect(v.inEscalation).toBe(false)
      expect(Object.values(v.actions).every((a) => !a.available)).toBe(true)
    }
  })

  it('EscalationL1, no claim, within TW2, eligible → only Submit Claim', () => {
    const v = derive({ claimExists: false, nowSeconds: IN_TW2 })
    expect(v.actions.submitClaim.available).toBe(true)
    expect(v.actions.updateClaim.available).toBe(false)
    expect(v.actions.invokeDRP.available).toBe(false)
    expect(v.actions.expireTW2.available).toBe(false) // not due
    expect(v.actions.expireTW3.available).toBe(false)
  })

  it('non-eligible wallet cannot Submit Claim (permissionless pokers still gated by window/claim)', () => {
    const v = derive({ claimExists: false, isEligibleClaimant: false, nowSeconds: IN_TW2 })
    expect(v.actions.submitClaim.available).toBe(false)
    expect(v.actions.submitClaim.reason).toMatch(/eligibleClaimant/i)
  })

  it('EscalationL1, no claim, past TW2 → expireTW2 (permissionless) default-reverses', () => {
    const v = derive({ claimExists: false, isEligibleClaimant: false, nowSeconds: IN_TW3 })
    expect(v.actions.expireTW2.available).toBe(true)
    expect(v.actions.submitClaim.available).toBe(false) // window expired
    expect(v.actions.expireTW3.available).toBe(false) // no claim
  })

  it('EscalationL1, claim, within TW2, eligible → Invoke DRP + Update Claim; expireTW2 blocked (claim pending)', () => {
    const v = derive({ claimExists: true, nowSeconds: IN_TW2 })
    expect(v.actions.invokeDRP.available).toBe(true)
    expect(v.actions.updateClaim.available).toBe(true)
    expect(v.actions.submitClaim.available).toBe(false) // already exists
    expect(v.actions.expireTW2.available).toBe(false)
    expect(v.actions.expireTW2.reason).toMatch(/pending/i)
    expect(v.actions.expireTW3.available).toBe(false) // not due
  })

  it('EscalationL1, claim, past TW2 but within TW3 → Invoke DRP still open, Update Claim closed', () => {
    const v = derive({ claimExists: true, nowSeconds: IN_TW3 })
    expect(v.actions.invokeDRP.available).toBe(true)
    expect(v.actions.updateClaim.available).toBe(false) // TW2 passed
    expect(v.actions.expireTW3.available).toBe(false) // full window not elapsed
  })

  it('EscalationL1, claim, past TW3 → expireTW3 (permissionless) default-reverses; DRP window closed', () => {
    const v = derive({ claimExists: true, nowSeconds: PAST_TW3 })
    expect(v.actions.expireTW3.available).toBe(true)
    expect(v.actions.invokeDRP.available).toBe(false)
    expect(v.actions.invokeDRP.reason).toMatch(/expired/i)
  })

  it('drpInvoked blocks a second Invoke DRP', () => {
    const v = derive({ claimExists: true, drpInvoked: true, nowSeconds: IN_TW2 })
    expect(v.actions.invokeDRP.available).toBe(false)
    expect(v.actions.invokeDRP.reason).toMatch(/already/i)
  })

  it('claimed transaction past TW3, non-eligible wallet → only expireTW3', () => {
    const v = derive({ claimExists: true, isEligibleClaimant: false, nowSeconds: PAST_TW3 })
    expect(v.actions.expireTW3.available).toBe(true)
    expect(v.actions.invokeDRP.available).toBe(false)
    expect(v.actions.expireTW2.available).toBe(false) // claim pending
  })

  // Both deadline pairs are strictly complementary at their boundary: each side derives from the
  // SAME `now > deadline` comparison (the contract's strict `>`), so the equality instant
  // `now == deadline` still belongs to the in-window action, and `+1` flips to the poker. Pinned
  // at the exact boundary second for the TW2 pair (submitClaim ↔ expireTW2) and the TW3 pair
  // (invokeDRP ↔ expireTW3) so a future off-by-one in `deriveEscalation` fails here.
  describe('deadline-pair complementarity at the equality instant', () => {
    it('TW2 pair at now == tw2Deadline (1_000_300) → Submit Claim open, expireTW2 not', () => {
      const v = derive({ claimExists: false, nowSeconds: 1_000_300 })
      expect(v.tw2Deadline).toBe(1_000_300)
      expect(v.actions.submitClaim.available).toBe(true)
      expect(v.actions.expireTW2.available).toBe(false)
    })

    it('TW2 pair at now == tw2Deadline + 1 → Submit Claim closed, expireTW2 open', () => {
      const v = derive({ claimExists: false, nowSeconds: 1_000_301 })
      expect(v.actions.submitClaim.available).toBe(false)
      expect(v.actions.expireTW2.available).toBe(true)
    })

    it('TW3 pair at now == tw3Deadline (1_000_600) → Invoke DRP open, expireTW3 not', () => {
      const v = derive({ claimExists: true, nowSeconds: 1_000_600 })
      expect(v.tw3Deadline).toBe(1_000_600)
      expect(v.actions.invokeDRP.available).toBe(true)
      expect(v.actions.expireTW3.available).toBe(false)
    })

    it('TW3 pair at now == tw3Deadline + 1 → Invoke DRP closed, expireTW3 open', () => {
      const v = derive({ claimExists: true, nowSeconds: 1_000_601 })
      expect(v.actions.invokeDRP.available).toBe(false)
      expect(v.actions.expireTW3.available).toBe(true)
    })

    it('across each boundary exactly one side is enabled — never both, never neither', () => {
      // TW2 pair (no claim): submitClaim vs expireTW2.
      for (let now = 1_000_298; now <= 1_000_303; now++) {
        const v = derive({ claimExists: false, nowSeconds: now })
        expect(v.actions.submitClaim.available).toBe(now <= 1_000_300)
        expect(v.actions.expireTW2.available).toBe(now > 1_000_300)
      }
      // TW3 pair (claim on record, eligible, not yet invoked): invokeDRP vs expireTW3.
      for (let now = 1_000_598; now <= 1_000_603; now++) {
        const v = derive({ claimExists: true, nowSeconds: now })
        expect(v.actions.invokeDRP.available).toBe(now <= 1_000_600)
        expect(v.actions.expireTW3.available).toBe(now > 1_000_600)
      }
    })
  })

  // Isolates the invokeDRP eligibleClaimant gate: with a claim on record and the DRP window still
  // open (in-window, not yet invoked), a NON-eligible wallet is blocked solely by the claimant
  // gate — every other precondition is satisfied, so the reason names eligibleClaimant, and the
  // permissionless expireTW3 stays closed because the window has not elapsed.
  it('invokeDRP eligibleClaimant gate: claim on record, in-window, non-eligible wallet → blocked on eligibility only', () => {
    const v = derive({ claimExists: true, isEligibleClaimant: false, nowSeconds: IN_TW3 })
    expect(v.actions.invokeDRP.available).toBe(false)
    expect(v.actions.invokeDRP.reason).toMatch(/eligibleClaimant/i)
    // proof the block is the gate, not the window or a missing claim:
    expect(v.tw3Expired).toBe(false) // still in-window
    expect(v.actions.expireTW3.available).toBe(false) // window not elapsed
  })
})
