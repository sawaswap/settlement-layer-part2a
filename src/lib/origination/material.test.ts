import { describe, expect, it } from 'vitest'
import { buildMaterial, freshEntropy } from './material'
import { acceptQuote } from './quoteRecord'
import { CHAIN_ID, NOW_SECONDS, quoteRecord, SETTLEMENT, USDC } from './testing'

/**
 * Absolute anchor for the Console's assembly of the three domains.
 *
 * The expected values were computed in the Part 2B repository (`9f1e56a`)
 * directly with `@sawaswap/crypto`, from the fields written out by hand — not
 * through `buildMaterial` — so a field this module fills wrongly (the sender
 * context, `createdBy`, the reference, an address) moves the hash away from it.
 */
const FIXED_ENTROPY = freshEntropy((length) => {
  const byte = length === 10 ? 1 : 0
  return new Uint8Array(length).fill(byte)
})
FIXED_ENTROPY.endpointSalt.fill(2)
FIXED_ENTROPY.operationalBlindingInput.fill(3)
FIXED_ENTROPY.identityBlindingInput.fill(4)

const PINNED_QUOTE_ID = '0x4ad6fdd32ed586cab0ffa3fcf67e989ad88454850a5f1a62d8d67f8b32920552'
const PINNED_STCN = 'SW-040G-2081-040G-2081'
const PINNED_MOMO_LEG_HASH = '0xbc984a0294b4bcaff6d59ccc8223cd287fd83b80beac29dea8be2e153c684f55'

function material() {
  const record = quoteRecord()
  record.bridge.address = '0x2222222222222222222222222222222222222222'
  return buildMaterial({
    accepted: acceptQuote({
      record,
      escrowAmount: 2_200_000n,
      escrow: { chainId: CHAIN_ID, tokenAddress: USDC, tokenSymbol: 'USDC', tokenDecimals: 6 },
      now: BigInt(NOW_SECONDS),
    }),
    userCMomoEndpoint: '+243810000000',
    originator: '0x3333333333333333333333333333333333333333',
    chainId: CHAIN_ID,
    settlement: SETTLEMENT,
    tokenAddress: USDC,
    executionInstructions: 'Pay the recipient in full.',
    entropy: FIXED_ENTROPY,
    createdAt: BigInt(NOW_SECONDS),
  })
}

describe('buildMaterial', () => {
  it('reproduces the momoLegHash computed independently from hand-written fields', () => {
    const built = material()
    expect(built.publicFields.quoteId).toBe(PINNED_QUOTE_ID)
    expect(built.publicFields.stcn).toBe(PINNED_STCN)
    expect(built.momoLegHash).toBe(PINNED_MOMO_LEG_HASH)
  })

  it('uses the STCN as the MoMo reference and the quote for both amounts', () => {
    const built = material()
    expect(built.identity.momoReference).toBe(built.publicFields.stcn)
    expect(built.publicFields.escrowAmount).toBe(2_200_000n)
    expect(built.publicFields.momoAmount).toBe(219n)
    expect(built.publicFields.momoCurrency).toBe('USD')
  })
})
