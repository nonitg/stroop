// Plain-language copy for lease states, shared by the dashboards and the public proof page.
import {
  CONTRACTS,
  type Lease,
  type Role,
  disputeWindowSecs,
  feeFor,
  fmtUSD,
  proposalOpen,
  proposalWindowSecs,
  startsOnRelease,
} from './stellar'

export type Tone = 'waiting' | 'active' | 'done' | 'returned' | 'paused'

export const fmtDate = (secs: number) =>
  new Date(secs * 1000).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export const fmtClock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`

/** "1 minute", "3 days": contract windows in words. */
export function fmtDuration(secs: number) {
  const [n, unit] = secs % 86400 === 0 ? [secs / 86400, 'day'] : secs % 3600 === 0 ? [secs / 3600, 'hour'] : [Math.round(secs / 60), 'minute']
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

export const FEE_PCT = `${CONTRACTS.feeBps / 100}%`

/** Keys handed over and the student can still confirm or dispute. */
export const inDisputeWindow = (l: Lease, now: number) =>
  l.status === 'Accepted' && l.handedOverAt > 0 && !startsOnRelease(l, now)

export const disputeWindowLeft = (l: Lease, now: number) =>
  Math.max(0, Math.ceil(l.handedOverAt + disputeWindowSecs(l) - now))

/** The fee is a fixed share of the rent; the contract pays it out at move-in or refunds it. */
export function feeLine(l: Lease): { amount: string; state: string } {
  const amount = fmtUSD(feeFor(l.rent * BigInt(l.periods)))
  if (l.start > 0) return { amount, state: 'paid at move-in' }
  if (l.status === 'Refunded' || l.status === 'Ended') return { amount, state: 'refunded' }
  return { amount, state: 'held until move-in' }
}

/** Where every unit of a lease's money is right now. */
export function moneyTrail(l: Lease) {
  const rentTotal = l.rent * BigInt(l.periods)
  const fee = feeFor(rentTotal)
  const feeCharged = l.start > 0 ? fee : 0n
  const feeHeld = l.start === 0 && l.status !== 'Refunded' && l.status !== 'Ended' ? fee : 0n
  const putIn = rentTotal + fee
  const paid = l.rent * BigInt(l.paidPeriods)
  const locked = l.held + feeHeld
  // Whatever isn't paid out, charged or still locked went back to the family.
  const returned = putIn - paid - feeCharged - locked
  return { rentTotal, fee, feeCharged, feeHeld, putIn, paid, locked, returned: returned > 0n ? returned : 0n }
}

export function statusBadge(l: Lease, now: number): { label: string; tone: Tone } {
  switch (l.status) {
    case 'Funded':
      return { label: 'Waiting for landlord', tone: 'waiting' }
    case 'Accepted':
      if (startsOnRelease(l, now)) return { label: 'Ready to start', tone: 'waiting' }
      if (l.handedOverAt > 0) return { label: 'Keys handed over', tone: 'waiting' }
      return { label: 'Waiting for move-in', tone: 'waiting' }
    case 'Active':
      return { label: `Active · month ${l.paidPeriods} of ${l.periods}`, tone: 'active' }
    case 'Completed':
      return { label: 'Fully paid', tone: 'done' }
    case 'Ended':
      return { label: 'Ended early', tone: 'returned' }
    case 'Refunded':
      return { label: 'Refunded in full', tone: 'returned' }
    case 'Disputed':
      return { label: 'Paused · disputed', tone: 'paused' }
    default:
      // Statuses added to the contract later still get a readable badge.
      return { label: String(l.status), tone: 'waiting' }
  }
}

export const DISPUTE_NOTE = {
  title: 'Payouts paused',
  body: 'The mediator named on this lease will split the locked rent between both sides.',
}

/** One sentence telling this person what happens next on the lease. */
export function nextStep(l: Lease, role: Role, me: string, now: number): string {
  const family = role === 'family'
  const fee = feeLine(l).amount

  if (l.status === 'Active' && proposalOpen(l, now)) {
    const left = fmtClock(Math.max(0, Math.ceil(l.endProposedAt + proposalWindowSecs(l) - now)))
    if (l.endProposedBy === me)
      return `You proposed ending early. Waiting for the other side; lapses in ${left}.`
    return `${family ? 'Your landlord' : 'The family'} proposed ending early. Agree within ${left}: rent owed goes to the landlord, the rest back to the family.`
  }

  switch (l.status) {
    case 'Funded':
      return family
        ? 'Send your landlord the proof link. Until they accept, you can cancel for a full refund.'
        : `The rent is locked. Accept to commit; the student then has until ${fmtDate(l.moveInBy)} to move in.`
    case 'Accepted': {
      const deadlinePassed = now > l.moveInBy
      if (startsOnRelease(l, now))
        return family
          ? 'The dispute window passed. The lease starts from the handover; month 1 goes out at the next payout.'
          : 'The dispute window passed quietly. Start the lease to collect rent from the handover.'
      if (l.handedOverAt > 0)
        return family
          ? "Your landlord says the keys are handed over. Confirm move-in, or raise a dispute before the window closes."
          : 'Keys handed over. If the student neither confirms nor disputes before the window closes, you can start the lease.'
      if (deadlinePassed)
        return family
          ? 'No handover by the deadline. You can take everything back, fee included.'
          : 'The move-in deadline passed without a handover. The family can take the reserve back.'
      return family
        ? `Accepted. Once you have the keys, confirm move-in: month 1 and the ${fee} fee are paid. No keys by ${fmtDate(l.moveInBy)}? Take everything back.`
        : `Hand over the keys, then mark it here. The reserve can no longer be taken back, and after ${fmtDuration(disputeWindowSecs(l))} of silence the lease starts.`
    }
    case 'Active':
      return family
        ? "Paid monthly. What isn't owed yet stays locked."
        : 'Rent unlocks monthly, on schedule. Nobody can pay it out early, including you.'
    case 'Disputed':
      return '' // shown as a callout (DISPUTE_NOTE) instead
    case 'Completed':
      return 'Every month has been paid to the landlord.'
    case 'Ended':
      return 'Ended. Rent owed went to the landlord; the rest went back to the family.'
    case 'Refunded':
      return 'The full amount, fee included, went back to the family.'
    default:
      return ''
  }
}
