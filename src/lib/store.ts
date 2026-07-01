import { create } from 'zustand'

/**
 * Light UI store for cross-screen carry-forward. Currently the most-recent
 * STID, so Screen 1 → Screen 2 hand-off (Agreement C.2 Screen 2 input:
 * "carry-forward from Screen 1") needs no URL plumbing. On-chain data is never
 * cached here — that flows through wagmi/TanStack Query.
 */
interface UiState {
  lastStid: `0x${string}` | null
  setLastStid: (stid: `0x${string}`) => void
}

export const useUiStore = create<UiState>((set) => ({
  lastStid: null,
  setLastStid: (stid) => set({ lastStid: stid }),
}))
