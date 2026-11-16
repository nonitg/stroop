import { CASH_MONTHS, type Lease, type Role, fmtCAD, fromUnits } from '../stellar'
import { moneyTrail } from '../leaseText'
import type { Slice } from './MoneyBar'

/** Where a lease's money is right now, as bar slices, from this person's side. */
export function leaseSlices(l: Lease, role: Role): Slice[] {
  const t = moneyTrail(l)
  const family = role === 'family'
  const slices: Slice[] = [
    { tone: 'paid', value: fromUnits(t.paid), label: family ? 'Paid to landlord' : 'Paid to you', amount: fmtCAD(t.paid) },
    {
      tone: 'locked',
      value: fromUnits(t.locked - t.lent),
      label: t.lent > 0n ? 'Locked, ready' : 'Locked',
      who: t.lent > 0n ? `Next ${CASH_MONTHS} months` : 'Paid out monthly',
      amount: fmtCAD(t.locked - t.lent),
    },
    {
      tone: 'lent',
      value: fromUnits(t.lent),
      label: 'Locked, lent out',
      who: 'Back before it’s due. Losses paid by Stroop’s fund',
      amount: fmtCAD(t.lent),
    },
    { tone: 'back', value: fromUnits(t.returned), label: family ? 'Back to you' : 'Back to family', amount: fmtCAD(t.returned) },
  ]
  if (family) {
    const fee = t.feeCharged + t.feeHeld
    slices.push({
      tone: 'fee',
      value: fromUnits(fee),
      label: 'Stroop fee',
      who: t.feeCharged > 0n ? 'Taken at move-in' : 'Held. Refunded if no move-in',
      amount: fmtCAD(fee),
    })
  }
  return slices
}
