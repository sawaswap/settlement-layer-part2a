# SawaSwap Operator Console — Frontend Integration Specification (FIS)

**Document ID:** SWP-FIS-CONSOLE-0.2
**Status:** M2 — complete, all seven sections (a. Contract Interface, b. State Machine Mapping, c. Event Listening, d. Wallet Integration, e. Role & Permission Logic, f. Chain-Agnostic Adaptation Notes, g. Testing Patterns). Covers Screens 0–4.
**Target:** Part 1 deployment of record on Base Sepolia (Settlement + MockDRP), source-verified on Basescan.
**Deployed-contract note:** Screen 3's dispute surface is built to the **deployed** Settlement, which diverges from the amended C.2 wording on the DRP path (invokeDRP is atomic — `EscalationL2_DRP` never rests; `expireTW3` default-reverses on `EscalationL1`). §b documents the deployed behaviour.
**Scope:** This is a standalone document, separate from the codebase, per Agreement C.4. It is Client-owned IP and survives termination.

> The Operator Console is a no-backend single-page application: every value below
> is read from chain via RPC, or composed client-side and committed on-chain. No
> server mediates any of it (Agreement C.5.f).

---

## a. Contract Interface Reference

All ABIs are extracted verbatim from the verified Part 1 build artefacts (`src/abi/`). The Console calls two contracts: the **Settlement** contract and the escrow asset **USDC** (ERC-20).

### Build note — deployed surface vs canonical surface

The deployed Settlement hardcodes USDC and exposes a **five-field** `PoIInput`:

```
PoIInput { address beneficiary; address eligibleClaimant; uint8 direction; uint256 escrowAmount; bytes32 momoLegHash }
```

The canonical seven-field struct (adding `tokenAddress` + `momoCurrency`) is the **mainnet target** (ADR 86cad3qpk), **not** Part 2a's build target. Screen 1 composes against the deployed five-field surface; the corridor / operator / Agent B inputs fold into `momoLegHash` and the direction-dependent slot mapping (see §b and the slot table below).

### Settlement — functions used

| Function | Signature | Returns | Purpose / screen |
| --- | --- | --- | --- |
| `commitPoI` | `commitPoI((address beneficiary,address eligibleClaimant,uint8 direction,uint256 escrowAmount,bytes32 momoLegHash))` | `bytes32 stid` | Screen 1 — commit a PoI, lock escrow, mint the STID. |
| `submitPoR` | `submitPoR(bytes32 stid, bytes porData)` | — | Screen 2 — submit Proof of Receipt. Reverts unless state is `PoICommitted`, within TW1, and `msg.sender == eligibleClaimant`; non-empty `porData` required. Settles the transaction. |
| `pokeTW1` | `pokeTW1(bytes32 stid)` | — | Screen 2 — permissionless escalation once TW1 has elapsed; `PoICommitted → EscalationL1`. |
| `getTransaction` | `getTransaction(bytes32 stid)` | `Transaction` tuple | Screen 2 — full transaction record (see struct below). |
| `transactionExists` | `transactionExists(bytes32 stid)` | `bool` | Screen 2 — validate a looked-up STID before reading. |
| `getPoRHash` | `getPoRHash(bytes32 stid)` | `bytes32` | Screen 2 — `!= 0x0…0` ⇒ a PoR has been submitted. |
| `getClaimHash` | `getClaimHash(bytes32 stid)` | `bytes32` | Screen 3 — `!= 0x0…0` ⇒ a claim is on record. |
| `submitClaim` | `submitClaim(bytes32 stid, bytes claimData)` | — | Screen 3 — file a claim. Reverts unless state is `EscalationL1`, within TW2, `msg.sender == eligibleClaimant`, no existing claim; non-empty `claimData`. |
| `updateClaim` | `updateClaim(bytes32 stid, bytes claimData)` | — | Screen 3 — revise the claim while TW2 is open (eligibleClaimant, claim exists). |
| `invokeDRP` | `invokeDRP(bytes32 stid)` | — | Screen 3 — cross the DRP boundary (eligibleClaimant, `EscalationL1`, claim, within the full window). **Atomic**: transitions to `EscalationL2_DRP`, calls `DRP.resolve`, and finalises to `Settled`/`Reversed` in one tx. |
| `expireTW2` | `expireTW2(bytes32 stid)` | — | Screen 3 — permissionless default-reverse once TW2 elapses with **no** claim; `EscalationL1 → Reversed`. |
| `expireTW3` | `expireTW3(bytes32 stid)` | — | Screen 3 — permissionless default-reverse once the full window elapses **with** a claim; `EscalationL1 → Reversed` (no DRP call). |
| `ADMIN_ROLE` | `ADMIN_ROLE()` | `bytes32` | Role detection — the admin role identifier. |
| `hasRole` | `hasRole(bytes32 role, address account)` | `bool` | Role detection — global Admin check (`hasRole(ADMIN_ROLE, account)`). |

