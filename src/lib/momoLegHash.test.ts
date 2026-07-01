import { describe, expect, it } from 'vitest'
import {
  canonicalPreimage,
  computeMomoLegHash,
  stableStringify,
  type MomoLegPreimage,
  PREIMAGE_VERSION,
} from './momoLegHash'
import { Direction } from './state'

const preimage: MomoLegPreimage = {
  version: PREIMAGE_VERSION,
  direction: Direction.CMM,
  corridor: {
    originChain: 'base-sepolia',
    originAsset: 'USDC',
    destCountry: '+243',
    destMno: 'vodacom',
    destCurrency: 'USD',
  },
  amounts: { amountSent: '10.5' },
  participant: { userCMomoNumber: '+243000000000' },
}

describe('momoLegHash composition', () => {
  it('canonicalisation is key-order-independent', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
  })

  it('same preimage → same hash regardless of object key order', () => {
    const reordered: MomoLegPreimage = {
      participant: preimage.participant,
      amounts: preimage.amounts,
      corridor: preimage.corridor,
      direction: preimage.direction,
      version: preimage.version,
    }
    expect(computeMomoLegHash(preimage)).toBe(computeMomoLegHash(reordered))
  })

  it('different preimage → different hash', () => {
    const other: MomoLegPreimage = { ...preimage, amounts: { amountSent: '11' } }
    expect(computeMomoLegHash(other)).not.toBe(computeMomoLegHash(preimage))
  })

  it('produces a 32-byte (0x + 64 hex) commitment', () => {
    expect(computeMomoLegHash(preimage)).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('canonical form is stable JSON', () => {
    expect(canonicalPreimage(preimage)).toContain('"originChain":"base-sepolia"')
  })
})
