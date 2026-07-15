import { type Hex } from 'viem'
import { useReadContract } from 'wagmi'
import { contracts } from '@/config/contracts'
import { DrpOutcome } from '@/lib/drpOutcome'

/**
 * Reads the deployed MockDRP's state for an STID (Agreement C.2 Screen 3 —
 * "MockDRP resolution status"):
 *  - `preset`  — the outcome resolve() will return (Settled/Reversed);
 *  - `called`  — whether resolve() has already fired (single-invocation guard).
 *
 * NB the DRP boundary is atomic in the deployed Settlement (invokeDRP →
 * resolve → terminal in one tx), so there is no persisted "pending" DRP state:
 * `called` flips true exactly when the transaction reaches its DRP terminal.
 * Polls in step with the transaction reads.
 */
export function useMockDrpStatus(stid?: Hex) {
  const enabled = Boolean(stid)

  const presetQ = useReadContract({
    ...contracts.mockDrp,
    functionName: 'preset',
    args: stid ? [stid] : undefined,
    query: { enabled, refetchInterval: 4000 },
  })

  const calledQ = useReadContract({
    ...contracts.mockDrp,
    functionName: 'called',
    args: stid ? [stid] : undefined,
    query: { enabled, refetchInterval: 4000 },
  })

  return {
    preset: presetQ.data != null ? (Number(presetQ.data) as DrpOutcome) : undefined,
    resolved: calledQ.data === true,
    refetch: () => {
      void presetQ.refetch()
      void calledQ.refetch()
    },
  }
}
