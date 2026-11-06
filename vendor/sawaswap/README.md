# Vendored @sawaswap packages

Built copies of `@sawaswap/crypto` and `@sawaswap/chain-client` from the Part 2B repository
(`sawaswapHQ/settlement-layer-part2b`). The Console uses these instead of reimplementing them,
and they are committed here instead of being installed from a registry (Client decision,
4 November 2026). Each update arrives as a PR.

Each `.tgz` has a `.provenance.json` beside it, recording the package, its version, the source
commit, the toolchain, the tarball's SHA-256 and the SHA-256 of every file inside it.

## What is checked, and where

| Condition                             | Checked by                                                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Traceable to source                   | `PROVENANCE.json` inside each tarball and the record beside it name the source commit. The Part 2B build refuses uncommitted inputs |
| Reproducible                          | Part 2B CI, job `vendored-packages`: two builds of one commit must be byte-identical                                                |
| Free of secrets                       | Part 2B CI: gitleaks over the unpacked tarballs. Here: `pnpm verify:vendored` repeats a credential-shape scan                       |
| Covered by the conformance tests      | `pnpm test:vendored` runs each package's own tests, shipped compiled in `dist/test`, against the installed build                    |
| What is installed is what is recorded | `pnpm verify:vendored`: tarball hash, the `package.json` declaration and every installed file                                       |

## Updating

1. In Part 2B, at the commit to vendor, with a clean tree: `node tools/vendor-packages.mjs --check`.
2. Copy `vendor-out/*` here, replacing the previous version's files.
3. Point the `@sawaswap/*` dependencies in `package.json` at the new tarballs and run `pnpm install`.
4. Run `pnpm verify:vendored` and `pnpm test:vendored`, then open the PR. Name the source commit in the PR description.

viem comes from the Console (`^2.55.13`, one copy for the whole app); the packages declare it as
a peer.
