import { type FormEvent, useEffect, useState } from 'react'
import {
  ArrowRight,
  CalendarClock,
  CircleAlert,
  CirclePause,
  Handshake,
  LockKeyhole,
  Scale,
  ShieldCheck,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { CONTRACTS, type Lease, explainError, explorer, getLease, short } from '../stellar'
import { useNow } from '../hooks'
import { DISPUTE_NOTE, FEE_PCT, feeLine, fmtDate } from '../leaseText'
import { ExplorerLink } from './ExplorerLink'
import { Money } from './Money'
import { Note } from './Note'
import { Schedule } from './Schedule'
import { StatusBadge } from './StatusBadge'

const REFRESH_MS = 8000

export function VerifyView({ id }: { id?: number }) {
  if (id === undefined || Number.isNaN(id)) return <LeaseLookup />
  return <LeaseProof id={id} />
}

function LeaseLookup() {
  const [input, setInput] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (input.trim()) window.location.hash = `#/lease/${input.trim()}`
  }
  return (
    <section className="lookup" aria-labelledby="lookup-title">
      <span className="seal lg" aria-hidden>
        <ShieldCheck size={26} />
      </span>
      <h1 id="lookup-title">Verify a rent reserve</h1>
      <p className="lede">Enter the lease number from the tenant's link. You'll see the locked rent and its rules, live from Stellar.</p>
      <form className="lookup-form" onSubmit={submit}>
        <label htmlFor="lease-number" className="sr-only">
          Lease number
        </label>
        <div className="lookup-field">
          <span aria-hidden>#</span>
          <input
            id="lease-number"
            inputMode="numeric"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/\D/g, ''))}
            placeholder="Lease number"
          />
          <button className="btn primary" type="submit" disabled={!input.trim()}>
            Verify <ArrowRight className="nudge" size={17} aria-hidden />
          </button>
        </div>
      </form>
    </section>
  )
}

function useLease(id: number) {
  const [lease, setLease] = useState<Lease | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkedAt, setCheckedAt] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    const load = () =>
      getLease(id)
        .then((l) => {
          if (!live) return
          setLease(l)
          setError(null)
          setCheckedAt(Date.now())
        })
        .catch((e) => live && setError(explainError(e)))
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [id])
  return { lease, error, checkedAt }
}

