import type { PropsWithChildren } from 'react'
import { Navigate } from 'react-router-dom'
import { useAccount } from 'wagmi'

/**
 * Route gate (Agreement C.2 / Screen 0): no screen beyond Connect is reachable
 * until a wallet is connected. Network correctness is enforced separately by
 * the blocking overlay, which covers every screen.
 */
export function RequireConnection({ children }: PropsWithChildren) {
  const { isConnected } = useAccount()
  if (!isConnected) return <Navigate to="/" replace />
  return <>{children}</>
}
