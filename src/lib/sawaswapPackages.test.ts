import { describe, expect, it } from 'vitest'
import { keccak256, toBytes } from 'viem'
import { PILOT_QUOTE_PROVIDER_ID } from '@sawaswap/crypto'
import { SETTLEMENT_CHAIN_ID } from '@sawaswap/chain-client'

// The vendored packages' own tests run under `pnpm test:vendored`. This file
// only proves the Console resolves them the way its code will: through its own
// TypeScript, its own Vite and its own copy of viem.
describe('vendored @sawaswap packages', () => {
  it('resolve from the Console with their exports intact', () => {
    expect(SETTLEMENT_CHAIN_ID).toBe(84532n)
    // Spec §2.6a fixes the pilot provider identifier as this digest.
    expect(PILOT_QUOTE_PROVIDER_ID).toBe(keccak256(toBytes('SAWASWAP_PILOT_QUOTE_AUTHORITY_V1')))
  })
})
