/**
 * The pilot selection — Build Default 3 as revised by the Client on 4 November
 * 2026: a configurable script that stands in for bidding and network
 * selection. It selects one Operator-B / Operator-R pair, issues the executable
 * quote for it, and hands both to the Console as an Authorised Quote Record;
 * it is not a quote issuer or a marketplace.
 *
 * It also prints the §7.1 anchors (ADR 123n15h7v6d v0.3.2) for the pair: each
 * operator's current key-binding sequence and fingerprint, typed in from that
 * operator's AgentOS Network screen — never read from SCN — for the
 * administrator to set as `VITE_KEY_ANCHORS`.
 *
 * Self-contained on purpose: `scripts/select-pair.ts` runs this file directly
 * under Node, so it imports only packages, never sibling modules.
 */
import {
  encodeExecutableQuote,
  evaluateQuote,
  executableRateFromProvenance,
  PILOT_QUOTE_PROVIDER_ID,
  QUOTE_DIRECTION_CMM,
  quoteId,
  type ExecutableQuoteV1,
} from '@sawaswap/crypto'
import type { QuoteRecordWire } from './quoteRecord'

export const QUOTE_RECORD_FORMAT = 'sawaswap.authorised-quote-record.v1'

/** One hour, the pilot validity the Client accepted on 4 November 2026. */
export const DEFAULT_VALIDITY_SECONDS = 3600

/** Minor-unit scale per payout currency; XAF has none. */
export const OUTPUT_DECIMALS: Readonly<Record<string, number>> = Object.freeze({
  USD: 2,
  CDF: 2,
  XAF: 0,
})

export interface SelectionInput {
  chainId: number
  /** The quote-context name of the chain, e.g. `base-sepolia`. */
  chainName: string
  settlement: string
  tokenAddress: string
  tokenSymbol: string
  tokenDecimals: number
  /** `momo:<+country>/<mno>/<CUR>`. */
  destination: string
  /** The reference rate, payout currency per token unit, as a decimal string. */
  referenceRate: string
  marginBps: number
  /** Escrow bounds, in token units as decimal strings. */
  minAmount: string
  maxAmount: string
  validitySeconds: number
  bridge: { address: string; momoEndpoint: string; sequence: string; fingerprint: string }
  relay: { address: string; sequence: string; fingerprint: string }
}

export interface AnchorWire {
  chainId: string
  settlement: string
  role: 'BRIDGE' | 'RELAY'
  operator: string
  sequence: string
  fingerprint: string
}

export interface Selection {
  record: QuoteRecordWire
  anchors: AnchorWire[]
  quote: ExecutableQuoteV1
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const FINGERPRINT = /^0x[0-9a-f]{64}$/
const SEQUENCE = /^[1-9][0-9]*$/
const DESTINATION = /^momo:\+[1-9][0-9]{0,3}\/[a-z0-9-]+\/([A-Z]{3})$/
const E164 = /^\+[1-9][0-9]+$/

/** A non-negative decimal string as an exact fraction. */
export function decimalFraction(text: string): { numerator: bigint; denominator: bigint } {
  const match = /^([0-9]+)(?:\.([0-9]+))?$/.exec(text)
  if (!match) throw new Error(`"${text}" is not a decimal number`)
  const fraction = match[2] ?? ''
  return { numerator: BigInt(match[1]! + fraction), denominator: 10n ** BigInt(fraction.length) }
}

/** A decimal string in whole units as atomic units, refusing extra precision. */
export function atomicUnits(text: string, decimals: number): bigint {
  const { numerator, denominator } = decimalFraction(text)
  const scaled = numerator * 10n ** BigInt(decimals)
  if (scaled % denominator !== 0n)
    throw new Error(`"${text}" has more than ${String(decimals)} decimals`)
  return scaled / denominator
}

/** `nowSeconds` is the issuing instant: `quotedAt`. */
export function buildSelection(input: SelectionInput, nowSeconds: number): Selection {
  const fail = (message: string): never => {
    throw new Error(message)
  }
  if (!ADDRESS.test(input.bridge.address)) fail('--bridge is not an address')
  if (!ADDRESS.test(input.relay.address)) fail('--relay is not an address')
  if (input.bridge.address.toLowerCase() === input.relay.address.toLowerCase()) {
    fail('The Bridge and the Relay must be different operators (CR-CONSOLE-4).')
  }
  if (!E164.test(input.bridge.momoEndpoint))
    fail("--bridge-momo must be canonical E.164 ('+', digits)")
  for (const [role, op] of [
    ['bridge', input.bridge],
    ['relay', input.relay],
  ] as const) {
    if (!SEQUENCE.test(op.sequence)) fail(`--${role}-sequence must be a positive integer`)
    if (!FINGERPRINT.test(op.fingerprint)) {
      fail(
        `--${role}-fingerprint must be 0x and 64 lower-case hex digits, as the Network screen shows it`,
      )
    }
  }
  const destination = DESTINATION.exec(input.destination)
  if (!destination) return fail(`--destination must look like momo:+243/vodacom/USD`)
  const currency = destination[1]!
  const outputDecimals = OUTPUT_DECIMALS[currency]
  if (outputDecimals === undefined) return fail(`No minor-unit scale is known for ${currency}`)
  if (!Number.isInteger(input.validitySeconds) || input.validitySeconds <= 0) {
    fail('--validity must be a positive number of seconds')
  }

  const reference = decimalFraction(input.referenceRate)
  const rate = executableRateFromProvenance({
    referenceRateNumerator: reference.numerator,
    referenceRateDenominator: reference.denominator,
    marginBps: BigInt(input.marginBps),
  })
  const quote: ExecutableQuoteV1 = {
    direction: QUOTE_DIRECTION_CMM,
    sourceExecutionContext: `crypto:${input.chainName}/${input.tokenSymbol}`,
    destinationExecutionContext: input.destination,
    inputAsset: { rail: 'crypto', tokenAddress: input.tokenAddress },
    outputAsset: { rail: 'momo', momoCurrency: currency },
    inputDecimals: input.tokenDecimals,
    outputDecimals,
    minInputAmount: atomicUnits(input.minAmount, input.tokenDecimals),
    maxInputAmount: atomicUnits(input.maxAmount, input.tokenDecimals),
    ...rate,
    inputFee: 0n,
    outputFee: 0n,
    quotedAt: BigInt(nowSeconds),
    expiresAt: BigInt(nowSeconds + input.validitySeconds),
    quoteProviderId: PILOT_QUOTE_PROVIDER_ID,
  }
  if (quote.minInputAmount > quote.maxInputAmount) fail('--min is above --max')
  // A quote that cannot price its own minimum is refused here, not at the Console.
  evaluateQuote(quote, quote.minInputAmount)

  const anchor = (
    role: 'BRIDGE' | 'RELAY',
    op: { address: string; sequence: string; fingerprint: string },
  ) => ({
    chainId: String(input.chainId),
    settlement: input.settlement,
    role,
    operator: op.address,
    sequence: op.sequence,
    fingerprint: op.fingerprint,
  })
  return {
    quote,
    record: {
      format: QUOTE_RECORD_FORMAT,
      quote: encodeExecutableQuote(quote),
      quoteId: quoteId(quote),
      bridge: { address: input.bridge.address, momoEndpoint: input.bridge.momoEndpoint },
      relay: { address: input.relay.address },
    },
    anchors: [anchor('BRIDGE', input.bridge), anchor('RELAY', input.relay)],
  }
}
