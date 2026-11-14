import { keyFingerprint } from '@sawaswap/crypto'
import { describe, expect, it } from 'vitest'
import { anchorFor, parseKeyAnchors } from './keyBinding'
import { acceptQuote, parseQuoteRecord } from './quoteRecord'
import { atomicUnits, buildSelection, decimalFraction, type SelectionInput } from './selection'
import { BRIDGE, CHAIN_ID, NOW_SECONDS, RELAY, SETTLEMENT, USDC } from './testing'

const input = (overrides: Partial<SelectionInput> = {}): SelectionInput => ({
  chainId: CHAIN_ID,
  chainName: 'base-sepolia',
  settlement: SETTLEMENT,
  tokenAddress: USDC,
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  destination: 'momo:+243/vodacom/USD',
  referenceRate: '1',
  marginBps: 10,
  minAmount: '1',
  maxAmount: '1000',
  validitySeconds: 3600,
  bridge: {
    address: BRIDGE.address,
    momoEndpoint: '+243820000000',
    sequence: '1',
    fingerprint: keyFingerprint(BRIDGE.box.publicKey),
  },
  relay: {
    address: RELAY.address,
    sequence: '1',
    fingerprint: keyFingerprint(RELAY.box.publicKey),
  },
  ...overrides,
})

const escrow = { chainId: CHAIN_ID, tokenAddress: USDC, tokenSymbol: 'USDC', tokenDecimals: 6 }

describe('pilot selection script', () => {
  it('issues a record the Console accepts, pricing 2.20 USDC at 2.19 USD for one hour', () => {
    const { record } = buildSelection(input(), NOW_SECONDS)
    const parsed = parseQuoteRecord(JSON.stringify(record))
    const accepted = acceptQuote({
      record: parsed,
      escrowAmount: 2_200_000n,
      escrow,
      now: BigInt(NOW_SECONDS + 3600),
    })
    expect(accepted.momoAmount).toBe(219n)
    expect(() =>
      acceptQuote({
        record: parsed,
        escrowAmount: 2_200_000n,
        escrow,
        now: BigInt(NOW_SECONDS + 3601),
      }),
    ).toThrow()
  })

  it("reproduces the Kinshasa pilot quote's rate: 0.9990 as 99_900_000 / 100_000_000 per the ADR's provenance rule", () => {
    const { quote } = buildSelection(input(), NOW_SECONDS)
    expect(quote.rateNumerator * 100_000_000n).toBe(99_900_000n * quote.rateDenominator)
  })

  it('prices XAF with no minor units: 2.20 USDC at 600 → 1318 XAF', () => {
    const { record } = buildSelection(
      input({ destination: 'momo:+242/airtel/XAF', referenceRate: '600' }),
      NOW_SECONDS,
    )
    const accepted = acceptQuote({
      record: parseQuoteRecord(JSON.stringify(record)),
      escrowAmount: 2_200_000n,
      escrow,
      now: BigInt(NOW_SECONDS),
    })
    expect(record.quote.outputDecimals).toBe(0)
    expect(accepted.momoAmount).toBe(1318n)
  })

  it('prints anchors the Console reads back for both roles', () => {
    const { anchors } = buildSelection(input(), NOW_SECONDS)
    const set = parseKeyAnchors(JSON.stringify(anchors))
    expect(anchorFor(set, 'BRIDGE', BRIDGE.address)).toMatchObject({
      sequence: 1n,
      fingerprint: keyFingerprint(BRIDGE.box.publicKey),
    })
    expect(anchorFor(set, 'RELAY', RELAY.address)).toMatchObject({
      sequence: 1n,
      fingerprint: keyFingerprint(RELAY.box.publicKey),
    })
  })

  it('refuses the same operator twice, a malformed fingerprint and a non-E.164 Agent B number', () => {
    expect(() =>
      buildSelection(input({ relay: { ...input().relay, address: BRIDGE.address } }), NOW_SECONDS),
    ).toThrow(/different operators/)
    expect(() =>
      buildSelection(input({ relay: { ...input().relay, fingerprint: '0xABC' } }), NOW_SECONDS),
    ).toThrow(/fingerprint/)
    expect(() =>
      buildSelection(
        input({ bridge: { ...input().bridge, momoEndpoint: '243820000000' } }),
        NOW_SECONDS,
      ),
    ).toThrow(/E.164/)
  })

  it('converts decimal strings exactly', () => {
    expect(decimalFraction('0.999')).toEqual({ numerator: 999n, denominator: 1000n })
    expect(atomicUnits('2.2', 6)).toBe(2_200_000n)
    expect(() => atomicUnits('0.0000001', 6)).toThrow()
  })
})
