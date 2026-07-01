import { ScreenPlaceholder } from './ScreenPlaceholder'

/** Screen 3 — Dispute and Escalation. Built in W2.1 (M2). */
export function Screen3Dispute() {
  return (
    <ScreenPlaceholder
      title="Dispute and Escalation"
      subtitle="Accessible once the queried STID has entered TW2 (M2 — W2.1)."
    >
      <ul className="list-disc space-y-1 pl-5">
        <li>TW2 time remaining, escalation timeline from TW1 expiry</li>
        <li>Submit Claim (TW2 only, eligibleClaimant only); expireTW2 / expireTW3 pokers</li>
        <li>MockDRP resolution status; dispute timeline with Basescan links</li>
      </ul>
    </ScreenPlaceholder>
  )
}
