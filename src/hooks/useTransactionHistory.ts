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

/** Average Base block time (seconds) — used only to size the SHORT span after
 *  the exact commit block, where block-time drift is negligible. */
const BLOCK_TIME = 2n
/** Safety margin (blocks) padded around the derived bounds. */
const LOOKBACK_MARGIN = 250n
/**
 * Maximum block span per `eth_getLogs` call. Public Base RPCs cap the query
 * range (~2000 blocks); we page in windows well under that so a long-lived
 * transaction's history never trips the limit.
 */
const LOG_PAGE = 800n

/**
 * Smallest block number whose timestamp is >= `target`, by binary search over
 * block timestamps. Anchors a log query to the exact block for a timestamp
 * instead of estimating from an average block time (which drifts over a
 * transaction's age and can silently miss events). Returns `hi` when every
 * block is older than `target` (target in the future / transaction in flight).
 */
async function blockAtOrAfter(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  target: bigint,
  hi: bigint,
): Promise<bigint> {
  let lo = 0n
  while (lo < hi) {
    const mid = (lo + hi) / 2n
    const { timestamp } = await client.getBlock({ blockNumber: mid })
    if (timestamp < target) lo = mid + 1n
    else hi = mid
  }
  return lo
}

/**
 * Full state-transition history for a STID (Agreement C.2 Screen 2 — "full
 * state transition history, each entry linked to its Basescan transaction
 * hash"). Anchors to the exact commit block (binary search on committedAt),
 * then pages the Settlement contract's logs across the transaction's lifecycle
 * span — bounded so we never trip the RPC range cap or its rate limit — and
 * keeps only those whose indexed stid matches. Refreshes on demand.
 */
export function useTransactionHistory(stid?: Hex, committedAt?: bigint, lifecycleSeconds?: bigint) {
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

      // Anchor the lower bound to the EXACT commit block: committedAt is the
      // commit block's timestamp, so the first block at-or-after it is that
      // block. This never drifts with block-time variance (the failure mode of
      // an age-based estimate, which could start the scan after the commit and
      // silently drop early events).
      const commitBlock = await blockAtOrAfter(publicClient, committedAt, latest)
      const fromBlock = commitBlock > LOOKBACK_MARGIN ? commitBlock - LOOKBACK_MARGIN : 0n

      // Upper bound: the lifecycle deadline plus a grace window (permissionless
      // pokes may fire a little after their deadline), sized as a SHORT span
      // from the exact commit block — so block-time drift here is negligible.
      // Bounding this (instead of scanning to the chain head) keeps an old
      // transaction to a handful of pages, avoiding the RPC rate limit. Pokes
      // that fire much later than the grace window are an accepted tail.
      let toBlock = latest
      if (lifecycleSeconds && lifecycleSeconds > 0n) {
        const spanBlocks = (lifecycleSeconds * 2n) / BLOCK_TIME + LOOKBACK_MARGIN
        const bound = commitBlock + spanBlocks
        toBlock = bound < latest ? bound : latest
      }

      // Page the bounded range in <= LOG_PAGE windows, sequentially, so no
      // single eth_getLogs exceeds the provider's range cap and we don't burst
      // its rate limit.
      let logs: Awaited<ReturnType<NonNullable<typeof publicClient>['getLogs']>> = []
      for (let start = fromBlock; start <= toBlock; start += LOG_PAGE + 1n) {
        const end = start + LOG_PAGE < toBlock ? start + LOG_PAGE : toBlock
        const page = await publicClient.getLogs({
          address: contracts.settlement.address,
          fromBlock: start,
          toBlock: end,
        })
        logs = logs.concat(page)
      }

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
  }, [publicClient, stid, committedAt, lifecycleSeconds])

  useEffect(() => {
    void load()
  }, [load])

  return { entries, isLoading, error, refetch: load }
}
