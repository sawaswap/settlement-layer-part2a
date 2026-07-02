# SawaSwap Operator Console — Frontend Integration Specification (FIS)

**Document ID:** SWP-FIS-CONSOLE-0.1
**Status:** M1 draft — sections a–d (Contract Interface, State Machine Mapping, Event Listening, Wallet Integration). Sections e–g (Role & Permission Logic, Chain-Agnostic Adaptation Notes, Testing Patterns) are delivered at M2.
**Target:** Part 1 deployment of record on Base Sepolia (Settlement + MockDRP), source-verified on Basescan.
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
| `ADMIN_ROLE` | `ADMIN_ROLE()` | `bytes32` | Role detection — the admin role identifier. |
| `hasRole` | `hasRole(bytes32 role, address account)` | `bool` | Role detection — global Admin check (`hasRole(ADMIN_ROLE, account)`). |

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
| `ClaimSubmitted` | `(bytes32 stid*, address claimant*)` | Screen 2 history (M2 dispute path). |
| `DRPInvoked` | `(bytes32 stid*, …)` | Screen 2 history (M2 DRP path). |

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
| `PoICommitted` → `EscalationL1` | `pokeTW1` (after TW1 expiry) | `StateChanged` | Badge → **"Escalated"**; active window switches to **TW2**; Submit PoR disabled. |
| `EscalationL1` → `Reversed` | `expireTW2` *(M2)* | `Reversed`, `StateChanged` | Badge → **"Reversed"** (escrow returned). |
| `EscalationL1` → `EscalationL2_DRP` | claim + DRP path *(M2)* | `ClaimSubmitted`, `DRPInvoked`, `StateChanged` | Badge → **"Escalated (DRP)"**; active window **TW3**. |
| `EscalationL2_DRP` → `Settled`/`Reversed` | DRP resolution *(M2)* | `Settled`/`Reversed` | Terminal badge. |

**Label mapping (Agreement C.2 Screen 2 — Pending/Active/Escalated/Settled/Reversed).** The deployed entry state is `PoICommitted` — escrow locked, TW1 running, `submitPoR` accepted. Per C.2 Screen 1 ("State indicator: confirms transition to **Active** state") this surfaces as **"Active"**. C.2's "Pending" is the brief pre-confirmation (unmined commit) state shown by Screen 1 while the transaction is in flight — it is not a distinct on-chain enum value.

**Time-window derivation.** Windows are locked at PoI (`committedAt`, `tw1/tw2/tw3`) and stack: TW1 ends at `committedAt + tw1` (state `PoICommitted`); TW2 at `+ tw2` (`EscalationL1`); TW3 at `+ tw3` (`EscalationL2_DRP`). The live countdown is seeded from the latest block's `timestamp` and advances locally between blocks (`useChainNow`), re-syncing on each new block. Terminal states have no active window.

**Action gating (mirrors the on-chain `require`s).**
- **Submit PoR** — enabled only when state is `PoICommitted`, the active TW1 has not expired, the connected wallet is the `eligibleClaimant`, and no PoR has been submitted.
- **pokeTW1** — enabled only when state is `PoICommitted` and TW1 has expired (permissionless).

---

## c. Event Listening Patterns

The Console is a no-backend SPA reading directly from RPC. Liveness is achieved by **polling reads** plus **bounded log queries**, not a server-side event pipeline.

| Surface | Mechanism | Filter | UI behaviour |
| --- | --- | --- | --- |
| Transaction state (`getTransaction`, `getPoRHash`, `transactionExists`) | wagmi `useReadContract` with `refetchInterval: 4000ms` | by `stid` argument | State badge, window, PoR flags, and action gating re-render as the transaction advances. |
| Transition history | `publicClient.getLogs` over a window bounded by `committedAt` (no dependence on the deploy block), decoded with `parseEventLogs` | keep logs whose indexed `stid` matches | Ordered timeline (block + log index), each entry linked to its Basescan transaction hash. |
| Chain time (for the countdown) | wagmi `useBlock({ watch: true })` + a 1-second local tick | latest block | Smooth per-second TW countdown re-synced on every new block. |
| STID read-back after commit | `parseEventLogs(PoICommitted)` on the commit receipt | indexed `stid` of the just-committed tx | Screen 1 shows the generated STID and carries it forward to Screen 2. |
| Wallet network | EIP-1193 provider `eth_chainId` + `chainChanged` subscription (`useWalletChainId`) | n/a | A mid-session network switch immediately blocks all interaction (see §d). |

History query bound: the window is `latest − (age_in_seconds / blockTime + margin)` blocks (Base ≈ 2s/block), which keeps each `getLogs` range small (the transaction's lifetime) and well within public-RPC limits.

> M2 may add push subscriptions (`watchContractEvent`) for the Agent B dashboard's multi-transaction view; the single-transaction Monitor is well served by the 4-second poll.

---

## d. Wallet Integration Patterns

The Console supports **MetaMask**, **Phantom**, and **Base Wallet** (Agreement C.5.c), via EIP-6963 browser-extension discovery and the Coinbase SDK, with WalletConnect available when a project ID is configured. The layer is extensible by **configuration**, not by architectural change.

### Connector assembly (`src/config/wagmi.ts`)

- **EIP-6963 multi-injected discovery** (`multiInjectedProviderDiscovery: true`) auto-detects MetaMask, Phantom, and any other extension that announces itself — each surfaces as a named, icon-bearing connector with no per-wallet code.
- **`coinbaseWallet()`** — Base Wallet (Coinbase), works with or without the extension installed.
- **`walletConnect()`** — added only when `VITE_WALLETCONNECT_PROJECT_ID` is set (the production project ID is held by the Client per E.2).

### Connection flow (Screen 0, `ConnectWallets`)

1. The wallet picker lists every available connector, deduped by name and ordered with the three featured wallets first. Connectors are surfaced via wagmi `useConnect()`.
2. Selecting a wallet calls `connect({ connector })`; a per-connector "Connecting…" state is shown.
3. On success the address is detected and displayed; the Admin role is resolved (`hasRole(ADMIN_ROLE, account)`).
4. No screen beyond Connect is reachable until a wallet is connected (route gate `RequireConnection`) **and** the network is confirmed (blocking overlay, below).

### Signing flow

Write actions (`approve`, `commitPoI`, `submitPoR`, `pokeTW1`) go through wagmi `useWriteContract().writeContractAsync`, which prompts the connected wallet. The Console then awaits the receipt (`publicClient.waitForTransactionReceipt`) before reading back results (e.g. the STID from `PoICommitted`).

### Error handling (`friendlyConnectError`)

Wallet/SDK errors are mapped to short, human messages rather than raw stack text:

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

### Extension pattern — adding a wallet

Adding a featured wallet is a one-line edit to the `FEATURED` list in `ConnectWallets` (display name + install hint); any EIP-6963-announcing extension is picked up automatically with no code change. A non-discoverable wallet is added by appending one connector to the `connectors` array in `wagmi.ts`. No screen, routing, or signing code changes — this satisfies the C.5.c "without architectural change" requirement.

---

## e–g. (M2)

- **e. Role and Permission Logic** — Admin (global, role registry) vs Agent B / User A / Beneficiary (per-transaction from STID state); User C has no on-chain identity (corridor metadata surfaced in detail views only).
- **f. Chain-Agnostic Adaptation Notes** — all Base-specific values are env-driven; the port surface to Celo / BNB Chain / Stellar. (Primary reusability asset.)
- **g. Testing Patterns** — manual verification of each state-machine path across all five screens, plus wallet/role detection and the Agent B dashboard.
