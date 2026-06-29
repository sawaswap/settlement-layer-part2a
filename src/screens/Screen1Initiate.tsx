import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { isAddress, parseEventLogs, parseUnits, type Address } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { contracts, escrowAsset } from '@/config/contracts'
import { settlementAbi } from '@/abi/settlement'
import { explorerTx } from '@/config/chain'
import { useAdminRole } from '@/hooks/useAdminRole'
import { useUiStore } from '@/lib/store'
import { Direction, directionLabel } from '@/lib/state'
import { resolveSlots, beneficiaryLabel } from '@/lib/slots'
import { computeMomoLegHash, PREIMAGE_VERSION, type MomoLegPreimage } from '@/lib/momoLegHash'
import { friendlyConnectError } from '@/lib/walletErrors'
import { formatAmount, shortAddress } from '@/lib/format'

type Phase = 'form' | 'review' | 'working' | 'done'

interface FormState {
  direction: Direction
  amount: string
  beneficiary: string
  userCRelay: string
  userCMomoNumber: string
  destCountry: string
  destMno: string
  destCurrency: string
}

const EMPTY: FormState = {
  direction: Direction.CMM,
  amount: '',
  beneficiary: '',
  userCRelay: '',
  userCMomoNumber: '',
  destCountry: '+243',
  destMno: 'vodacom',
  destCurrency: 'USD',
}

/**
 * Screen 1 — Initiate Transaction (Admin-only, Agreement C.2). Composes a PoI
 * against the DEPLOYED five-field PoIInput and locks USDC escrow.
 *
 * Slot mapping (verified — Francis Q1 / v0.12.0 Tables 1/2) is direction-
 * dependent; Agent B is not a separate field. momoLegHash commits the
 * three-block off-chain preimage (lib/momoLegHash). The eligibleClaimant is
 * shown for explicit confirmation and is immutable after commitment.
 */
export function Screen1Initiate() {
  const { address, isConnected } = useAccount()
  const { isAdmin, isLoading: roleLoading } = useAdminRole()

  if (isConnected && !roleLoading && !isAdmin) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <h1 className="text-base font-semibold">Initiate Transaction — Admin only</h1>
        <p className="mt-1">
          The connected wallet does not hold the Admin role in the Settlement Contract&apos;s role
          registry. Connect the admin wallet to initiate a transaction.
        </p>
      </div>
    )
  }

  return <InitiateForm key={address ?? 'anon'} originator={address} />
}

