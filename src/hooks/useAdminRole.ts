import { useAccount, useReadContract } from 'wagmi'
import { contracts } from '@/config/contracts'

/**
 * Admin role detection (Agreement C.2): Admin is detected GLOBALLY via the
 * Settlement Contract's role registry and does not change across transactions.
 * Reads ADMIN_ROLE(), then hasRole(role, account).
 */
export function useAdminRole() {
  const { address } = useAccount()

  const { data: adminRole } = useReadContract({
    ...contracts.settlement,
    functionName: 'ADMIN_ROLE',
  })

  const { data: isAdmin, isLoading } = useReadContract({
    ...contracts.settlement,
    functionName: 'hasRole',
    args: adminRole && address ? [adminRole, address] : undefined,
    query: { enabled: Boolean(adminRole && address) },
  })

  return { isAdmin: Boolean(isAdmin), isLoading }
}
