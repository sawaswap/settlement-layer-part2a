import { zeroHash, type Hex } from 'viem'
import { useReadContract } from 'wagmi'
import { contracts } from '@/config/contracts'

/**
 * Reads a transaction by STID: existence, the full struct, and whether a PoR
 * has been submitted (getPoRHash != 0). Polls so the Monitor reflects state
 * transitions live (Agreement C.2 Screen 2).
 */
export function useTransaction(stid?: Hex) {
  const enabled = Boolean(stid)

  const existsQ = useReadContract({
    ...contracts.settlement,
    functionName: 'transactionExists',
    args: stid ? [stid] : undefined,
    query: { enabled, refetchInterval: 4000 },
  })

  const found = existsQ.data === true

  const txQ = useReadContract({
    ...contracts.settlement,
    functionName: 'getTransaction',
    args: stid ? [stid] : undefined,
    query: { enabled: enabled && found, refetchInterval: 4000 },
  })

  const porQ = useReadContract({
    ...contracts.settlement,
    functionName: 'getPoRHash',
    args: stid ? [stid] : undefined,
    query: { enabled: enabled && found, refetchInterval: 4000 },
  })

  return {
    exists: existsQ.data,
    transaction: txQ.data,
    porSubmitted: porQ.data != null && porQ.data !== zeroHash,
    isLoading: existsQ.isLoading || (found && txQ.isLoading),
    isError: existsQ.isError || txQ.isError,
    refetch: () => {
      void existsQ.refetch()
      void txQ.refetch()
      void porQ.refetch()
    },
  }
}

export type TransactionData = NonNullable<ReturnType<typeof useTransaction>['transaction']>
