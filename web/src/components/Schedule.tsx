import type { CSSProperties } from 'react'
import { Check, HandCoins, LockKeyhole, Undo2, type LucideIcon } from 'lucide-react'
import { type Lease, periodsDue } from '../stellar'

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

/** One tile per month of rent; a row of 12 reads like a year of rent coupons. */
export function MonthTiles({ states }: { states: MonthState[] }) {
  const cols = { '--cols': Math.min(states.length, 12), '--cols-sm': Math.min(states.length, 6) } as CSSProperties
  return (
    <ol className="tiles" style={cols} aria-label="Rent schedule by month">
      {states.map((s, i) => {
        const { label, Icon } = STATES[s]
        return (
          <li key={i} className={`tile ${s}`} title={`Month ${i + 1}: ${label}`}>
            <Icon className="tile-icon" size={18} strokeWidth={2.25} aria-hidden />
            <span className="tile-n" aria-hidden>
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

export function Schedule({ lease, now }: { lease: Lease; now: number }) {
  const states = monthStates(lease, now)
  const count = (s: MonthState) => states.filter((x) => x === s).length
  return (
    <div className="schedule">
      <MonthTiles states={states} />
      <ul className="legend" aria-label="Schedule key">
        {(Object.keys(STATES) as MonthState[]).map((s) => (
          <li key={s}>
            <span className={`swatch ${s}`} aria-hidden />
            {STATES[s].label} <span className="legend-n">{count(s)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
