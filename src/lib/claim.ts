import { stringToHex, type Hex } from 'viem'

/**
 * Claim payload for submitClaim(stid, claimData) / updateClaim(stid, claimData).
 * The deployed contract requires non-empty bytes and stores keccak256(claimData);
 * it does not interpret the contents (see Settlement.submitClaim/updateClaim).
 *
 * BUILD STATUS: the canonical Claim composition is IA §14 (Claim Composition,
 * incl. the CMM eligibleClaimant2 time-dependent handoff) and is a design item
 * we own, like the momoLegHash preimage and the PoR payload (lib/por). This
 * returns a minimal, deterministic, non-empty payload so the claim → DRP →
 * Settled/Reversed path is demonstrable on testnet; centralised here so the
 * eventual schema lock is a single-file change. Mirrors lib/por.
 */
export const CLAIM_VERSION = 'claim/0.1'

export function composeClaimData(stid: Hex): Hex {
  return stringToHex(JSON.stringify({ v: CLAIM_VERSION, stid }))
}