### MockDRP — functions used

The deployed MockDRP is a **test stub** (not a production DRP). It returns a per-STID preset outcome from `resolve`, settable by any caller. On an **unset** STID `resolve` returns the zero value `Outcome(0)` = **Settled** — so an un-preset STID resolves to Settled; presetting Reversed is the explicit step. This default matters for the demo: to exhibit **DRP-Reversed** browser-only, the outcome must be preset to Reversed before Invoke DRP (a Settled outcome needs no preset).

| Function | Signature | Returns | Purpose / screen |
| --- | --- | --- | --- |
| `preset` | `preset(bytes32 stid)` | `uint8 Outcome` | Screen 3 — the outcome `resolve` will return (`Settled=0`, `Reversed=1`). |
| `called` | `called(bytes32 stid)` | `bool` | Screen 3 — whether `resolve` has already fired (single-invocation guard). |
| `setOutcome` | `setOutcome(bytes32 stid, uint8 outcome)` | — | Screen 3 **test-harness control** (env-gated `VITE_ENABLE_DRP_HARNESS`) — preset the outcome so both DRP terminals are reachable browser-only. |

`Transaction` tuple returned by `getTransaction`:

```
{ bytes32 stid; address originator; address beneficiary; address eligibleClaimant;
  uint8 direction; uint256 escrowAmount; bytes32 momoLegHash;
  uint64 tw1; uint64 tw2; uint64 tw3; uint64 committedAt;
  uint8 state; bool drpInvoked; bool terminalMoved }
```

### USDC (ERC-20) — functions used

| Function | Signature | Returns | Purpose |
| --- | --- | --- | --- |
| `balanceOf` | `balanceOf(address)` | `uint256` | Screen 1 — confirm the operator can fund the escrow. |
| `allowance` | `allowance(address owner, address spender)` | `uint256` | Screen 1 — gate the approval step (spender = Settlement). |
| `approve` | `approve(address spender, uint256 amount)` | `bool` | Screen 1 — approve the Settlement contract to pull the escrow. |

### Events consumed

| Event | Signature (indexed marked *) | Consumed by |
| --- | --- | --- |
| `PoICommitted` | `(bytes32 stid*, address originator*, address beneficiary*, uint8 direction, uint256 escrowAmount, uint64 tw1, uint64 tw2, uint64 tw3)` | Screen 1 reads `stid` from the receipt; Screen 2 history. |
| `StateChanged` | `(bytes32 stid*, uint8 previous, uint8 current)` | Screen 2 history (every transition). |
| `PoRSubmitted` | `(bytes32 stid*)` | Screen 2 history. |
| `Settled` | `(bytes32 stid*, address beneficiary*, uint256 amount)` | Screen 2 history (terminal). |
| `Reversed` | `(bytes32 stid*, address originator*, uint256 amount)` | Screen 2 history (terminal). |
| `ClaimSubmitted` | `(bytes32 stid*, address claimant*)` | Screens 2/3 history (dispute path). |
| `ClaimUpdated` | `(bytes32 stid*)` | Screens 2/3 history (claim revision). |
| `DRPInvoked` | `(bytes32 stid*)` | Screens 2/3 history (DRP path). |

### Slot mapping (direction-dependent)

