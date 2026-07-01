import { formatUnits } from 'viem'

/** Shorten an address for display: 0x1234…abcd. */
export function shortAddress(addr?: string, lead = 6, tail = 4): string {
  if (!addr) return '—'
  if (addr.length <= lead + tail) return addr
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`
}

/** Human-readable token amount from a base-unit bigint. */
export function formatAmount(value: bigint, decimals: number, symbol?: string): string {
  const n = formatUnits(value, decimals)
  return symbol ? `${n} ${symbol}` : n
}

/** Format a unix-second bigint/number as an ISO-ish UTC string. */
export function formatTimestamp(seconds: bigint | number): string {
  const ms = Number(seconds) * 1000
  if (!Number.isFinite(ms) || ms === 0) return '—'
  return new Date(ms).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}

/** Format a remaining-seconds count as Hh Mm Ss, clamped at zero. */
export function formatCountdown(remainingSeconds: number): string {
  const s = Math.max(0, Math.floor(remainingSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}h ${pad(m)}m ${pad(sec)}s` : `${m}m ${pad(sec)}s`
}
