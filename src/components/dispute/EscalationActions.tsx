import { useState } from 'react'
import { usePublicClient, useWriteContract } from 'wagmi'
import type { TransactionData } from '@/hooks/useTransaction'
import type { EscalationView, EscalationActionKey } from '@/lib/escalation'
import { contracts } from '@/config/contracts'
import { composeClaimData } from '@/lib/claim'
import { friendlyContractError } from '@/lib/contractErrors'

/**
 * Screen 3 dispute actions, gated to the DEPLOYED Settlement contract via
 * lib/escalation (see docs/frontend/notes/part2a-m2-plan.md §2):
 *
 *   - Submit Claim / Update Claim — eligibleClaimant, within TW2.
 *   - Invoke DRP — eligibleClaimant, claim on record, within the full window;
 *     atomic (invokeDRP → DRP.resolve → terminal in one tx). Contingent on the
 *     Client confirming the added action (20260708 clarification, point b);
 *     kept in a delimited block so it is trivially removable.
 *   - Trigger TW2 / TW3 Expiry — permissionless default-reverse pokers.
 *
 * The claim/DRP surface partitions by claim status: no claim → Submit Claim +
 * expireTW2; claim → Update Claim + Invoke DRP + expireTW3.
 */
export function EscalationActions({
  txn,
  escalation,
  onDone,
}: {
  txn: TransactionData
  escalation: EscalationView
  onDone: () => void
}) {
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [busy, setBusy] = useState<EscalationActionKey | null>(null)
  const [error, setError] = useState('')

  if (!escalation.inEscalation) return null

  const a = escalation.actions

  async function run(kind: EscalationActionKey) {
    if (!publicClient) return
    setError('')
    setBusy(kind)
    try {
      const hash =
        kind === 'submitClaim' || kind === 'updateClaim'
          ? await writeContractAsync({
              ...contracts.settlement,
              functionName: kind,
              args: [txn.stid, composeClaimData(txn.stid)],
            })
          : await writeContractAsync({
              ...contracts.settlement,
              functionName: kind,
              args: [txn.stid],
            })
      await publicClient.waitForTransactionReceipt({ hash })
      onDone()
    } catch (e) {
      setError(friendlyContractError(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Dispute actions</h2>

      <div className="flex flex-wrap gap-2">
        {!escalation.claimExists ? (
          <ActionButton
            label="Submit Claim"
            busyLabel="Submitting claim…"
            primary
            busy={busy === 'submitClaim'}
            disabled={busy !== null}
            action={a.submitClaim}
            onClick={() => run('submitClaim')}
          />
        ) : (
          <>
            <ActionButton
              label="Update Claim"
              busyLabel="Updating claim…"
              busy={busy === 'updateClaim'}
              disabled={busy !== null}
              action={a.updateClaim}
              onClick={() => run('updateClaim')}
            />
            {/* ── Invoke DRP (contingent; point b of the 2026-07-08 clarification) ── */}
            <ActionButton
              label="Invoke DRP"
              busyLabel="Invoking DRP…"
              primary
              busy={busy === 'invokeDRP'}
              disabled={busy !== null}
              action={a.invokeDRP}
              onClick={() => run('invokeDRP')}
            />
            {/* ── end Invoke DRP ── */}
          </>
        )}

        <ActionButton
          label={escalation.claimExists ? 'Trigger TW3 Expiry' : 'Trigger TW2 Expiry'}
          busyLabel="Expiring…"
          busy={busy === 'expireTW2' || busy === 'expireTW3'}
          disabled={busy !== null}
          action={escalation.claimExists ? a.expireTW3 : a.expireTW2}
          onClick={() => run(escalation.claimExists ? 'expireTW3' : 'expireTW2')}
        />
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Submit Claim, Update Claim and Invoke DRP are callable only by the eligibleClaimant wallet.
        The expiry pokers are permissionless — any wallet may trigger a default-reverse once the
        window has elapsed.
      </p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  )
}

function ActionButton({
  label,
  busyLabel,
  action,
  onClick,
  busy,
  disabled,
  primary,
}: {
  label: string
  busyLabel: string
  action: { available: boolean; reason: string }
  onClick: () => void
  busy: boolean
  disabled: boolean
  primary?: boolean
}) {
  const enabled = action.available && !disabled
  const base = primary
    ? 'rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700'
    : 'rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50'
  const off = 'cursor-not-allowed rounded bg-slate-100 px-3 py-2 text-sm font-medium text-slate-400 ring-1 ring-slate-200'
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      className={action.available ? base : off}
      title={action.available ? label : action.reason}
    >
      {busy ? busyLabel : label}
    </button>
  )
}