Agent B is **not** a separate contract field; it is direction-dependent labelling over the three address slots (`originator` = `msg.sender`; `beneficiary` + `eligibleClaimant` are `commitPoI` parameters). Source: Whitepaper v0.12.0 "Protocol at a Glance" Tables 1/2.

| Direction | originator (msg.sender) | beneficiary | eligibleClaimant |
| --- | --- | --- | --- |
| **CMM** (Crypto → MoMo) | User A | Agent B | User C (integration-layer relay) |
| **MMC** (MoMo → Crypto) | Agent B | User A | Agent B (= originator) |

---

## b. State Machine Mapping

On-chain `State` enum (ordering is the ABI — do not reorder): `PoICommitted(0)`, `ExecutionOpen(1, reserved/unused in the Part 1 flow)`, `EscalationL1(2)`, `EscalationL2_DRP(3)`, `Settled(4)`, `Reversed(5)`.

| Transition | Triggering function | Resulting event(s) | UI state change |
| --- | --- | --- | --- |
| (none) → `PoICommitted` | `commitPoI` | `PoICommitted` | Screen 1 shows the STID + escrow-lock confirmation; Screen 2 renders state badge **"Active"** and starts the **TW1** countdown. |
| `PoICommitted` → `Settled` | `submitPoR` (in TW1, by eligibleClaimant) | `PoRSubmitted`, `Settled`, `StateChanged` | Badge → **"Settled"**; "PoR submitted: Yes"; actions hidden. |
| `PoICommitted` → `EscalationL1` | `pokeTW1` (after TW1 expiry) | `StateChanged` | Badge → **"Escalated"**; active window switches to **TW2**; Submit PoR disabled; Screen 3 dispute actions open. |
| `EscalationL1` (claim filed) | `submitClaim` / `updateClaim` (within TW2, eligibleClaimant) | `ClaimSubmitted` / `ClaimUpdated` | "Claim on record: Yes"; the DRP path (Invoke DRP) opens; `expireTW2` becomes unavailable (claim pending). No state change — the transaction rests in `EscalationL1`. |
| `EscalationL1` → `Reversed` | `expireTW2` (TW2 elapsed, **no** claim; permissionless) | `Reversed`, `StateChanged` | Badge → **"Reversed"** (escrow returned to originator). |
| `EscalationL1` → `Settled`/`Reversed` | `invokeDRP` (claim, within window, eligibleClaimant) — **atomic** | `DRPInvoked`, `Settled`/`Reversed`, `StateChanged` | Transitions to `EscalationL2_DRP`, calls `DRP.resolve`, and finalises in the **same tx** — the terminal badge shows immediately. `EscalationL2_DRP` is never a persisted resting state. |
| `EscalationL1` → `Reversed` | `expireTW3` (full window elapsed, **with** a claim; permissionless) | `Reversed`, `StateChanged` | Badge → **"Reversed"**. Deployed `expireTW3` default-reverses on `EscalationL1`; it makes **no** DRP call (the amended C.2 "callable when EscalationL2_DRP / DRP fallback" wording describes an earlier design and is unreachable). |

**Label mapping (Agreement C.2 Screen 2 — Pending/Active/Escalated/Settled/Reversed).** The deployed entry state is `PoICommitted` — escrow locked, TW1 running, `submitPoR` accepted. Per C.2 Screen 1 ("State indicator: confirms transition to **Active** state") this surfaces as **"Active"**. C.2's "Pending" is the brief pre-confirmation (unmined commit) state shown by Screen 1 while the transaction is in flight — it is not a distinct on-chain enum value.

**Time-window derivation.** Windows are locked at PoI (`committedAt`, `tw1/tw2/tw3`) and stack: TW1 ends at `committedAt + tw1`, TW2 at `+ tw2`, TW3 at `+ tw3`. The window is derived from these deadlines rather than from the state enum alone, because under the deployed semantics `invokeDRP` is atomic and nothing ever rests in `EscalationL2_DRP` (see the deployed-vs-canonical note above): a claimed transaction sits in `EscalationL1` across **both** the TW2 and TW3 spans, so past its `tw2Deadline` it is in its TW3 span — the DRP / default-reverse window ending at `tw3Deadline` — while still reporting state `EscalationL1`. A state-only mapping would pin the whole of `EscalationL1` to TW2 and make the TW3 view unreachable. This derivation is centralised in `lib/windows.windowInfo` and is the single source of truth for every window read — the Screen 2 monitor, the Screen 3/4 card countdowns, and the Screen 4 dashboard window filter — so the displayed window and the filter can never disagree on the same transaction. The live countdown is seeded from the latest block's `timestamp` and advances locally between blocks (`useChainNow`), re-syncing on each new block. Terminal states have no active window.

