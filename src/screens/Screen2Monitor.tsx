import { useEffect, useMemo, useState } from 'react'
import { isHex, type Hex } from 'viem'
import { useAccount } from 'wagmi'
import { useUiStore } from '@/lib/store'
import { useTransaction } from '@/hooks/useTransaction'
import { useTransactionHistory } from '@/hooks/useTransactionHistory'
import { useChainNow } from '@/hooks/useChainNow'
import { windowInfo } from '@/lib/windows'
import { SettlementState } from '@/lib/state'
import { TransactionDetails, type ViewMode } from '@/components/monitor/TransactionDetails'
import { MonitorActions } from '@/components/monitor/MonitorActions'
import { TransitionHistory } from '@/components/monitor/TransitionHistory'

const isStid = (s: string): s is Hex => isHex(s) && s.length === 66

/**
 * Screen 2 — Transaction Monitor (Agreement C.2). The primary verification
 * instrument: look up any transaction by STID and observe every terminal state
 * of the state machine, with a live time-window countdown, full transition
 * history, and the PoR / pokeTW1 actions — no command-line interaction.
 */
export function Screen2Monitor() {
  const { address } = useAccount()
  const lastStid = useUiStore((s) => s.lastStid)
  const [input, setInput] = useState<string>(lastStid ?? '')
  const [activeStid, setActiveStid] = useState<Hex | undefined>(lastStid ?? undefined)

  // Carry-forward from Screen 1: adopt a freshly-committed STID if the field is empty.
  useEffect(() => {
    if (lastStid && !input) {
      setInput(lastStid)
      setActiveStid(lastStid)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastStid])

  const { exists, transaction, porSubmitted, isLoading, isError, refetch } =
    useTransaction(activeStid)
  const now = useChainNow()
  const {
    entries,
    isLoading: historyLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useTransactionHistory(
    activeStid,
    transaction?.committedAt,
    transaction ? transaction.tw1 + transaction.tw2 + transaction.tw3 : undefined,
  )

  const window = useMemo(() => {
    if (!transaction) return null
    return windowInfo(
      Number(transaction.state) as SettlementState,
      transaction.committedAt,
      transaction.tw1,
      transaction.tw2,
      transaction.tw3,
      now,
    )
  }, [transaction, now])

  const mode: ViewMode = useMemo(() => {
    if (!transaction || !address) return 'observer'
    const parties = [
      transaction.originator,
      transaction.beneficiary,
      transaction.eligibleClaimant,
    ].map((a) => a.toLowerCase())
    return parties.includes(address.toLowerCase()) ? 'institution' : 'observer'
  }, [transaction, address])

  const trimmed = input.trim()
  const inputValid = trimmed === '' || isStid(trimmed)

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">Transaction Monitor</h1>
      <p className="mt-1 text-sm text-slate-500">
        Look up any transaction by STID and observe its full lifecycle.
      </p>

      <div className="mt-6 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="0x… (STID)"
          className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:border-sky-500 focus:outline-none"
        />
        <button
          onClick={() => isStid(trimmed) && setActiveStid(trimmed)}
          disabled={!isStid(trimmed)}
          className="shrink-0 rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          Look up
        </button>
      </div>
      {!inputValid && (
        <p className="mt-1 text-xs text-amber-700">A STID is a 32-byte 0x value (66 characters).</p>
      )}

      <div className="mt-6">
        {!activeStid && (
          <p className="text-sm text-slate-400">
            Paste a STID above, or initiate a transaction on the Initiate screen to carry one
            forward.
          </p>
        )}

        {activeStid && isLoading && <p className="text-sm text-slate-400">Loading transaction…</p>}

        {activeStid && !isLoading && isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Could not read this transaction from the network. Check your connection and try again.
          </div>
        )}

        {activeStid && !isLoading && !isError && exists === false && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No transaction found for this STID on {`this network`}.
          </div>
        )}

        {activeStid && transaction && window && (
          <div className="space-y-6">
            <ViewModeBanner mode={mode} />
            <TransactionDetails
              txn={transaction}
              porSubmitted={porSubmitted}
              window={window}
              mode={mode}
            />
            <MonitorActions
              txn={transaction}
              porSubmitted={porSubmitted}
              window={window}
              onDone={() => {
                refetch()
                void refetchHistory()
              }}
            />
            <TransitionHistory entries={entries} isLoading={historyLoading} error={historyError} />
          </div>
        )}
      </div>
    </div>
  )
}

function ViewModeBanner({ mode }: { mode: ViewMode }) {
  return (
    <div
      className={`rounded-md px-3 py-2 text-xs ${
        mode === 'institution'
          ? 'bg-sky-50 text-sky-800 ring-1 ring-sky-200'
          : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200'
      }`}
    >
      {mode === 'institution'
        ? 'Institution-party view — the connected wallet is a party to this transaction.'
        : 'Third-party-observer view — corridor, amounts, STID and on-chain state only.'}
    </div>
  )
}
