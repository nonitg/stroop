import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { Keypair } from '@stellar/stellar-sdk'
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  CirclePause,
  Ellipsis,
  Hourglass,
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
  short,
  txsFor,
} from '../stellar'
import { useNow, verifyLink } from '../hooks'
import { DISPUTE_NOTE, disputeWindowLeft, fmtClock, inDisputeWindow, nextStep } from '../leaseText'
import { mediatorName } from '../mediators'
import { ExplorerLink } from './ExplorerLink'
import { type Action, leaseActions } from './leaseActions'
import { Money } from './Money'
import { MoneyTrail } from './MoneyTrail'
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
  const due = periodsDue(lease, now)
  const actions = leaseActions(lease, role, kp, now)
  const askLandlord = role === 'family' && lease.status === 'Funded'
  const paidTotal = lease.rent * BigInt(lease.paidPeriods)
  const guidance = nextStep(lease, role, kp.publicKey(), now)
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
        <h3 id={`lease-${lease.id}`}>
          Lease <span className="num">{lease.id}</span>
        </h3>
        <StatusBadge lease={lease} now={now} />
      </header>
      <p className="lease-meta">
        {role === 'family' ? 'Landlord' : 'Family'} <span className="mono">{short(counterparty)}</span>
        <span className="sep" aria-hidden>
          ·
        </span>
        Mediator: {mediatorName(lease.mediator)}
      </p>

      <div className="lease-amount">
        <p className="label">{role === 'family' ? 'Still locked' : 'Locked for you'}</p>
        <Money units={lease.held} className="amount-lg" />
        <p className="num">
          <Money units={paidTotal} /> of <Money units={lease.rent * BigInt(lease.periods)} /> paid{' '}
          {role === 'family' ? 'to your landlord' : 'to you'} so far
        </p>
      </div>

      <Schedule lease={lease} now={now} shake={shake} />

      {preStart && <Lifecycle lease={lease} />}

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

      {(guidance || loud.length > 0 || quiet.length > 0 || askLandlord) && (
        <div className="next">
          {guidance && <p className="next-step">{guidance}</p>}
          {(loud.length > 0 || quiet.length > 0 || askLandlord) && (
            <div className="actions">
              {askLandlord && <CopyProofLink id={lease.id} primary />}
              {loud.map(actionButton)}
              {quiet.length > 0 && <MoreMenu actions={quiet} busy={busy} onPick={act} />}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="alert error" role="alert">
          <CircleAlert size={16} aria-hidden /> {error}
        </p>
      )}

      <MoneyTrail lease={lease} role={role} />

      <footer className="lease-foot">
        <Receipts leaseId={lease.id} />
        <div className="lease-links">
          <a className="text-link" href={`#/lease/${lease.id}`}>
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
    <button className={primary ? 'btn primary' : 'text-link'} onClick={run}>
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
      <summary>Activity on Stellar ({txs.length})</summary>
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
