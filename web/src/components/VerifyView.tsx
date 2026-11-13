import { type FormEvent, useEffect, useState } from 'react'
import { CircleAlert, CirclePause, FileSearch, Info, LoaderCircle, ShieldCheck } from 'lucide-react'
import { CONTRACTS, type Lease, explainError, explorer, fmtUSD, getLease, short } from '../stellar'
import { useNow } from '../hooks'
import { DISPUTE_NOTE, FEE_PCT, feeLine, fmtDate } from '../leaseText'
import { ExplorerLink } from './ExplorerLink'
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
    <section className="panel lookup" aria-labelledby="lookup-title">
      <FileSearch className="lookup-icon" size={32} aria-hidden />
      <h1 id="lookup-title">Check a tenant's rent reserve</h1>
      <p className="lede">
        Enter the lease number from the tenant's RentProof link. You'll see how much rent is locked and the rules that
        protect it, read live from Stellar.
      </p>
      <form className="lookup-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="lease-number">Lease number</label>
          <input id="lease-number" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. 12" />
        </div>
        <button className="btn primary" type="submit" disabled={!input.trim()}>
          Check lease
        </button>
      </form>
    </section>
  )
}

function LeaseProof({ id }: { id: number }) {
  const [lease, setLease] = useState<Lease | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const now = useNow()

  useEffect(() => {
    let live = true
    const load = () =>
      getLease(id)
        .then((l) => {
          if (!live) return
          setLease(l)
          setError(null)
          setCheckedAt(new Date())
        })
        .catch((e) => live && setError(explainError(e)))
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [id])

  if (error && !lease)
    return (
      <section className="panel lookup">
        <CircleAlert className="lookup-icon error-icon" size={32} aria-hidden />
        <h1>We couldn't find lease {id}</h1>
        <p className="lede">
          Check the lease number in the link and try again. If it's right, Stellar Testnet may be slow to respond.
        </p>
        <p className="tech-detail">Details: {error}</p>
        <a className="btn secondary" href="#/verify">
          Check another lease
        </a>
      </section>
    )
  if (!lease)
    return (
      <p className="loading-line center" aria-busy="true">
        <LoaderCircle className="spin" size={18} aria-hidden /> Reading lease {id} from Stellar Testnet…
      </p>
    )

  const total = lease.rent * BigInt(lease.periods)
  const paid = lease.rent * BigInt(lease.paidPeriods)
  const fee = feeLine(lease)
  return (
    <article className="proof" aria-labelledby="proof-title">
      <header className="proof-head">
        <span className="seal" aria-hidden>
          <ShieldCheck size={28} />
        </span>
        <div>
          <h1 id="proof-title">Rent reserve proof</h1>
          <p className="proof-sub">Lease {lease.id}</p>
        </div>
        <p className="live">
          <span className="live-dot" aria-hidden />
          <span>
            Read live from Stellar Testnet
            {checkedAt && (
              <span className="live-time">
                Checked {checkedAt.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </span>
        </p>
      </header>

      <div className="proof-body">
        <section className="proof-amount" aria-label="Amount locked">
          <div className="proof-amount-top">
            <span className="label">Locked for this lease right now</span>
            <StatusBadge lease={lease} now={now} />
          </div>
          <p className="amount xl">
            {fmtUSD(lease.held)} <span className="unit">test USDC</span>
          </p>
          <p className="proof-terms">
            {fmtUSD(paid)} of {fmtUSD(total)} paid to the landlord so far.
          </p>
          {lease.status === 'Disputed' && <Note tone="paused" Icon={CirclePause} {...DISPUTE_NOTE} />}
          <dl className="terms">
            <div>
              <dt>Monthly rent</dt>
              <dd>
                {fmtUSD(lease.rent)} × {lease.periods} months
              </dd>
            </div>
            <div>
              <dt>Service fee ({FEE_PCT})</dt>
              <dd>
                {fee.amount}, {fee.state}
              </dd>
            </div>
            <div>
              <dt>Keys handed over</dt>
              <dd>
                {lease.handedOverAt > 0
                  ? fmtDate(lease.handedOverAt)
                  : lease.start > 0
                    ? 'Confirmed at move-in'
                    : 'Not yet'}
              </dd>
            </div>
            <div>
              <dt>Lease started</dt>
              <dd>{lease.start > 0 ? fmtDate(lease.start) : 'Not yet'}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="proof-schedule">
          <h2 id="proof-schedule">Monthly schedule</h2>
          <Schedule lease={lease} now={now} />
        </section>

        <section aria-labelledby="proof-rules">
          <h2 id="proof-rules">Rules the contract enforces</h2>
          <ul className="checklist">
            <li>Rent is paid only to the landlord, one month at a time, never ahead of schedule.</li>
            <li>Nobody, including RentProof, can send this money anywhere else.</li>
            <li>
              If the keys aren't handed over and move-in isn't confirmed by {fmtDate(lease.moveInBy)}, the money goes back
              to the family, fee included.
            </li>
            <li>Ending early needs both sides to agree; unused rent goes back to the family.</li>
            <li>Disputes go to a neutral mediator, who can only split the money between the landlord and the family.</li>
          </ul>
        </section>

        <section aria-labelledby="proof-parties">
          <h2 id="proof-parties">Accounts on this lease</h2>
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
              <dt>
                Mediator <span className="dt-note">(can only split between landlord and family)</span>
              </dt>
              <dd>
                <ExplorerLink href={explorer.account(lease.mediator)} text={short(lease.mediator)} />
              </dd>
            </div>
            <div>
              <dt>Rent contract</dt>
              <dd>
                <ExplorerLink href={explorer.contract(CONTRACTS.rentReserve)} text={CONTRACTS.rentReserve} />
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <footer className="proof-foot">
        <Info size={18} aria-hidden />
        <p>
          This page reads the lease straight from the RentProof contract on Stellar Testnet and refreshes every few
          seconds. It shows account addresses only, no names or personal details. Test USDC has no real value.
          {lease.status === 'Funded' && (
            <>
              {' '}
              Landlord? <a href="#/landlord">Accept this lease from your account</a>.
            </>
          )}
        </p>
      </footer>
    </article>
  )
}
