import { useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import type { TransactionData } from '@/hooks/useTransaction'
import type { WindowInfo } from '@/lib/windows'
import { SettlementState } from '@/lib/state'
import { contracts } from '@/config/contracts'
import { composePorData } from '@/lib/por'
import { friendlyConnectError } from '@/lib/walletErrors'

/**
 * Screen 2 actions (Agreement C.2):
 *  - Submit PoR — active only while PoICommitted within TW1, by the
 *    eligibleClaimant, and when no PoR has been submitted (Settlement.submitPoR
 *    enforces all three on-chain). PoR settles the transaction.
 *  - pokeTW1 — permissionless escalation once TW1 has elapsed.
 */
export function MonitorActions({
  txn,
  porSubmitted,
  window,
  onDone,
}: {
  txn: TransactionData
  porSubmitted: boolean
  window: WindowInfo
  onDone: () => void
}) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [busy, setBusy] = useState<'por' | 'poke' | null>(null)
  const [error, setError] = useState('')

  const state = Number(txn.state) as SettlementState
  const isPoICommitted = state === SettlementState.PoICommitted
  const isEligibleClaimant =
    Boolean(address) && address!.toLowerCase() === txn.eligibleClaimant.toLowerCase()

  const canSubmitPoR = isPoICommitted && !window.expired && isEligibleClaimant && !porSubmitted
  const canPoke = isPoICommitted && window.expired

  async function run(kind: 'por' | 'poke') {
    if (!publicClient) return
    setError('')
    setBusy(kind)
    try {
      const hash =
        kind === 'por'
          ? await writeContractAsync({
              ...contracts.settlement,
              functionName: 'submitPoR',
              args: [txn.stid, composePorData(txn.stid)],
            })
          : await writeContractAsync({
              ...contracts.settlement,
              functionName: 'pokeTW1',
              args: [txn.stid],
            })
      await publicClient.waitForTransactionReceipt({ hash })
      onDone()
    } catch (e) {
      setError(friendlyConnectError(e))
    } finally {
      setBusy(null)
    }
  }

  // Nothing actionable in terminal states.
  if (state === SettlementState.Settled || state === SettlementState.Reversed) return null

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Actions</h2>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => run('por')}
          disabled={!canSubmitPoR || busy !== null}
          className={
            canSubmitPoR
              ? 'rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700'
              : 'cursor-not-allowed rounded bg-slate-100 px-3 py-2 text-sm font-medium text-slate-400 ring-1 ring-slate-200'
          }
          title={porSubmitterHint(isPoICommitted, window.expired, isEligibleClaimant, porSubmitted)}
        >
          {busy === 'por' ? 'Submitting PoR…' : 'Submit PoR'}
        </button>
        <button
          onClick={() => run('poke')}
          disabled={!canPoke || busy !== null}
          className="rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          title={
            canPoke ? 'Escalate to TW2' : 'pokeTW1 is available once TW1 has expired'
          }
        >
          {busy === 'poke' ? 'Escalating…' : 'pokeTW1 (escalate)'}
        </button>
      </div>

      {isPoICommitted && !porSubmitted && !isEligibleClaimant && !window.expired && (
        <p className="mt-2 text-xs text-slate-500">
          Only the eligibleClaimant wallet can submit the PoR for this transaction.
        </p>
      )}
      {isPoICommitted && !porSubmitted && window.expired && (
        <p className="mt-2 text-xs text-slate-500">
          TW1 has elapsed, so a PoR can no longer be submitted. Escalate with{' '}
          <span className="font-medium">pokeTW1</span> to open the claim window; the claim is then
          submitted on the Dispute screen.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  )
}

function porSubmitterHint(
  isPoICommitted: boolean,
  expired: boolean,
  isClaimant: boolean,
  porSubmitted: boolean,
): string {
  if (porSubmitted) return 'PoR already submitted'
  if (!isPoICommitted) return 'PoR can only be submitted while the transaction is in TW1'
  if (expired) return 'TW1 has expired'
  if (!isClaimant) return 'Only the eligibleClaimant can submit PoR'
  return 'Submit Proof of Receipt and settle'
}
