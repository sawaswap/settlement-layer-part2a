/**
 * Pilot selection script (Build Default 3, revised 4 November 2026): selects an
 * Operator-B / Operator-R pair, issues the executable quote for it, and writes
 * the Authorised Quote Record the Console loads on Screen 1. It also prints the
 * key-binding anchors for the pair, to be set as VITE_KEY_ANCHORS.
 *
 * The anchors' sequence and fingerprint are read from each operator's AgentOS
 * Network screen ("Key binding — sequence", "Key binding — key fingerprint"),
 * never from SCN (ADR 123n15h7v6d v0.3.2 §7.1).
 *
 *   node scripts/select-pair.ts \
 *     --bridge 0x… --bridge-momo +243… --bridge-sequence 1 --bridge-fingerprint 0x… \
 *     --relay 0x… --relay-sequence 1 --relay-fingerprint 0x… \
 *     [--destination momo:+243/vodacom/USD] [--rate 1] [--margin-bps 10] \
 *     [--min 1] [--max 1000] [--validity 3600] [--out quote-record.json]
 *
 * Defaults are the Base Sepolia deployment of record and the Kinshasa pilot
 * quote (1:1 reference, 10 bps margin). The record is valid from now for
 * --validity seconds: issue it when the transaction is about to be originated.
 */
import { writeFileSync } from 'node:fs'
import { buildSelection, DEFAULT_VALIDITY_SECONDS } from '../src/lib/origination/selection.ts'

function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`)
  const value = index === -1 ? fallback : process.argv[index + 1]
  if (value === undefined || value.startsWith('--')) {
    console.error(`Missing --${name}`)
    process.exit(1)
  }
  return value
}

const out = arg('out', 'quote-record.json')
let selection
try {
  selection = buildSelection(
    {
      chainId: Number(arg('chain-id', '84532')),
      chainName: arg('chain-name', 'base-sepolia'),
      settlement: arg('settlement', '0x9645827808E25b4e19B1B8A05B075606dfF86331'),
      tokenAddress: arg('token', '0x036CbD53842c5426634e7929541eC2318f3dCF7e'),
      tokenSymbol: arg('token-symbol', 'USDC'),
      tokenDecimals: Number(arg('token-decimals', '6')),
      destination: arg('destination', 'momo:+243/vodacom/USD'),
      referenceRate: arg('rate', '1'),
      marginBps: Number(arg('margin-bps', '10')),
      minAmount: arg('min', '1'),
      maxAmount: arg('max', '1000'),
      validitySeconds: Number(arg('validity', String(DEFAULT_VALIDITY_SECONDS))),
      bridge: {
        address: arg('bridge'),
        momoEndpoint: arg('bridge-momo'),
        sequence: arg('bridge-sequence'),
        fingerprint: arg('bridge-fingerprint'),
      },
      relay: {
        address: arg('relay'),
        sequence: arg('relay-sequence'),
        fingerprint: arg('relay-fingerprint'),
      },
    },
    Math.floor(Date.now() / 1000),
  )
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : String(cause))
  process.exit(2)
}

writeFileSync(out, `${JSON.stringify(selection.record, null, 2)}\n`)
const expires = new Date(Number(selection.quote.expiresAt) * 1000).toISOString()
console.log(`Authorised Quote Record written to ${out}`)
console.log(`  quoteId  ${selection.record.quoteId}`)
console.log(
  `  pair     Bridge ${selection.record.bridge.address} / Relay ${selection.record.relay.address}`,
)
console.log(`  valid    until ${expires}`)
console.log('')
console.log(
  'Key-binding anchors for the Console deployment (Production environment, set by the administrator):',
)
console.log(`VITE_KEY_ANCHORS='${JSON.stringify(selection.anchors)}'`)
