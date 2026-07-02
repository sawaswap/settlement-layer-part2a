import { SettlementState, stateLabel } from '@/lib/state'

// Literal class strings (not interpolated) so Tailwind's content scanner keeps them.
const badgeClass: Record<SettlementState, string> = {
  [SettlementState.PoICommitted]: 'bg-state-active text-white',
  [SettlementState.ExecutionOpen]: 'bg-state-active text-white',
  [SettlementState.EscalationL1]: 'bg-state-escalated text-white',
  [SettlementState.EscalationL2_DRP]: 'bg-state-escalated text-white',
  [SettlementState.Settled]: 'bg-state-settled text-white',
  [SettlementState.Reversed]: 'bg-state-reversed text-white',
}

export function StateBadge({ state }: { state: SettlementState }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass[state]}`}
    >
      {stateLabel[state]}
    </span>
  )
}
