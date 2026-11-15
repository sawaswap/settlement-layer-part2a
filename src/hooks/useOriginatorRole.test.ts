import { keccak256, toBytes } from 'viem'
import { describe, expect, it } from 'vitest'
import { canOriginate, CONSOLE_ORIGINATOR_ROLE } from './useOriginatorRole'

describe('CR-CONSOLE-1', () => {
  it('pins the role to its absolute value, read on Base Sepolia on 2 November 2026', () => {
    expect(CONSOLE_ORIGINATOR_ROLE).toBe(
      '0x92fef97c968f206ab0606b03edb5b431abe7259117c17ffd9d54f79bd4407b70',
    )
    expect(keccak256(toBytes('SAWASWAP_CONSOLE_ORIGINATOR'))).toBe(CONSOLE_ORIGINATOR_ROLE)
  })

  it('opens for the admin and for the originator role, and stays closed for anyone else', () => {
    expect(canOriginate({ isAdmin: true, isOriginator: false })).toBe(true)
    expect(canOriginate({ isAdmin: false, isOriginator: true })).toBe(true)
    expect(canOriginate({ isAdmin: false, isOriginator: false })).toBe(false)
  })
})
