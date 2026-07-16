/**
 * Consistent, unmistakable signal that an identifying off-chain field is not yet
 * available (2026-07-10 clarification, point d). These fields live in the
 * encrypted Block C of the momoLegHash preimage and await the CID-retrieval +
 * decryption design item; until then the Console renders THIS placeholder rather
 * than a blank or a stand-in value, so a genuine decrypted field can never be
 * confused with a not-yet-available one. Shared across the by-STID screens so the
 * treatment reads identically wherever a preimage field would appear.
 */
export function PendingPreimage() {
  return (
    <span
      className="italic text-slate-400"
      title="Encrypted in the off-chain preimage — pending the CID-retrieval + decryption design item (IA §12.3.3 + §12.4.1–§12.4.3)"
    >
      not yet available — encrypted (pending preimage retrieval)
    </span>
  )
}
