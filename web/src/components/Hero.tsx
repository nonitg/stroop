import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { Role } from '../stellar'
import { type Wallet, reducedMotion } from '../hooks'
import { fmtMoney, offRampQuote } from '../money'
import { AccountSetup } from './Account'
import { Money } from './Money'
import { type MonthState, MonthBar } from './Schedule'

const COPY: Record<Role, { title: string; lede: string; fee: string; steps: [string, string][] }> = {
  family: {
    title: 'Proof of rent, not prepayment.',
    lede: 'Lock a year of rent where your landlord can see it, without handing it over. They’re paid one month at a time; what isn’t owed yet stays yours.',
    fee: 'Stroop charges 1% of the rent, only after you move in. Converting from your bank adds about 1% more, set by the on-ramp.',
    steps: [
      ['Lock the rent', 'Pay from your bank in your own currency. It’s converted to USDC and locked in a Stellar contract.'],
      ['Your landlord checks it', 'They open your proof link and see the money, live. No credit history needed.'],
      ['Paid monthly, refunded if fake', 'One month goes out each rent day. No keys by the deadline? Everything comes back.'],
    ],
  },
  landlord: {
    title: 'See the rent before you hand over the keys.',
    lede: 'The family locks the whole lease up front. You verify it live, then it’s paid to you every month, on schedule.',
    fee: 'No Stroop fee for landlords: the family pays it. Cashing out to your bank costs about 0.5%, set by the off-ramp.',
    steps: [
      ['See the rent first', 'Open the family’s proof link: the full lease is locked before you commit.'],
      ['Accept, hand over keys', 'Once the keys are handed over, the money can’t be taken back.'],
      ['Paid monthly, in CAD', 'Each month arrives on schedule. Cash out to your Canadian bank any time.'],
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
          <h1 id="hero-title" className="hero-title">
            {c.title}
          </h1>
          <p className="hero-lede">{c.lede}</p>
          <AccountSetup role={role} wallet={wallet} />
          <p className="hero-fee">
            {c.fee}{' '}
            <a className="text-link" href="#/how">
              See every fee <ArrowRight size={14} aria-hidden />
            </a>
          </p>
        </div>
        <ReserveVisual role={role} />
      </section>
      <ol className="steps">
        {c.steps.map(([title, body], i) => (
          <li key={title}>
            <span className="step-n">{i + 1}</span>
            <h2>{title}</h2>
            <p>{body}</p>
          </li>
        ))}
      </ol>
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
    <figure className="visual" aria-label="Example: a year of rent, paid one month at a time">
      <p className="visual-label">{family ? 'Example lease · still locked' : 'Example lease · paid to you'}</p>
      <p className="visual-amount" aria-hidden>
        <Money units={(family ? MONTHS - paid : paid) * RENT} />
      </p>
      <MonthBar states={states} next={!still && paid < MONTHS ? { index: paid, progress: 1 } : null} />
      <dl className="visual-rows num" aria-hidden>
        <div>
          <dt>Paid to landlord</dt>
          <dd>
            {paid} of {MONTHS} months
          </dd>
        </div>
        <div>
          <dt>Each month</dt>
          <dd>
            {fmtMoney(RENT, 'USD')} ≈ {fmtMoney(offRampQuote(RENT).receive, 'CAD')} in their bank
          </dd>
        </div>
      </dl>
    </figure>
  )
}
