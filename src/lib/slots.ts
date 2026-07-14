import type { Address } from 'viem'
import { Direction } from './state'

/**
 * Direction-dependent slot mapping for commitPoI.
 *
 * Source of truth: Francis, 2026-06-09 (Clarification 1 answer) + Protocol
 * Whitepaper v0.12.0 "Protocol at a Glance" Tables 1/2. Agent B is NOT a
 * separate contract field — it is direction-dependent labelling over the three
 * address slots the deployed contract exposes (originator = msg.sender;
 * beneficiary + eligibleClaimant are commitPoI parameters):
 *
 *   CMM (Crypto → MoMo):
 *     originator       = User A   (msg.sender)
 *     beneficiary      = Agent B  (parameter)
 *     eligibleClaimant = User C   (parameter; relay address operated for C
 *                                  by the integration layer)
 *   MMC (MoMo → Crypto):
 *     originator       = Agent B  (msg.sender)
 *     beneficiary      = User A   (parameter)
 *     eligibleClaimant = Agent B  (= originator)
 *
 * The connected wallet is always the originator (the contract takes originator
 * from msg.sender). In MMC, eligibleClaimant is therefore the connected wallet
 * and is not a separate input.
 */
export interface SlotInputs {
  direction: Direction
  /** The connected wallet — originator / msg.sender. */
  connected: Address
  /** Beneficiary slot: Agent B in CMM, User A in MMC. */
  beneficiary: Address
  /** CMM only: the User C relay address (eligibleClaimant). Ignored for MMC. */
  userCRelay?: Address
}

export interface ResolvedSlots {
  originator: Address
  beneficiary: Address
  eligibleClaimant: Address
}

export function resolveSlots(input: SlotInputs): ResolvedSlots {
  if (input.direction === Direction.CMM) {
    if (!input.userCRelay) {
      throw new Error('CMM requires a User C relay address for eligibleClaimant')
    }
    return {
      originator: input.connected, // User A
      beneficiary: input.beneficiary, // Agent B
      eligibleClaimant: input.userCRelay, // User C relay
    }
  }
  // MMC
  return {
    originator: input.connected, // Agent B
    beneficiary: input.beneficiary, // User A
    eligibleClaimant: input.connected, // Agent B = originator
  }
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

/**
 * KRAIT-001 client-side mitigation. An address that must never be written as a
 * `beneficiary` or `eligibleClaimant`: the zero address, or a contract that is
 * part of the settlement machinery itself (the Settlement contract or the escrow
 * token). Escrow that resolves to any of these is permanently locked — no party
 * can claim or reverse it — so the Console blocks the commit client-side before
 * `commitPoI`. Comparison is case-insensitive (checksummed vs lower-case forms
 * denote the same address). This is a testnet safety rail, not the contract-side
 * fix (that is Part-1-repo work, tracked separately).
 */
export function isForbiddenParty(addr: Address, forbidden: readonly Address[]): boolean {
  const a = addr.toLowerCase()
  return a === ZERO_ADDRESS || forbidden.some((f) => f.toLowerCase() === a)
}

/** Human label for the beneficiary input, by direction. */
export const beneficiaryLabel: Record<Direction, string> = {
  [Direction.CMM]: 'Agent B wallet (beneficiary)',
  [Direction.MMC]: 'User A wallet (beneficiary)',
}

/**
 * Reverse of the slot mapping: which address slot holds Agent B, for display
 * (Agreement C.2 Screen 2 "identity of Agent B assigned to the transaction").
 * CMM → Agent B is the beneficiary; MMC → Agent B is the originator.
 */
export function deriveAgentB(
  direction: Direction,
  originator: Address,
  beneficiary: Address,
): Address {
  return direction === Direction.CMM ? beneficiary : originator
}
