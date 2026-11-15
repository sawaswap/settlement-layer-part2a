import { useAccount, useReadContract } from 'wagmi'
import { contracts } from '@/config/contracts'

/**
 * `keccak256("SAWASWAP_CONSOLE_ORIGINATOR")` — Spec §1.3 Option A, CR-CONSOLE-1.
 * Held as its value rather than recomputed, and pinned by a test, so a typo in
 * the role name cannot silently gate the screen on a role nobody holds. On the
 * deployed Settlement Contract the role is inert: no function checks it, its
 * admin is `DEFAULT_ADMIN_ROLE`, and the admin grants it with `grantRole`.
 */
export const CONSOLE_ORIGINATOR_ROLE =
  '0x92fef97c968f206ab0606b03edb5b431abe7259117c17ffd9d54f79bd4407b70' as const

/**
 * CR-CONSOLE-1: the Initiate screen opens for a wallet holding `ADMIN_ROLE` or
 * the Console originator role, and stays closed for any other address.
 */
export function canOriginate(roles: { isAdmin: boolean; isOriginator: boolean }): boolean {
  return roles.isAdmin || roles.isOriginator
}

export function useOriginatorRole() {
  const { address } = useAccount()

  const { data: adminRole } = useReadContract({
    ...contracts.settlement,
    functionName: 'ADMIN_ROLE',
  })
  const admin = useReadContract({
    ...contracts.settlement,
    functionName: 'hasRole',
    args: adminRole && address ? [adminRole, address] : undefined,
    query: { enabled: Boolean(adminRole && address) },
  })
  const originator = useReadContract({
    ...contracts.settlement,
    functionName: 'hasRole',
    args: address ? [CONSOLE_ORIGINATOR_ROLE, address] : undefined,
    query: { enabled: Boolean(address) },
  })

  const isAdmin = admin.data === true
  const isOriginator = originator.data === true
  return {
    isAdmin,
    isOriginator,
    allowed: canOriginate({ isAdmin, isOriginator }),
    isLoading: admin.isLoading || originator.isLoading,
  }
}
