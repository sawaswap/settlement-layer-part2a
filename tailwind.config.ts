import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // SawaSwap state-machine palette — one source of truth for state badges.
        state: {
          pending: '#64748b', // slate — PoICommitted / escrow locked
          active: '#0ea5e9', // sky — ExecutionOpen / TW1
          escalated: '#f59e0b', // amber — EscalationL1/L2 / TW2-TW3
          settled: '#16a34a', // green — terminal Settled
          reversed: '#dc2626', // red — terminal Reversed
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
