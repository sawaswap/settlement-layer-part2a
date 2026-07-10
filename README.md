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
  settings. Enable SPA history fallback (rewrite all routes to `/index.html`).
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
  `getClaimHash`, `ADMIN_ROLE`, `hasRole`.
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
1. **Initiate Transaction** (Admin-only) — commit a PoI, lock escrow, mint the STID.
2. **Transaction Monitor** (primary verification instrument) — look up any STID; observe state, windows, history; Submit PoR / pokeTW1.
3. **Dispute & Escalation** — claim window, DRP path, and the TW2/TW3 expiry pokers; every dispute terminal drivable by STID.
4. **Agent B Transaction Dashboard** — the connected wallet's transactions, filterable by state + window, with drill-down to Screen 2.

## Testing

`pnpm test` runs the vitest unit suite (escalation matrix, dashboard filters,
window/slot/state derivation, momoLegHash + claim payloads, contract-revert
decoding, reactive network guard). Manual verification patterns — the six
state-machine checks browser-only, plus wallet/role detection — are in FIS §g.
