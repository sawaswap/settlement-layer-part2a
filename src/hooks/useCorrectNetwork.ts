import { useAccount } from 'wagmi'
import { appChain } from '@/config/chain'
import { useWalletChainId } from './useWalletChainId'

/**
 * Network verification (Agreement C.2 / Screen 0): the Console targets exactly
 * one chain (appChain, from env). A mismatch must block all interaction.
 *
 * Detection reads the wallet's real chain via the provider (useWalletChainId)
 * and stays live on in-session network switches. `currentChainId` is undefined
 * until the first read resolves — callers should treat that as "not yet known"
 * rather than "wrong network" to avoid a flash on load.
 */
export function useCorrectNetwork() {
  const { isConnected } = useAccount()
  const currentChainId = useWalletChainId()
  return {
    isConnected,
    currentChainId,
    expectedChainId: appChain.id,
    isNetworkKnown: currentChainId !== undefined,
    isCorrectNetwork: isConnected && currentChainId === appChain.id,
  }
}
