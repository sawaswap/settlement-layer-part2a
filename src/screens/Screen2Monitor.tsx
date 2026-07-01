import { ScreenPlaceholder } from './ScreenPlaceholder'

/**
 * Screen 2 — Transaction Monitor (primary verification instrument). Built in
 * W1.3. STID lookup → full transaction state, live TW countdown on
 * block.timestamp, Submit PoR (TW1 only), pokeTW1, transition history with
 * Basescan links, contract-event subscriptions for live updates.
 * Corridor metadata is fetched by CID pointer (preimage Block C), not by
 * momoLegHash (which is a keccak256 commitment).
 */
export function Screen2Monitor() {
  return (
    <ScreenPlaceholder
      title="Transaction Monitor"
      subtitle="Look up any transaction by STID and observe every terminal state — no CLI (W1.3)."
    >
      <ul className="list-disc space-y-1 pl-5">
        <li>STID lookup (paste / carry-forward from Screen 1)</li>
        <li>Contract state, eligibleClaimant, direction, escrow asset + amount, Agent B, PoR flag</li>
        <li>Active window TW1/TW2/TW3 with live countdown; full transition history</li>
        <li>Submit PoR (active only in TW1); pokeTW1</li>
      </ul>
    </ScreenPlaceholder>
  )
}
