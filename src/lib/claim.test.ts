import { describe, expect, it } from 'vitest'
import { hexToString, type Hex } from 'viem'
import { composeClaimData, CLAIM_VERSION } from './claim'

const STID_A = ('0x' + '11'.repeat(32)) as Hex
const STID_B = ('0x' + '22'.repeat(32)) as Hex

describe('claim payload composition', () => {
  it('is non-empty and deterministic for a given STID', () => {
    const a1 = composeClaimData(STID_A)
    const a2 = composeClaimData(STID_A)
    expect(a1).toBe(a2)
    expect(a1.length).toBeGreaterThan(2) // more than just '0x'
  })

  it('differs per STID and carries the version tag', () => {
    expect(composeClaimData(STID_A)).not.toBe(composeClaimData(STID_B))
    const decoded = JSON.parse(hexToString(composeClaimData(STID_A)))
    expect(decoded.v).toBe(CLAIM_VERSION)
    expect(decoded.stid).toBe(STID_A)
  })
})
