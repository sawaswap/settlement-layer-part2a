import { describe, expect, it } from 'vitest'
import { friendlyContractError } from './contractErrors'

describe('contract revert decoding', () => {
  it('maps a custom error name from data.errorName', () => {
    const err = { name: 'ContractFunctionRevertedError', data: { errorName: 'NotEligibleClaimant' } }
    expect(friendlyContractError(err)).toMatch(/eligibleClaimant/i)
  })

  it('maps each of the dispute-path custom errors to a message', () => {
    const cases: Record<string, RegExp> = {
      WindowExpired: /expired/i,
      EscalationNotDue: /not due/i,
      ClaimAlreadyExists: /already been submitted/i,
      NoClaim: /no claim/i,
      ClaimPending: /pending/i,
      DRPAlreadyInvoked: /already been invoked/i,
    }
    for (const [name, re] of Object.entries(cases)) {
      expect(friendlyContractError({ data: { errorName: name } })).toMatch(re)
    }
  })

  it('falls back to scanning the message when no structured errorName is present', () => {
    const err = { message: 'execution reverted: ClaimPending()' }
    expect(friendlyContractError(err)).toMatch(/pending/i)
  })

  it('decodes MockDRP string reverts', () => {
    expect(friendlyContractError({ reason: 'MockDRP: already-resolved' })).toMatch(/already resolved/i)
    expect(friendlyContractError({ reason: 'MockDRP: configured-revert' })).toMatch(/test-harness/i)
  })

  it('delegates wallet-layer errors to the connection decoder', () => {
    expect(friendlyContractError({ code: 4001 })).toMatch(/rejected/i)
  })

  it('returns empty string for no error', () => {
    expect(friendlyContractError(null)).toBe('')
  })
})
