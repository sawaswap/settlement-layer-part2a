import { describe, expect, it } from 'vitest'
import { resolveSlots, beneficiaryLabel } from './slots'
import { Direction } from './state'

const A = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa' as const
const B = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' as const
const C = '0xCcCCccCCCCCCCCCCCCCCcccccCcCccCcCcCCCCcCc' as const

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
})
