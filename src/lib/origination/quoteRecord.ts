import {
  assertQuoteValidAt,
  decodeExecutableQuote,
  encodeExecutableQuote,
  evaluateQuote,
  PILOT_QUOTE_PROVIDER_ID,
  QUOTE_DIRECTION_CMM,
  quoteId as deriveQuoteId,
  type ExecutableQuoteV1,
  type ExecutableQuoteWire,
} from '@sawaswap/crypto'
import { getAddress, isAddress, type Address, type Hex } from 'viem'
import { OriginationRefusal, refuse } from './errors'
import { QUOTE_RECORD_FORMAT } from './selection'

/**
 * The Authorised Quote Record (ADR 123n15h8936 v0.14 §2.4c.2) with the
 * Operator-B / Operator-R pair the pilot selection script chose for it
 * (§2.4c.4(c) as worded by the Client on 5 November 2026).
 *
 * The quote and `quoteId` are exactly the ADR's. The pair sits beside them and
 * never inside: no operator field enters `ExecutableQuoteV1`, so the record
 * does not change `quoteId` (§2.4c.4(b)). `commitPoI` binds the pair — Operator-B
 * as `beneficiary`, Operator-R as `eligibleClaimant` — and the signed Consumer
 * Context carries the Relay address.
 *
 * `bridge.momoEndpoint` is Agent B's own mobile-money account, an Identity-domain
 * field (86cb152xc v1.2.13). It travels with the selection because the
 * selection is what names Agent B.
 */
export { QUOTE_RECORD_FORMAT }

export interface QuoteRecordWire {
  format: typeof QUOTE_RECORD_FORMAT
  quote: ExecutableQuoteWire
  quoteId: string
  bridge: { address: string; momoEndpoint: string }
  relay: { address: string }
}

export interface AuthorisedQuoteRecord {
  quote: ExecutableQuoteV1
  quoteId: Hex
  bridge: { address: Address; momoEndpoint: string }
  relay: { address: Address }
}

/** A receiving corridor, as the quote's destination execution context names it. */
export interface MomoCorridor {
  countryCode: string
  mno: string
  currency: string
}

const malformed = (message: string): never => refuse('QUOTE_RECORD_MALFORMED', message)

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const CANONICAL_E164 = /^\+[1-9][0-9]+$/

function operatorAddress(value: unknown, where: string): Address {
  if (typeof value !== 'string' || !isAddress(value, { strict: false })) {
    return malformed(`${where} is not a 20-byte 0x address.`)
  }
  return getAddress(value)
}

/**
 * Strict parse of the record as the selection script writes it. Unknown
 * members are refused rather than ignored: a field the Console did not read is
 * a field nobody checked.
 */
export function parseQuoteRecord(text: string): AuthorisedQuoteRecord {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return malformed('The quote record is not JSON.')
  }
  if (!isObject(value)) return malformed('The quote record is not a JSON object.')
  const allowed = ['format', 'quote', 'quoteId', 'bridge', 'relay']
  const extra = Object.keys(value).filter((key) => !allowed.includes(key))
  if (extra.length > 0)
    return malformed(`Unknown member(s) in the quote record: ${extra.join(', ')}.`)
  if (value.format !== QUOTE_RECORD_FORMAT) {
    return malformed(`The record format is not ${QUOTE_RECORD_FORMAT}.`)
  }

  let quote: ExecutableQuoteV1
  try {
    quote = decodeExecutableQuote(value.quote, 'quote')
  } catch (cause) {
    return malformed(`The quote is not a canonical ExecutableQuoteV1: ${messageOf(cause)}`)
  }
  if (typeof value.quoteId !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value.quoteId)) {
    return malformed('quoteId is not a 32-byte 0x value.')
  }

  const { bridge, relay } = value
  if (!isObject(bridge) || !isObject(relay))
    return malformed('The record names no Bridge/Relay pair.')
  if (typeof bridge.momoEndpoint !== 'string' || !CANONICAL_E164.test(bridge.momoEndpoint)) {
    return malformed("bridge.momoEndpoint is not canonical E.164 ('+', then digits only).")
  }
  return {
    quote,
    quoteId: value.quoteId.toLowerCase() as Hex,
    bridge: {
      address: operatorAddress(bridge.address, 'bridge.address'),
      momoEndpoint: bridge.momoEndpoint,
    },
    relay: { address: operatorAddress(relay.address, 'relay.address') },
  }
}

/** The record back in its wire form — what the selection script writes. */
export function encodeQuoteRecord(record: AuthorisedQuoteRecord): QuoteRecordWire {
  return {
    format: QUOTE_RECORD_FORMAT,
    quote: encodeExecutableQuote(record.quote),
    quoteId: record.quoteId,
    bridge: { address: record.bridge.address, momoEndpoint: record.bridge.momoEndpoint },
    relay: { address: record.relay.address },
  }
}

const MOMO_CONTEXT = /^momo:(\+[1-9][0-9]{0,3})\/([a-z0-9-]+)\/([A-Z]{3})$/

/** The corridor a quote pays into, from its destination execution context. */
export function quoteCorridor(quote: ExecutableQuoteV1): MomoCorridor {
  const match = MOMO_CONTEXT.exec(quote.destinationExecutionContext)
  if (!match) {
    return refuse(
      'QUOTE_CONTEXT_MISMATCH',
      `The quote's destination ${quote.destinationExecutionContext} is not a mobile-money context.`,
    )
  }
  return { countryCode: match[1]!, mno: match[2]!, currency: match[3]! }
}

