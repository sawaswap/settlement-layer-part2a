import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { parseUnits, type PublicClient } from 'viem'
import { useAccount, useChainId, usePublicClient, useReadContract, useWalletClient } from 'wagmi'
import { createScnClient } from '@sawaswap/scn-client'
import { contracts, escrowAsset } from '@/config/contracts'
import { explorerTx } from '@/config/chain'
import { env } from '@/config/env'
import { useOriginatorRole } from '@/hooks/useOriginatorRole'
import { useUiStore } from '@/lib/store'
import { formatAmount, formatTimestamp, shortAddress } from '@/lib/format'
import { friendlyConnectError } from '@/lib/walletErrors'
import { OriginationRefusal } from '@/lib/origination/errors'
import {
  browserChainPort,
  browserWalletPort,
  isUserRejection,
} from '@/lib/origination/browserPorts'
import {
  commitOrigination,
  deliverOrigination,
  prepareOrigination,
  releaseCommitRequest,
  resumeOrigination,
  type OriginationDeps,
} from '@/lib/origination/flow'
import { keyBindingMode, localCheckpointStore, parseKeyAnchors } from '@/lib/origination/keyBinding'
import { browserRandom } from '@/lib/origination/material'
import {
  acceptQuote,
  messageOf,
  parseQuoteRecord,
  type AcceptedQuote,
} from '@/lib/origination/quoteRecord'
import {
  isOpenPhase,
  localOriginationStore,
  type OriginationRecord,
} from '@/lib/origination/record'

/**
 * Screen 1 — Initiate Transaction (C01).
 *
 * The Console originates a CMM transaction from the operator's EOA wallet in
 * the order the protocol fixes: the Authorised Quote Record is validated and
 * accepted (§2.4c.3), both operators' signed key bindings are verified, the
 * Consumer Context is sealed to User C's SCA and signed in the wallet, then
 * `commitPoI`, then the preimage material, the payout material and the
 * Transaction Introduction are delivered through SCN. A local record carries
 * every step, so an interrupted origination resumes instead of starting again.
 *
 * MMC origination is not offered: the frozen construction (86cb152xc v1.2.13)
 * and the pilot quote are CMM only.
 */
export function Screen1Initiate() {
  const { address, isConnected } = useAccount()
  const { allowed, isLoading } = useOriginatorRole()

  if (isConnected && !isLoading && !allowed) {
    return (
      <Notice tone="amber" title="Initiate Transaction — originators only">
        The connected wallet holds neither the Admin role nor the Console originator role
        (CR-CONSOLE-1) in the Settlement Contract&apos;s role registry. The admin grants the
        originator role with <span className="font-mono">grantRole</span>.
      </Notice>
    )
  }
  if (env.VITE_SCN_URL === undefined) {
    return (
      <Notice tone="amber" title="Initiate Transaction — SCN not configured">
        This deployment has no <span className="font-mono">VITE_SCN_URL</span>, so it cannot look up
        the operators&apos; keys or deliver the transaction&apos;s objects.
      </Notice>
    )
  }
  return <Origination key={address ?? 'anon'} scnUrl={env.VITE_SCN_URL} />
}

function useOriginationDeps(scnUrl: string): OriginationDeps | undefined {
  const { address } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  return useMemo(() => {
    if (!address || !publicClient || !walletClient) return undefined
    const client = publicClient as PublicClient
    const chainArgs = {
      settlement: contracts.settlement.address,
      tokenAddress: contracts.usdc.address,
    }
    return {
      chain: browserChainPort({
        client,
        chainId,
        ...chainArgs,
        tokenSymbol: escrowAsset.symbol,
        tokenDecimals: escrowAsset.decimals,
      }),
      wallet: browserWalletPort({ client, wallet: walletClient, account: address, ...chainArgs }),
      scn: createScnClient({ baseUrl: scnUrl }),
      store: localOriginationStore(),
      policy: {
        mode: keyBindingMode(env.VITE_KEY_BINDING_MODE, chainId),
        anchors: parseKeyAnchors(env.VITE_KEY_ANCHORS),
        checkpoints: localCheckpointStore(),
      },
      now: () => Date.now(),
      random: browserRandom,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    }
  }, [address, chainId, publicClient, walletClient, scnUrl])
}

interface FormState {
  quoteRecordText: string
  ssid: string
  userCMomoEndpoint: string
  amount: string
  executionInstructions: string
}

const EMPTY: FormState = {
  quoteRecordText: '',
  ssid: '',
  userCMomoEndpoint: '',
  amount: '',
  executionInstructions: 'Pay the recipient in full.',
}

type Step = 'form' | 'review' | 'working'

