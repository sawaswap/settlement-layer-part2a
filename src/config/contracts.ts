import type { Address } from 'viem'
import { getAddress } from 'viem'
import { env } from './env'
import { settlementAbi } from '@/abi/settlement'
import { mockDrpReadAbi } from '@/abi/mockdrp.read'
import { erc20Abi } from '@/abi/erc20'

/**
 * Typed contract handles. Addresses come from env and are checksummed here so a
 * malformed address surfaces immediately. ABIs are extracted verbatim from the
 * verified Part 1 build artefacts (settlement-layer-part1, M3 deployment of
 * record) — see FIS a (Contract Interface Reference).
 *
 * BUILD NOTE: the deployed Settlement hardcodes USDC and uses the five-field
 * PoIInput (no tokenAddress / momoCurrency). Screen 1 composes against THIS
 * surface; the canonical seven-field struct is the mainnet target (ADR
 * 86cad3qpk), not Part 2a's build target.
 */
export const contracts = {
  settlement: {
    address: getAddress(env.VITE_SETTLEMENT_ADDRESS) as Address,
    abi: settlementAbi,
  },
  // Read-only handle (preset/called) for the always-loaded Screen 3 status hook.
  // The harness-only `setOutcome` write carries its own ABI (full mockDrpAbi,
  // imported inside DrpHarnessControl) so it tree-shakes out when the harness is
  // disabled — see src/abi/mockdrp.read.ts.
  mockDrp: {
    address: getAddress(env.VITE_MOCKDRP_ADDRESS) as Address,
    abi: mockDrpReadAbi,
  },
  usdc: {
    address: getAddress(env.VITE_USDC_ADDRESS) as Address,
    abi: erc20Abi,
  },
} as const

export const escrowAsset = {
  symbol: env.VITE_USDC_SYMBOL,
  decimals: env.VITE_USDC_DECIMALS,
  address: contracts.usdc.address,
}
