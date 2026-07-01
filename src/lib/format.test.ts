import { describe, expect, it } from 'vitest'
import { formatAmount, formatCountdown, shortAddress } from './format'

describe('format helpers', () => {
  it('shortens addresses', () => {
    expect(shortAddress('0x9645827808E25b4e19B1B8A05B075606dfF86331')).toBe('0x9645…6331')
    expect(shortAddress(undefined)).toBe('—')
  })

  it('formats USDC base units to human amount', () => {
    expect(formatAmount(1_500_000n, 6, 'USDC')).toBe('1.5 USDC')
    expect(formatAmount(0n, 6)).toBe('0')
  })

  it('formats a countdown and clamps at zero', () => {
    expect(formatCountdown(3661)).toBe('1h 01m 01s')
    expect(formatCountdown(59)).toBe('0m 59s')
    expect(formatCountdown(-10)).toBe('0m 00s')
  })
})
