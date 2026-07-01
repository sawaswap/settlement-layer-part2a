import { createConfig, http } from 'wagmi'
import type { CreateConnectorFn } from 'wagmi'
import { coinbaseWallet, walletConnect } from 'wagmi/connectors'
import { appChain } from './chain'
import { env } from './env'

/**
 * Wallet integration layer (Agreement C.5.c, FIS d). The integration is
 * extensible such that additional wallets are added by configuration, not by an
 * architectural change:
 *   - EIP-6963 multi-injected discovery (below) auto-detects MetaMask, Phantom,
 *     and any other browser-extension wallet that announces itself — each
 *     surfaces as a named, icon-bearing connector with no per-wallet code.
 *   - coinbaseWallet() → Base Wallet (Coinbase) via SDK, works with or without
 *     the extension installed.
 *   - walletConnect()  → added only when a projectId is configured (E.2:
 *     production projectId held by the Client).
 *
 * Screen 0 orders and presents these; adding a featured wallet is a list edit.
 */
const connectors: CreateConnectorFn[] = [
  coinbaseWallet({ appName: env.VITE_APP_NAME, preference: 'all' }),
  ...(env.VITE_WALLETCONNECT_PROJECT_ID
    ? [
        walletConnect({
          projectId: env.VITE_WALLETCONNECT_PROJECT_ID,
          showQrModal: true,
        }),
      ]
    : []),
]

export const wagmiConfig = createConfig({
  chains: [appChain],
  connectors,
  multiInjectedProviderDiscovery: true,
  transports: {
    [appChain.id]: http(env.VITE_RPC_URL),
  },
  ssr: false,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
