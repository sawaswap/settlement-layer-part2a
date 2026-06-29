/**
 * Map a wallet/connection error to a short, human-readable message. Wallet
 * SDKs throw a wide range of shapes; we surface intent, not stack noise.
 */
export function friendlyConnectError(error: unknown): string {
  if (!error) return ''
  const e = error as { name?: string; code?: number; message?: string; shortMessage?: string }

  // viem/wagmi UserRejectedRequestError, or EIP-1193 code 4001
  if (e.name === 'UserRejectedRequestError' || e.code === 4001) {
    return 'Connection request was rejected in the wallet.'
  }
  // Resource unavailable — a request is already pending in the wallet
  if (e.code === -32002) {
    return 'A connection request is already open — check your wallet extension.'
  }
  if (e.name === 'ConnectorNotFoundError') {
    return 'Wallet not detected. Install or unlock the extension and try again.'
  }
  if (e.name === 'ChainMismatchError') {
    return 'Wallet is on the wrong network — switch to the required chain.'
  }
  return e.shortMessage || e.message || 'Could not connect. Please try again.'
}
