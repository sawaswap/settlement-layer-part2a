# Vendored @sawaswap packages

Built copies of `@sawaswap/crypto`, `@sawaswap/chain-client` and `@sawaswap/scn-client` from the Part 2B repository
(`sawaswapHQ/settlement-layer-part2b`). The Console uses these instead of reimplementing them,
and they are committed here instead of being installed from a registry (Client decision,
4 November 2026). Each update arrives as a PR.

Each `.tgz` has a `.provenance.json` beside it, recording the package, its version, the source
commit, the toolchain, the tarball's SHA-256 and the SHA-256 of every file inside it.

## What is checked, and where

| Condition                             | Checked by                                                                                                                                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Traceable to source                   | `PROVENANCE.json` inside each tarball and the record beside it name the source commit. The Part 2B build refuses uncommitted inputs                                                                                                                    |
| Reproducible                          | Part 2B CI, job `vendored-packages`: two builds of one commit must be byte-identical                                                                                                                                                                   |
| Free of secrets                       | Part 2B CI: gitleaks over the unpacked tarballs. Here: `pnpm verify:vendored` repeats a credential-shape scan                                                                                                                                          |
| Covered by the conformance tests      | `pnpm test:vendored` runs each package's own tests, shipped compiled in `dist/test`, against the installed build. It fails unless each package ran exactly the test files its record lists and the number of tests pinned in `conformance-counts.json` |
| What is installed is what is recorded | `pnpm verify:vendored`: tarball hash, the `package.json` declaration and every installed file. Every `@sawaswap` dependency has exactly one record, and every tarball here has one                                                                     |

## Updating

1. In Part 2B, at the commit to vendor, with a clean tree: `node tools/vendor-packages.mjs --check`.
2. Copy `vendor-out/*` here, replacing the previous version's files.
3. Point the `@sawaswap/*` dependencies in `package.json` at the new tarballs and run `pnpm install`.
4. Run `pnpm verify:vendored`, then `node scripts/test-vendored.mjs --update` to pin the new test counts, then
   `pnpm test:vendored`. Open the PR and name the source commit in its description; a change in a pinned count shows
   in the diff of `conformance-counts.json` and should be explained there.

The packages declare viem as a peer dependency and do not bring their own. The Console pins it to exactly
`2.55.13`, the version in Part 2B's lockfile, and `pnpm.overrides` maps every `viem@>=2.24.0` in the tree to that same
version, so the app, wagmi and the vendored packages all resolve the same viem version. pnpm may still install it more
than once when its own peers differ (today: two installs of `2.55.13` for two zod versions), which does not change the
code. WalletConnect's exact `2.23.2` is below that range and keeps its own copy, as before.
