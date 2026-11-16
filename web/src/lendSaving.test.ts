import { describe, expect, it } from 'vitest'
import { lendSaving } from './stellar'

describe('lendSaving', () => {
  it('is the flat discount, capped at the fee', () => {
    // 0.5% of C$12,000 = C$60, so the full C$50 comes off.
    expect(lendSaving(1000, 12)).toBe(500_000_000n)
    // 0.5% of C$4,500 = C$22.50: lending makes the fee zero, not negative.
    expect(lendSaving(500, 9)).toBe(225_000_000n)
  })
})
