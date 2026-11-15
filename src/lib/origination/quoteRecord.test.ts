import { PILOT_QUOTE_PROVIDER_ID, quoteId } from '@sawaswap/crypto'
import { describe, expect, it } from 'vitest'
import { OriginationRefusal } from './errors'
import {
  acceptQuote,
  assertCommittedPair,
  encodeQuoteRecord,
  parseQuoteRecord,
  QUOTE_RECORD_FORMAT,
  type AuthorisedQuoteRecord,
} from './quoteRecord'
import { BRIDGE, CHAIN_ID, NOW_SECONDS, quoteRecord, quoteRecordText, RELAY, USDC } from './testing'

const escrow = { chainId: CHAIN_ID, tokenAddress: USDC, tokenSymbol: 'USDC', tokenDecimals: 6 }

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof OriginationRefusal) return error.code
    throw error
  }
  return 'ACCEPTED'
}

const accept = (record: AuthorisedQuoteRecord, escrowAmount = 2_200_000n, now = NOW_SECONDS) =>
  acceptQuote({ record, escrowAmount, escrow, now: BigInt(now) })

describe('Authorised Quote Record — parse', () => {
  it('round-trips the wire form the selection script writes', () => {
    const record = quoteRecord()
    const parsed = parseQuoteRecord(quoteRecordText(record))
    expect(encodeQuoteRecord(parsed)).toEqual(encodeQuoteRecord(record))
    expect(quoteId(parsed.quote)).toBe(record.quoteId)
    expect(encodeQuoteRecord(parsed).format).toBe(QUOTE_RECORD_FORMAT)
  })

  it('refuses unknown members, another format, a bad endpoint and a bad address', () => {
    const wire = JSON.parse(quoteRecordText()) as Record<string, unknown>
    const variants: Record<string, unknown>[] = [
      { ...wire, operatorC: '0x' },
      { ...wire, format: 'sawaswap.authorised-quote-record.v2' },
      { ...wire, bridge: { address: BRIDGE.address, momoEndpoint: '243820000000' } },
      { ...wire, relay: { address: '0x1234' } },
      { ...wire, quoteId: '0x1234' },
    ]
    for (const variant of variants) {
      expect(codeOf(() => parseQuoteRecord(JSON.stringify(variant)))).toBe('QUOTE_RECORD_MALFORMED')
    }
    expect(codeOf(() => parseQuoteRecord('not json'))).toBe('QUOTE_RECORD_MALFORMED')
  })
})

describe('§2.4c.3 pre-commit validation', () => {
  it('derives momoAmount = Q_CMM(escrowAmount): 2.20 USDC → 2.19 USD at 0.9990', () => {
    const accepted = accept(quoteRecord())
    expect(accepted.momoAmount).toBe(219n)
    expect(accepted.corridor).toEqual({ countryCode: '+243', mno: 'vodacom', currency: 'USD' })
  })

  it('step 1: a quoteId the fields do not derive is refused', () => {
    const record = {
      ...quoteRecord(),
      quoteId: quoteId(quoteRecord({ rateNumerator: 99_800_000n }).quote),
    }
    expect(codeOf(() => accept(record))).toBe('QUOTE_ID_MISMATCH')
  })

  it('step 2: another quote provider is refused', () => {
    const other = `0x${'ab'.repeat(32)}` as const
    expect(other).not.toBe(PILOT_QUOTE_PROVIDER_ID)
    expect(codeOf(() => accept(quoteRecord({ quoteProviderId: other })))).toBe(
      'QUOTE_PROVIDER_MISMATCH',
    )
  })

  it('step 3: MMC, another chain, another token, another scale or a mismatched output asset are refused', () => {
    const cases = [
      quoteRecord({ direction: 1 }),
      quoteRecord({ sourceExecutionContext: 'crypto:base/USDC' }),
      quoteRecord({ inputAsset: { rail: 'crypto', tokenAddress: BRIDGE.address } }),
      quoteRecord({ inputDecimals: 18 }),
      quoteRecord({ outputAsset: { rail: 'momo', momoCurrency: 'CDF' } }),
      quoteRecord({ destinationExecutionContext: 'crypto:base-sepolia/USDC' }),
    ]
    for (const record of cases) expect(codeOf(() => accept(record))).toBe('QUOTE_CONTEXT_MISMATCH')
    expect(
      codeOf(() =>
        acceptQuote({
          record: quoteRecord(),
          escrowAmount: 2_200_000n,
          escrow: { ...escrow, chainId: 8453 },
          now: BigInt(NOW_SECONDS),
        }),
      ),
    ).toBe('QUOTE_CONTEXT_MISMATCH')
  })

  it('step 4: the window is inclusive at both ends and refused outside it', () => {
    const record = quoteRecord()
    const quotedAt = Number(record.quote.quotedAt)
    const expiresAt = Number(record.quote.expiresAt)
    expect(codeOf(() => accept(record, 2_200_000n, quotedAt))).toBe('ACCEPTED')
    expect(codeOf(() => accept(record, 2_200_000n, expiresAt))).toBe('ACCEPTED')
    expect(codeOf(() => accept(record, 2_200_000n, quotedAt - 1))).toBe('QUOTE_EXPIRED')
    expect(codeOf(() => accept(record, 2_200_000n, expiresAt + 1))).toBe('QUOTE_EXPIRED')
  })

  it('steps 5–6: an amount outside the bounds, or one that pays out nothing, is refused', () => {
    const record = quoteRecord()
    expect(codeOf(() => accept(record, 999_999n))).toBe('QUOTE_AMOUNT_REFUSED')
    expect(codeOf(() => accept(record, 1_000_000_001n))).toBe('QUOTE_AMOUNT_REFUSED')
    expect(codeOf(() => accept(quoteRecord({ outputFee: 1_000n }), 2_200_000n))).toBe(
      'QUOTE_AMOUNT_REFUSED',
    )
  })
})

describe('§2.4c.4(c) and CR-CONSOLE-4', () => {
  const record = quoteRecord()
  const pair = {
    record,
    beneficiary: BRIDGE.address,
    eligibleClaimant: RELAY.address,
    consumerContextRelay: RELAY.address,
  }

  it('passes the selected pair, compared without regard to case', () => {
    expect(
      codeOf(() => assertCommittedPair({ ...pair, beneficiary: BRIDGE.address.toLowerCase() })),
    ).toBe('ACCEPTED')
  })

  it('refuses the same operator in both roles', () => {
    expect(codeOf(() => assertCommittedPair({ ...pair, beneficiary: RELAY.address }))).toBe(
      'SAME_OPERATOR',
    )
  })

  it('refuses a beneficiary, eligibleClaimant or Consumer Context Relay other than the selected pair', () => {
    const other = '0x000000000000000000000000000000000000dEaD'
    expect(codeOf(() => assertCommittedPair({ ...pair, beneficiary: other }))).toBe('PAIR_MISMATCH')
    expect(codeOf(() => assertCommittedPair({ ...pair, eligibleClaimant: other }))).toBe(
      'PAIR_MISMATCH',
    )
    expect(codeOf(() => assertCommittedPair({ ...pair, consumerContextRelay: other }))).toBe(
      'PAIR_MISMATCH',
    )
  })
})
