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

export function statusBadge(l: Lease, now: number): { label: string; tone: Tone } {
  switch (l.status) {
    case 'Funded':
      return { label: 'Waiting for landlord', tone: 'waiting' }
    case 'Accepted':
      if (startsOnRelease(l, now)) return { label: 'Ready to start', tone: 'waiting' }
      if (l.handedOverAt > 0) return { label: 'Keys handed over', tone: 'waiting' }
      return { label: 'Waiting for move-in', tone: 'waiting' }
    case 'Active':
      return { label: `Active, month ${l.paidPeriods} of ${l.periods}`, tone: 'active' }
    case 'Completed':
      return { label: 'Fully paid', tone: 'done' }
    case 'Ended':
      return { label: 'Ended early', tone: 'returned' }
    case 'Refunded':
      return { label: 'Refunded in full', tone: 'returned' }
    case 'Disputed':
      return { label: 'Disputed, payouts paused', tone: 'paused' }
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
      return `You proposed ending the lease early. Waiting for the other side to agree; the proposal lapses in ${left}.`
    return `${family ? 'Your landlord' : 'The family'} proposed ending the lease early. If you agree within ${left}, rent owed so far goes to the landlord and the rest goes back to the family.`
  }

  switch (l.status) {
    case 'Funded':
      return family
        ? 'Send your landlord the proof link below. Until they accept, you can cancel and get everything back, fee included.'
        : `The rent is locked. Accept to commit to this lease; the student then has until ${fmtDate(l.moveInBy)} to confirm move-in.`
    case 'Accepted': {
      const deadlinePassed = now > l.moveInBy
      if (startsOnRelease(l, now))
        return family
          ? 'The dispute window passed, so the lease starts from when the keys were handed over. Month 1 goes to your landlord at the next payout.'
          : 'The dispute window passed quietly. Start the lease to collect rent from the day you handed over the keys.'
      if (l.handedOverAt > 0)
        return family
          ? "Your landlord says the keys are handed over. Confirm move-in if you have them. If something's wrong, raise a dispute before the window closes; otherwise the lease starts on its own."
          : "Keys marked as handed over. The student can confirm move-in or raise a dispute until the window closes. If they do neither, you can start the lease."
      if (deadlinePassed)
        return family
          ? 'The move-in deadline passed without the keys being handed over. You can take everything back, fee included.'
          : 'The move-in deadline passed without a handover, so the family can take the reserve back.'
      return family
        ? `Your landlord accepted. Once you have the keys, confirm move-in: month 1 and the ${fee} service fee are paid and the schedule starts. No keys by ${fmtDate(l.moveInBy)}? You can take everything back.`
        : `Waiting for the student to confirm move-in. Once you've handed over the keys, mark it here: the reserve can no longer be taken back, and if the student doesn't respond within ${fmtDuration(disputeWindowSecs(l))} the lease starts on its own.`
    }
    case 'Active':
      return family
        ? "Rent goes to your landlord one month at a time. What isn't owed yet stays locked."
        : 'Rent unlocks for you every month, on schedule. Nobody can pay it out early, including you.'
    case 'Disputed':
      return '' // shown as a callout (DISPUTE_NOTE) instead
    case 'Completed':
      return 'Every month has been paid to the landlord.'
    case 'Ended':
      return 'This lease has ended. Rent owed went to the landlord and the rest went back to the family.'
    case 'Refunded':
      return 'The full amount, fee included, went back to the family.'
    default:
      return ''
  }
}
