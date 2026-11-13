import { type ReactNode, useState } from 'react'
import type { Keypair } from '@stellar/stellar-sdk'
import {
  CalendarClock,
  CircleAlert,
  CirclePause,
  Copy,
  FileCheck,
  Hourglass,
  Landmark,
  Link,
  LoaderCircle,
  ReceiptText,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import {
  type Lease,
  type Role,
  disputeWindowSecs,
  explainError,
  explorer,
  fmtUSD,
  logTx,
  periodsDue,
  secsToNextRelease,
  short,
  txsFor,
} from '../stellar'
import { CashOut } from '../CashOut'
import { useNow, verifyLink } from '../hooks'
import { DISPUTE_NOTE, FEE_PCT, disputeWindowLeft, feeLine, fmtClock, inDisputeWindow, nextStep } from '../leaseText'
import { ExplorerLink } from './ExplorerLink'
import { type Action, leaseActions } from './leaseActions'
import { Schedule } from './Schedule'
import { StatusBadge } from './StatusBadge'
import { Note } from './Note'
import { useCopy } from './useCopy'
import { useToast } from './useToast'

// The contract's NothingDue error: an early withdrawal it refused, which the UI shows as protection, not failure.
const isNothingDue = (e: unknown) => /Error\(Contract, #6\)/.test(e instanceof Error ? e.message : String(e))

export function LeaseCard(props: { lease: Lease; role: Role; kp: Keypair; onChange: () => Promise<unknown> }) {
  const { lease, role, kp, onChange } = props
  const now = useNow()
  const toast = useToast()
  const copy = useCopy()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [cashout, setCashout] = useState(false)
  const due = periodsDue(lease, now)
  const next = secsToNextRelease(lease, now)
  const actions = leaseActions(lease, role, kp, now)
  const askLandlord = role === 'family' && lease.status === 'Funded'
  const paidTotal = lease.rent * BigInt(lease.paidPeriods)
  const guidance = nextStep(lease, role, kp.publicKey(), now)
  const fee = feeLine(lease)

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
    copy(verifyLink(lease.id), { title: 'Proof link copied', body: 'Send it to your landlord so they can check the locked rent.' })

  return (
    <article className="panel lease" id={`lease-card-${lease.id}`} aria-labelledby={`lease-${lease.id}`}>
      <header className="lease-head">
        <h2 id={`lease-${lease.id}`}>Lease {lease.id}</h2>
        <StatusBadge lease={lease} now={now} />
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
          <div>
            <dt>Service fee ({FEE_PCT})</dt>
            <dd>
              {fee.amount} <span className="fact-note">{fee.state}</span>
            </dd>
          </div>
        </dl>
      </div>

      {guidance && <p className="next-step">{guidance}</p>}

      {lease.status === 'Disputed' && <Note tone="paused" Icon={CirclePause} {...DISPUTE_NOTE} />}

      {inDisputeWindow(lease, now) && (
        <Countdown Icon={Hourglass} secs={disputeWindowLeft(lease, now)} total={disputeWindowSecs(lease)}>
          Dispute window closes in
        </Countdown>
      )}

      {blocked && due === 0 && (
        <Note
          tone="protect"
          Icon={ShieldCheck}
          title="Blocked by the contract"
          body="No rent is due yet, so the contract refused to pay out. Rent only moves on schedule, one month at a time, and only to you."
          onDismiss={() => setBlocked(false)}
        />
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

      <Schedule lease={lease} now={now} />

      {next !== null && (
        <Countdown Icon={CalendarClock} secs={next} total={lease.periodSecs}>
          Month {lease.paidPeriods + due + 1} unlocks in
        </Countdown>
      )}

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

function Countdown(props: { Icon: LucideIcon; secs: number; total: number; children: ReactNode }) {
  const { Icon, secs, total, children } = props
  return (
    <div className="countdown">
      <Icon size={18} aria-hidden />
      <span>
        {children} <strong className="clock">{fmtClock(secs)}</strong>
      </span>
      <span className="meter" aria-hidden>
        <span style={{ width: `${Math.min(1, Math.max(0, 1 - secs / total)) * 100}%` }} />
      </span>
    </div>
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