/**
 * The quote-context name of a chain (`crypto:<chain>/<asset>`). The pilot's
 * quotes name Base Sepolia `base-sepolia`; any chain not listed here cannot be
 * matched, so a quote for it is refused rather than guessed.
 */
export const QUOTE_CHAIN_NAMES: Readonly<Record<number, string>> = Object.freeze({
  84532: 'base-sepolia',
})

export interface EscrowContext {
  chainId: number
  tokenAddress: Address
  tokenSymbol: string
  tokenDecimals: number
}

export interface AcceptedQuote {
  record: AuthorisedQuoteRecord
  corridor: MomoCorridor
  escrowAmount: bigint
  momoAmount: bigint
}

/**
 * §2.4c.3 steps 1–6, in order. Steps 7 and 8 — presenting the result and User
 * A's acceptance — are the screen's. Any failure prevents commitment.
 *
 * `now` is Unix seconds. The validity window is inclusive at both ends
 * (§2.6a); the selection script's one-hour validity is the safety margin.
 */
export function acceptQuote(input: {
  record: AuthorisedQuoteRecord
  escrowAmount: bigint
  escrow: EscrowContext
  now: bigint
}): AcceptedQuote {
  const { record, escrow } = input
  const { quote } = record

  // 1. quoteId recomputed from the canonical fields.
  const derived = deriveQuoteId(quote)
  if (derived.toLowerCase() !== record.quoteId.toLowerCase()) {
    refuse(
      'QUOTE_ID_MISMATCH',
      `The record's quoteId ${record.quoteId} is not the one its fields derive (${derived}).`,
    )
  }
  // 2. The pilot authority.
  if (quote.quoteProviderId.toLowerCase() !== PILOT_QUOTE_PROVIDER_ID.toLowerCase()) {
    refuse(
      'QUOTE_PROVIDER_MISMATCH',
      'The quote was not issued by the SawaSwap Pilot Quote Authority.',
    )
  }
  // 3. CMM, and the contexts and assets of this deployment.
  if (quote.direction !== QUOTE_DIRECTION_CMM) {
    refuse('QUOTE_CONTEXT_MISMATCH', 'The quote is not a CMM quote.')
  }
  const chainName = QUOTE_CHAIN_NAMES[escrow.chainId]
  if (chainName === undefined) {
    refuse(
      'QUOTE_CONTEXT_MISMATCH',
      `No quote context is defined for chain ${String(escrow.chainId)}.`,
    )
  }
  const source = `crypto:${chainName}/${escrow.tokenSymbol}`
  if (quote.sourceExecutionContext !== source) {
    refuse(
      'QUOTE_CONTEXT_MISMATCH',
      `The quote's source is ${quote.sourceExecutionContext}; this Console escrows ${source}.`,
    )
  }
  if (
    quote.inputAsset.rail !== 'crypto' ||
    quote.inputAsset.tokenAddress.toLowerCase() !== escrow.tokenAddress.toLowerCase()
  ) {
    refuse('QUOTE_CONTEXT_MISMATCH', 'The quote is not priced in this escrow token.')
  }
  if (quote.inputDecimals !== escrow.tokenDecimals) {
    refuse(
      'QUOTE_CONTEXT_MISMATCH',
      `The quote's input scale is ${String(quote.inputDecimals)} decimals; the token has ${String(escrow.tokenDecimals)}.`,
    )
  }
  const corridor = quoteCorridor(quote)
  if (quote.outputAsset.rail !== 'momo' || quote.outputAsset.momoCurrency !== corridor.currency) {
    refuse('QUOTE_CONTEXT_MISMATCH', "The quote's output asset is not its destination currency.")
  }
  // 4. The validity window. 5–6. Bounds and Q_CMM with both fail-closed checks.
  try {
    assertQuoteValidAt(quote, input.now)
  } catch (cause) {
    refuse('QUOTE_EXPIRED', messageOf(cause))
  }
  let momoAmount: bigint
  try {
    momoAmount = evaluateQuote(quote, input.escrowAmount)
  } catch (cause) {
    return refuse('QUOTE_AMOUNT_REFUSED', messageOf(cause))
  }
  return { record, corridor, escrowAmount: input.escrowAmount, momoAmount }
}

/**
 * §2.4c.4(c) and CR-CONSOLE-4, on the exact addresses about to be committed:
 * Operator-B is the beneficiary, Operator-R is the eligibleClaimant and the
 * Relay address sealed into the Consumer Context, and the two are different
 * operators. Run again immediately before the wallet is asked to commit.
 */
export function assertCommittedPair(input: {
  record: AuthorisedQuoteRecord
  beneficiary: string
  eligibleClaimant: string
  consumerContextRelay: string
}): void {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  if (same(input.beneficiary, input.eligibleClaimant)) {
    refuse(
      'SAME_OPERATOR',
      'The Bridge and the Relay are the same address. CR-CONSOLE-4 requires two distinct operators.',
    )
  }
  if (!same(input.beneficiary, input.record.bridge.address)) {
    refuse('PAIR_MISMATCH', 'The beneficiary is not the Operator-B the quote record selected.')
  }
  if (!same(input.eligibleClaimant, input.record.relay.address)) {
    refuse('PAIR_MISMATCH', 'The eligibleClaimant is not the Operator-R the quote record selected.')
  }
  if (!same(input.consumerContextRelay, input.record.relay.address)) {
    refuse(
      'PAIR_MISMATCH',
      'The Consumer Context names a Relay other than the selected Operator-R.',
    )
  }
}

export function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export { OriginationRefusal }
