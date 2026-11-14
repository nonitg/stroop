import { type FormEvent, useEffect, useState } from 'react'
import { ArrowRight, Check, CircleAlert, CirclePause, ShieldCheck } from 'lucide-react'
import { CONTRACTS, type Lease, explainError, explorer, fromUnits, getLease, short } from '../stellar'
import { CAD, fmtMoney } from '../money'
import { mediatorName } from '../mediators'
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
        {!/not found/i.test(error) && <p className="tech-detail">{error}</p>}
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
  const rules: [string, string][] = [
    ['Never paid early', 'One month at a time, on schedule.'],
    ['Only to the landlord, or back to the family', 'Nobody, including Stroop, can send it anywhere else.'],
    ['No keys, full refund', `Move-in not confirmed by ${fmtDate(lease.moveInBy)}? Everything goes back to the family.`],
    ['Ending early takes both sides', 'Rent owed goes to the landlord; the rest goes back to the family.'],
    ['The mediator can only split', 'In a dispute, they divide the locked rent between landlord and family. Nothing else.'],
  ]

  return (
    <article className="proof" aria-labelledby="proof-title">
      <header className="proof-head">
        <span className="seal" aria-hidden>
          <ShieldCheck size={20} />
        </span>
        <div className="proof-title">
          <h1 id="proof-title">Verified rent reserve</h1>
          <p className="num">
            Lease {lease.id} · live from Stellar · {ago < 2 ? 'just checked' : `checked ${ago}s ago`}
          </p>
        </div>
        <StatusBadge lease={lease} now={now} />
      </header>

      <section className="card proof-main" aria-label="Amount locked">
        <p className="label">Locked right now</p>
        <Money units={lease.held} className="amount-xl" />
        <p className="proof-sub num">
          <Money units={paid} /> of <Money units={total} /> paid to the landlord so far
        </p>
        {lease.status === 'Disputed' && <Note tone="paused" Icon={CirclePause} {...DISPUTE_NOTE} />}
        <Schedule lease={lease} now={now} />
        {lease.status === 'Funded' && (
          <a className="btn primary" href="#/landlord">
            Landlord? Accept this lease <ArrowRight className="nudge" size={17} aria-hidden />
          </a>
        )}
      </section>

      <section className="card proof-section" aria-labelledby="proof-terms">
        <h2 id="proof-terms">Terms</h2>
        <dl className="ledger num">
          <div>
            <dt>
              Monthly rent
              <span className="ledger-note">≈ {fmtMoney(fromUnits(lease.rent) * CAD.perUsd, 'CAD')} a month</span>
            </dt>
            <dd>
              <Money units={lease.rent} /> × {lease.periods}
            </dd>
          </div>
          <div>
            <dt>
              Stroop fee, {FEE_PCT}
              <span className="ledger-note">Paid by the family, {fee.state}. The landlord pays nothing.</span>
            </dt>
            <dd>{fee.amount}</dd>
          </div>
          <div>
            <dt>
              Mediator
              <span className="ledger-note">Only if either side raises a dispute</span>
            </dt>
            <dd>{mediatorName(lease.mediator)}</dd>
          </div>
          <div>
            <dt>Move-in deadline</dt>
            <dd>{fmtDate(lease.moveInBy)}</dd>
          </div>
          <div>
            <dt>Keys handed over</dt>
            <dd>{lease.handedOverAt > 0 ? fmtDate(lease.handedOverAt) : lease.start > 0 ? 'At move-in' : 'Not yet'}</dd>
          </div>
          <div>
            <dt>Lease started</dt>
            <dd>{lease.start > 0 ? fmtDate(lease.start) : 'Not yet'}</dd>
          </div>
        </dl>
      </section>

      <section className="card proof-section" aria-labelledby="proof-rules">
        <h2 id="proof-rules">Rules the contract enforces</h2>
        <ul className="rules">
          {rules.map(([title, body]) => (
            <li key={title}>
              <Check size={16} aria-hidden />
              <div>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card proof-section" aria-labelledby="proof-parties">
        <h2 id="proof-parties">Accounts on Stellar</h2>
        <dl className="ledger">
          <div>
            <dt>Landlord</dt>
            <dd>
              <ExplorerLink href={explorer.account(lease.landlord)} text={short(lease.landlord)} />
            </dd>
          </div>
          <div>
            <dt>Family</dt>
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
        <p className="fine">
          Read straight from the Stroop contract on Stellar Testnet. Accounts only, no names or personal details. Test USDC has
          no real value.
        </p>
      </section>
    </article>
  )
}

function ProofSkeleton({ id }: { id: number }) {
  return (
    <article className="proof skeleton" aria-busy="true" aria-label={`Reading lease ${id} from Stellar`}>
      <header className="proof-head">
        <span className="sk sk-line" style={{ width: 220 }} />
      </header>
      <section className="card proof-main">
        <span className="sk sk-line" style={{ width: 110 }} />
        <span className="sk sk-amount lg" />
        <span className="sk sk-tiles" />
      </section>
    </article>
  )
}
