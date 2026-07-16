import { useCallback, useEffect, useState } from 'react'
import { getAbiItem, zeroHash, type Address, type Hex } from 'viem'
import { usePublicClient } from 'wagmi'
import { contracts } from '@/config/contracts'
import { settlementAbi } from '@/abi/settlement'
import { env } from '@/config/env'
import type { AgentTxRow } from '@/lib/dashboard'
import { SettlementState, Direction } from '@/lib/state'

const poiCommittedEvent = getAbiItem({ abi: settlementAbi, name: 'PoICommitted' })

/** Block span per eth_getLogs call — under the public Base RPC range cap. */
const LOG_PAGE = 1500n
/** Safety cap on rows built per load (getTransaction is a call each). */
const MAX_ROWS = 200

/**
 * Discovers the connected wallet's transactions for Screen 4 (Agent B Dashboard).
 * Agent B always occupies an indexed PoICommitted slot — beneficiary in CMM,
 * originator in MMC (lib/slots) — so we page the PoICommitted logs filtered by
 * `originator == wallet` and `beneficiary == wallet` (both indexed), union the
 * STIDs, then read each transaction's struct + PoR flag. No backend (C.5.f):
 * this is a bounded client-side scan from VITE_INDEX_FROM_BLOCK to head, run
 * once per load / manual refresh (not polled).
 */
export function useAgentTransactions(wallet?: Address) {
  const publicClient = usePublicClient()
  const [rows, setRows] = useState<AgentTxRow[]>([])
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fromBlock, setFromBlock] = useState<bigint | null>(null)
  const [truncated, setTruncated] = useState(false)

  const load = useCallback(async () => {
    if (!publicClient || !wallet) return
    setLoading(true)
    setError('')
    setTruncated(false)
    try {
      const head = await publicClient.getBlockNumber()
      const start = BigInt(env.VITE_INDEX_FROM_BLOCK)
      setFromBlock(start)

      // Collect unique STIDs where the wallet is originator or beneficiary.
      const seen = new Map<string, bigint>() // stid -> commit block (for ordering)
      for (let s = start; s <= head; s += LOG_PAGE + 1n) {
        const e = s + LOG_PAGE < head ? s + LOG_PAGE : head
        for (const args of [{ originator: wallet }, { beneficiary: wallet }] as const) {
          const logs = await publicClient.getLogs({
            address: contracts.settlement.address,
            event: poiCommittedEvent,
            args,
            fromBlock: s,
            toBlock: e,
          })
          for (const l of logs) {
            const stid = l.args.stid
            if (stid && !seen.has(stid)) seen.set(stid, l.blockNumber)
          }
        }
      }

      let stids = [...seen.entries()]
        .sort((a, b) => Number(b[1] - a[1]))
        .map(([stid]) => stid as Hex)
      if (stids.length > MAX_ROWS) {
        setTruncated(true)
        stids = stids.slice(0, MAX_ROWS)
      }

      const built: AgentTxRow[] = []
      for (const stid of stids) {
        const [txn, porHash] = await Promise.all([
          publicClient.readContract({
            ...contracts.settlement,
            functionName: 'getTransaction',
            args: [stid],
          }),
          publicClient.readContract({
            ...contracts.settlement,
            functionName: 'getPoRHash',
            args: [stid],
          }),
        ])
        built.push({
          stid: txn.stid,
          direction: Number(txn.direction) as Direction,
          state: Number(txn.state) as SettlementState,
          escrowAmount: txn.escrowAmount,
          originator: txn.originator,
          beneficiary: txn.beneficiary,
          eligibleClaimant: txn.eligibleClaimant,
          committedAt: txn.committedAt,
          tw1: txn.tw1,
          tw2: txn.tw2,
          tw3: txn.tw3,
          porSubmitted: porHash != null && porHash !== zeroHash,
          drpInvoked: txn.drpInvoked,
        })
      }
      built.sort((a, b) => Number(b.committedAt - a.committedAt))
      setRows(built)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [publicClient, wallet])

  useEffect(() => {
    void load()
  }, [load])

  return { rows, isLoading, error, fromBlock, truncated, refetch: load }
}
