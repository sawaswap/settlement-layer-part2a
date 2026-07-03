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
 * hash"). Fetches the Settlement contract's logs over the transaction's
 * lifecycle window (committedAt … committedAt + tw1+tw2+tw3), paged so we
 * never trip the RPC range cap or its rate limit, then keeps only those whose
 * indexed stid matches. Refreshes on demand.
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
      const nowSec = BigInt(Math.floor(Date.now() / 1000))

      // A transaction's events only occur within its lifecycle window,
      // [committedAt, committedAt + tw1+tw2+tw3]. Translate that time span into
      // a block range (approx, via average block time) instead of scanning to
      // the chain head — otherwise an old transaction spans tens of thousands
      // of blocks, flooding the RPC with pages and tripping its rate limit.
      const startAge = nowSec > committedAt ? nowSec - committedAt : 0n
      const fromAgeBlocks = startAge / BLOCK_TIME + LOOKBACK_MARGIN
      const fromBlock = latest > fromAgeBlocks ? latest - fromAgeBlocks : 0n

      const endSec =
        lifecycleSeconds && lifecycleSeconds > 0n ? committedAt + lifecycleSeconds : nowSec
      let toBlock = latest
      if (endSec < nowSec) {
        const endAgeBlocks = (nowSec - endSec) / BLOCK_TIME
        const back = endAgeBlocks > LOOKBACK_MARGIN ? endAgeBlocks - LOOKBACK_MARGIN : 0n
        toBlock = latest > back ? latest - back : latest
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
