import type { ReactNode } from 'react'
import type { Address } from 'viem'
import type { TransactionData } from '@/hooks/useTransaction'
import type { WindowInfo } from '@/lib/windows'
import { SettlementState, Direction, directionLabel } from '@/lib/state'
import { deriveAgentB } from '@/lib/slots'
import { escrowAsset } from '@/config/contracts'
import { explorerAddress } from '@/config/chain'
import { env } from '@/config/env'
import { formatAmount, formatCountdown, formatTimestamp, shortAddress } from '@/lib/format'
import { StateBadge } from './StateBadge'

export type ViewMode = 'institution' | 'observer'

/**
 * Read-only detail view for one transaction (Agreement C.2 Screen 2). On-chain
 * fields render for all viewers; participant/corridor fields come from the
 * encrypted momoLegHash preimage and are gated by viewing mode — pending the
 * CID-discovery + decryption design item (IA §12.3.3 Block C storageLocation +
 * §12.4.1–§12.4.3 three-key encryption model), so they show as such rather than
 * being faked.
 */
export function TransactionDetails({
  txn,
  porSubmitted,
  window,
  mode,
}: {
  txn: TransactionData
  porSubmitted: boolean
  window: WindowInfo
  mode: ViewMode
}) {
  const state = Number(txn.state) as SettlementState
  const direction = Number(txn.direction) as Direction
  const agentB = deriveAgentB(direction, txn.originator, txn.beneficiary)

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">On-chain state</h2>
        <dl className="space-y-2 text-sm">
          <Row label="STID">
            <Mono>{txn.stid}</Mono>
          </Row>
          <Row label="State">
            <StateBadge state={state} />
          </Row>
          <Row label="Active window">
            {window.label ? (
              <span>
                {window.label} ·{' '}
                {window.expired ? (
                  <span className="text-amber-700">expired</span>
                ) : (
                  <span className="tabular-nums">{formatCountdown(window.remaining)} remaining</span>
                )}
              </span>
            ) : (
              <span className="text-slate-400">— (terminal)</span>
            )}
          </Row>
          <Row label="Direction">{directionLabel[direction]}</Row>
          <Row label="Escrow">
            {formatAmount(txn.escrowAmount, escrowAsset.decimals, escrowAsset.symbol)}
          </Row>
          <Row label="Escrow asset">
            <AddrLink address={escrowAsset.address} suffix={` (${escrowAsset.symbol})`} />
          </Row>
          <Row label="Network">{env.VITE_CHAIN_NAME}</Row>
          <Row label="PoR submitted">{porSubmitted ? 'Yes' : 'No'}</Row>
          <Row label="Off-chain rail settled by Agent B">
            {porSubmitted ? 'Yes (attested on-chain by PoR)' : 'No'}
          </Row>
          <Row label="DRP invoked">{txn.drpInvoked ? 'Yes' : 'No'}</Row>
          <Row label="Committed at">{formatTimestamp(txn.committedAt)}</Row>
        </dl>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Parties</h2>
        <dl className="space-y-2 text-sm">
          <Row label="Originator">
            <AddrLink address={txn.originator} />
          </Row>
          <Row label="Beneficiary">
            <AddrLink address={txn.beneficiary} />
          </Row>
          <Row label="eligibleClaimant (immutable)">
            <span className="rounded bg-amber-50 px-1.5 py-0.5 ring-1 ring-amber-200">
              <AddrLink address={txn.eligibleClaimant} />
            </span>
          </Row>
          <Row label="Agent B">
            <AddrLink address={agentB} />
          </Row>
        </dl>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">
          Corridor &amp; participant (off-chain preimage)
        </h2>
        <p className="mb-3 text-xs text-slate-400">
          {mode === 'institution'
            ? 'You are a party to this transaction. Participant details are pending the preimage retrieval design item (CID discovery + decryption, IA §12.3.3 + §12.4.1–§12.4.3).'
            : 'Encrypted — visible only to the transaction parties. Observers see corridor, amounts, STID and on-chain state.'}
        </p>
        <dl className="space-y-2 text-sm text-slate-400">
          <Row label="Mobile money operator">— (pending preimage retrieval)</Row>
          <Row label="Corridor">— (pending preimage retrieval)</Row>
          {mode === 'institution' && (
            <Row label="User C mobile-money number">— (pending preimage retrieval)</Row>
          )}
        </dl>
      </section>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="break-all font-mono text-xs">{children}</span>
}

function AddrLink({ address, suffix }: { address: Address; suffix?: string }) {
  return (
    <a
      href={explorerAddress(address)}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-sky-700 underline"
      title={address}
    >
      {shortAddress(address, 8, 6)}
      {suffix}
    </a>
  )
}
