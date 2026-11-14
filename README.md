# SawaSwap Operator Console

Browser-based operator UI for the SawaSwap Settlement Layer (Part 2a), targeting
the Part 1 deployment of record on **Base Sepolia**. Single-page application, no
backend: all state is read directly from chain via RPC, and all writes are
composed client-side and signed by the connected wallet.

The companion **Frontend Integration Specification (FIS.md)** documents the
contract interface, state-machine mapping, event patterns, wallet integration,
roles, chain-agnostic adaptation, and testing patterns in full.

## Stack

- **Vite + React + TypeScript** (strict), client-rendered SPA
- **viem + wagmi** for contract interaction; **TanStack Query** for read state
- **Wallet layer**: EIP-6963 injected discovery (MetaMask, Phantom, Base/Coinbase
  extension) + optional WalletConnect — config-extensible, no architectural
  change to add a wallet
- **Tailwind CSS** for styling; **zustand** for light cross-screen UI state

## Quick start

```bash
pnpm install
cp .env.example .env   # all values are browser-public; none are secrets
pnpm dev               # http://localhost:5173
```

Requires Node 18+ and pnpm. `.env` ships preconfigured for the Base Sepolia
deployment of record, so `pnpm dev` works out of the box.

## Scripts

| Command          | Purpose                      |
| ---------------- | ---------------------------- |
| `pnpm dev`       | Run the dev server           |
| `pnpm build`     | Typecheck + production build |
| `pnpm preview`   | Serve the production build   |
| `pnpm typecheck` | `tsc --noEmit`               |
| `pnpm lint`      | ESLint                       |
| `pnpm test`      | Vitest unit tests            |
| `pnpm format`    | Prettier write               |
| `node scripts/select-pair.ts …` | Pilot selection: Authorised Quote Record + key-binding anchors |

## Configuration

All chain- and asset-specific values live in `.env` (see `.env.example`). Porting
to another network or asset is an environment change, not a code change — the
Console's chain-/asset-agnostic posture (FIS §f). Every value is compiled into
the browser bundle and is therefore **public**; none are secrets.

| Variable | Purpose |
| --- | --- |
| `VITE_CHAIN_ID`, `VITE_CHAIN_NAME`, `VITE_RPC_URL` | Target chain + read transport |
| `VITE_EXPLORER_URL`, `VITE_EXPLORER_NAME`, `VITE_NATIVE_SYMBOL` | Explorer links + gas-token label |
| `VITE_SETTLEMENT_ADDRESS`, `VITE_MOCKDRP_ADDRESS` | Contract instances |
| `VITE_USDC_ADDRESS`, `VITE_USDC_SYMBOL`, `VITE_USDC_DECIMALS` | Escrow asset |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect (optional; Client-held in production, E.2) |
| `VITE_INDEX_FROM_BLOCK` | Screen 4 discovery lower bound (default = Settlement deploy block) |
| `VITE_ENABLE_DRP_HARNESS` | Show/hide the Screen 3 MockDRP test-harness control (`false` to hide) |
| `VITE_SCN_URL` | SCN Server Zero deployment for origination (Screen 1 cannot originate without it) |
| `VITE_KEY_BINDING_MODE` | Operator key-binding mode; blank = `STRICT`, `SYNTHETIC` only on Base Sepolia (ADR 123n15h7v6d §5.2) |
| `VITE_KEY_ANCHORS` | Key-binding anchors for the selected pair, as `scripts/select-pair.ts` prints them (§7.1) |

The env is validated once at startup (zod, `src/config/env.ts`) — a
misconfiguration fails loudly rather than deep inside a contract call.

## Wallet setup

The Console supports **MetaMask**, **Phantom**, and **Base Wallet** via the two
mechanisms Agreement C.5 names — **browser-extension injection** (EIP-6963) and
**WalletConnect** — with no wallet-proprietary SDK.

- Install the wallet extension(s); each is auto-discovered and listed on Screen 0.
- **Base Wallet connects via its browser extension**, not the mobile app: after
  the Coinbase → Base App rebrand, dapp connection moved to the Base Account SDK
  and mobile scan-to-connect was discontinued. Do not scan a QR with the Base
  mobile app — use the extension.
- WalletConnect (mobile wallets via QR) is enabled when
  `VITE_WALLETCONNECT_PROJECT_ID` is set.
- All screens require a connected wallet on the configured network; a wrong
  network is blocked with a one-click switch (see FIS §d).

Adding a wallet: a featured wallet is a one-line entry in `ConnectWallets`; any
EIP-6963 extension is picked up automatically. No routing/signing changes.

## Deployment

Static SPA — deploys to any static host; the Client's target is **Vercel** (or
Netlify) with the **Base Sepolia** Settlement as the on-chain target.

```bash
pnpm build            # → dist/ (typecheck + Vite build)
```

- **Vercel/Netlify:** set the build command to `pnpm build` and the output
  directory to `dist`. Add the `.env` variables in the project's environment
  settings. SPA history fallback (rewrite all routes to `/index.html`, required
  because the app uses client-side routing so a direct load or refresh of e.g.
  `/dispute` must serve the app, not a 404) is checked in as `vercel.json`; on
  Netlify add the equivalent `/* /index.html 200` redirect.
