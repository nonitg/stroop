import { type Lease, type Role, fmtUSD, fromUnits } from '../stellar'
import { moneyTrail } from '../leaseText'
import type { Slice } from './MoneyBar'

/** Where a lease's money is right now, as bar slices, from this person's side. */
export function leaseSlices(l: Lease, role: Role): Slice[] {
  const t = moneyTrail(l)
  const family = role === 'family'
  const slices: Slice[] = [
    { tone: 'paid', value: fromUnits(t.paid), label: family ? 'Paid to landlord' : 'Paid to you', amount: fmtUSD(t.paid) },
    {
      tone: 'locked',
      value: fromUnits(t.locked),
      label: 'Locked',
      who: 'Released one month at a time',
      amount: fmtUSD(t.locked),
    },
    { tone: 'back', value: fromUnits(t.returned), label: family ? 'Back to you' : 'Back to family', amount: fmtUSD(t.returned) },
  ]
  if (family) {
    const fee = t.feeCharged + t.feeHeld
    slices.push({
      tone: 'fee',
      value: fromUnits(fee),
      label: 'Stroop fee',
      who: t.feeCharged > 0n ? 'Taken at move-in' : 'Held. Refunded if no move-in',
      amount: fmtUSD(fee),
    })
  }
  return slices
}
