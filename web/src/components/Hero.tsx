import { type CSSProperties, useEffect, useState } from 'react'
import {
  ArrowRight,
  CalendarClock,
  Landmark,
  LockKeyhole,
  ShieldCheck,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '../stellar'
import { type Wallet, reducedMotion } from '../hooks'
import { AccountSetup } from './Account'
import { Money } from './Money'
import { type MonthState, MonthTiles } from './Schedule'

const COPY: Record<Role, { eyebrow: string; title: string; lede: string; pillars: [LucideIcon, string, string][] }> = {
  family: {
    eyebrow: 'For students & families',
    title: 'Proof of rent, not prepayment.',
    lede: "Show your landlord the rent is there, without handing it over. Paid monthly; whatever isn't owed yet stays yours.",
    pillars: [
      [LockKeyhole, 'Locked, not handed over', 'Rent sits in a smart contract with fixed rules.'],
      [ShieldCheck, 'Verified live', 'Your landlord checks it on Stellar, in one tap.'],
      [Undo2, 'Unused rent returns', 'Fake listing or early exit? It comes back.'],
    ],
  },
  landlord: {
    eyebrow: 'For landlords',
    title: 'See the rent before you hand over the keys.',
    lede: 'The whole lease is locked up front and released to you every month, on schedule.',
    pillars: [
      [ShieldCheck, 'Locked before you commit', 'The full lease is held before you accept.'],
      [CalendarClock, 'Paid on schedule', 'Each month unlocks on time, only to you.'],
      [Landmark, 'Cash out to CAD', 'Withdraw to your bank through a Stellar anchor.'],
    ],
  },
}

/** First-visit screen for a role: the promise, one button, and the reserve shown working. */
export function Hero({ role, wallet }: { role: Role; wallet: Wallet }) {
  const c = COPY[role]
  return (
    <div className="hero-wrap">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">{c.eyebrow}</p>
          <h1 id="hero-title" className="hero-title">
            {c.title}
          </h1>
          <p className="hero-lede">{c.lede}</p>
          <AccountSetup role={role} wallet={wallet} />
        </div>
        <ReserveVisual role={role} />
      </section>
      <ul className="pillars">
        {c.pillars.map(([Icon, title, body]) => (
          <li key={title}>
            <Icon size={18} aria-hidden />
            <div>
              <h2>{title}</h2>
              <p>{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

const MONTHS = 12
const RENT = 1000
const TICK_MS = 1600

/** A looping example lease: one month moves to the landlord per tick, the rest stays locked. */
function ReserveVisual({ role }: { role: Role }) {
  const still = reducedMotion()
  const [tick, setTick] = useState(still ? 3 : 0)
  useEffect(() => {
    if (still) return
    // Hold on the finished lease for a beat, then start over.
    const t = setInterval(() => setTick((n) => (n >= MONTHS + 2 ? 0 : n + 1)), TICK_MS)
    return () => clearInterval(t)
  }, [still])

  const paid = Math.min(tick, MONTHS)
  const states: MonthState[] = Array.from({ length: MONTHS }, (_, i) => (i < paid ? 'paid' : 'locked'))
  const family = role === 'family'
  return (
    <figure className="reserve-visual on-dark" aria-label="Example: a year of rent, released one month at a time">
      <div className="rv-head">
        <span className="rv-title">
          <ShieldCheck size={16} aria-hidden /> {family ? 'Rent reserve' : 'Incoming rent'}
        </span>
        <span className="rv-tag">Example</span>
      </div>
      <div className="rv-body" aria-hidden>
        <span className="rv-label">{family ? 'Locked' : 'Received'}</span>
        <p className="rv-amount">
          <Money units={(family ? MONTHS - paid : paid) * RENT} />
        </p>
        <div className="rv-tiles" style={{ '--fill-ms': `${TICK_MS}ms` } as CSSProperties}>
          <MonthTiles states={states} next={!still && paid < MONTHS ? { index: paid, progress: 1 } : null} />
        </div>
      </div>
      <div className="rv-flow" aria-hidden>
        <span className="rv-from">Reserve</span>
        <span className="rv-track">
          {paid > 0 && <span key={paid} className="rv-pulse" />}
        </span>
        <span className="rv-to">
          {family ? 'Landlord' : 'You'} <ArrowRight size={13} />
        </span>
        <span key={`amt-${paid}`} className="rv-delta num">
          {paid > 0 ? `+$${RENT.toLocaleString('en-US')} · month ${paid}` : 'Waiting for move-in'}
        </span>
      </div>
    </figure>
  )
}
