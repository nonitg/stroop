import { describe, expect, it } from 'vitest'
import { landlordPayout, offRampQuote } from './money'

describe('cash-out quotes', () => {
  it('charges a renter the partner fee when sending money home', () => {
    const q = offRampQuote(100, 'INR')
    expect(q.fee).toBeCloseTo(44.25)
    expect(q.receive).toBeCloseTo(8805.75)
  })

  it('pays a landlord the full C$ amount: Stroop pays the fee back', () => {
    const q = landlordPayout(1000)
    expect(q.fee).toBeCloseTo(7)
    expect(q.rebate).toBeCloseTo(7)
    expect(q.receive).toBeCloseTo(1400)
  })
})
