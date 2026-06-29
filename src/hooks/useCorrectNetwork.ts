import { useAccount } from 'wagmi'
import { appChain } from '@/config/chain'

/**
 * Network verification (Agreement C.2 / Screen 0): the Console targets exactly
 * one chain (appChain, from env). A mismatch must block all interaction.
 */
export function useCorrectNetwork() {
  const { chainId, isConnected } = useAccount()
  return {
    isConnected,
    currentChainId: chainId,
    expectedChainId: appChain.id,
    isCorrectNetwork: isConnected && chainId === appChain.id,
  }
}
