import { describe, expect, it } from 'vitest'
import type { Lease } from './stellar'
import { leaseNews } from './news'

const lease: Lease = {
  id: 3,
  payer: 'GPAYER',
  landlord: 'GLANDLORD',
  mediator: 'GMED',
  rent: 1000_0000000n,
  periods: 12,
  periodSecs: 60,
  createdAt: 0,
  moveInBy: 1800,
  handedOverAt: 0,
  start: 100,
  paidPeriods: 2,
  held: 10000_0000000n,
  fee: 60_0000000n,
  landlordOwed: 0n,
  status: 'Active',
  endProposedAt: 0,
  lend: false,
  lent: 0n,
  covered: 0n,
}

describe('leaseNews', () => {
  it('tells the landlord when rent arrives', () => {
    const before = { status: 'Active' as const, paidPeriods: 1, handedOverAt: 0, endProposedBy: undefined }
    expect(leaseNews(before, lease, 'landlord', 'GLANDLORD')).toMatchObject({ title: 'Rent arrived', href: '#/lease/3' })
  })
})
