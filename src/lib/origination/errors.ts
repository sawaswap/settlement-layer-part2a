/**
 * Why an origination was refused. Every refusal before `commitPoI` leaves the
 * escrow untouched; the code names the rule, the message says what to do.
 */
export type OriginationRefusalCode =
  // §2.4c.3 / §2.4c.4 — the Authorised Quote Record and its pair
  | 'QUOTE_RECORD_MALFORMED'
  | 'QUOTE_ID_MISMATCH'
  | 'QUOTE_PROVIDER_MISMATCH'
  | 'QUOTE_CONTEXT_MISMATCH'
  | 'QUOTE_EXPIRED'
  | 'QUOTE_AMOUNT_REFUSED'
  | 'PAIR_MISMATCH'
  // CR-CONSOLE-4 / CR-CONSOLE-5
  | 'SAME_OPERATOR'
  | 'SSID_PENDING'
  // Inputs
  | 'INVALID_INPUT'
  // ADR 123n15h7v6d v0.3.2 §5 / §5.1
  | 'OPERATOR_NOT_REGISTERED'
  | 'KEY_BINDING_MISSING'
  | 'KEY_BINDING_MISMATCH'
  | 'KEY_BINDING_STALE'
  | 'KEY_BINDING_CONFLICT'
  | 'KEY_ANCHOR_MISSING'
  | 'KEY_ANCHOR_INVALID'
  | 'KEY_ANCHOR_MISMATCH'
  // SCN and the SCA directory
  | 'SCA_NOT_REGISTERED'
  | 'SCN_UNREACHABLE'
  // Consumer Context (ADR 86cb4mgeh v0.7)
  | 'SIGNATURE_MISMATCH'

export class OriginationRefusal extends Error {
  readonly code: OriginationRefusalCode

  constructor(code: OriginationRefusalCode, message: string) {
    super(message)
    this.name = 'OriginationRefusal'
    this.code = code
  }
}

export const refuse = (code: OriginationRefusalCode, message: string): never => {
  throw new OriginationRefusal(code, message)
}