function InitiateForm({ originator }: { originator?: Address }) {
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const setLastStid = useUiStore((s) => s.setLastStid)

  const [form, setForm] = useState<FormState>(EMPTY)
  const [phase, setPhase] = useState<Phase>('form')
  const [confirmImmutable, setConfirmImmutable] = useState(false)
  const [error, setError] = useState('')
  const [statusLine, setStatusLine] = useState('')
  const [result, setResult] = useState<{ stid: `0x${string}`; txHash: `0x${string}` } | null>(null)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const { data: balance } = useReadContract({
    ...contracts.usdc,
    functionName: 'balanceOf',
    args: originator ? [originator] : undefined,
    query: { enabled: Boolean(originator) },
  })
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    ...contracts.usdc,
    functionName: 'allowance',
    args: originator ? [originator, contracts.settlement.address] : undefined,
    query: { enabled: Boolean(originator) },
  })

  const isCmm = form.direction === Direction.CMM

  // Validation + derived values (slots, amount, momoLegHash) for the review step.
  const derived = useMemo(() => {
    const errors: string[] = []
    if (!originator) errors.push('No connected wallet.')

    let amount = 0n
    try {
      amount = form.amount ? parseUnits(form.amount, escrowAsset.decimals) : 0n
    } catch {
      errors.push('Amount is not a valid number.')
    }
    if (amount <= 0n) errors.push('Amount must be greater than zero.')

    if (!isAddress(form.beneficiary)) errors.push('Beneficiary is not a valid address.')
    if (isCmm && !isAddress(form.userCRelay))
      errors.push('User C relay (eligibleClaimant) is not a valid address.')
    if (!form.destCountry || !form.destMno || !form.destCurrency)
      errors.push('Corridor (country / operator / currency) is incomplete.')

    if (errors.length || !originator) return { errors }

    const slots = resolveSlots({
      direction: form.direction,
      connected: originator,
      beneficiary: form.beneficiary as Address,
      userCRelay: isCmm ? (form.userCRelay as Address) : undefined,
    })

    const preimage: MomoLegPreimage = {
      version: PREIMAGE_VERSION,
      direction: form.direction,
      corridor: {
        originChain: 'base-sepolia',
        originAsset: escrowAsset.symbol,
        destCountry: form.destCountry,
        destMno: form.destMno,
        destCurrency: form.destCurrency,
      },
      amounts: { amountSent: form.amount },
      participant: isCmm
        ? { userCMomoNumber: form.userCMomoNumber, agentBWallet: form.beneficiary, userAWallet: originator }
        : { userAWallet: form.beneficiary, agentBWallet: originator },
    }
    const momoLegHash = computeMomoLegHash(preimage)
    return { errors: [], amount, slots, momoLegHash }
  }, [form, originator, isCmm])

  const insufficientBalance =
    derived.amount !== undefined && balance !== undefined && balance < derived.amount

  async function onCommit() {
    if (!publicClient || !derived.slots || derived.amount === undefined || !derived.momoLegHash)
      return
    setError('')
    setPhase('working')
    try {
      if (allowance === undefined || allowance < derived.amount) {
        setStatusLine('Approving USDC escrow…')
        const approveHash = await writeContractAsync({
          ...contracts.usdc,
          functionName: 'approve',
          args: [contracts.settlement.address, derived.amount],
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
        await refetchAllowance()
      }

      setStatusLine('Committing PoI and locking escrow…')
      const commitHash = await writeContractAsync({
        ...contracts.settlement,
        functionName: 'commitPoI',
        args: [
          {
            beneficiary: derived.slots.beneficiary,
            eligibleClaimant: derived.slots.eligibleClaimant,
            direction: form.direction,
            escrowAmount: derived.amount,
            momoLegHash: derived.momoLegHash,
          },
        ],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: commitHash })
      const events = parseEventLogs({
        abi: settlementAbi,
        eventName: 'PoICommitted',
        logs: receipt.logs,
      })
      const stid = events[0]?.args.stid
      if (!stid) throw new Error('Commit succeeded but no PoICommitted event was found.')

      setLastStid(stid)
      setResult({ stid, txHash: commitHash })
      setPhase('done')
    } catch (e) {
      setError(friendlyConnectError(e))
      setPhase('review')
    } finally {
      setStatusLine('')
    }
  }

  if (phase === 'done' && result) {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="text-xl font-semibold text-emerald-700">PoI committed — escrow locked</h1>
        <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <Field label="STID">
            <span className="break-all font-mono text-xs">{result.stid}</span>
          </Field>
          <Field label="Escrow">
            <span>{formatAmount(derived.amount ?? 0n, escrowAsset.decimals, escrowAsset.symbol)} locked</span>
          </Field>
          <Field label="Transaction">
            <a className="text-sky-700 underline" href={explorerTx(result.txHash)} target="_blank" rel="noreferrer">
              View on explorer
            </a>
          </Field>
        </div>
        <div className="mt-4 flex gap-2">
          <Link to="/monitor" className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700">
            Open in Transaction Monitor
          </Link>
          <button
            onClick={() => {
              setForm(EMPTY)
              setConfirmImmutable(false)
              setResult(null)
              setPhase('form')
            }}
            className="rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Initiate another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl font-semibold">Initiate Transaction</h1>
      <p className="mt-1 text-sm text-slate-500">
        Admin-only. Compose a PoI and lock {escrowAsset.symbol} escrow on {' '}
        <span className="font-mono">{shortAddress(contracts.settlement.address)}</span>.
      </p>

      {phase === 'form' || phase === 'review' ? (
        <fieldset disabled={phase === 'review'} className="mt-6 space-y-4">
          <div>
            <Label>Direction</Label>
            <div className="mt-1 flex gap-2">
              {[Direction.CMM, Direction.MMC].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set('direction', d)}
                  className={`flex-1 rounded border px-3 py-2 text-sm ${
                    form.direction === d
                      ? 'border-sky-500 bg-sky-50 font-medium text-sky-800'
                      : 'border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {directionLabel[d]}
                </button>
              ))}
            </div>
          </div>

          <TextInput
            label={`Amount (${escrowAsset.symbol})`}
            value={form.amount}
            onChange={(v) => set('amount', v)}
            placeholder="10.5"
            mono
          />

          <TextInput
            label={beneficiaryLabel[form.direction]}
            value={form.beneficiary}
            onChange={(v) => set('beneficiary', v)}
            placeholder="0x…"
            mono
          />

          {isCmm ? (
            <>
              <TextInput
                label="User C relay address (eligibleClaimant — immutable)"
                value={form.userCRelay}
                onChange={(v) => set('userCRelay', v)}
                placeholder="0x…"
                mono
              />
              <TextInput
                label="User C mobile-money number"
                value={form.userCMomoNumber}
                onChange={(v) => set('userCMomoNumber', v)}
                placeholder="+243…"
              />
            </>
          ) : (
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              eligibleClaimant = the connected wallet (Agent B = originator) in MMC. No separate input.
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <TextInput label="Country" value={form.destCountry} onChange={(v) => set('destCountry', v)} />
            <TextInput label="Operator (MNO)" value={form.destMno} onChange={(v) => set('destMno', v)} />
            <TextInput label="Currency" value={form.destCurrency} onChange={(v) => set('destCurrency', v)} />
          </div>
        </fieldset>
      ) : null}

      {phase === 'form' && (
        <div className="mt-6">
          {derived.errors.length > 0 && (
            <ul className="mb-3 list-disc space-y-0.5 pl-5 text-xs text-amber-700">
              {derived.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <button
            onClick={() => setPhase('review')}
            disabled={derived.errors.length > 0}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Review
          </button>
        </div>
      )}

      {phase === 'review' && derived.slots && (
        <ReviewPanel
          originator={derived.slots.originator}
          beneficiary={derived.slots.beneficiary}
          eligibleClaimant={derived.slots.eligibleClaimant}
          direction={form.direction}
          amountText={formatAmount(derived.amount ?? 0n, escrowAsset.decimals, escrowAsset.symbol)}
          momoLegHash={derived.momoLegHash!}
          insufficientBalance={Boolean(insufficientBalance)}
          balanceText={
            balance !== undefined
              ? formatAmount(balance, escrowAsset.decimals, escrowAsset.symbol)
              : '—'
          }
          confirmImmutable={confirmImmutable}
          setConfirmImmutable={setConfirmImmutable}
          onBack={() => setPhase('form')}
          onCommit={onCommit}
          error={error}
        />
      )}

      {phase === 'working' && (
        <div className="mt-6 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          {statusLine || 'Working…'} Confirm the request(s) in your wallet.
        </div>
      )}
    </div>
  )
}

function ReviewPanel(props: {
  originator: Address
  beneficiary: Address
  eligibleClaimant: Address
  direction: Direction
  amountText: string
  momoLegHash: `0x${string}`
  insufficientBalance: boolean
  balanceText: string
  confirmImmutable: boolean
  setConfirmImmutable: (v: boolean) => void
  onBack: () => void
  onCommit: () => void
  error: string
}) {
  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Review — these slots are written on commitment</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <Field label="Direction">{directionLabel[props.direction]}</Field>
        <Field label="Originator (msg.sender)">
          <Mono>{props.originator}</Mono>
        </Field>
        <Field label="Beneficiary">
          <Mono>{props.beneficiary}</Mono>
        </Field>
        <Field label="eligibleClaimant (immutable)">
          <span className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-xs text-amber-900 ring-1 ring-amber-200">
            {props.eligibleClaimant}
          </span>
        </Field>
        <Field label="Escrow">{props.amountText}</Field>
        <Field label="momoLegHash">
          <span className="break-all font-mono text-xs text-slate-500">{props.momoLegHash}</span>
        </Field>
        <Field label="Your balance">{props.balanceText}</Field>
      </dl>

      {props.insufficientBalance && (
        <p className="mt-3 text-xs text-red-600">
          Insufficient {escrowAsset.symbol} balance to lock this escrow.
        </p>
      )}

      <label className="mt-4 flex items-start gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={props.confirmImmutable}
          onChange={(e) => props.setConfirmImmutable(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I confirm the eligibleClaimant address is correct. It is fixed at PoI and cannot be changed
          after commitment.
        </span>
      </label>

      {props.error && <p className="mt-3 text-xs text-red-600">{props.error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          onClick={props.onBack}
          className="rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Back
        </button>
        <button
          onClick={props.onCommit}
          disabled={!props.confirmImmutable || props.insufficientBalance}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Commit PoI &amp; lock escrow
        </button>
      </div>
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <span className="text-xs font-medium text-slate-600">{children}</span>
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none ${mono ? 'font-mono' : ''}`}
      />
    </label>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="break-all font-mono text-xs">{children}</span>
}
