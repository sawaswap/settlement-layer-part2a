import type { HistoryEntry } from '@/hooks/useTransactionHistory'
import { explorerTx } from '@/config/chain'
import { shortAddress } from '@/lib/format'

/** A human label per emitted event. */
const eventLabel: Record<string, string> = {
  PoICommitted: 'PoI committed — escrow locked',
  PoRSubmitted: 'PoR submitted',
  StateChanged: 'State changed',
  ClaimSubmitted: 'Claim submitted',
  DRPInvoked: 'DRP invoked',
  Settled: 'Settled — escrow released',
  Reversed: 'Reversed — escrow returned',
}

export function TransitionHistory({
  entries,
  isLoading,
  error,
}: {
  entries: HistoryEntry[]
  isLoading: boolean
  error: string
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Transition history</h2>
      {error && <p className="text-xs text-red-600">Could not load history: {error}</p>}
      {!error && isLoading && entries.length === 0 && (
        <p className="text-xs text-slate-400">Loading…</p>
      )}
      {!error && !isLoading && entries.length === 0 && (
        <p className="text-xs text-slate-400">No events found.</p>
      )}
      <ol className="space-y-2">
        {entries.map((e) => (
          <li
            key={`${e.txHash}-${e.logIndex}`}
            className="flex items-center justify-between gap-4 text-sm"
          >
            <span>
              <span className="font-medium">{eventLabel[e.eventName] ?? e.eventName}</span>{' '}
              <span className="text-slate-400">· block {e.blockNumber.toString()}</span>
            </span>
            <a
              href={explorerTx(e.txHash)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-sky-700 underline"
            >
              {shortAddress(e.txHash, 8, 6)}
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}
