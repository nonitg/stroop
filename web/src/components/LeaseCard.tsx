import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { Keypair } from '@stellar/stellar-sdk'
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  CirclePause,
  Ellipsis,
  Hourglass,
  Landmark,
  Link,
  LoaderCircle,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import {
  type Lease,
  type Role,
  disputeWindowSecs,
  explainError,
  explorer,
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
import { Money } from './Money'
import { Schedule } from './Schedule'
import { StatusBadge } from './StatusBadge'
import { Note } from './Note'
import { useCopy } from './useCopy'
import { useToast } from './useToast'

// The contract's NothingDue error: an early withdrawal it refused, which the UI shows as protection, not failure.
const isNothingDue = (e: unknown) => /Error\(Contract, #6\)/.test(e instanceof Error ? e.message : String(e))

const SHAKE_MS = 600

export function LeaseCard(props: { lease: Lease; role: Role; kp: Keypair; onChange: () => Promise<unknown> }) {
  const { lease, role, kp, onChange } = props
  const now = useNow()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Month count when an early withdrawal was refused; the note goes away once rent moves on.
  const [blockedAt, setBlockedAt] = useState<number | null>(null)
  const [shake, setShake] = useState(false)
  const [cashout, setCashout] = useState(false)
  const due = periodsDue(lease, now)
  const next = secsToNextRelease(lease, now)
  const actions = leaseActions(lease, role, kp, now)
  const askLandlord = role === 'family' && lease.status === 'Funded'
  const paidTotal = lease.rent * BigInt(lease.paidPeriods)
  const guidance = nextStep(lease, role, kp.publicKey(), now)
  const fee = feeLine(lease)
  const preStart = lease.status === 'Funded' || lease.status === 'Accepted'
  const counterparty = role === 'family' ? lease.landlord : lease.payer
  const loud = actions.filter((a) => a.tier !== 'quiet')
  const quiet = actions.filter((a) => a.tier === 'quiet')

  const act = async (a: Action) => {
    setError(null)
    setBlockedAt(null)
    setBusy(a.id)
    const t0 = performance.now()
    try {
      const { hash } = await a.run()
      if (hash) logTx({ leaseId: lease.id, label: a.done, hash, at: Date.now() })
      toast({ title: a.done, body: a.doneBody, hash, secs: (performance.now() - t0) / 1000 })
      await onChange()
    } catch (e) {
      if (a.id === 'early' && isNothingDue(e)) {
        setBlockedAt(lease.paidPeriods)
        setShake(true)
        setTimeout(() => setShake(false), SHAKE_MS)
      } else setError(explainError(e))
    } finally {
      setBusy(null)
    }
  }

  const actionButton = (a: Action) => (
    <button key={a.id} className={`btn ${a.tier}`} disabled={!!busy} aria-busy={busy === a.id} onClick={() => act(a)}>
      {busy === a.id ? <LoaderCircle className="spin" size={17} aria-hidden /> : a.Icon && <a.Icon size={17} aria-hidden />}
      {busy === a.id ? 'Confirming on Stellar…' : a.label}
    </button>
  )

  return (
    <article className="card lease" id={`lease-card-${lease.id}`} aria-labelledby={`lease-${lease.id}`}>
      <header className="lease-head">
        <div>
          <h3 id={`lease-${lease.id}`}>
            Lease <span className="num">{lease.id}</span>
          </h3>
          <p className="lease-meta num">
            <span>
              {role === 'family' ? 'To' : 'From'} <span className="mono">{short(counterparty)}</span>
            </span>
            <span className="sep" aria-hidden>
              ·
            </span>
            <span>
              {FEE_PCT} fee {fee.amount}, {fee.state}
            </span>
          </p>
        </div>
        <StatusBadge lease={lease} now={now} />
      </header>

      <dl className="figures">
        <div className="fig lead">
          <dt>Locked</dt>
          <dd>
            <Money units={lease.held} />
          </dd>
        </div>
        <div className="fig">
          <dt>Paid to landlord</dt>
          <dd>
            <Money units={paidTotal} />
          </dd>
        </div>
        <div className="fig">
          <dt>Rent</dt>
          <dd className="num">
            <Money units={lease.rent} /> <span className="times">× {lease.periods}</span>
          </dd>
        </div>
      </dl>

      {preStart && <Lifecycle lease={lease} />}

      <div className="lease-schedule">
        <Schedule lease={lease} now={now} shake={shake} />
        {next !== null && (
          <p className="unlock num">
            Month {lease.paidPeriods + due + 1} in <strong className="clock">{fmtClock(next)}</strong>
          </p>
        )}
      </div>

      {inDisputeWindow(lease, now) && (
        <Countdown Icon={Hourglass} secs={disputeWindowLeft(lease, now)} total={disputeWindowSecs(lease)}>
          Dispute window closes in
        </Countdown>
      )}

      {lease.status === 'Disputed' && <Note tone="paused" Icon={CirclePause} {...DISPUTE_NOTE} />}

      {blockedAt === lease.paidPeriods && due === 0 && (
        <Note
          tone="protect"
          Icon={ShieldCheck}
          title="Blocked by the contract"
          body="No rent is due yet. It only moves on schedule, one month at a time."
          onDismiss={() => setBlockedAt(null)}
        />
      )}

      {guidance && <p className="next-step">{guidance}</p>}

      {(loud.length > 0 || quiet.length > 0 || askLandlord || (role === 'landlord' && lease.paidPeriods > 0)) && (
        <div className="actions">
          {askLandlord && <CopyProofLink id={lease.id} primary />}
          {loud.map(actionButton)}
          {role === 'landlord' && lease.paidPeriods > 0 && (
            <button className="btn secondary" onClick={() => setCashout((o) => !o)} aria-expanded={cashout}>
              <Landmark size={17} aria-hidden /> Cash out to CAD
            </button>
          )}
          {quiet.length > 0 && <MoreMenu actions={quiet} busy={busy} onPick={act} />}
        </div>
      )}

      {error && (
        <p className="alert error" role="alert">
          <CircleAlert size={16} aria-hidden /> {error}
        </p>
      )}

      {cashout && <CashOut onClose={() => setCashout(false)} amount={paidTotal} />}

      <footer className="lease-foot">
        <Receipts leaseId={lease.id} />
        <div className="lease-links">
          <a className="btn quiet sm" href={`#/lease/${lease.id}`}>
            Proof page <ArrowUpRight size={14} aria-hidden />
          </a>
          {!askLandlord && <CopyProofLink id={lease.id} />}
        </div>
      </footer>
    </article>
  )
}

const LIFECYCLE = ['Rent locked', 'Landlord accepted', 'Keys handed over', 'Moved in'] as const

/** Where a lease is before rent starts flowing. */
function Lifecycle({ lease }: { lease: Lease }) {
  const done = lease.status === 'Funded' ? 1 : lease.handedOverAt > 0 ? 3 : 2
  return (
    <ol className="lifecycle" aria-label="Lease progress">
      {LIFECYCLE.map((label, i) => {
        const state = i < done ? 'done' : i === done ? 'current' : 'todo'
        return (
          <li key={label} className={state}>
            <span className="lc-dot" aria-hidden>
              {state === 'done' && <Check size={10} strokeWidth={3.5} />}
            </span>
            <span className="lc-label">{label}</span>
            <span className="sr-only">{state === 'done' ? ' (done)' : state === 'current' ? ' (next)' : ''}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Countdown(props: { Icon: LucideIcon; secs: number; total: number; children: ReactNode }) {
  const { Icon, secs, total, children } = props
  return (
    <div className="countdown">
      <Icon size={16} aria-hidden />
      <span>
        {children} <strong className="clock num">{fmtClock(secs)}</strong>
      </span>
      <span className="meter" aria-hidden>
        <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, 1 - secs / total))})` }} />
      </span>
    </div>
  )
}

/** Copies the landlord's proof link; the button itself confirms. */
function CopyProofLink({ id, primary }: { id: number; primary?: boolean }) {
  const copy = useCopy()
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const run = async () => {
    if (!(await copy(verifyLink(id), { title: 'Proof link copied' }, { silent: true }))) return
    setCopied(true)
    if (primary) toast({ title: 'Proof link copied', body: 'Send it to your landlord so they can check the locked rent.' })
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button className={`btn ${primary ? 'primary' : 'quiet sm'}`} onClick={run}>
      {copied ? <Check className="pop" size={primary ? 17 : 14} aria-hidden /> : <Link size={primary ? 17 : 14} aria-hidden />}
      {copied ? 'Copied' : primary ? 'Copy proof link for landlord' : 'Copy link'}
    </button>
  )
}

/** Less common actions (cancel, dispute, end early) sit behind one button. */
function MoreMenu({ actions, busy, onPick }: { actions: Action[]; busy: string | null; onPick: (a: Action) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const working = actions.find((a) => a.id === busy)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="more" ref={ref}>
      <button
        className="btn quiet"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={!!working}
        disabled={!!busy}
        onClick={() => setOpen((o) => !o)}
      >
        {working ? <LoaderCircle className="spin" size={17} aria-hidden /> : <Ellipsis size={17} aria-hidden />}
        {working ? 'Confirming on Stellar…' : 'More'}
      </button>
      {open && (
        <div className="menu" role="menu">
          {actions.map((a) => (
            <button
              key={a.id}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onPick(a)
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Receipts({ leaseId }: { leaseId: number }) {
  const txs = txsFor(leaseId)
  if (txs.length === 0) return <span />
  return (
    <details className="receipts">
      <summary>
        Receipts <span className="count num">{txs.length}</span>
      </summary>
      <ol>
        {txs.map((t) => (
          <li key={t.hash}>
            <span className="r-label">{t.label}</span>
            <time className="num" dateTime={new Date(t.at).toISOString()}>
              {new Date(t.at).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}
            </time>
            <ExplorerLink href={explorer.tx(t.hash)} text={short(t.hash)} />
          </li>
        ))}
      </ol>
    </details>
  )
}

export function LeaseList(props: { role: Role; kp: Keypair; leases: Lease[] | null; onChange: () => Promise<unknown> }) {
  if (!props.leases) return <LeaseSkeleton />
  return (
    <>
      {props.leases.map((l) => (
        <LeaseCard key={l.id} lease={l} role={props.role} kp={props.kp} onChange={props.onChange} />
      ))}
    </>
  )
}

export function LeaseSkeleton() {
  return (
    <div className="card lease skeleton" aria-busy="true" aria-label="Reading leases from Stellar">
      <span className="sk sk-line" style={{ width: 120 }} />
      <span className="sk sk-amount" />
      <span className="sk sk-tiles" />
    </div>
  )
}
