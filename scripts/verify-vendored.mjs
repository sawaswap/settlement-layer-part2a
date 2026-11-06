// Checks the vendored @sawaswap packages before anything uses them.
//
// The Console commits built copies of @sawaswap/crypto and @sawaswap/chain-client
// rather than installing them from a registry (Client decision, 4 November 2026).
// Each tarball in vendor/sawaswap has a provenance record beside it, written by
// tools/vendor-packages.mjs in the Part 2B repository. This script holds the
// committed bytes, the dependency declaration and the installed copy to that
// record, so a tarball swapped, edited or left stale fails here:
//
//  1. the tarball's SHA-256 is the one recorded;
//  2. package.json depends on exactly that tarball;
//  3. every installed file is byte-identical to the recorded file list, and the
//     installed PROVENANCE.json names the recorded source commit;
//  4. nothing installed matches a credential shape.
//
// Reproducing a tarball needs the Part 2B source, so that check runs in Part
// 2B's CI (`node tools/vendor-packages.mjs --check`), not here.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const VENDOR = join(ROOT, 'vendor/sawaswap')
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{36}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/,
  /\bsk_(live|test)_[A-Za-z0-9]{16,}\b/,
  /(PRIVATE_KEY|DEPLOYER_KEY|MNEMONIC)\s*[:=]\s*['"`]?[0-9a-zA-Z]/,
]

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
// The installed package's own node_modules holds pnpm's links to its
// dependencies' binaries, which are the installer's, not the tarball's.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(path)
    return [path]
  })

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const records = readdirSync(VENDOR).filter((name) => name.endsWith('.provenance.json'))
if (records.length === 0) throw new Error('No provenance records in vendor/sawaswap.')

const failures = []
for (const recordFile of records) {
  const record = JSON.parse(readFileSync(join(VENDOR, recordFile), 'utf8'))
  const label = `${record.package}@${record.version}`

  const tarball = readFileSync(join(VENDOR, record.tarball))
  if (sha256(tarball) !== record.tarballSha256) {
    failures.push(`${label}: ${record.tarball} does not have the recorded SHA-256.`)
  }

  const declared = manifest.dependencies?.[record.package]
  if (declared !== `file:vendor/sawaswap/${record.tarball}`) {
    failures.push(`${label}: package.json declares "${declared}", not the recorded tarball.`)
  }

  const installed = join(ROOT, 'node_modules', record.package)
  const files = walk(installed)
    .filter((path) => statSync(path).isFile())
    .map((path) => relative(installed, path))
    .sort()
  const expected = record.files.map((file) => file.path)
  if (JSON.stringify(files) !== JSON.stringify(expected)) {
    failures.push(`${label}: the installed file list differs from the recorded one.`)
  }
  for (const file of record.files) {
    const path = join(installed, file.path)
    let bytes
    try {
      bytes = readFileSync(path)
    } catch {
      continue // already reported by the file-list comparison
    }
    if (sha256(bytes) !== file.sha256)
      failures.push(`${label}: ${file.path} differs from the record.`)
    const text = bytes.toString('utf8')
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(text)) failures.push(`${label}: ${file.path} matches ${pattern}.`)
    }
  }

  const provenance = JSON.parse(readFileSync(join(installed, 'PROVENANCE.json'), 'utf8'))
  if (provenance.sourceCommit !== record.sourceCommit) {
    failures.push(
      `${label}: installed copy names ${provenance.sourceCommit}, record ${record.sourceCommit}.`,
    )
  }

  console.log(`${label} — ${record.sourceRepository} @ ${record.sourceCommit.slice(0, 7)}`)
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`Vendored packages verified (${records.length}).`)
