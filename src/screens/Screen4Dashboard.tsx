import { ScreenPlaceholder } from './ScreenPlaceholder'

/** Screen 4 — Agent B Transaction Dashboard. Built in W2.2 (M2). */
export function Screen4Dashboard() {
  return (
    <ScreenPlaceholder
      title="Agent B Transaction Dashboard"
      subtitle="Operational monitoring view and AgentOS precursor surface (M2 — W2.2)."
    >
      <ul className="list-disc space-y-1 pl-5">
        <li>All transactions for the connected Agent B wallet; filter by state + time window</li>
        <li>Full monitoring fields per transaction; drill-down to Screen 2</li>
        <li>Chain-aware / asset-aware strictly via env</li>
      </ul>
    </ScreenPlaceholder>
  )
}
