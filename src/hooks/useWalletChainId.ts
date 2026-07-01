import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}

/**
 * The connected wallet's ACTUAL current chain id, read directly from the
 * EIP-1193 provider and kept live via the provider's `chainChanged` event.
 *
 * This is provider truth, independent of the wagmi config's configured-chain
 * tracking — so an in-session network switch in the wallet (e.g. to Ethereum
 * Mainnet) is detected immediately, and detection is correct again on reload.
 * Returns `undefined` until the first `eth_chainId` read resolves.
 */
export function useWalletChainId(): number | undefined {
  const { connector, isConnected } = useAccount()
  const [chainId, setChainId] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (!isConnected || !connector) {
      setChainId(undefined)
      return
    }

    let active = true
    let provider: Eip1193Provider | undefined

    const onChainChanged = (...args: unknown[]) => {
      const next = args[0]
      if (typeof next === 'string') setChainId(Number(next))
      else if (typeof next === 'number') setChainId(next)
    }

    async function subscribe() {
      try {
        provider = (await connector!.getProvider()) as Eip1193Provider
        const current = await provider.request({ method: 'eth_chainId' })
        if (active && (typeof current === 'string' || typeof current === 'number')) {
          setChainId(Number(current))
        }
        provider.on?.('chainChanged', onChainChanged)
      } catch {
        if (active) setChainId(undefined)
      }
    }

    void subscribe()

    return () => {
      active = false
      provider?.removeListener?.('chainChanged', onChainChanged)
    }
  }, [connector, isConnected])

  return chainId
}