function errorText(error: unknown): string {
  if (error instanceof OriginationRefusal) return `${error.code}: ${error.message}`
  if (isUserRejection(error)) return 'Declined in the wallet. Nothing was sent.'
  return friendlyConnectError(error) || messageOf(error)
}

function Origination({ scnUrl }: { scnUrl: string }) {
  const { address } = useAccount()
  const chainId = useChainId()
  const deps = useOriginationDeps(scnUrl)
  const setLastStid = useUiStore((s) => s.setLastStid)

  const [form, setForm] = useState<FormState>(EMPTY)
  const [step, setStep] = useState<Step>('form')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [current, setCurrent] = useState<OriginationRecord | null>(null)
  const [records, setRecords] = useState<OriginationRecord[]>(() => localOriginationStore().list())

  const mode = keyBindingMode(env.VITE_KEY_BINDING_MODE, chainId)
  const anchors = parseKeyAnchors(env.VITE_KEY_ANCHORS)
  const refresh = useCallback(() => setRecords(localOriginationStore().list()), [])
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const { data: balance } = useReadContract({
    ...contracts.usdc,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  })

  // §2.4c.3 steps 1–6, live, so the operator sees a refusal before any prompt.
  const preview = useMemo((): { quote?: AcceptedQuote; errors: string[] } => {
    const errors: string[] = []
    let escrowAmount = 0n
    try {
      escrowAmount = form.amount ? parseUnits(form.amount, escrowAsset.decimals) : 0n
    } catch {
      errors.push('Amount is not a valid number.')
    }
    if (escrowAmount <= 0n) errors.push('Amount must be greater than zero.')
    if (!form.ssid.trim()) errors.push("User C's SSID is required.")
    if (!/^\+[1-9][0-9]+$/.test(form.userCMomoEndpoint.trim()))
      errors.push("User C's number must be canonical E.164: '+', then digits only.")
    if (!form.quoteRecordText.trim()) {
      errors.push('Load the Authorised Quote Record.')
      return { errors }
    }
    try {
      const quote = acceptQuote({
        record: parseQuoteRecord(form.quoteRecordText),
        escrowAmount: escrowAmount > 0n ? escrowAmount : 1n,
        escrow: {
          chainId,
          tokenAddress: contracts.usdc.address,
          tokenSymbol: escrowAsset.symbol,
          tokenDecimals: escrowAsset.decimals,
        },
        now: BigInt(Math.floor(Date.now() / 1000)),
      })
      if (balance !== undefined && balance < quote.escrowAmount) {
        errors.push(`Insufficient ${escrowAsset.symbol} balance for this escrow.`)
      }
      return { quote, errors }
    } catch (cause) {
      errors.push(errorText(cause))
      return { errors }
    }
  }, [form, chainId, balance])

  async function run(label: string, action: () => Promise<OriginationRecord>) {
    setError('')
    setStatus(label)
    setStep('working')
    try {
      const record = await action()
      setCurrent(record)
      if (record.stid) setLastStid(record.stid)
      setStep('review')
      return record
    } catch (cause) {
      setError(errorText(cause))
      setStep('review')
      return undefined
    } finally {
      setStatus('')
      refresh()
    }
  }

  async function onPrepare() {
    if (!deps || !preview.quote) return
    const prepared = await run(
      'Verifying both operators’ keys, then sign the Consumer Context in your wallet…',
      () =>
        prepareOrigination(
          {
            quoteRecordText: form.quoteRecordText,
            ssid: form.ssid,
            userCMomoEndpoint: form.userCMomoEndpoint,
            escrowAmount: preview.quote!.escrowAmount,
            executionInstructions: form.executionInstructions,
          },
          deps,
        ),
    )
    if (prepared) await onCommit(prepared)
  }

  async function onCommit(record: OriginationRecord) {
    if (!deps) return
    const committed = await run('Approve (if needed) and commit in your wallet…', () =>
      commitOrigination(record, deps),
    )
    if (committed?.phase === 'COMMITTED') await onDeliver(committed)
  }

  async function onDeliver(record: OriginationRecord) {
    if (!deps) return
    await run(
      'Delivering the preimage, the payout material and the Introduction through SCN…',
      () => deliverOrigination(record, deps),
    )
  }

  async function onResume(record: OriginationRecord) {
    if (!deps) return
    if (record.phase === 'PREPARED') return onCommit(record)
    await run('Resuming…', () => resumeOrigination(record, deps))
  }

  async function onRelease(record: OriginationRecord) {
    if (!deps) return
    await run('Checking the chain for this commit…', () => releaseCommitRequest(record, deps))
  }

  async function onLoadFile(file: File | undefined) {
    if (!file) return
    set('quoteRecordText', await file.text())
  }

  const open = records.filter(
    (record) =>
      isOpenPhase(record.phase) && record.originator.toLowerCase() === address?.toLowerCase(),
  )

  if (current?.phase === 'DELIVERED') {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="text-xl font-semibold text-emerald-700">
          Transaction originated and delivered
        </h1>
        <RecordSummary record={current} />
        <div className="mt-4 flex gap-2">
          <Link
            to="/monitor"
            className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Open in Transaction Monitor
          </Link>
          <button
            onClick={() => {
              setForm(EMPTY)
              setAccepted(false)
              setCurrent(null)
              setStep('form')
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
        CMM. Lock {escrowAsset.symbol} escrow on{' '}
        <span className="font-mono">{shortAddress(contracts.settlement.address)}</span> for the
        Bridge and Relay the quote record selects.
      </p>
      <ModeBanner
        mode={mode}
        anchors={'invalid' in anchors ? 'unreadable' : String(anchors.anchors.length)}
      />

      {open.length > 0 && (
        <OpenOriginations
          records={open}
          busy={step === 'working'}
          onResume={onResume}
          onRelease={onRelease}
        />
      )}

      {current && <RecordSummary record={current} />}

      <fieldset disabled={step !== 'form'} className="mt-6 space-y-4">
        <label className="block">
          <Label>Authorised Quote Record (from the pilot selection script)</Label>
          <textarea
            value={form.quoteRecordText}
            onChange={(e) => set('quoteRecordText', e.target.value)}
            rows={5}
            placeholder='{"format":"sawaswap.authorised-quote-record.v1", …}'
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs focus:border-sky-500 focus:outline-none"
          />
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => void onLoadFile(e.target.files?.[0])}
            className="mt-1 text-xs"
          />
        </label>
        <TextInput
          label={`Amount (${escrowAsset.symbol})`}
          value={form.amount}
          onChange={(v) => set('amount', v)}
          placeholder="2.2"
          mono
        />
        <TextInput
          label="User C SSID"
          value={form.ssid}
          onChange={(v) => set('ssid', v)}
          placeholder="m4-…"
          mono
        />
        <TextInput
          label="User C mobile-money number (canonical E.164)"
          value={form.userCMomoEndpoint}
          onChange={(v) => set('userCMomoEndpoint', v)}
          placeholder="+243…"
          mono
        />
        <TextInput
          label="Execution instructions for Agent B (optional)"
          value={form.executionInstructions}
          onChange={(v) => set('executionInstructions', v)}
        />
      </fieldset>

      {step === 'form' && (
        <div className="mt-6">
          {preview.errors.length > 0 && (
            <ul className="mb-3 list-disc space-y-0.5 pl-5 text-xs text-amber-700">
              {preview.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <button
            onClick={() => {
              setAccepted(false)
              setStep('review')
            }}
            disabled={preview.errors.length > 0 || open.some((r) => r.ssid === form.ssid.trim())}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Review quote
          </button>
        </div>
      )}

      {step === 'review' && preview.quote && !current && (
        <QuoteReview
          quote={preview.quote}
          accepted={accepted}
          setAccepted={setAccepted}
          onBack={() => setStep('form')}
          onAccept={() => void onPrepare()}
          ready={Boolean(deps)}
        />
      )}

      {step === 'working' && (
        <div className="mt-6 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          {status}
        </div>
      )}
      {error && <p className="mt-3 whitespace-pre-wrap text-xs text-red-600">{error}</p>}
      {current && current.phase !== 'ABANDONED' && step === 'review' && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void onResume(current)}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  )
}

/** §2.4c.3 steps 7–8: what User A accepts, before any wallet prompt. */
function QuoteReview(props: {
  quote: AcceptedQuote
  accepted: boolean
  setAccepted: (v: boolean) => void
  onBack: () => void
  onAccept: () => void
  ready: boolean
}) {
  const { quote } = props
  const q = quote.record.quote
  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Quote — accept before commitment</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <Field label="You escrow">
          {formatAmount(quote.escrowAmount, escrowAsset.decimals, escrowAsset.symbol)}
        </Field>
        <Field label="User C receives">
          <strong>
            {formatAmount(quote.momoAmount, q.outputDecimals, quote.corridor.currency)}
          </strong>
        </Field>
        <Field label="Sender-side charges">
          {q.inputFee === 0n
            ? 'none'
            : formatAmount(q.inputFee, q.inputDecimals, escrowAsset.symbol)}
        </Field>
        <Field label="Corridor">
          {quote.corridor.countryCode} · {quote.corridor.mno} · {quote.corridor.currency}
        </Field>
        <Field label="Bridge (beneficiary)">
          <Mono>{quote.record.bridge.address}</Mono>
        </Field>
        <Field label="Relay (eligibleClaimant)">
          <Mono>{quote.record.relay.address}</Mono>
        </Field>
        <Field label="Quote valid until">{formatTimestamp(q.expiresAt)}</Field>
        <Field label="quoteId">
          <span className="break-all font-mono text-xs text-slate-500">{quote.record.quoteId}</span>
        </Field>
      </dl>
      <label className="mt-4 flex items-start gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={props.accepted}
          onChange={(e) => props.setAccepted(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          User A accepts this quote. The amounts, the Bridge and the Relay are fixed at commitment
          and cannot be changed afterwards.
        </span>
      </label>
      <p className="mt-3 text-xs text-slate-500">
        Your wallet asks twice: once to sign the Consumer Context for User C, then to approve and
        commit the escrow.
      </p>
      <div className="mt-4 flex gap-2">
        <button
          onClick={props.onBack}
          className="rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Back
        </button>
        <button
          onClick={props.onAccept}
          disabled={!props.accepted || !props.ready}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Accept, sign and commit
        </button>
      </div>
    </div>
  )
}

function ModeBanner({ mode, anchors }: { mode: string; anchors: string }) {
  const synthetic = mode === 'SYNTHETIC'
  return (
    <div
      className={`mt-3 rounded border px-3 py-2 text-xs ${
        synthetic
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : 'border-slate-200 bg-slate-50 text-slate-600'
      }`}
    >
      Key-binding mode: <strong>{mode}</strong>
      {synthetic
        ? ' — the anchor gate is off (Base Sepolia test mode). Checks 1–8 still apply.'
        : ` — checks 1–8 and the anchor gate. Anchors configured: ${anchors}.`}
    </div>
  )
}

function OpenOriginations(props: {
  records: OriginationRecord[]
  busy: boolean
  onResume: (record: OriginationRecord) => void
  onRelease: (record: OriginationRecord) => void
}) {
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <h2 className="font-semibold">Unfinished originations in this browser</h2>
      <ul className="mt-2 space-y-2">
        {props.records.map((record) => (
          <li key={record.id} className="flex items-center justify-between gap-2">
            <span>
              {record.phase} · {record.ssid} ·{' '}
              {record.stid ? shortAddress(record.stid, 10, 6) : record.stcn}
            </span>
            <span className="flex gap-1">
              <button
                disabled={props.busy}
                onClick={() => props.onResume(record)}
                className="rounded bg-amber-600 px-2 py-1 text-white disabled:opacity-50"
              >
                {record.phase === 'PREPARED' ? 'Commit' : 'Resume'}
              </button>
              {record.phase === 'COMMIT_REQUESTED' && record.commit?.txHash === undefined && (
                <button
                  disabled={props.busy}
                  onClick={() => props.onRelease(record)}
                  title="Only when the wallet's activity shows no commit was sent"
                  className="rounded border border-amber-600 px-2 py-1 disabled:opacity-50"
                >
                  Release
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RecordSummary({ record }: { record: OriginationRecord }) {
  return (
    <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <Field label="Phase">{record.phase}</Field>
      {record.stid && (
        <Field label="STID">
          <span className="break-all font-mono text-xs">{record.stid}</span>
        </Field>
      )}
      <Field label="STCN">
        <span className="font-mono">{record.stcn}</span>
      </Field>
      <Field label="Escrow">
        {formatAmount(BigInt(record.escrowAmount), escrowAsset.decimals, escrowAsset.symbol)}
      </Field>
      <Field label="Key-binding mode">{record.mode}</Field>
      {record.commit?.txHash && (
        <Field label="commitPoI">
          <a
            className="text-sky-700 underline"
            href={explorerTx(record.commit.txHash)}
            target="_blank"
            rel="noreferrer"
          >
            View on explorer
          </a>
        </Field>
      )}
      <Field label="Delivered">
        preimage {record.posted.preimage ?? '—'} · payout {record.posted.payout ?? '—'} ·
        introduction {record.posted.introduction ?? '—'}
      </Field>
      <details className="text-xs text-slate-500">
        <summary>Origination log</summary>
        <ul className="mt-1 space-y-0.5">
          {record.log.map((entry) => (
            <li key={`${entry.at}-${entry.event}`}>
              {new Date(entry.at).toISOString()} — {entry.event}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

function Notice({ tone, title, children }: { tone: 'amber'; title: string; children: ReactNode }) {
  void tone
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      <h1 className="text-base font-semibold">{title}</h1>
      <p className="mt-1">{children}</p>
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <span className="text-xs font-medium text-slate-600">{children}</span>
}

function TextInput(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <label className="block">
      <Label>{props.label}</Label>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className={`mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none ${props.mono ? 'font-mono' : ''}`}
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
