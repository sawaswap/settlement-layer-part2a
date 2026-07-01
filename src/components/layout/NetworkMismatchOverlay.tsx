import { useSwitchChain } from 'wagmi'
import { appChain } from '@/config/chain'
import { useCorrectNetwork } from '@/hooks/useCorrectNetwork'

/**
 * Blocking network-mismatch warning (Agreement C.2 / C.5): if the connected
 * wallet is on the wrong chain, a prominent warning blocks ALL interaction,
 * with a one-click prompt to switch. Renders nothing when on the right chain
 * or when no wallet is connected (Screen 0 handles the unconnected case).
 */
export function NetworkMismatchOverlay() {
  const { isConnected, isCorrectNetwork, isNetworkKnown, currentChainId } = useCorrectNetwork()
  const { switchChain, isPending, error } = useSwitchChain()

  // Block only once the wallet's chain is known and confirmed wrong — avoids a
  // flash while the first eth_chainId read resolves.
  if (!isConnected || !isNetworkKnown || isCorrectNetwork) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-red-700">Wrong network</h2>
        <p className="mt-2 text-sm text-slate-600">
          This wallet is connected to chain{' '}
          <span className="font-mono">{currentChainId ?? 'unknown'}</span>. The Operator Console
          requires <span className="font-medium">{appChain.name}</span> (chain {appChain.id}). All
          interaction is blocked until you switch.
        </p>
        <button
          onClick={() => switchChain({ chainId: appChain.id })}
          disabled={isPending}
          className="mt-4 w-full rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {isPending ? 'Switching…' : `Switch to ${appChain.name}`}
        </button>
        {error && (
          <p className="mt-2 text-xs text-red-600">
            Could not switch automatically: {error.message}. Switch the network manually in your
            wallet.
          </p>
        )}
      </div>
    </div>
  )
}
