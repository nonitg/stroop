// Plain-language copy for lease states, shared by the dashboards and the public proof page.
import type { Lease, Role } from './stellar'

export type Tone = 'waiting' | 'active' | 'done' | 'returned'

export function statusBadge(l: Lease): { label: string; tone: Tone } {
  switch (l.status) {
    case 'Funded':
      return { label: 'Waiting for landlord', tone: 'waiting' }
    case 'Accepted':
      return { label: 'Waiting for move-in', tone: 'waiting' }
    case 'Active':
      return { label: `Active, month ${l.paidPeriods} of ${l.periods}`, tone: 'active' }
    case 'Completed':
      return { label: 'Fully paid', tone: 'done' }
    case 'Ended':
      return { label: 'Ended early', tone: 'returned' }
    case 'Refunded':
      return { label: 'Refunded in full', tone: 'returned' }
  }
}

export const fmtDate = (secs: number) =>
  new Date(secs * 1000).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export const fmtClock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`

/** One sentence telling this person what happens next on the lease. */
export function nextStep(l: Lease, role: Role, me: string): string {
  const other = role === 'family' ? 'Your landlord' : 'The family'
  if (l.endProposedBy === me) return 'You proposed ending the lease early. Waiting for the other side to agree.'
  if (l.endProposedBy)
    return `${other} proposed ending the lease early. If you agree, rent owed so far goes to the landlord and the rest goes back to the family.`
  const family = role === 'family'
  switch (l.status) {
    case 'Funded':
      return family
        ? 'Send your landlord the proof link below. Until they accept, you can cancel and get everything back.'
        : `The rent is locked. Accept to commit to this lease; the student then has until ${fmtDate(l.moveInBy)} to confirm move-in.`
    case 'Accepted':
      return family
        ? `Your landlord accepted. Once you have the keys, confirm move-in: month 1 is paid and the schedule starts. No keys by ${fmtDate(l.moveInBy)}? You can take everything back.`
        : 'Waiting for the student to confirm move-in. Month 1 is paid to you the moment they do.'
    case 'Active':
      return family
        ? "Rent goes to your landlord one month at a time. What isn't owed yet stays locked."
        : 'Rent unlocks for you every month, on schedule. Nobody can pay it out early, including you.'
    case 'Completed':
      return 'Every month has been paid to the landlord.'
    case 'Ended':
      return 'Ended early by agreement. Rent owed went to the landlord; the rest went back to the family.'
    case 'Refunded':
      return 'The full amount went back to the family.'
  }
}
