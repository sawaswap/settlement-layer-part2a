import { useMemo } from 'react'
import { useConnect } from 'wagmi'
import type { Connector } from 'wagmi'
import { friendlyConnectError } from '@/lib/walletErrors'

/**
 * Wallet picker (Agreement C.2 Screen 0). Lists every available connector —
 * EIP-6963-discovered extensions (MetaMask, Phantom, …), Coinbase/Base Wallet,
 * and WalletConnect when configured — as named, icon-bearing buttons.
 *
 * The three contractually-named wallets are surfaced first; install hints are
 * shown for any that aren't detected. Adding a featured wallet is a one-line
 * edit to FEATURED below — no architectural change (C.5.c).
 */
const FEATURED: { match: string; label: string; href: string }[] = [
  { match: 'metamask', label: 'MetaMask', href: 'https://metamask.io/download/' },
  { match: 'phantom', label: 'Phantom', href: 'https://phantom.app/download' },
  { match: 'coinbase', label: 'Base Wallet', href: 'https://www.coinbase.com/wallet/downloads' },
]

function featuredRank(name: string): number {
  const n = name.toLowerCase()
  if (n.includes('walletconnect')) return 100 // always last
  const idx = FEATURED.findIndex((f) => n.includes(f.match))
  return idx === -1 ? 50 : idx
}

export function ConnectWallets() {
  const { connectors, connect, isPending, variables, error } = useConnect()

  const ordered = useMemo(() => {
    // Dedupe by display name (an installed Coinbase extension can appear both
    // via 6963 discovery and via the explicit SDK connector).
    const seen = new Set<string>()
    const unique = connectors.filter((c) => {
      const key = c.name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return unique.sort((a, b) => featuredRank(a.name) - featuredRank(b.name))
  }, [connectors])

  const detectedNames = ordered.map((c) => c.name.toLowerCase())
  const missingFeatured = FEATURED.filter((f) => !detectedNames.some((n) => n.includes(f.match)))

  return (
    <div className="mt-6 space-y-2">
      {ordered.map((connector) => {
        const pending = isPending && variables?.connector === connector
        return (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            disabled={isPending}
            className="flex w-full items-center gap-3 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            <WalletIcon connector={connector} />
            <span>{connector.name}</span>
            <span className="ml-auto text-slate-400">{pending ? 'Connecting…' : 'Connect →'}</span>
          </button>
        )
      })}

      {error && <p className="text-xs text-red-600">{friendlyConnectError(error)}</p>}

      {missingFeatured.length > 0 && (
        <p className="pt-1 text-xs text-slate-400">
          Don&apos;t see your wallet? Install{' '}
          {missingFeatured.map((f, i) => (
            <span key={f.match}>
              <a
                href={f.href}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-slate-600"
              >
                {f.label}
              </a>
              {i < missingFeatured.length - 1 ? ', ' : ''}
            </span>
          ))}
          .
        </p>
      )}
    </div>
  )
}

function WalletIcon({ connector }: { connector: Connector }) {
  if (connector.icon) {
    return <img src={connector.icon} alt="" aria-hidden className="h-6 w-6 rounded" />
  }
  return (
    <span
      aria-hidden
      className="grid h-6 w-6 place-items-center rounded bg-slate-200 text-xs font-semibold text-slate-600"
    >
      {connector.name.charAt(0)}
    </span>
  )
}
