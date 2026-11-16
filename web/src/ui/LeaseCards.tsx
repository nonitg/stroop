import { Check, ChevronRight, KeyRound, LockKeyhole, Pause, Undo2 } from 'lucide-react'
import { type Lease, type Role, fmtCAD } from '../stellar'
import { useNow } from '../hooks'
import { headline, isClosed, leaseFigure } from '../leaseText'
import { Amount } from './Amount'
import { KeyRow, MoneyBar } from './MoneyBar'
import { Status } from './Status'
import { leaseSlices } from './leaseSlices'

/** The lease that matters most right now, big, on the home screen. Tapping opens it. */
export function LeaseHero({
  lease,
  role,
  me,
}: {
  lease: Lease
  role: Role
  me: string
}) {
  const now = useNow()
  const h = headline(lease, role, me, now)
  const slices = leaseSlices(lease, role)
  const fig = leaseFigure(lease, role)
  return (
    <a className="hero-card glass syrup card" href={`#/lease/${lease.id}`}>
      <div className="head">
        <span className="label">{fig.label}</span>
        <span className="chip">Lease {lease.id}</span>
      </div>
      <Amount units={fig.units} />
      <span className="approx">{fig.sub ?? `${fmtCAD(lease.rent)} a month`}</span>
      <MoneyBar slices={slices} thin />
      <KeyRow slices={slices} />
      <div className="hero-foot">
        <Status {...h} />
        <ChevronRight className="chev" size={20} aria-hidden />
      </div>
    </a>
  )
}

const ICON = {
  Funded: LockKeyhole,
  Accepted: KeyRound,
  Active: LockKeyhole,
  Completed: Check,
  Ended: Undo2,
  Refunded: Undo2,
  Disputed: Pause,
}

/** A lease as one list row: who, what state, how much is still locked. */
export function LeaseRow({ lease, role, me }: { lease: Lease; role: Role; me: string }) {
  const now = useNow(5000)
  const h = headline(lease, role, me, now)
  const Icon = ICON[lease.status] ?? LockKeyhole
  const tone = h.mood === 'you' ? 'locked' : h.mood === 'good' ? 'good' : h.mood === 'stop' ? 'stop' : ''
  const fig = leaseFigure(lease, role)
  return (
    <a className="row" href={`#/lease/${lease.id}`}>
      <span className={`ico ${tone}`}>
        <Icon size={18} aria-hidden />
      </span>
      <span className="txt">
        <strong>{h.title}</strong>
        <span>
          Lease {lease.id} · {fmtCAD(lease.rent)}/mo
        </span>
      </span>
      <span className="end">
        {fmtCAD(fig.units)}
        <small>{isClosed(lease) ? 'paid' : 'locked'}</small>
      </span>
      <ChevronRight className="chev" size={18} aria-hidden />
    </a>
  )
}

const LIVE = new Set(['Funded', 'Accepted', 'Active', 'Disputed'])

/** The lease to feature: the newest one still in play, else the newest. */
export const featured = (leases: Lease[]) => leases.find((l) => LIVE.has(l.status)) ?? leases[0]
