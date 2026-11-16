import { describe, expect, it } from 'vitest'
import { lendSaving } from './stellar'

describe('lendSaving', () => {
  it('is the flat discount, capped at the fee', () => {
    // 0.5% of US$12,000 = US$60, so the full US$50 comes off.
    expect(lendSaving(1000, 12)).toBe(500_000_000n)
    // 0.5% of US$4,500 = US$22.50: lending makes the fee zero, not negative.
    expect(lendSaving(500, 9)).toBe(225_000_000n)
  })
})
