import { useState } from 'react'
import { type Hex } from 'viem'
import { usePublicClient, useWriteContract } from 'wagmi'
import { contracts } from '@/config/contracts'
import { mockDrpAbi } from '@/abi/mockdrp'
import { DrpOutcome, drpOutcomeLabel } from '@/lib/drpOutcome'
import { friendlyContractError } from '@/lib/contractErrors'

/**
 * TEST-HARNESS control (isolated; gated by VITE_ENABLE_DRP_HARNESS).
 *
 * The deployed MockDRP returns a per-STID preset from resolve(), settable by any
 * caller (the mock has no access control). This control presets that outcome so
 * BOTH DRP terminals — DRP-Settled and DRP-Reversed — are reachable browser-only,
 * satisfying the M2 acceptance ("every terminal state … without any command-line
 * interaction"). It touches ONLY the MockDRP, which is explicitly "not a
 * production DRP", and is removed with it.
 *
 * Contingent on the Client's steer (20260708 clarification, point c): if outcomes
 * are to be preset out-of-band instead, set VITE_ENABLE_DRP_HARNESS=false and this
 * component never renders.
 */
export function DrpHarnessControl({
  stid,
  preset,
  resolved,
  onDone,
}: {
  stid: Hex
  preset: DrpOutcome | undefined
  resolved: boolean
  onDone: () => void
}) {
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [busy, setBusy] = useState<DrpOutcome | null>(null)
  const [error, setError] = useState('')

  async function set(outcome: DrpOutcome) {
    if (!publicClient) return
    setError('')
    setBusy(outcome)
    try {
      const hash = await writeContractAsync({
        address: contracts.mockDrp.address,
        abi: mockDrpAbi,
        functionName: 'setOutcome',
        args: [stid, outcome],
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
    <section className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4">
      <h2 className="mb-1 text-sm font-semibold text-amber-800">
        MockDRP outcome · test harness
      </h2>
      <p className="mb-3 text-xs text-amber-700">
        This <span className="font-medium">stands in for the production DRP’s independent decision,
        which is not yet built</span>. It presets the verdict the MockDRP will return when the DRP is
        invoked, so both DRP terminals (Settled / Reversed) can be demonstrated browser-only. It is
        scaffolding for the testnet demo — <span className="font-medium">not</span> the operator
        choosing the outcome; a production DRP would decide independently and this control would not
        exist.
        {resolved && ' The DRP has already resolved this transaction — presetting no longer applies.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {[DrpOutcome.Settled, DrpOutcome.Reversed].map((o) => {
          const active = preset === o
          return (
            <button
              key={o}
              onClick={() => set(o)}
              disabled={busy !== null || resolved}
              className={
                active
                  ? 'rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white'
                  : 'rounded border border-amber-400 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50'
              }
              title={`Set MockDRP outcome to ${drpOutcomeLabel[o]} for this STID`}
            >
              {busy === o ? 'Setting…' : `Set ${drpOutcomeLabel[o]}`}
              {active ? ' ✓' : ''}
            </button>
          )
        })}
        <span className="text-xs text-amber-700">
          Current preset: <span className="font-medium">{preset != null ? drpOutcomeLabel[preset] : '—'}</span>
        </span>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  )
}
