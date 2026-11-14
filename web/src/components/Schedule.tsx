import type { CSSProperties } from 'react'
import { type Lease, periodsDue, secsToNextRelease } from '../stellar'
import { fmtClock } from '../leaseText'

export type MonthState = 'paid' | 'due' | 'locked' | 'refunded'

const LABELS: Record<MonthState, string> = { paid: 'paid', due: 'due now', locked: 'locked', refunded: 'returned' }

export function monthStates(lease: Lease, now: number): MonthState[] {
  const dueTotal = lease.paidPeriods + periodsDue(lease, now)
  return Array.from({ length: lease.periods }, (_, i) =>
    i < lease.paidPeriods ? 'paid' : i < dueTotal ? 'due' : lease.held === 0n ? 'refunded' : 'locked',
  )
}

/** The month that unlocks next and how far through the wait we are (0–1). */
export function nextUnlock(lease: Lease, now: number): { index: number; progress: number } | null {
  const secs = secsToNextRelease(lease, now)
  if (secs === null) return null
  return { index: lease.paidPeriods + periodsDue(lease, now), progress: 1 - secs / lease.periodSecs }
}

/** One segment per month of rent. The next locked month fills as its unlock time approaches. */
export function MonthBar(props: { states: MonthState[]; next?: { index: number; progress: number } | null; shake?: boolean }) {
  const { states, next, shake } = props
  return (
    <ol className={`bar${shake ? ' shake' : ''}`} aria-label="Rent schedule by month">
      {states.map((s, i) => (
        <li key={i} className={`seg ${s}`} style={{ '--i': i } as CSSProperties} title={`Month ${i + 1}: ${LABELS[s]}`}>
          {next?.index === i && s === 'locked' && (
            <span className="seg-fill" style={{ transform: `scaleX(${next.progress})` }} aria-hidden />
          )}
          <span className="sr-only">
            Month {i + 1}: {LABELS[s]}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** The month bar plus a one-line count of where the months are and when the next one pays. */
export function Schedule({ lease, now, shake }: { lease: Lease; now: number; shake?: boolean }) {
  const states = monthStates(lease, now)
  const counts = (['paid', 'due', 'locked', 'refunded'] as MonthState[])
    .map((s) => ({ s, n: states.filter((x) => x === s).length }))
    .filter((x) => x.n > 0)
  const secs = secsToNextRelease(lease, now)
  const preStart = lease.status === 'Funded' || lease.status === 'Accepted'
  return (
    <div className="schedule">
      <MonthBar states={states} next={nextUnlock(lease, now)} shake={shake} />
      <div className="schedule-meta num">
        <ul className="key" aria-label="Months">
          {counts.map(({ s, n }) => (
            <li key={s}>
              <span className={`dot ${s}`} aria-hidden />
              {n} {LABELS[s]}
            </li>
          ))}
        </ul>
        {secs !== null && (
          <span>
            Next month pays in <strong className="clock">{fmtClock(secs)}</strong>
          </span>
        )}
        {preStart && <span>Month 1 pays at move-in</span>}
      </div>
    </div>
  )
}
