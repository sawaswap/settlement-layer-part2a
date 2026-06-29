# SawaSwap Operator Console

Browser-based operator UI for the SawaSwap Settlement Layer (Part 2a), targeting
the Part 1 deployment of record on **Base Sepolia**. Single-page application, no
backend: all state is read directly from chain via RPC.

> This README is a scaffold. The full operator/developer README (local dev,
> environment configuration, wallet setup, deployment, ABI summary) is a M2
> deliverable (plan W2.6). A standalone Frontend Integration Specification (FIS)
> is delivered alongside the codebase as a primary deliverable.

## Stack

- **Vite + React + TypeScript** (strict), client-rendered SPA
- **viem + wagmi** for contract interaction; **TanStack Query** for state
- **Wallet layer**: injected (MetaMask, Phantom) + Coinbase/Base Wallet, with
  optional WalletConnect — config-extensible (no architectural change to add a wallet)
- **Tailwind CSS** for styling

## Quick start

```bash
pnpm install
cp .env.example .env   # all values are browser-public; none are secrets
pnpm dev               # http://localhost:5173
```

## Scripts

| Command           | Purpose                                  |
| ----------------- | ---------------------------------------- |
| `pnpm dev`        | Run the dev server                       |
| `pnpm build`      | Typecheck + production build             |
| `pnpm typecheck`  | `tsc --noEmit`                           |
| `pnpm lint`       | ESLint                                   |
| `pnpm test`       | Vitest unit tests                        |
| `pnpm format`     | Prettier write                           |

## Configuration

All chain- and asset-specific values live in `.env` (see `.env.example`).
Porting to another network or asset is an environment change, not a code change
— this is the Console's chain-/asset-agnostic posture (documented in FIS f).

## Contracts

Targets the Part 1 M3 deployment of record on Base Sepolia (Settlement +
MockDRP), source-verified on Basescan. ABIs in `src/abi/` are extracted from the
verified build artefacts.

## Screens

0. Wallet Connection & Network Verification
1. Initiate Transaction (Admin-only)
2. Transaction Monitor (primary verification instrument)
3. Dispute & Escalation
4. Agent B Transaction Dashboard
