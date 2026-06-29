import { NavLink } from 'react-router-dom'
import { useAccount, useDisconnect } from 'wagmi'
import { useAdminRole } from '@/hooks/useAdminRole'
import { useCorrectNetwork } from '@/hooks/useCorrectNetwork'
import { env } from '@/config/env'
import { appChain } from '@/config/chain'
import { shortAddress } from '@/lib/format'
import { Badge } from '@/components/ui/Badge'

/**
 * Persistent header (Agreement C.2) — present on every screen without
 * exception: logo + application name; connected wallet address; detected role;
 * active network with a mismatch indicator.
 *
 * Role note: Admin is shown here (global, role-registry). Agent B / User A /
 * Beneficiary are per-transaction and surface in transaction views, not here.
 * User C has no on-chain identity and is never shown here.
 */
const navItems = [
  { to: '/', label: 'Connect', end: true },
  { to: '/initiate', label: 'Initiate' },
  { to: '/monitor', label: 'Monitor' },
  { to: '/dispute', label: 'Dispute' },
  { to: '/dashboard', label: 'Dashboard' },
]

export function Header() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { isAdmin } = useAdminRole()
  const { isCorrectNetwork } = useCorrectNetwork()

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Logo placeholder — Client to supply SVG/PNG; integrated on receipt (C.2). */}
          <div
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded bg-sky-600 text-sm font-bold text-white"
          >
            S
          </div>
          <span className="text-sm font-semibold tracking-tight">{env.VITE_APP_NAME}</span>
        </div>

        <nav className="flex items-center gap-1 text-sm">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded px-2 py-1 ${isActive ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-500 hover:text-slate-800'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <Badge
            className={
              isCorrectNetwork
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-red-100 text-red-800'
            }
            title={`Expected chain ${appChain.id}`}
          >
            {appChain.name}
          </Badge>

          {isConnected ? (
            <>
              {isAdmin && <Badge className="bg-violet-100 text-violet-800">Admin</Badge>}
              <span className="font-mono text-xs text-slate-600">{shortAddress(address)}</span>
              <button
                onClick={() => disconnect()}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Disconnect
              </button>
            </>
          ) : (
            <span className="text-xs text-slate-400">Not connected</span>
          )}
        </div>
      </div>
    </header>
  )
}
