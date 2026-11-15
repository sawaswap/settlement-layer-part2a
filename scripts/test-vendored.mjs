// Runs the vendored @sawaswap packages' own conformance tests and holds the
// run to explicit counts (review finding C3).
//
// A green vitest run proves only that whatever ran passed. It does not prove
// that a package's tests ran at all: a test file left out of a tarball, a glob
// that stops matching, or a suite that quietly shrinks would all still be
// green. So, per package:
//
//  1. the test files executed are exactly the `dist/test/**/*.test.js` files
//     its provenance record lists — the build in Part 2B decides that set, not
//     this repository;
//  2. the number of tests (passed and skipped) equals the number pinned in
//     vendor/sawaswap/conformance-counts.json, which a vendoring PR updates, so
//     a change in the count is a visible line in its diff;
//  3. nothing failed, and at least one test passed.
//
// Run with --update to rewrite the pinned counts after a deliberate re-vendor.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const VENDOR = join(ROOT, 'vendor/sawaswap')
const COUNTS = join(VENDOR, 'conformance-counts.json')
const update = process.argv.includes('--update')

const records = readdirSync(VENDOR)
  .filter((name) => name.endsWith('.provenance.json'))
  .map((name) => JSON.parse(readFileSync(join(VENDOR, name), 'utf8')))
const TEST_FILE = /^dist\/test\/.*\.test\.js$/

const scratch = mkdtempSync(join(tmpdir(), 'vendored-tests-'))
const report = join(scratch, 'report.json')
let runFailed = false
try {
  execFileSync(
    'npx',
    [
      'vitest',
      'run',
      '--config',
      'vitest.vendored.config.ts',
      '--reporter=default',
      '--reporter=json',
      `--outputFile=${report}`,
    ],
    { cwd: ROOT, stdio: 'inherit' },
  )
} catch {
  runFailed = true // reported below, with the counts
}
const results = JSON.parse(readFileSync(report, 'utf8'))
rmSync(scratch, { recursive: true, force: true })

const pinned = update ? {} : JSON.parse(readFileSync(COUNTS, 'utf8'))
const counts = {}
const failures = []
for (const record of records) {
  const label = `${record.package}@${record.version}`
  const installed = join(ROOT, 'node_modules', record.package)
  const expectedFiles = record.files.map((file) => file.path).filter((path) => TEST_FILE.test(path))
  const ran = results.testResults.filter((file) => file.name.startsWith(`${installed}/`))
  const ranFiles = ran.map((file) => relative(installed, file.name)).sort()

  if (expectedFiles.length === 0) failures.push(`${label}: its record lists no conformance tests.`)
  if (JSON.stringify(ranFiles) !== JSON.stringify([...expectedFiles].sort())) {
    failures.push(`${label}: the test files run are not the ones its provenance record lists.`)
  }
  const statuses = ran.flatMap((file) => file.assertionResults.map((test) => test.status))
  const passed = statuses.filter((status) => status === 'passed').length
  const skipped = statuses.filter((status) => status === 'skipped' || status === 'pending').length
  const failed = statuses.length - passed - skipped
  if (failed > 0) failures.push(`${label}: ${failed} test(s) did not pass.`)
  if (passed === 0) failures.push(`${label}: no test passed.`)

  counts[record.package] = {
    version: record.version,
    files: ranFiles.length,
    tests: passed + skipped,
  }
  const expected = pinned[record.package]
  if (!update) {
    if (expected === undefined) {
      failures.push(`${label}: no pinned count in conformance-counts.json.`)
    } else if (
      expected.version !== record.version ||
      expected.tests !== passed + skipped ||
      expected.files !== ranFiles.length
    ) {
      failures.push(
        `${label}: ran ${ranFiles.length} files / ${passed + skipped} tests; pinned ` +
          `${expected.files} files / ${expected.tests} tests for ${expected.version}.`,
      )
    }
  }
  console.log(`${label}: ${ranFiles.length} files, ${passed} passed, ${skipped} skipped`)
}
if (!update) {
  for (const name of Object.keys(pinned)) {
    if (!records.some((record) => record.package === name)) {
      failures.push(`${name}: pinned in conformance-counts.json but not vendored.`)
    }
  }
}

if (runFailed && failures.length === 0) failures.push('vitest reported a failure.')
if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
if (update) {
  writeFileSync(COUNTS, `${JSON.stringify(counts, null, 2)}\n`)
  console.log(`Pinned counts written to ${relative(ROOT, COUNTS)}.`)
} else {
  console.log('Vendored conformance tests ran at the pinned counts.')
}
