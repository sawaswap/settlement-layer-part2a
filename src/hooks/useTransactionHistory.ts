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

/** Average Base block time (seconds) — used to estimate the commit block. */
const BLOCK_TIME = 2n
/** Safety margin (blocks) added before the estimated commit block. */
const LOOKBACK_MARGIN = 250n
/**
 * Maximum block span per `eth_getLogs` call. Public Base RPCs cap the query
 * range (~2000 blocks); we page in windows well under that so a long-lived
 * transaction's history never trips the limit.
 */
const LOG_PAGE = 800n

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
    // Require committedAt before querying: without it we cannot bound the range
    // and would scan from genesis, which public RPCs reject (block-range cap).
    // The effect re-runs once the transaction read supplies committedAt.
    if (!committedAt || committedAt <= 0n) {
      setEntries([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const latest = await publicClient.getBlockNumber()
      const nowSec = BigInt(Math.floor(Date.now() / 1000))
      const ageSeconds = nowSec > committedAt ? nowSec - committedAt : 0n
      const ageBlocks = ageSeconds / BLOCK_TIME + LOOKBACK_MARGIN
      const fromBlock = latest > ageBlocks ? latest - ageBlocks : 0n

      // Page [fromBlock, latest] in <= LOG_PAGE windows so no single
      // eth_getLogs call exceeds the provider's range cap.
      const ranges: Array<{ from: bigint; to: bigint }> = []
      for (let start = fromBlock; start <= latest; start += LOG_PAGE + 1n) {
        const end = start + LOG_PAGE < latest ? start + LOG_PAGE : latest
        ranges.push({ from: start, to: end })
      }
      const pages = await Promise.all(
        ranges.map((r) =>
          publicClient.getLogs({
            address: contracts.settlement.address,
            fromBlock: r.from,
            toBlock: r.to,
          }),
        ),
      )
      const logs = pages.flat()

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
