/**
 * Mirror of IDRP.Outcome (settlement-layer-part1 src/interfaces/IDRP.sol).
 * Enum ordering IS the ABI: Settled = 0 (the default preset), Reversed = 1.
 * The deployed MockDRP returns a per-STID preset from resolve(); Screen 3 reads
 * `preset` (the configured outcome) and `called` (whether resolve has fired).
 */
export enum DrpOutcome {
  Settled = 0,
  Reversed = 1,
}

export const drpOutcomeLabel: Record<DrpOutcome, string> = {
  [DrpOutcome.Settled]: 'Settled',
  [DrpOutcome.Reversed]: 'Reversed',
}
