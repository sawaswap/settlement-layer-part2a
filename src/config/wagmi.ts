import { createConfig, http } from 'wagmi'
import type { CreateConnectorFn } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'
import { appChain } from './chain'
import { env } from './env'

/**
 * Wallet integration layer (Agreement C.5.c). Per C.5 the wallet set —
 * MetaMask, Phantom, Base Wallet — is integrated via the two sanctioned
 * mechanisms only:
 *   1. Direct browser-extension injection — EIP-6963 multi-injected discovery
 *      (below) auto-detects MetaMask, Phantom, and a Base/Coinbase extension
 *      if installed, each as a named, icon-bearing connector.
 *   2. WalletConnect — the path for the Base mobile app and other mobile
 *      wallets via a universal QR. Enabled when a projectId is configured
 *      (production projectId is the Client's, per E.2).
 *
 * No wallet-proprietary SDK connector is used: Base Wallet connects via
 * WalletConnect (mobile) or injection (extension), exactly as C.5 specifies.
 * Adding a wallet is a configuration change, not an architectural one.
 */
const connectors: CreateConnectorFn[] = env.VITE_WALLETCONNECT_PROJECT_ID
  ? [
      walletConnect({
        projectId: env.VITE_WALLETCONNECT_PROJECT_ID,
        showQrModal: true,
        metadata: {
          name: env.VITE_APP_NAME,
          description: 'SawaSwap Operator Console',
          // Match the actual serving origin so WalletConnect verification passes
          // on any deploy (staging preview or production) without a domain allowlist.
          url: typeof window !== 'undefined' ? window.location.origin : 'https://console.sawaswap.io',
          icons: ['https://sawaswap.io/favicon.ico'],
        },
      }),
    ]
  : []

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