**Action gating (mirrors the on-chain `require`s).** The Screen 3 gating is centralised in `lib/escalation.deriveEscalation`, which mirrors the contract's window comparisons (`now <= deadline` allows, `now > deadline` reverts) and is unit-tested as a matrix.
- **Submit PoR** (Screen 2) — state `PoICommitted`, TW1 not expired, connected wallet is the `eligibleClaimant`, no PoR yet.
- **pokeTW1** (Screen 2) — state `PoICommitted`, TW1 expired (permissionless).
- **Submit Claim** (Screen 3) — state `EscalationL1`, within TW2, eligibleClaimant, no existing claim.
- **Update Claim** (Screen 3) — state `EscalationL1`, within TW2, eligibleClaimant, claim exists.
- **Invoke DRP** (Screen 3) — state `EscalationL1`, claim exists, within the full window, eligibleClaimant, not already invoked.
- **Trigger TW2 Expiry** (`expireTW2`, Screen 3) — state `EscalationL1`, TW2 elapsed, **no** claim (permissionless).
- **Trigger TW3 Expiry** (`expireTW3`, Screen 3) — state `EscalationL1`, full window elapsed, **claim** on record (permissionless).

**Invoke DRP ↔ expireTW3 are complementary at `tw3Deadline`.** Both derive their window test from the **same** comparison — `tw3Expired = now > tw3Deadline` (the contract's strict `>`, so the boundary second `now == tw3Deadline` still belongs to the DRP window). Invoke DRP requires `!tw3Expired`; expireTW3 requires `tw3Expired`. For an eligible claimant with a claim on record and the DRP not yet invoked, exactly **one** of the two is ever available — never both, never neither — and the hand-off is atomic at the boundary: while the DRP window is open the claimant may adjudicate, and the instant it closes the transaction default-reverses. A boundary unit test (`escalation.test.ts`) pins this at `now == tw3Deadline` and `now == tw3Deadline + 1`.

**Invoke DRP requires an explicit confirm.** It is the one atomic, irreversible action on Screen 3 — it resolves the DRP and finalises to Settled/Reversed in the **same** transaction. The button therefore arms on a first click and requires a second, explicit confirm (stating the irreversibility) before it fires; the other actions are single-click.

---

## c. Event Listening Patterns

The Console is a no-backend SPA reading directly from RPC. Liveness is achieved by **polling reads** plus **bounded log queries**, not a server-side event pipeline.

| Surface | Mechanism | Filter | UI behaviour |
| --- | --- | --- | --- |
| Transaction state (`getTransaction`, `getPoRHash`, `transactionExists`) | wagmi `useReadContract` with `refetchInterval: 4000ms` | by `stid` argument | State badge, window, PoR flags, and action gating re-render as the transaction advances. |
| Claim status (`getClaimHash`) | `useReadContract`, `refetchInterval: 4000ms` (`useClaimStatus`) | by `stid` | Screen 3 — "Claim on record" flips the dispute-action set (claim → DRP path). |
| MockDRP status (`preset`, `called`) | `useReadContract`, `refetchInterval: 4000ms` (`useMockDrpStatus`) | by `stid` | Screen 3 — "DRP status" (not-invoked → invoked → resolved). DRP is atomic, so there is no persisted "pending" state. |
| Agent B dashboard discovery | `publicClient.getLogs(PoICommitted)` filtered by indexed `originator`/`beneficiary == wallet`, paged ≤1500 blocks from `VITE_INDEX_FROM_BLOCK` to head; then `getTransaction`+`getPoRHash` per STID (`useAgentTransactions`) | indexed wallet slots | Screen 4 — one scan per load / manual **Refresh** (not polled); rows filtered client-side by state + window, the window derived from the deadlines rather than from state alone (see §b). Capped at the 200 most-recent (surfaced). |
| Transition history | `publicClient.getLogs` paged in ≤800-block windows over a range **anchored on the exact commit block** (binary search matching a block timestamp to `committedAt`, so no dependence on the deploy block and no drift), decoded with `parseEventLogs` | keep logs whose indexed `stid` matches | Screens 2/3 — ordered timeline (block + log index), each entry linked to its Basescan transaction hash. |
| Chain time (for the countdown) | wagmi `useBlock({ watch: true })` + a 1-second local tick | latest block | Smooth per-second TW countdown re-synced on every new block. |
| STID read-back after commit | `parseEventLogs(PoICommitted)` on the commit receipt | indexed `stid` of the just-committed tx | Screen 1 shows the generated STID and carries it forward to Screen 2. |
| Wallet network | EIP-1193 provider `eth_chainId` + `chainChanged` subscription (`useWalletChainId`) | n/a | A mid-session network switch immediately blocks all interaction (see §d). |

History query bound: the lower bound is the exact commit block (binary search on `committedAt`) and the upper bound is the lifecycle deadline plus a small grace window; the range is paged in ≤800-block slices. This resolves at any transaction age with no dependence on the deploy block, no block-time drift, and no trip of the public-RPC range cap or rate limit. (An accepted tail: a permissionless poke fired far beyond its deadline can sit past the grace window.)

> The Console reads by **polling** and **bounded log scans** throughout — no `watchContractEvent` push pipeline. The 4-second poll serves the single-transaction screens; the dashboard scans once per load / manual Refresh. This keeps the no-backend invariant (C.5.f) and the RPC load predictable.

---

## d. Wallet Integration Patterns

The Console supports **MetaMask**, **Phantom**, and **Base Wallet** (Agreement C.5.c) via the two mechanisms C.5 names — **direct browser-extension injection** and **WalletConnect** — and no wallet-proprietary SDK. The layer is extensible by **configuration**, not by architectural change.

### Connector assembly (`src/config/wagmi.ts`)

- **EIP-6963 multi-injected discovery** (`multiInjectedProviderDiscovery: true`) auto-detects MetaMask, Phantom, and a Base/Coinbase extension if installed — each surfaces as a named, icon-bearing connector with no per-wallet code.
- **`walletConnect()`** — a universal QR for mobile wallets (e.g. MetaMask and Phantom mobile). Enabled when `VITE_WALLETCONNECT_PROJECT_ID` is set (the production project ID is held by the Client per E.2).
- **Base Wallet** connects via **browser-extension injection** (the Base/Coinbase extension, discovered over EIP-6963) — one of the two mechanisms C.5 names. The contract requirement ("Base Wallet … via WalletConnect and direct browser extension injection") is satisfied by the injection path; no proprietary SDK connector is added.
  - **Vendor note:** the Base mobile app does **not** connect over WalletConnect. After the Coinbase Wallet → Base App rebrand, dapp connection moved to the Base Account SDK / "Sign in with Base" (passkey), and mobile scan-to-connect was discontinued. **Testing:** connect Base via its browser extension — do not scan a QR with the mobile app.

### Connection flow (Screen 0, `ConnectWallets`)

1. The wallet picker lists every available connector, deduped by name and ordered with the three featured wallets first. Connectors are surfaced via wagmi `useConnect()`.
2. Selecting a wallet calls `connect({ connector })`; a per-connector "Connecting…" state is shown.
3. On success the address is detected and displayed; the Admin role is resolved (`hasRole(ADMIN_ROLE, account)`).
4. No screen beyond Connect is reachable until a wallet is connected (route gate `RequireConnection`) **and** the network is confirmed (blocking overlay, below).

### Signing flow

Write actions — Screen 1 `approve` / `commitPoI`; Screen 2 `submitPoR` / `pokeTW1`; Screen 3 `submitClaim` / `updateClaim` / `invokeDRP` / `expireTW2` / `expireTW3` and the MockDRP `setOutcome` harness — all go through wagmi `useWriteContract().writeContractAsync`, which prompts the connected wallet. The Console then awaits the receipt (`publicClient.waitForTransactionReceipt`) before reading back results (e.g. the STID from `PoICommitted`, or the refreshed dispute state).

### Error handling (`friendlyConnectError` + `friendlyContractError`)

Two layers. `friendlyContractError` (Screen 3) decodes **on-chain reverts** — the Settlement custom errors (`NotEligibleClaimant`, `WindowExpired`, `ClaimAlreadyExists`, `NoClaim`, `ClaimPending`, `DRPAlreadyInvoked`, `EscalationNotDue`, `InvalidState`, …) and MockDRP string reverts — to a human message, falling back to `friendlyConnectError` for the wallet/SDK layer below:

| Condition | Message |
| --- | --- |
| User rejected (`UserRejectedRequestError` / EIP-1193 `4001`) | "Connection request was rejected in the wallet." |
| Request already pending (`-32002`) | "A connection request is already open — check your wallet extension." |
| Connector not found | "Wallet not detected. Install or unlock the extension and try again." |
| Chain mismatch | "Wallet is on the wrong network — switch to the required chain." |
| Otherwise | the SDK's `shortMessage`/`message`, or a generic fallback. |

### Network verification and switching (Base Sepolia)

- The connected wallet's **actual** chain is read from the EIP-1193 provider (`eth_chainId`) and kept live by subscribing to the provider's **`chainChanged`** event (`useWalletChainId`). This is provider truth, independent of the configured-chain state, so an **in-session** network switch (e.g. to Mainnet) is detected immediately and detection is correct again on reload.
- On a mismatch, a **prominent overlay blocks all interaction** with a one-click "Switch to Base Sepolia" (`useSwitchChain`); the header badge shows "Wrong network (chain N)". The overlay suppresses itself only while the first chain read resolves, to avoid a load-time flash.

**Per-site networks (MetaMask) — how to reproduce the guard.** Modern MetaMask scopes the active network **per connected site**: the wallet exposes the site's own selected network via `eth_chainId`/`chainChanged`, independent of the network shown in MetaMask's own UI. Consequently, toggling MetaMask's global network does **not** change the connected site's network — the Console correctly continues on Base Sepolia (this is expected, not a defect). To exercise the wrong-network guard, change the *site's* network:
- connect while MetaMask is on another network (e.g. Ethereum Mainnet) → the Console blocks immediately and "Switch to Base Sepolia" recovers it; or
- change the site's network via MetaMask's per-site network control → the guard reacts live.

A wallet without per-site networks (e.g. Phantom) switches globally and triggers the guard directly. The reactive path is covered by a deterministic test (`useWalletChainId.test.ts`) driving a mock provider's `chainChanged`, so acceptance does not depend on any wallet's UX.

### Extension pattern — adding a wallet

Adding a featured wallet is a one-line edit to the `FEATURED` list in `ConnectWallets` (display name + install hint); any EIP-6963-announcing extension is picked up automatically with no code change. A non-discoverable wallet is added by appending one connector to the `connectors` array in `wagmi.ts`. No screen, routing, or signing code changes — this satisfies the C.5.c "without architectural change" requirement.

---

## e. Role and Permission Logic

The Console reflects two distinct authority models — one global, one per-transaction — and never invents access the contract does not enforce.

**Global role (registry).** The Settlement contract carries an OpenZeppelin `AccessControl` registry. The only role the Console reads is **Admin** (`hasRole(ADMIN_ROLE, account)`, via `useAdminRole`). Admin is the sole gate for **Screen 1 (Initiate)** — committing a PoI is an operator action. Admin state is resolved on connect and shown in the header.

**Per-transaction roles (derived from STID state, not a registry).** Every other permission is a function of the transaction record, resolved per STID from `getTransaction`:

| Role | Where it sits | Gated actions |
| --- | --- | --- |
| `eligibleClaimant` | struct field (immutable, set at PoI) | `submitPoR` (Screen 2); `submitClaim` / `updateClaim` / `invokeDRP` (Screen 3) |
| `originator` / `beneficiary` | struct fields | viewing-mode party check; no privileged action |
| **Agent B** | *derived*: beneficiary in CMM, originator in MMC (`deriveAgentB`, per the slot table in §a) | none on-chain — a display/label role; the subject of Screen 4 |
| anyone (permissionless) | — | `pokeTW1` (Screen 2); `expireTW2` / `expireTW3` (Screen 3) — liveness pokers |

**Viewing modes (per-transaction).** Institution-party vs third-party-observer is resolved per STID: **institution** when the connected wallet is one of `{originator, beneficiary, eligibleClaimant}`, else **observer**. Observers see corridor, amounts, STID and on-chain state; identifying participant fields are gated to institution mode.

**User C** has **no on-chain identity**. In CMM the `eligibleClaimant` slot holds an integration-layer **relay** address representing User C, not User C's own key; User C's MoMo number/operator live in the encrypted participant block of the off-chain preimage (Block C `storageLocation`, IA §12.3.3; decryptable client-side under the three-key model, §12.4.1–§12.4.3) and are surfaced only in institution mode. In this build those identifying fields render as **"pending preimage retrieval"** — the CID-publish + three-key-decrypt path is a handed-to-us design item, deferred; the non-identifying corridor/amount blocks are on-chain-derivable and shown live.

**Test-harness authority.** The Screen 3 MockDRP-outcome control (`setOutcome`) is **permissionless** — the mock has no access control — and is env-gated (`VITE_ENABLE_DRP_HARNESS`). It touches only the test stub and carries no production-role meaning.

**Production-absence property (not merely hidden).** `VITE_ENABLE_DRP_HARNESS=false` does not just hide the control — it **structurally excludes** it from the build. `Screen3Dispute` gates a `lazy(() => import('DrpHarnessControl'))` on the **raw** `import.meta.env.VITE_ENABLE_DRP_HARNESS` literal, which Vite inlines at build time and then dead-code-eliminates, so the harness chunk is never emitted; the harness-only `setOutcome` write carries the full MockDRP ABI **inside** that chunk, while the always-loaded status handle uses a read-only `preset`/`called` subset (`src/abi/mockdrp.read.ts`). A `VITE_ENABLE_DRP_HARNESS=false` build therefore contains **no** `DrpHarnessControl` chunk and **no** occurrence of `setOutcome` anywhere in `dist/` — verify with `grep -rn setOutcome dist/` (empty on a `false` build; present in the harness chunk on the default build). This is the M2 production-deploy acceptance check.

## f. Chain-Agnostic Adaptation Notes

This is the primary reusability asset (Agreement §, "reusable protocol artefact … for future implementations on other chains"). **No chain- or asset-specific literal appears in component logic** — every such value is env-driven and validated once at startup (`src/config/env.ts`, zod).

**The full env surface** (all browser-public — no-backend SPA, C.5.f):

| Variable | Role |
| --- | --- |
| `VITE_CHAIN_ID` / `VITE_CHAIN_NAME` / `VITE_RPC_URL` | the target chain the wallet is checked against + the read transport |
| `VITE_EXPLORER_URL` / `VITE_EXPLORER_NAME` | block-explorer links (addresses, tx hashes) |
| `VITE_NATIVE_SYMBOL` | gas-token label |
| `VITE_SETTLEMENT_ADDRESS` / `VITE_MOCKDRP_ADDRESS` | contract instances |
| `VITE_USDC_ADDRESS` / `VITE_USDC_SYMBOL` / `VITE_USDC_DECIMALS` | the escrow asset (address + display) |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect (Client-held in production, E.2) |
| `VITE_INDEX_FROM_BLOCK` | Screen 4 discovery lower bound (default = the Settlement deploy block) |
| `VITE_ENABLE_DRP_HARNESS` | include/exclude the Screen 3 MockDRP-outcome test harness; `false` **structurally tree-shakes** it out of the build (no chunk, no `setOutcome`) — see §e |

**Porting.**
- **Another EVM chain (Celo, BNB Chain).** Env change only: deploy the Settlement + MockDRP there, point the addresses/chain/RPC/explorer at the new network, set `VITE_INDEX_FROM_BLOCK` to the new deploy block. No component, hook, state-machine, or slot-mapping code changes — viem/wagmi are chain-generic and the ABIs are identical.
- **A different escrow asset.** Env change only (`VITE_USDC_*`). The deployed Part 1 instance is USDC-narrowed (ADR 86cad3qpk); a token-generic mainnet contract exposes the seven-field `PoIInput` — Screen 1's commit surface would widen to include `tokenAddress`/`momoCurrency` at that point (documented in §a).
- **A non-EVM chain (Stellar).** The **screen logic, state-machine mapping, viewing modes, and slot model are chain-agnostic and reusable**, but the RPC/ABI layer (viem transport, `getLogs`, `writeContract`) is EVM-specific: a Stellar port replaces that adapter with a Stellar-native contract-interaction layer while keeping the UI and protocol model. This boundary — everything above the viem calls is portable — is the reusability line to design to.

**Chain-state semantics (agreed).** Env config defines *which* chain the Console checks the wallet against; the *displayed* network state is derived from the wallet's **live** chainId (`eth_chainId` + `chainChanged`), never from config. "Chain-aware via env" (C.2 / E.5) means the target chain is configurable — not that the displayed state comes from configuration. The wrong-network guard blocks all interaction whenever the wallet's live chainId ≠ the configured target.

## g. Testing Patterns

How to verify every state-machine path manually via the Console across all five screens, browser-only (no CLI) — the M2 acceptance rehearsal — plus wallet/role detection and the dashboard.

**The six state-machine checks (by STID).** All drivable from the Console:

| # | Path | Screen · action | Terminal / result |
| --- | --- | --- | --- |
| 1 | commit PoI → escrow locked | Screen 1 · `commitPoI` | STID minted, escrow held, badge "Active", TW1 counting |
| 2 | happy path | Screen 2 · `submitPoR` in TW1 | **Settled** |
| 3 | escalation | Screen 2 · `pokeTW1` after TW1 | EscalationL1 (claim window opens) — Check 5 |
| 4 | no-claim default-reverse | Screen 3 · `expireTW2` (TW2 elapsed, no claim) | **Reversed** |
| 5 | DRP resolution | Screen 3 · Submit Claim → **preset MockDRP** → `invokeDRP` | **DRP-Settled** and **DRP-Reversed** (run twice, presetting each outcome) |
| 6 | DRP-timeout default-reverse | Screen 3 · `expireTW3` (full window, claim on record) | **Reversed** — Check 6 |

To exercise check 5 browser-only, preset the MockDRP outcome with the Screen 3 test-harness control (`VITE_ENABLE_DRP_HARNESS`) before Invoke DRP; the mock is not a production DRP.

**Wallet + role detection.** For each of the three wallets (MetaMask, Phantom, Base browser-extension): connect on Screen 0, confirm the address and Admin detection; confirm the wrong-network guard blocks when the wallet is off Base Sepolia and recovers via "Switch to Base Sepolia" (see §d for the per-site-network reproduction). WalletConnect QR renders when a project ID is configured.

**Agent B dashboard (Screen 4).** With a wallet that is a party to several transactions: confirm the list populates, filter by state (Active/Escalated/Settled/Reversed) and by window (TW1/TW2/TW3), and drill-down "Open in Monitor" carries the STID to Screen 2. Note when checking the window filter that it is time-derived, not state-derived: a claimed transaction sits in `EscalationL1` across both the TW2 and TW3 spans, so past its `tw2Deadline` it is listed under **TW3** — the view an Agent B uses to find transactions approaching default-reverse — and not under TW2. The card's "Active window" reads from the same derivation, so card and filter always agree.

**Automated tests (`pnpm test`, vitest).** Pure logic is unit-tested so acceptance does not hinge on wallet UX: escalation-action matrix (`escalation.test`), dashboard filters (`dashboard.test`), window derivation (`windows.test`), slot mapping (`slots.test`), state labels (`state.test`), momoLegHash composition (`momoLegHash.test`), contract-revert decoding (`contractErrors.test`), claim payload (`claim.test`), amount/countdown formatting (`format.test`), and the reactive network guard against a mock provider (`useWalletChainId.test`). CI runs lint + typecheck + test + build.
