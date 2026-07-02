import { useCallback, useEffect, useState } from 'react'
import { parseEventLogs, type Hex } from 'viem'
import { usePublicClient } from 'wagmi'
import { contracts } from '@/config/contracts'
import { settlementAbi } from '@/abi/settlement'

export interface HistoryEntry {
  eventName: string
  txHash: Hex
  blockNumber: bigint
  logIndex: number
}

/** Average Base block time (seconds) — used to bound the log query window. */
const BLOCK_TIME = 2
/** Safety margin (blocks) added before the estimated commit block. */
const LOOKBACK_MARGIN = 250n

/**
 * Full state-transition history for a STID (Agreement C.2 Screen 2 — "full
 * state transition history, each entry linked to its Basescan transaction
 * hash"). Fetches the Settlement contract's logs over a window bounded by the
 * transaction's committedAt (we don't depend on the deploy block), then keeps
 * only those whose indexed stid matches. Refreshes on demand.
 */
export function useTransactionHistory(stid?: Hex, committedAt?: bigint) {
  const publicClient = usePublicClient()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const load = useCallback(async () => {
    if (!publicClient || !stid) return
    setLoading(true)
    setError('')
    try {
      const latest = await publicClient.getBlockNumber()
      let fromBlock = 0n
      if (committedAt && committedAt > 0n) {
        const nowSec = BigInt(Math.floor(Date.now() / 1000))
        const ageSeconds = nowSec > committedAt ? nowSec - committedAt : 0n
        const ageBlocks = ageSeconds / BigInt(BLOCK_TIME) + LOOKBACK_MARGIN
        fromBlock = latest > ageBlocks ? latest - ageBlocks : 0n
      }

      const logs = await publicClient.getLogs({
        address: contracts.settlement.address,
        fromBlock,
        toBlock: 'latest',
      })

      const parsed = parseEventLogs({ abi: settlementAbi, logs })
      const mine = parsed
        .filter((l) => {
          const args = l.args as Record<string, unknown>
          return typeof args.stid === 'string' && args.stid.toLowerCase() === stid.toLowerCase()
        })
        .map<HistoryEntry>((l) => ({
          eventName: l.eventName,
          txHash: l.transactionHash,
          blockNumber: l.blockNumber,
          logIndex: l.logIndex,
        }))
        .sort((a, b) =>
          a.blockNumber === b.blockNumber
            ? a.logIndex - b.logIndex
            : Number(a.blockNumber - b.blockNumber),
        )

      setEntries(mine)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }, [publicClient, stid, committedAt])

  useEffect(() => {
    void load()
  }, [load])

  return { entries, isLoading, error, refetch: load }
}
