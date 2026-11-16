// Plain-language copy for lease states, shared by the dashboards and the public proof page.
import {
  type Lease,
  type Role,
  disputeWindowSecs,
  leaseFee,
  fmtCAD,
  proposalOpen,
  proposalWindowSecs,
  periodsDue,
  secsToNextRelease,
  startsOnRelease,
} from './stellar'

export const fmtDate = (secs: number) =>
  new Date(secs * 1000).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export const fmtClock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`

/** "1 minute", "3 days": contract windows in words. */
export function fmtDuration(secs: number) {
  const [n, unit] = secs % 86400 === 0 ? [secs / 86400, 'day'] : secs % 3600 === 0 ? [secs / 3600, 'hour'] : [Math.round(secs / 60), 'minute']
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

/** Keys handed over and the student can still confirm or dispute. */
export const inDisputeWindow = (l: Lease, now: number) =>
  l.status === 'Accepted' && l.handedOverAt > 0 && !startsOnRelease(l, now)

/** The fee is a fixed share of the rent; the contract pays it out at move-in or refunds it. */
export function feeLine(l: Lease): { amount: string; state: string } {
  const amount = fmtCAD(leaseFee(l))
  if (l.start > 0) return { amount, state: 'paid at move-in' }
  if (l.status === 'Refunded' || l.status === 'Ended') return { amount, state: 'refunded' }
  return { amount, state: 'held until move-in' }
}

/** Where every unit of a lease's money is right now. */
export function moneyTrail(l: Lease) {
  const rentTotal = l.rent * BigInt(l.periods)
  const fee = leaseFee(l)
  const feeCharged = l.start > 0 ? fee : 0n
  const feeHeld = l.start === 0 && l.status !== 'Refunded' && l.status !== 'Ended' ? fee : 0n
  const putIn = rentTotal + fee
  const paid = l.rent * BigInt(l.paidPeriods)
  const locked = l.held
  // Lent rent is still the lease's money; it's just out earning for Stroop until it's needed.
  const lent = l.lent
  // Whatever isn't paid out, charged, held as fee or still locked went back to the family.
  const returned = putIn - paid - feeCharged - feeHeld - locked
  return { rentTotal, fee, feeCharged, feeHeld, putIn, paid, locked, lent, returned: returned > 0n ? returned : 0n }
}

/** A lease that can no longer move money: everything is either paid out or back with the family. */
export const isClosed = (l: Lease) => l.status === 'Completed' || l.status === 'Ended' || l.status === 'Refunded'

/**
 * The big number at the top of a lease, the same on every screen. While a lease is open it's what's
 * still locked; once it closes, it's what the landlord was paid, with what went back to the family.
 */
export function leaseFigure(l: Lease, viewer: Role | 'public'): { label: string; units: bigint; sub?: string } {
  const t = moneyTrail(l)
  const family = viewer === 'family'
  if (!isClosed(l))
    return {
      label: family ? 'Locked' : viewer === 'landlord' ? 'Locked for you' : 'Locked for the landlord',
      units: l.held,
    }
  return {
    label: family ? 'Paid to your landlord' : viewer === 'landlord' ? 'Paid to you' : 'Paid to the landlord',
    units: t.paid,
    sub: t.returned > 0n ? `${fmtCAD(t.returned)} ${family ? 'came back to you' : 'went back to the family'}` : undefined,
  }
}

/** The right-hand line under the month tiles. */
export function monthsLeftText(l: Lease) {
  const left = l.periods - l.paidPeriods
  if (l.status === 'Funded' || l.status === 'Accepted') return 'Month 1 pays at move-in'
  if (l.status === 'Completed') return 'All paid'
  if (isClosed(l)) return left > 0 ? `${left} returned` : 'All paid'
  return `${left} to go`
}

export type Mood = 'you' | 'wait' | 'good' | 'stop'

/** The one line at the top of a lease: what's happening, and (if anything) what's on you. */
export function headline(l: Lease, role: Role, me: string, now: number): { title: string; sub?: string; mood: Mood } {
  const family = role === 'family'
  const other = family ? 'Your landlord' : 'Your tenant'
  const clock = (secs: number) => fmtClock(Math.max(0, Math.ceil(secs)))

  if (l.status === 'Active' && proposalOpen(l, now)) {
    const left = clock(l.endProposedAt + proposalWindowSecs(l) - now)
    return l.endProposedBy === me
      ? {
          title: `Waiting for ${family ? 'your landlord' : 'your tenant'} to agree`,
          sub: `Your request to end early lapses in ${left}.`,
          mood: 'wait',
        }
      : { title: `${other} wants to end early`, sub: `Agree within ${left}, or the lease simply continues.`, mood: 'you' }
  }

  switch (l.status) {
    case 'Funded':
      return family
        ? { title: 'Waiting for your landlord', sub: 'Send them the proof link.', mood: 'wait' }
        : { title: 'Rent is locked for you', sub: 'Accept to commit to this lease.', mood: 'you' }
    case 'Accepted': {
      if (startsOnRelease(l, now))
        return family
          ? { title: 'Your lease is starting', sub: 'Month 1 pays out next.', mood: 'good' }
          : { title: 'Ready to start', sub: 'No problems were reported.', mood: 'you' }
      if (l.handedOverAt > 0) {
        const left = clock(l.handedOverAt + disputeWindowSecs(l) - now)
        return family
          ? { title: 'Keys handed over?', sub: `Confirm, or report a problem within ${left}.`, mood: 'you' }
          : { title: 'Waiting for your tenant', sub: `Starts by itself in ${left} unless they report a problem.`, mood: 'wait' }
      }
      if (now > l.moveInBy)
        return family
          ? { title: 'No keys by the deadline', sub: 'Take everything back, fee included.', mood: 'you' }
          : { title: 'Move-in deadline passed', sub: 'Your tenant can take the rent back.', mood: 'stop' }
      return family
        ? { title: 'Accepted. Move in when ready', sub: `No keys by ${fmtDate(l.moveInBy)}? It all comes back.`, mood: 'you' }
        : { title: 'Hand over the keys', sub: 'Then mark it here.', mood: 'you' }
    }
    case 'Active': {
      const secs = secsToNextRelease(l, now)
      const due = periodsDue(l, now)
      if (due > 0)
        return family
          ? {
              title: `Month ${l.paidPeriods} of ${l.periods} paid`,
              sub: `Month ${l.paidPeriods + 1} is on its way to your landlord.`,
              mood: 'good',
            }
          : {
              title: `${fmtCAD(l.rent * BigInt(due))} ready to collect`,
              sub: `Month ${l.paidPeriods} of ${l.periods} paid so far.`,
              mood: 'you',
            }
      return {
        title: `Month ${l.paidPeriods} of ${l.periods} paid`,
        sub: secs === null ? 'The last month is paid out.' : `Next rent ${family ? 'pays' : 'unlocks'} in ${clock(secs)}.`,
        mood: 'good',
      }
    }
    case 'Disputed':
      return { title: 'Paused for mediation', sub: 'The mediator will split the locked rent.', mood: 'stop' }
    case 'Completed':
      return { title: 'Fully paid', sub: `All ${l.periods} months went to ${family ? 'your landlord' : 'you'}.`, mood: 'good' }
    case 'Ended':
      return { title: 'Ended early', sub: family ? 'Unused rent came back to you.' : 'Rent owed was paid to you.', mood: 'wait' }
    case 'Refunded':
      return {
        title: 'Refunded',
        sub: family ? 'Everything came back to you.' : 'The rent went back to the family.',
        mood: 'wait',
      }
    default:
      return { title: String(l.status), mood: 'wait' }
  }
}
