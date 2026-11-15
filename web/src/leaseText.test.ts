import { describe, expect, it } from 'vitest'
import type { Lease } from './stellar'
import { headline } from './leaseText'
import { parseRoute } from './hooks'

const base: Lease = {
  id: 1,
  payer: 'GPAYER',
  landlord: 'GLANDLORD',
  mediator: 'GMED',
  rent: 1000_0000000n,
  periods: 12,
  periodSecs: 60,
  createdAt: 0,
  moveInBy: 1800,
  handedOverAt: 0,
  start: 0,
  paidPeriods: 0,
  held: 12000_0000000n,
  fee: 120_0000000n,
  landlordOwed: 0n,
  status: 'Funded',
  endProposedAt: 0,
}

describe('headline', () => {
  it('tells each side what a freshly locked lease needs', () => {
    expect(headline(base, 'family', 'GPAYER', 10)).toMatchObject({ title: 'Waiting for your landlord', mood: 'wait' })
    expect(headline(base, 'landlord', 'GLANDLORD', 10)).toMatchObject({ title: 'Rent is locked for you', mood: 'you' })
  })

  it('counts paid months and the next payout on an active lease', () => {
    const active: Lease = { ...base, status: 'Active', start: 100, paidPeriods: 2 }
    expect(headline(active, 'family', 'GPAYER', 130)).toEqual({ title: 'Month 2 of 12 paid', sub: 'Next rent pays in 0:30.', mood: 'good' })
  })
})

describe('parseRoute', () => {
  it('maps hashes to screens, including invite and legacy links', () => {
    expect(parseRoute('#/lease/7')).toEqual({ view: 'lease', id: 7 })
    expect(parseRoute('#/new/GABC')).toEqual({ view: 'new', to: 'GABC' })
    expect(parseRoute('#/landlord')).toEqual({ view: 'home', role: 'landlord' })
    expect(parseRoute('')).toEqual({ view: 'home' })
  })
})
