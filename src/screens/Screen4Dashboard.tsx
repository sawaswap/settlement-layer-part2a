import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useAgentTransactions } from '@/hooks/useAgentTransactions'
import { useChainNow } from '@/hooks/useChainNow'
import { useUiStore } from '@/lib/store'
import { windowInfo } from '@/lib/windows'
import { Direction, directionLabel } from '@/lib/state'
import { deriveAgentB } from '@/lib/slots'
import {
  filterRows,
  stateFilterOptions,
  windowFilterOptions,
  type AgentTxRow,
  type StateFilter,
  type WindowFilter,
} from '@/lib/dashboard'
import { escrowAsset } from '@/config/contracts'
import { explorerAddress } from '@/config/chain'
import { formatAmount, formatCountdown, shortAddress } from '@/lib/format'
import { StateBadge } from '@/components/monitor/StateBadge'

const directionShort: Record<Direction, string> = {
  [Direction.CMM]: 'CMM',
  [Direction.MMC]: 'MMC',
}

/**
 * Screen 4 — Agent B Transaction Dashboard (Agreement C.2). Lists the connected
 * wallet's transactions (discovered by its indexed PoICommitted slots), with
 * state + time-window filters, the full on-chain monitoring fields, and
 * drill-down to Screen 2 carrying the STID forward. Chain-/asset-aware via env
 * (Section E.5). Identifying participant fields are the encrypted-preimage
 * design item and shown as pending.
 */
export function Screen4Dashboard() {
  const { address } = useAccount()
  const now = useChainNow()
  const { rows, isLoading, error, fromBlock, truncated, refetch } = useAgentTransactions(address)
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const [windowFilter, setWindowFilter] = useState<WindowFilter>('all')

  const visible = useMemo(
    () => filterRows(rows, stateFilter, windowFilter),
    [rows, stateFilter, windowFilter],
  )

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Agent B Transaction Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Transactions where the connected wallet is a party, on {escrowAsset.symbol} · Base
            Sepolia.
          </p>
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isLoading}
          className="shrink-0 rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="mt-5 space-y-2">
        <FilterRow
          label="State"
          options={stateFilterOptions}
          value={stateFilter}
          onChange={setStateFilter}
        />
        <FilterRow
          label="Window"
          options={windowFilterOptions}
          value={windowFilter}
          onChange={setWindowFilter}
        />
      </div>

      <div className="mt-6">
        {isLoading && rows.length === 0 && (
          <p className="text-sm text-slate-400">Scanning transactions…</p>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Could not load transactions: {error}
          </div>
        )}
        {!isLoading && !error && rows.length === 0 && (
          <p className="text-sm text-slate-400">
            No transactions found for this wallet from block {fromBlock?.toString() ?? '—'}. Initiate
            one on the Initiate screen, or adjust{' '}
            <span className="font-mono">VITE_INDEX_FROM_BLOCK</span>.
          </p>
        )}

        {rows.length > 0 && (
          <>
            <p className="mb-3 text-xs text-slate-500">
              {visible.length} of {rows.length} transaction{rows.length === 1 ? '' : 's'} shown ·
              indexed from block {fromBlock?.toString()}
              {truncated && ' · list capped at the most recent 200'}
            </p>
            <div className="space-y-3">
              {visible.map((r) => (
                <TxCard key={r.stid} row={r} now={now} />
              ))}
              {visible.length === 0 && (
                <p className="text-sm text-slate-400">No transactions match the current filters.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function FilterRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { key: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={
            value === o.key
              ? 'rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-white'
              : 'rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50'
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function TxCard({ row, now }: { row: AgentTxRow; now: number }) {
  const navigate = useNavigate()
  const setLastStid = useUiStore((s) => s.setLastStid)
  const window = windowInfo(row.state, row.committedAt, row.tw1, row.tw2, row.tw3, now)
  const agentB = deriveAgentB(row.direction, row.originator, row.beneficiary)

  function openInMonitor() {
    setLastStid(row.stid)
    navigate('/monitor')
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600"
            title={directionLabel[row.direction]}
          >
            {directionShort[row.direction]}
          </span>
          <StateBadge state={row.state} />
        </div>
        <button
          onClick={openInMonitor}
          className="rounded bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-700"
        >
          Open in Monitor →
        </button>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        <Row label="STID">
          <span className="break-all font-mono text-xs">{shortAddress(row.stid, 10, 8)}</span>
        </Row>
        <Row label="Escrow">
          {formatAmount(row.escrowAmount, escrowAsset.decimals, escrowAsset.symbol)}
        </Row>
        <Row label="Active window">
          {window.label ? (
            window.expired ? (
              <span className="text-amber-700">{window.label} · expired</span>
            ) : (
              <span className="tabular-nums">
                {window.label} · {formatCountdown(window.remaining)}
              </span>
            )
          ) : (
            <span className="text-slate-400">— (terminal)</span>
          )}
        </Row>
        <Row label="PoR / rail settled">{row.porSubmitted ? 'Yes' : 'No'}</Row>
        <Row label="eligibleClaimant">
          <Addr address={row.eligibleClaimant} />
        </Row>
        <Row label="Agent B">
          <Addr address={agentB} />
        </Row>
        <Row label="Corridor / operator">
          <span className="text-slate-400">— (pending preimage retrieval)</span>
        </Row>
        <Row label="DRP invoked">{row.drpInvoked ? 'Yes' : 'No'}</Row>
      </dl>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

function Addr({ address }: { address: `0x${string}` }) {
  return (
    <a
      href={explorerAddress(address)}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-sky-700 underline"
      title={address}
    >
      {shortAddress(address, 6, 4)}
    </a>
  )
}
