import { keccak256, toBytes, type Hex } from 'viem'
import { Direction } from './state'

/**
 * momoLegHash composition (Integration Architecture §12/§13 Preimage Model;
 * Francis, 2026-06-12 Clarification 2 Part B).
 *
 * The off-chain MoMo leg is committed on-chain as an opaque bytes32. The
 * contract NEVER reconstructs or validates the preimage — the integration
 * layer owns the schema. The only hard requirement is internal consistency:
 * same preimage → same hash. The preimage has three SEPARABLE blocks:
 *
 *   (a) corridor    — Execution Context pair (origin chain/asset, destination
 *                     country/MNO/currency), reversed for MMC. NON-identifying.
 *   (b) amounts     — sent / delivered / FX. Mostly non-identifying.
 *   (c) participant — endpoints (User C MoMo number, User A wallet, account
 *                     refs). IDENTIFYING — encrypted before IPFS in the full
 *                     build; (a)+(b) stay readable. This drives Screen 2's two
 *                     viewing modes.
 *
 * BUILD STATUS: momoLegHash = keccak256(canonical preimage). The canonical
 * field-by-field serialisation, the encryption boundary for block (c), the
 * IPFS upload, and the CID storage/discovery for Screen 2 retrieval are handed
 * to our implementation design — being finalised — layered on the IA §12.3.3
 * Block C storageLocation + §12.4.1–§12.4.3 three-key encryption model. This
 * module pins the commitment shape (deterministic, key-order-independent) so
 * Screen 1 can commit today; the canonical encoding is centralised here so the
 * eventual schema lock is a single-file change.
 */
export interface CorridorBlock {
  originChain: string // e.g. 'base-sepolia'
  originAsset: string // e.g. 'USDC'
  destCountry: string // ISO / dialling code, e.g. '+243'
  destMno: string // mobile network operator, e.g. 'vodacom'
  destCurrency: string // e.g. 'USD'
}

export interface AmountsBlock {
  amountSent: string // human-readable, escrow asset
  amountDelivered?: string
  fx?: string
}

export interface ParticipantBlock {
  userCMomoNumber?: string
  userAWallet?: string
  agentBWallet?: string
}

export interface MomoLegPreimage {
  version: string
  direction: Direction
  corridor: CorridorBlock
  amounts: AmountsBlock
  participant: ParticipantBlock
}

export const PREIMAGE_VERSION = 'momoleg/0.1'

type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

/** Deterministic, key-order-independent JSON — the canonicalisation hashed. */
export function stableStringify(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k] as Json)}`).join(',')}}`
}

export function canonicalPreimage(p: MomoLegPreimage): string {
  return stableStringify(p as unknown as Json)
}

/** keccak256 over the canonical preimage. The value placed in PoIInput.momoLegHash. */
export function computeMomoLegHash(p: MomoLegPreimage): Hex {
  return keccak256(toBytes(canonicalPreimage(p)))
}
