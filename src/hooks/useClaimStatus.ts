import { zeroHash, type Hex } from 'viem'
import { useReadContract } from 'wagmi'
import { contracts } from '@/config/contracts'

/**
 * Reads the claim hash for an STID (getClaimHash != 0 ⇒ a claim is on record).
 * Polls so Screen 3 reflects a submitted/updated claim live, matching the
 * useTransaction cadence. Screen 3 composes this alongside useTransaction to
 * derive the available escalation actions (lib/escalation).
 */
export function useClaimStatus(stid?: Hex) {
  const enabled = Boolean(stid)

  const q = useReadContract({
    ...contracts.settlement,
    functionName: 'getClaimHash',
    args: stid ? [stid] : undefined,
    query: { enabled, refetchInterval: 4000 },
  })

  return {
    claimHash: q.data,
    claimExists: q.data != null && q.data !== zeroHash,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => {
      void q.refetch()
    },
  }
}