- **Custom subdomain** (e.g. `console.sawaswap.io`): DNS is the Client's
  responsibility; the Developer configures the host project to receive it. Absent
  a subdomain, the platform URL (e.g. `*.vercel.app`) satisfies the deployment
  condition (D14).
- Production WalletConnect project ID and RPC are Client-held (E.2).

## Contracts / ABI summary

Targets the Part 1 M3 deployment of record on Base Sepolia (Settlement +
MockDRP), source-verified on Basescan. ABIs in `src/abi/` are extracted verbatim
from the verified build artefacts. The functions the Console uses:

- **Settlement (reads):** `transactionExists`, `getTransaction`, `getPoRHash`,
  `getClaimHash`, `ADMIN_ROLE`, `hasRole` (including the inert
  `SAWASWAP_CONSOLE_ORIGINATOR` role, CR-CONSOLE-1).
- **Settlement (writes):** `commitPoI` (Screen 1); `submitPoR`, `pokeTW1`
  (Screen 2); `submitClaim`, `updateClaim`, `invokeDRP`, `expireTW2`, `expireTW3`
  (Screen 3).
- **MockDRP:** `preset`, `called` (reads); `setOutcome` (Screen 3 test harness).
- **USDC (ERC-20):** `balanceOf`, `allowance`, `approve` (Screen 1).
- **Events consumed:** `PoICommitted`, `StateChanged`, `PoRSubmitted`,
  `ClaimSubmitted`, `ClaimUpdated`, `DRPInvoked`, `Settled`, `Reversed`.

The deployed Settlement is USDC-narrowed (five-field `PoIInput`); the canonical
seven-field struct is the mainnet target (ADR 86cad3qpk). See FIS §a.

## Screens

0. **Wallet Connection & Network Verification** — connect one of three wallets; enforce Base Sepolia.
1. **Initiate Transaction** (Admin or Console originator role) — originate a CMM transaction end to end. See *Origination* below.
2. **Transaction Monitor** (primary verification instrument) — look up any STID; observe state, windows, history; Submit PoR / pokeTW1.
3. **Dispute & Escalation** — claim window, DRP path, and the TW2/TW3 expiry pokers; every dispute terminal drivable by STID.
4. **Agent B Transaction Dashboard** — the connected wallet's transactions, filterable by state + window, with drill-down to Screen 2.

## Origination (C01)

Screen 1 originates a CMM transaction from the connected EOA wallet, in the
protocol's order:

1. **Quote.** The operator loads the Authorised Quote Record that
   `scripts/select-pair.ts` issued for one Bridge/Relay pair (ADR 123n15h8936
   v0.14 §2.4c). The Console validates it (§2.4c.3: `quoteId`, authority,
   contexts, validity window, bounds, `Q_CMM`) and shows User A what they
   accept.
2. **Keys.** It looks up both operators on SCN and verifies each signed key
   binding (ADR 123n15h7v6d v0.3.2 checks 1–8, then the anchor gate in `STRICT`
   mode). The last accepted binding per chain, Settlement Contract and operator
   is kept in this browser (check 8).
3. **Consumer Context.** It builds the three domains (86cb152xc v1.2.13), seals
   the Consumer Context to User C's SCA and asks the wallet to sign it
   (EIP-712, 86cb4mgeh v0.7). The signer is recovered before any gas.
4. **Commit.** `approve` if needed, then `commitPoI` with Operator-B as
   `beneficiary` and Operator-R as `eligibleClaimant` (§2.4c.4(c),
   CR-CONSOLE-4). The STID comes from the receipt.
5. **Deliver.** The preimage material (to Relay), the payout material (to the
   Bridge) and Transaction Introduction v3 (to User C's SSID) are sealed once
   and posted to SCN, in that order (`docs/m4-e2e-layouts.md`).

Before step 3 it also refuses an SSID that already has a pending transaction
(CR-CONSOLE-5): one held open in this browser, or one whose Introduction slot on
SCN names an STID that is not yet terminal on chain.

Every step is written to a local record first, so a reload resumes rather than
restarts. A commit is never sent twice from one record: if the wallet did not
return a hash, the Console looks for the record's `momoLegHash` on chain. A
delivery retry sends the same sealed bytes. The record holds unsealed material
until delivery completes and lives only in this browser profile; if its site
data is cleared before then, the escrow returns through TW1 expiry and
`expireTW2`.

**Selection script.** Issue the record when the transaction is about to be
originated; it is valid for one hour by default:

```bash
node scripts/select-pair.ts \
  --bridge 0x… --bridge-momo +243… --bridge-sequence 1 --bridge-fingerprint 0x… \
  --relay 0x… --relay-sequence 1 --relay-fingerprint 0x…
```

The sequence and fingerprint of each operator come from its AgentOS Network
screen, never from SCN. The script writes `quote-record.json` and prints the
`VITE_KEY_ANCHORS` value for the Console deployment.

## Testing

`pnpm test` runs the vitest unit suite (escalation matrix, dashboard filters,
window/slot/state derivation, origination (quote acceptance, key binding,
Consumer Context, the sealed objects and recovery), claim payloads, contract-revert
decoding, reactive network guard). Manual verification patterns — the six
state-machine checks browser-only, plus wallet/role detection — are in FIS §g.
