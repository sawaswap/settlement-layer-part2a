import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// A mock EIP-1193 provider whose `chainChanged` listener we can drive, exposed
// via vi.hoisted so the vi.mock factory can reference it.
const mocks = vi.hoisted(() => {
  const state: { listener?: (...args: unknown[]) => void } = {}
  const provider = {
    request: async ({ method }: { method: string }) =>
      method === 'eth_chainId' ? '0x1' : undefined,
    on: (event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'chainChanged') state.listener = cb
    },
    removeListener: () => {
      state.listener = undefined
    },
  }
  const connector = { getProvider: async () => provider }
  return { state, connector }
})

vi.mock('wagmi', () => ({
  useAccount: () => ({ isConnected: true, connector: mocks.connector }),
}))

import { useWalletChainId } from './useWalletChainId'

describe('useWalletChainId — reactive network detection', () => {
  it('reads eth_chainId at mount and reacts to chainChanged', async () => {
    const { result } = renderHook(() => useWalletChainId())

    // Initial read: wallet reports Ethereum Mainnet (0x1).
    await waitFor(() => expect(result.current).toBe(1))

    // In-session switch to Base Sepolia (0x14a34 = 84532).
    act(() => mocks.state.listener?.('0x14a34'))
    await waitFor(() => expect(result.current).toBe(84532))

    // Switch back to Mainnet — detection must react again.
    act(() => mocks.state.listener?.('0x1'))
    await waitFor(() => expect(result.current).toBe(1))
  })
})
