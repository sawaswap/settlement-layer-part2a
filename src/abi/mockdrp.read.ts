// Read-only subset of mockDrpAbi (src/abi/mockdrp.ts) — the two view getters the
// always-loaded Screen 3 status hook (useMockDrpStatus) reads: `preset` and
// `called`. Held as an INDEPENDENT literal (not derived from mockDrpAbi) on
// purpose: the shared `contracts.mockDrp` handle references only this subset, so
// the full ABI — which carries the harness-only `setOutcome` write entry — is
// imported solely by DrpHarnessControl and tree-shakes out of a
// `VITE_ENABLE_DRP_HARNESS=false` build. Keep the two signatures below in sync
// with mockdrp.ts whenever the ABI is regenerated from the verified contract.
export const mockDrpReadAbi = [
  {
    "type": "function",
    "name": "called",
    "inputs": [{ "name": "stid", "type": "bytes32", "internalType": "bytes32" }],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "preset",
    "inputs": [{ "name": "stid", "type": "bytes32", "internalType": "bytes32" }],
    "outputs": [{ "name": "", "type": "uint8", "internalType": "enum IDRP.Outcome" }],
    "stateMutability": "view"
  }
] as const;
