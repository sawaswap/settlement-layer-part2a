import { stringToHex, type Hex } from 'viem'

/**
 * PoR payload for submitPoR(stid, porData). The contract requires non-empty
 * bytes and stores keccak256(porData); it does not interpret the contents.
 *
 * BUILD STATUS: the canonical PoR composition is IA §13 (PoR Composition —
 * direction-specific, trigger-agnostic for Part 2a) and is a design item we
 * own, like the momoLegHash preimage. This returns a minimal, deterministic,
 * non-empty payload so the PoR → Settled path is demonstrable on testnet;
 * centralised here so the eventual schema lock is a single-file change.
 */
export const POR_VERSION = 'por/0.1'

export function composePorData(stid: Hex): Hex {
  return stringToHex(JSON.stringify({ v: POR_VERSION, stid }))
}
