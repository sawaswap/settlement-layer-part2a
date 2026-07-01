import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useSwitchChain } from 'wagmi'
import { ConnectWallets } from '@/components/wallet/ConnectWallets'
import { useCorrectNetwork } from '@/hooks/useCorrectNetwork'
import { useAdminRole } from '@/hooks/useAdminRole'
import { shortAddress } from '@/lib/format'
import { appChain } from '@/config/chain'

/**
 * Screen 0 — Wallet Connection and Network Verification (Agreement C.2).
 * The entry point. No other screen is reachable until a wallet is connected
 * and the network is confirmed (route gating + a blocking overlay enforce this).
 */
export function Screen0Connect() {
  const { isConnected, address } = useAccount()
  const { isCorrectNetwork } = useCorrectNetwork()
  const { isAdmin, isLoading: roleLoading } = useAdminRole()
  const { switchChain, isPending: switching } = useSwitchChain()

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold">Connect wallet</h1>
      <p className="mt-1 text-sm text-slate-500">
        Connect a wallet and confirm the {appChain.name} network to use the Operator Console.
      </p>

      {!isConnected ? (
        <ConnectWallets />
      ) : (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <dl className="space-y-2 text-sm">
            <Row label="Address">
              <span className="font-mono">{shortAddress(address, 10, 8)}</span>
            </Row>
            <Row label="Network">
              {isCorrectNetwork ? (
                <span className="text-emerald-700">{appChain.name} ✓</span>
              ) : (
                <button
                  onClick={() => switchChain({ chainId: appChain.id })}
                  disabled={switching}
                  className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {switching ? 'Switching…' : `Switch to ${appChain.name}`}
                </button>
              )}
            </Row>
            <Row label="Role">
              {roleLoading ? (
                <span className="text-slate-400">Checking…</span>
              ) : (
                <span>{isAdmin ? 'Admin (global)' : 'Non-admin'}</span>
              )}
            </Row>
          </dl>

          {isCorrectNetwork && (
            <div className="mt-4 flex gap-2">
              <Link
                to="/monitor"
                className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                Open Transaction Monitor
              </Link>
              {isAdmin && (
                <Link
                  to="/initiate"
                  className="rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Initiate Transaction
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
