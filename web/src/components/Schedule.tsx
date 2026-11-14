import type { CSSProperties } from 'react'
import { Check, HandCoins, LockKeyhole, Undo2, type LucideIcon } from 'lucide-react'
import { type Lease, periodsDue, secsToNextRelease } from '../stellar'

export type MonthState = 'paid' | 'due' | 'locked' | 'refunded'

const STATES: Record<MonthState, { label: string; Icon: LucideIcon }> = {
  paid: { label: 'Paid', Icon: Check },
  due: { label: 'Due now', Icon: HandCoins },
  locked: { label: 'Locked', Icon: LockKeyhole },
  refunded: { label: 'Refunded', Icon: Undo2 },
}

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

/** One tile per month of rent. The next locked month slowly fills as its unlock time approaches. */
export function MonthTiles(props: { states: MonthState[]; next?: { index: number; progress: number } | null; shake?: boolean }) {
  const { states, next, shake } = props
  const cols = { '--cols': Math.min(states.length, 12), '--cols-sm': Math.min(states.length, 6) } as CSSProperties
  return (
    <ol className={`tiles${shake ? ' shake' : ''}`} style={cols} aria-label="Rent schedule by month">
      {states.map((s, i) => {
        const { label, Icon } = STATES[s]
        const filling = next?.index === i && s === 'locked'
        return (
          <li key={i} className={`tile ${s}`} style={{ '--i': i } as CSSProperties} title={`Month ${i + 1}: ${label}`}>
            {filling && <span className="tile-fill" style={{ transform: `scaleY(${next.progress})` }} aria-hidden />}
            <Icon className="tile-icon" size={15} strokeWidth={2.25} aria-hidden />
            <span className="tile-n num" aria-hidden>
              {i + 1}
            </span>
            <span className="sr-only">
              Month {i + 1}: {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function Schedule({ lease, now, shake }: { lease: Lease; now: number; shake?: boolean }) {
  const states = monthStates(lease, now)
  const present = (Object.keys(STATES) as MonthState[])
    .map((s) => ({ s, n: states.filter((x) => x === s).length }))
    .filter((x) => x.n > 0)
  return (
    <div className="schedule">
      <MonthTiles states={states} next={nextUnlock(lease, now)} shake={shake} />
      <ul className="legend" aria-label="Schedule key">
        {present.map(({ s, n }) => (
          <li key={s}>
            <span className={`swatch ${s}`} aria-hidden />
            {STATES[s].label} <span className="legend-n num">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
