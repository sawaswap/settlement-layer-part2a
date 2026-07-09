import { useEffect, useMemo, useState } from 'react'
import { isHex, type Hex } from 'viem'
import { useAccount } from 'wagmi'
import { useUiStore } from '@/lib/store'
import { useTransaction } from '@/hooks/useTransaction'
import { useClaimStatus } from '@/hooks/useClaimStatus'
import { useMockDrpStatus } from '@/hooks/useMockDrpStatus'
import { useTransactionHistory } from '@/hooks/useTransactionHistory'
import { useChainNow } from '@/hooks/useChainNow'
import { deriveEscalation } from '@/lib/escalation'
import { SettlementState, stateLabel, isTerminal, directionLabel, Direction } from '@/lib/state'
import { drpOutcomeLabel } from '@/lib/drpOutcome'
import { escrowAsset } from '@/config/contracts'
import { env } from '@/config/env'
import { formatAmount, formatCountdown, shortAddress } from '@/lib/format'
import { explorerAddress } from '@/config/chain'
import { StateBadge } from '@/components/monitor/StateBadge'
import { TransitionHistory } from '@/components/monitor/TransitionHistory'
import { EscalationActions } from '@/components/dispute/EscalationActions'
import { DrpHarnessControl } from '@/components/dispute/DrpHarnessControl'

const isStid = (s: string): s is Hex => isHex(s) && s.length === 66

/**
 * Screen 3 — Dispute and Escalation (Agreement C.2). Reached once a STID has
 * entered the claim window (EscalationL1) via TW1 expiry. Surfaces the claim
 * window, the DRP path, and the permissionless expiry pokers — every dispute
 * terminal observable and drivable by STID with no command-line interaction.
 * Built to the deployed Settlement/MockDRP (see part2a-m2-plan §2).
 */
export function Screen3Dispute() {
  const { address } = useAccount()
  const lastStid = useUiStore((s) => s.lastStid)
  const [input, setInput] = useState<string>(lastStid ?? '')
  const [activeStid, setActiveStid] = useState<Hex | undefined>(lastStid ?? undefined)

  useEffect(() => {
    if (lastStid && !input) {
      setInput(lastStid)
      setActiveStid(lastStid)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastStid])

  const { exists, transaction, isLoading, isError, refetch } = useTransaction(activeStid)
  const { claimExists, refetch: refetchClaim } = useClaimStatus(activeStid)
  const drp = useMockDrpStatus(activeStid)
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

  const escalation = useMemo(() => {
    if (!transaction) return null
    return deriveEscalation({
      state: Number(transaction.state) as SettlementState,
      claimExists,
      drpInvoked: transaction.drpInvoked,
      isEligibleClaimant:
        Boolean(address) && address!.toLowerCase() === transaction.eligibleClaimant.toLowerCase(),
      committedAt: transaction.committedAt,
      tw1: transaction.tw1,
      tw2: transaction.tw2,
      tw3: transaction.tw3,
      nowSeconds: now,
    })
  }, [transaction, claimExists, address, now])

  const trimmed = input.trim()
  const inputValid = trimmed === '' || isStid(trimmed)

  function refetchAll() {
    refetch()
    refetchClaim()
    drp.refetch()
    void refetchHistory()
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">Dispute and Escalation</h1>
      <p className="mt-1 text-sm text-slate-500">
        Drive and observe the claim window, the DRP path, and the expiry pokers by STID.
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
            Paste a STID above, or carry one forward from the Monitor screen.
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
            No transaction found for this STID on this network.
          </div>
        )}

        {activeStid && transaction && escalation && (
          <div className="space-y-6">
            <DisputeStatus
              stid={transaction.stid}
              state={Number(transaction.state) as SettlementState}
              direction={Number(transaction.direction) as Direction}
              escrowAmount={transaction.escrowAmount}
              eligibleClaimant={transaction.eligibleClaimant}
              claimExists={claimExists}
              drpInvoked={transaction.drpInvoked}
              drpPreset={drp.preset}
              drpResolved={drp.resolved}
              tw3Deadline={escalation.tw3Deadline}
              now={now}
            />

            {Number(transaction.state) === SettlementState.PoICommitted && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                This transaction has not entered the claim window yet. Once TW1 expires, escalate it
                with <span className="font-medium">pokeTW1</span> on the Monitor screen; the dispute
                actions open here in EscalationL1.
              </div>
            )}

            {isTerminal(Number(transaction.state) as SettlementState) && (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
                Terminal state reached:{' '}
                <span className="font-semibold">
                  {stateLabel[Number(transaction.state) as SettlementState]}
                </span>
                . No further dispute actions apply.
              </div>
            )}

            {env.VITE_ENABLE_DRP_HARNESS && escalation.inEscalation && !drp.resolved && (
              <DrpHarnessControl
                stid={transaction.stid}
                preset={drp.preset}
                resolved={drp.resolved}
                onDone={refetchAll}
              />
            )}

            <EscalationActions txn={transaction} escalation={escalation} onDone={refetchAll} />

            <TransitionHistory entries={entries} isLoading={historyLoading} error={historyError} />
          </div>
        )}
      </div>
    </div>
  )
}

function DisputeStatus({
  stid,
  state,
  direction,
  escrowAmount,
  eligibleClaimant,
  claimExists,
  drpInvoked,
  drpPreset,
  drpResolved,
  tw3Deadline,
  now,
}: {
  stid: Hex
  state: SettlementState
  direction: Direction
  escrowAmount: bigint
  eligibleClaimant: Hex
  claimExists: boolean
  drpInvoked: boolean
  drpPreset: number | undefined
  drpResolved: boolean
  tw3Deadline: number
  now: number
}) {
  const inEscalation = state === SettlementState.EscalationL1
  const tw3Remaining = Math.max(0, tw3Deadline - now)
  const tw3Expired = now > tw3Deadline

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Escalation status</h2>
      <dl className="space-y-2 text-sm">
        <Row label="STID">
          <span className="break-all font-mono text-xs">{stid}</span>
        </Row>
        <Row label="State">
          <StateBadge state={state} />
        </Row>
        <Row label="Direction">{directionLabel[direction]}</Row>
        <Row label="Escrow">{formatAmount(escrowAmount, escrowAsset.decimals, escrowAsset.symbol)}</Row>
        <Row label="eligibleClaimant (immutable)">
          <a
            href={explorerAddress(eligibleClaimant)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-sky-700 underline"
            title={eligibleClaimant}
          >
            {shortAddress(eligibleClaimant, 8, 6)}
          </a>
        </Row>
        <Row label="Claim on record">{claimExists ? 'Yes' : 'No'}</Row>
        {inEscalation && claimExists && (
          <Row label="DRP window (TW3)">
            {tw3Expired ? (
              <span className="text-amber-700">expired</span>
            ) : (
              <span className="tabular-nums">{formatCountdown(tw3Remaining)} remaining</span>
            )}
          </Row>
        )}
        <Row label="DRP status">
          {drpResolved
            ? 'Resolved'
            : drpInvoked
              ? 'Invoked'
              : claimExists
                ? `Not invoked (preset: ${drpPreset != null ? drpOutcomeLabel[drpPreset as 0 | 1] : '—'})`
                : 'No claim yet'}
        </Row>
      </dl>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}
