import { describe, expect, it } from 'vitest'
import { resolveSlots, beneficiaryLabel, deriveAgentB, isForbiddenParty, ZERO_ADDRESS } from './slots'
import { Direction } from './state'

const A = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa' as const
const B = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' as const
const C = '0xCcCCccCCCCCCCCCCCCCCcccccCcCccCcCcCCCCcCc' as const

const SETTLEMENT = '0x9645827808E25b4e19B1B8A05B075606dfF86331' as const
const USDC = '0x1234567890abcdef1234567890ABCDEF12345678' as const

describe('direction-dependent slot mapping (Francis Q1 / v0.12.0 Tables 1/2)', () => {
  it('CMM: originator=connected(User A), beneficiary=Agent B, eligibleClaimant=User C relay', () => {
    const slots = resolveSlots({ direction: Direction.CMM, connected: A, beneficiary: B, userCRelay: C })
    expect(slots).toEqual({ originator: A, beneficiary: B, eligibleClaimant: C })
  })

  it('MMC: originator=connected(Agent B), beneficiary=User A, eligibleClaimant=connected', () => {
    const slots = resolveSlots({ direction: Direction.MMC, connected: B, beneficiary: A })
    expect(slots).toEqual({ originator: B, beneficiary: A, eligibleClaimant: B })
  })

  it('CMM without a relay address is rejected', () => {
    expect(() => resolveSlots({ direction: Direction.CMM, connected: A, beneficiary: B })).toThrow()
  })

  it('labels the beneficiary input by direction', () => {
    expect(beneficiaryLabel[Direction.CMM]).toContain('Agent B')
    expect(beneficiaryLabel[Direction.MMC]).toContain('User A')
  })

  it('derives Agent B from the correct slot by direction', () => {
    expect(deriveAgentB(Direction.CMM, A, B)).toBe(B) // CMM: Agent B = beneficiary
    expect(deriveAgentB(Direction.MMC, B, A)).toBe(B) // MMC: Agent B = originator
  })
})

describe('isForbiddenParty — KRAIT-001 client-side party guard', () => {
  const forbidden = [SETTLEMENT, USDC] as const

  it('rejects the zero address (always, regardless of the list)', () => {
    expect(isForbiddenParty(ZERO_ADDRESS, [])).toBe(true)
    expect(isForbiddenParty(ZERO_ADDRESS, forbidden)).toBe(true)
  })

  it('rejects the Settlement and escrow-token contract addresses', () => {
    expect(isForbiddenParty(SETTLEMENT, forbidden)).toBe(true)
    expect(isForbiddenParty(USDC, forbidden)).toBe(true)
  })

  it('is case-insensitive (checksummed vs lower-case are the same address)', () => {
    expect(isForbiddenParty(SETTLEMENT.toLowerCase() as typeof SETTLEMENT, forbidden)).toBe(true)
    expect(isForbiddenParty(SETTLEMENT, [SETTLEMENT.toLowerCase() as typeof SETTLEMENT])).toBe(true)
  })

  it('allows ordinary party addresses', () => {
    expect(isForbiddenParty(A, forbidden)).toBe(false)
    expect(isForbiddenParty(B, forbidden)).toBe(false)
    expect(isForbiddenParty(C, forbidden)).toBe(false)
  })
})