function LeaseProof({ id }: { id: number }) {
  const { lease, error, checkedAt } = useLease(id)
  const now = useNow()

  if (error && !lease)
    return (
      <section className="lookup" role="alert">
        <span className="seal lg error" aria-hidden>
          <CircleAlert size={26} />
        </span>
        <h1>Lease {id} wasn't found</h1>
        <p className="lede">Check the number in the link. If it's right, Stellar Testnet may be slow; this page keeps trying.</p>
        <p className="tech-detail">{error}</p>
        <a className="btn secondary" href="#/verify">
          Check another lease
        </a>
      </section>
    )
  if (!lease) return <ProofSkeleton id={id} />

  const total = lease.rent * BigInt(lease.periods)
  const paid = lease.rent * BigInt(lease.paidPeriods)
  const fee = feeLine(lease)
  const ago = checkedAt ? Math.max(0, Math.round(now - checkedAt / 1000)) : 0
  const rules: [LucideIcon, string, string][] = [
    [CalendarClock, 'Paid monthly, never early', 'One month at a time, on schedule.'],
    [LockKeyhole, 'Only to the landlord, or back to the family', 'Nobody, including Stroop, can send it anywhere else.'],
    [Undo2, 'No keys, full refund', `If move-in isn't confirmed by ${fmtDate(lease.moveInBy)}, the family gets everything back.`],
    [Handshake, 'Ending early takes both sides', 'Unused rent goes back to the family.'],
    [Scale, 'Disputes go to a mediator', 'Who can only split the money between landlord and family.'],
  ]

  return (
    <article className="proof" aria-labelledby="proof-title">
      <header className="proof-band on-dark">
        <span className="seal" aria-hidden>
          <svg viewBox="0 0 24 24" width="26" height="26">
            <path className="seal-shield" d="M12 2.8 4.5 5.6v5.9c0 4.6 3.1 8.2 7.5 9.7 4.4-1.5 7.5-5.1 7.5-9.7V5.6z" />
            <path className="seal-check" d="m8.6 12.2 2.4 2.4 4.6-4.8" />
          </svg>
        </span>
        <div className="proof-title">
          <h1 id="proof-title">Verified rent reserve</h1>
          <p className="num">Lease {lease.id}</p>
        </div>
        <p className="live num" aria-live="off">
          <span className="live-dot" aria-hidden />
          Live · {ago < 2 ? 'just checked' : `checked ${ago}s ago`}
        </p>
      </header>

      <section className="proof-hero" aria-label="Amount locked">
        <div className="proof-hero-top">
          <span className="eyebrow">Locked right now</span>
          <StatusBadge lease={lease} now={now} />
        </div>
        <p className="proof-amount">
          <Money units={lease.held} />
          <span className="unit">test USDC</span>
        </p>
        <p className="proof-sub num">
          <Money units={paid} /> of <Money units={total} /> paid to the landlord
        </p>
        {lease.status === 'Disputed' && <Note tone="paused" Icon={CirclePause} {...DISPUTE_NOTE} />}
        <Schedule lease={lease} now={now} />
        {lease.status === 'Funded' && (
          <a className="btn primary proof-cta" href="#/landlord">
            Landlord? Accept this lease <ArrowRight className="nudge" size={17} aria-hidden />
          </a>
        )}
      </section>

      <dl className="terms">
        <div>
          <dt>Monthly rent</dt>
          <dd className="num">
            <Money units={lease.rent} /> × {lease.periods}
          </dd>
        </div>
        <div>
          <dt>Service fee ({FEE_PCT})</dt>
          <dd className="num">
            {fee.amount} <span className="dd-note">{fee.state}</span>
          </dd>
        </div>
        <div>
          <dt>Keys handed over</dt>
          <dd className="num">
            {lease.handedOverAt > 0 ? fmtDate(lease.handedOverAt) : lease.start > 0 ? 'At move-in' : 'Not yet'}
          </dd>
        </div>
        <div>
          <dt>Lease started</dt>
          <dd className="num">{lease.start > 0 ? fmtDate(lease.start) : 'Not yet'}</dd>
        </div>
      </dl>

      <section className="proof-section" aria-labelledby="proof-rules">
        <h2 id="proof-rules">Enforced by the contract</h2>
        <ul className="rules">
          {rules.map(([Icon, title, body]) => (
            <li key={title}>
              <span className="rule-icon" aria-hidden>
                <Icon size={16} />
              </span>
              <div>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="proof-section" aria-labelledby="proof-parties">
        <h2 id="proof-parties">On-chain accounts</h2>
        <dl className="parties">
          <div>
            <dt>Landlord</dt>
            <dd>
              <ExplorerLink href={explorer.account(lease.landlord)} text={short(lease.landlord)} />
            </dd>
          </div>
          <div>
            <dt>Paid by</dt>
            <dd>
              <ExplorerLink href={explorer.account(lease.payer)} text={short(lease.payer)} />
            </dd>
          </div>
          <div>
            <dt>Mediator</dt>
            <dd>
              <ExplorerLink href={explorer.account(lease.mediator)} text={short(lease.mediator)} />
            </dd>
          </div>
          <div>
            <dt>Contract</dt>
            <dd>
              <ExplorerLink href={explorer.contract(CONTRACTS.rentReserve)} text={short(CONTRACTS.rentReserve)} />
            </dd>
          </div>
        </dl>
      </section>

      <footer className="proof-foot">
        Read straight from the Stroop contract on Stellar Testnet. Addresses only, no names or personal details. Test USDC
        has no real value.
      </footer>
    </article>
  )
}

function ProofSkeleton({ id }: { id: number }) {
  return (
    <article className="proof skeleton" aria-busy="true" aria-label={`Reading lease ${id} from Stellar`}>
      <header className="proof-band on-dark">
        <span className="seal" aria-hidden />
        <div className="proof-title">
          <span className="sk sk-line dark" style={{ width: 180 }} />
        </div>
      </header>
      <section className="proof-hero">
        <span className="sk sk-line" style={{ width: 110 }} />
        <span className="sk sk-amount lg" />
        <span className="sk sk-tiles" />
      </section>
    </article>
  )
}
