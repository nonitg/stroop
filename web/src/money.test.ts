import { describe, expect, it } from 'vitest'
import { landlordPayout, offRampQuote, onRampQuote } from './money'

describe('add-money quotes', () => {
  it('converts once from a bank abroad, with the exchange fee on top', () => {
    const q = onRampQuote(1000, 'INR')
    expect(q.rate).toBeCloseTo(63.214, 3)
    expect(q.fee).toBeCloseTo(632.14)
    expect(q.pay).toBeCloseTo(63846.43)
  })

  it('charges no exchange from a Canadian bank', () => {
    expect(onRampQuote(1000, 'CAD')).toMatchObject({ pay: 1000, fee: 0 })
  })
})

describe('cash-out quotes', () => {
  it('charges a renter the exchange fee when sending money home', () => {
    const q = offRampQuote(100, 'INR')
    expect(q.fee).toBeCloseTo(63.21)
    expect(q.receive).toBeCloseTo(6258.21)
  })

  it('pays a landlord the full C$ rent: no exchange, Stroop pays the fee back', () => {
    const q = landlordPayout(1000)
    expect(q.fee).toBeCloseTo(5)
    expect(q.rebate).toBeCloseTo(5)
    expect(q.receive).toBeCloseTo(1000)
  })
})
