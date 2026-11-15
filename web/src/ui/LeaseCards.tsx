import { Check, ChevronRight, KeyRound, LockKeyhole, Pause, Undo2 } from 'lucide-react'
import { type Lease, type Role, fmtUSD } from '../stellar'
import { useNow } from '../hooks'
import { headline } from '../leaseText'
import { fmtMoney } from '../money'
import { Amount } from './Amount'
import { KeyRow, MoneyBar } from './MoneyBar'
import { Status } from './Status'
import { leaseSlices } from './leaseSlices'

/** The lease that matters most right now, big, on the home screen. Tapping opens it. */
export function LeaseHero({
  lease,
  role,
  me,
  home,
}: {
  lease: Lease
  role: Role
  me: string
  home?: { code: string; perUsd: number }
}) {
  const now = useNow()
  const h = headline(lease, role, me, now)
  const slices = leaseSlices(lease, role)
  const held = Number(lease.held) / 1e7
  return (
    <a className="hero-card glass syrup card" href={`#/lease/${lease.id}`}>
      <div className="head">
        <span className="label">{role === 'family' ? 'Locked for rent' : 'Locked for you'}</span>
        <span className="chip">Lease {lease.id}</span>
      </div>
      <Amount units={lease.held} />
      <span className="approx">
        {home && home.code !== 'USD' ? `≈ ${fmtMoney(held * home.perUsd, home.code)} · ` : ''}
        {fmtUSD(lease.rent)} a month
      </span>
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
  return (
    <a className="row" href={`#/lease/${lease.id}`}>
      <span className={`ico ${tone}`}>
        <Icon size={18} aria-hidden />
      </span>
      <span className="txt">
        <strong>{h.title}</strong>
        <span>
          Lease {lease.id} · {fmtUSD(lease.rent)}/mo
        </span>
      </span>
      <span className="end">
        {fmtUSD(lease.held)}
        <small>locked</small>
      </span>
      <ChevronRight className="chev" size={18} aria-hidden />
    </a>
  )
}

const LIVE = new Set(['Funded', 'Accepted', 'Active', 'Disputed'])

/** The lease to feature: the newest one still in play, else the newest. */
export const featured = (leases: Lease[]) => leases.find((l) => LIVE.has(l.status)) ?? leases[0]
