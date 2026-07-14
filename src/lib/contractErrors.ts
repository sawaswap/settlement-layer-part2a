import { BaseError, ContractFunctionRevertedError } from 'viem'
import { friendlyConnectError } from './walletErrors'

/**
 * Decode a Settlement revert into a short, human-readable message.
 *
 * `walletErrors.friendlyConnectError` handles wallet/connection-layer failures
 * (user rejection, wrong network, no connector). This adds the on-chain layer:
 * the Settlement custom errors (Screen 3's dispute actions surface most of them)
 * and string reverts from the MockDRP. Falls back to the wallet decoder, so a
 * single call site covers both layers.
 */
const ERROR_MESSAGES: Record<string, string> = {
  NotEligibleClaimant: 'Only the eligibleClaimant wallet can perform this action.',
  WindowExpired: 'The window for this action has already expired.',
  EscalationNotDue: 'Not due yet — the window has not elapsed.',
  ClaimAlreadyExists: 'A claim has already been submitted for this transaction.',
  NoClaim: 'No claim is on record for this transaction.',
  NoClaimToUpdate: 'There is no claim to update yet.',
  ClaimPending: 'A claim is pending — this transaction resolves through the DRP, not a default-reverse.',
  DRPAlreadyInvoked: 'The DRP has already been invoked for this transaction.',
  InvalidState: 'The transaction is not in the required state for this action.',
  InvalidClaimData: 'Claim data must not be empty.',
  InvalidPoRData: 'PoR data must not be empty.',
  NotPoRSubmitter: 'Only the eligibleClaimant wallet can submit the PoR.',
  TransactionNotFound: 'No transaction was found for this STID.',
  AlreadyFinalized: 'This transaction has already reached a terminal state.',
  DuplicateSTID: 'A transaction with this identifier already exists.',
  ZeroAmount: 'The escrow amount must be greater than zero.',
  NotImplementedM1: 'This function is not available on the deployed contract.',
}

const KNOWN_NAMES = Object.keys(ERROR_MESSAGES)

/** Pull a custom-error name from a viem error tree or a plain error-ish object. */
function extractRevertName(error: unknown): string | undefined {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName) {
      return revert.data.errorName
    }
  }
  // Plain-object / test shapes and message-scan fallback.
  const e = error as { name?: string; data?: { errorName?: string }; message?: string }
  if (e?.data?.errorName) return e.data.errorName
  const haystack = e?.message ?? ''
  return KNOWN_NAMES.find((n) => haystack.includes(n))
}

/** Pull a string-revert reason (e.g. MockDRP's require messages). */
function extractRevertReason(error: unknown): string | undefined {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError && revert.reason) return revert.reason
  }
  const e = error as { reason?: string }
  return e?.reason
}

export function friendlyContractError(error: unknown): string {
  if (!error) return ''

  const name = extractRevertName(error)
  if (name && ERROR_MESSAGES[name]) return ERROR_MESSAGES[name]

  const reason = extractRevertReason(error)
  if (reason) {
    if (reason.includes('already-resolved')) return 'The DRP has already resolved this transaction.'
    if (reason.includes('configured-revert')) return 'The DRP call reverted (test-harness configuration).'
    return reason
  }

  return friendlyConnectError(error)
}
