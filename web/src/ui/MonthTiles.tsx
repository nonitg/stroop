import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { type Lease, periodsDue, secsToNextRelease } from '../stellar'

type MonthState = 'paid' | 'due' | 'locked' | 'refunded'
const SAY: Record<MonthState, string> = { paid: 'paid', due: 'ready to collect', locked: 'locked', refunded: 'returned' }

function monthStates(l: Lease, now: number): MonthState[] {
  const dueTotal = l.paidPeriods + periodsDue(l, now)
  return Array.from({ length: l.periods }, (_, i) =>
    i < l.paidPeriods ? 'paid' : i < dueTotal ? 'due' : l.held === 0n ? 'refunded' : 'locked',
  )
}

/** One tile per month of rent. The next locked month fills as its unlock time nears. */
export function MonthTiles({ lease, now, shake }: { lease: Lease; now: number; shake?: boolean }) {
  const states = monthStates(lease, now)
  const secs = secsToNextRelease(lease, now)
  const nextIdx = secs === null ? -1 : lease.paidPeriods + periodsDue(lease, now)
  const progress = secs === null ? 0 : 1 - secs / lease.periodSecs
  return (
    <ol className={`tiles${shake ? ' shake' : ''}`} aria-label="Rent by month">
      {states.map((s, i) => (
        <li key={i} className={s} style={{ '--i': i } as CSSProperties}>
          {i === nextIdx && s === 'locked' && <span className="fill" style={{ transform: `scaleX(${progress})` }} />}
          {s === 'paid' && <Check size={12} strokeWidth={3} aria-hidden />}
          <span className="sr-only">
            Month {i + 1}: {SAY[s]}
          </span>
        </li>
      ))}
    </ol>
  )
}
