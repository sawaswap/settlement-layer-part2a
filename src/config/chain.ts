import { defineChain } from 'viem'
import { env } from './env'

/**
 * The single chain the Console targets, built entirely from env. Nothing in the
 * component tree hardcodes a chain ID, RPC, or explorer — porting to Celo, BNB
 * Chain, or Stellar (where EVM-compatible) is an env change. See FIS f.
 */
export const appChain = defineChain({
  id: env.VITE_CHAIN_ID,
  name: env.VITE_CHAIN_NAME,
  nativeCurrency: {
    name: env.VITE_NATIVE_SYMBOL,
    symbol: env.VITE_NATIVE_SYMBOL,
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [env.VITE_RPC_URL] },
  },
  blockExplorers: {
    default: { name: env.VITE_EXPLORER_NAME, url: env.VITE_EXPLORER_URL },
  },
  testnet: true,
})

/** Build an explorer URL for a tx hash or address. */
export const explorerTx = (hash: string) => `${env.VITE_EXPLORER_URL}/tx/${hash}`
export const explorerAddress = (addr: string) => `${env.VITE_EXPLORER_URL}/address/${addr}`
