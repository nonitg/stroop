import { useState } from 'react'
import type { Keypair } from '@stellar/stellar-sdk'
import {
  BadgeCheck,
  CalendarClock,
  CircleAlert,
  Copy,
  FileCheck,
  HandCoins,
  KeyRound,
  Landmark,
  Link,
  LoaderCircle,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  type Lease,
  type Role,
  explainError,
  explorer,
  fmtUSD,
  logTx,
  periodsDue,
  reserve,
  secsToNextRelease,
  short,
  txsFor,
} from '../stellar'
import { CashOut } from '../CashOut'
import { useNow, verifyLink } from '../hooks'
import { fmtClock, nextStep } from '../leaseText'
import { ExplorerLink } from './ExplorerLink'
import { Schedule } from './Schedule'
import { StatusBadge } from './StatusBadge'
import { useToast } from './useToast'

type Tier = 'primary' | 'secondary' | 'quiet'

interface Action {
  id: string
  label: string
  /** Toast title once the transaction lands; also the receipt label. */
  done: string
  doneBody?: string
  tier: Tier
  Icon?: LucideIcon
  run: () => Promise<{ hash?: string }>
}

// The contract's NothingDue error: an early withdrawal it refused, which the UI shows as protection, not failure.
const isNothingDue = (e: unknown) => /Error\(Contract, #6\)/.test(e instanceof Error ? e.message : String(e))

function leaseActions(lease: Lease, role: Role, kp: Keypair, now: number): Action[] {
  const due = periodsDue(lease, now)
  const proposedByMe = lease.endProposedBy === kp.publicKey()
  const proposedByOther = !!lease.endProposedBy && !proposedByMe
  const reclaim = () => reserve.reclaim(kp, lease.id)
  const release = () => reserve.release(kp, lease.id)
  const actions: Action[] = []

  if (role === 'family') {
    if (lease.status === 'Accepted')
      actions.push({
        id: 'move-in',
        label: 'Confirm move-in',
        done: 'Move-in confirmed',
        doneBody: 'Month 1 is paid to your landlord and the schedule has started.',
        tier: 'primary',
        Icon: KeyRound,
        run: () => reserve.moveIn(kp, lease.id),
      })
    if (lease.status === 'Accepted' && now > lease.moveInBy)
      actions.push({ id: 'reclaim', label: 'Take everything back (no move-in)', done: 'Rent returned', tier: 'secondary', run: reclaim })
    if (lease.status === 'Funded')
      actions.push({
        id: 'cancel',
        label: 'Cancel and get refund',
        done: 'Lease cancelled',
        doneBody: 'The full amount is back in your account.',
        tier: 'quiet',
        run: reclaim,
      })
  } else {
    if (lease.status === 'Funded')
      actions.push({
        id: 'accept',
        label: 'Accept lease',
        done: 'Lease accepted',
        doneBody: 'The student can now confirm move-in.',
        tier: 'primary',
        Icon: BadgeCheck,
        run: () => reserve.accept(kp, lease.id),
      })
    if (due > 0)
      actions.push({
        id: 'collect',
        label: `Collect ${due} month${due > 1 ? 's' : ''} of rent`,
        done: 'Rent collected',
        doneBody: `${fmtUSD(lease.rent * BigInt(due))} is now in your account.`,
        tier: 'primary',
        Icon: HandCoins,
        run: release,
      })
    // Demo of the core protection: with nothing due, the contract refuses to pay out.
    if (lease.status === 'Active' && due === 0)
      actions.push({ id: 'early', label: 'Try to withdraw early', done: 'Rent collected', tier: 'secondary', Icon: LockKeyhole, run: release })
  }
  if (lease.status === 'Active' && !proposedByMe)
    actions.push({
      id: 'end',
      label: proposedByOther ? 'Agree to end lease early' : 'Propose ending lease early',
      done: proposedByOther ? 'Lease ended early' : 'Early end proposed',
      doneBody: proposedByOther
        ? 'Rent owed went to the landlord; the rest went back to the family.'
        : 'Nothing changes until the other side agrees.',
      tier: proposedByOther ? 'primary' : 'quiet',
      run: () => reserve.endEarly(kp, lease.id),
    })

  // One primary action at a time; any later "primary" steps down a level.
  const first = actions.findIndex((a) => a.tier === 'primary')
  return actions.map((a, i) => (a.tier === 'primary' && i !== first ? { ...a, tier: 'secondary' } : a))
}

export function LeaseCard(props: { lease: Lease; role: Role; kp: Keypair; onChange: () => Promise<unknown> }) {
  const { lease, role, kp, onChange } = props
  const now = useNow()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [cashout, setCashout] = useState(false)
  const due = periodsDue(lease, now)
  const next = secsToNextRelease(lease, now)
  const actions = leaseActions(lease, role, kp, now)
  const askLandlord = role === 'family' && lease.status === 'Funded'
  const paidTotal = lease.rent * BigInt(lease.paidPeriods)

  const act = async (a: Action) => {
    setError(null)
    setBlocked(false)
    setBusy(a.id)
    try {
      const { hash } = await a.run()
      if (hash) logTx({ leaseId: lease.id, label: a.done, hash, at: Date.now() })
      toast({ title: a.done, body: a.doneBody, hash })
      await onChange()
    } catch (e) {
      if (a.id === 'early' && isNothingDue(e)) setBlocked(true)
      else setError(explainError(e))
    } finally {
      setBusy(null)
    }
  }

  const actionButton = (a: Action) => (
    <button key={a.id} className={`btn ${a.tier}`} disabled={!!busy} aria-busy={busy === a.id} onClick={() => act(a)}>
      {busy === a.id ? <LoaderCircle className="spin" size={18} aria-hidden /> : a.Icon && <a.Icon size={18} aria-hidden />}
      {busy === a.id ? 'Confirming…' : a.label}
    </button>
  )

  const copyLink = () =>
    navigator.clipboard?.writeText(verifyLink(lease.id)).then(() =>
      toast({ title: 'Proof link copied', body: 'Send it to your landlord so they can check the locked rent.' }),
    )

  return (
    <article className="panel lease" id={`lease-card-${lease.id}`} aria-labelledby={`lease-${lease.id}`}>
      <header className="lease-head">
        <h2 id={`lease-${lease.id}`}>Lease {lease.id}</h2>
        <StatusBadge lease={lease} />
      </header>

      <div className="lease-figures">
        <div className="held">
          <span className="label">Locked for this lease</span>
          <span className="amount">{fmtUSD(lease.held)}</span>
          <span className="unit">test USDC</span>
        </div>
        <dl className="facts">
          <div>
            <dt>Paid to landlord</dt>
            <dd>{fmtUSD(paidTotal)}</dd>
          </div>
          <div>
            <dt>Monthly rent</dt>
            <dd>
              {fmtUSD(lease.rent)} × {lease.periods}
            </dd>
          </div>
        </dl>
      </div>

      <p className="next-step">{nextStep(lease, role, kp.publicKey())}</p>

      <Schedule lease={lease} now={now} />

      {next !== null && (
        <div className="countdown">
          <CalendarClock size={18} aria-hidden />
          <span>
            Month {lease.paidPeriods + due + 1} unlocks in <strong className="clock">{fmtClock(next)}</strong>
          </span>
          <span className="meter" aria-hidden>
            <span style={{ width: `${(1 - next / lease.periodSecs) * 100}%` }} />
          </span>
        </div>
      )}

      {blocked && due === 0 && (
        <div className="blocked" role="status">
          <ShieldCheck className="blocked-icon" size={28} aria-hidden />
          <div>
            <strong>Blocked by the contract</strong>
            <p>
              No rent is due yet, so the contract refused to pay out. Rent only moves on schedule, one month at a time,
              and only to you.
            </p>
          </div>
          <button className="icon-btn" onClick={() => setBlocked(false)} aria-label="Dismiss">
            <X size={18} aria-hidden />
          </button>
        </div>
      )}

      {(actions.length > 0 || askLandlord || (role === 'landlord' && lease.paidPeriods > 0)) && (
        <div className="actions">
          {askLandlord && (
            <button className="btn primary" onClick={copyLink}>
              <Link size={18} aria-hidden /> Copy proof link for landlord
            </button>
          )}
          {actions.filter((a) => a.tier !== 'quiet').map(actionButton)}
          {role === 'landlord' && lease.paidPeriods > 0 && (
            <button className="btn secondary" onClick={() => setCashout(true)} aria-expanded={cashout}>
              <Landmark size={18} aria-hidden /> Cash out to CAD
            </button>
          )}
          {actions.some((a) => a.tier === 'quiet') && (
            <div className="actions-quiet">{actions.filter((a) => a.tier === 'quiet').map(actionButton)}</div>
          )}
        </div>
      )}

      {error && (
        <p className="alert error" role="alert">
          <CircleAlert size={18} aria-hidden /> {error}
        </p>
      )}

      {cashout && <CashOut onClose={() => setCashout(false)} amount={paidTotal} />}

      <footer className="lease-foot">
        <Receipts leaseId={lease.id} />
        <div className="lease-links">
          <a className="btn quiet small" href={`#/lease/${lease.id}`}>
            <FileCheck size={16} aria-hidden /> Open proof page
          </a>
          {!askLandlord && (
            <button className="btn quiet small" onClick={copyLink}>
              <Copy size={16} aria-hidden /> Copy proof link
            </button>
          )}
        </div>
      </footer>
    </article>
  )
}

function Receipts({ leaseId }: { leaseId: number }) {
  const txs = txsFor(leaseId)
  if (txs.length === 0) return <span />
  return (
    <details className="receipts">
      <summary>
        <ReceiptText size={16} aria-hidden /> Receipts ({txs.length})
      </summary>
      <ul>
        {txs.map((t) => (
          <li key={t.hash}>
            <span>{t.label}</span>
            <time dateTime={new Date(t.at).toISOString()}>
              {new Date(t.at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}
            </time>
            <ExplorerLink href={explorer.tx(t.hash)} text={short(t.hash)} />
          </li>
        ))}
      </ul>
    </details>
  )
}

export function LeaseList(props: { role: Role; kp: Keypair; leases: Lease[] | null; onChange: () => Promise<unknown> }) {
  if (!props.leases)
    return (
      <p className="loading-line" aria-busy="true">
        <LoaderCircle className="spin" size={18} aria-hidden /> Reading leases from Stellar…
      </p>
    )
  return (
    <>
      {props.leases.map((l) => (
        <LeaseCard key={l.id} lease={l} role={props.role} kp={props.kp} onChange={props.onChange} />
      ))}
    </>
  )
}
