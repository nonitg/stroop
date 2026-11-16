import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarX2,
  ChevronRight,
  Flag,
  HandCoins,
  LoaderCircle,
  LockKeyhole,
  type LucideIcon,
  ReceiptText,
  Share,
  ShieldCheck,
  Undo2,
  X,
} from 'lucide-react'
import { useApp } from '../app'
import {
  CONTRACTS,
  FEE_PCT,
  type Lease,
  type Role,
  disputeWindowSecs,
  explainError,
  explorer,
  leaseFee,
  fmtCAD,
  getKeypair,
  logTx,
  periodsDue,
  short,
  simulatePoolLoss,
  txsFor,
} from '../stellar'
import { useHomeCurrency, useLease, useNow, verifyLink } from '../hooks'
import { fmtDate, fmtDuration, headline } from '../leaseText'
import { currency, fmtMoney, landlordPayout, offRampQuote, perCad } from '../money'
import { mediatorName } from '../mediators'
import { type Action, leaseActions } from '../components/leaseActions'
import { useToast } from '../components/useToast'
import { Amount } from '../ui/Amount'
import { LendingSheet } from '../ui/LendingSheet'
import { Ledger, MoneyBar } from '../ui/MoneyBar'
import { MonthTiles } from '../ui/MonthTiles'
import { Sheet } from '../ui/Sheet'
import { Status } from '../ui/Status'
import { leaseSlices } from '../ui/leaseSlices'
import { useShare } from '../ui/share'
import { Problem } from './MoneySheets'
import { Proof } from './Proof'
import { hushNews } from '../news'

/** #/lease/:id — your lease if you're on it (switching sides if the other local account is), else the public proof. */
export function LeaseScreen({ id }: { id: number }) {
  const { role, setRole, wallet, leases, refresh } = useApp()
  const mine = leases?.find((l) => l.id === id)
  const { lease: fetched, error } = useLease(id)
  const other: Role = role === 'family' ? 'landlord' : 'family'
  const otherPub = getKeypair(other)?.publicKey()
  const myPub = wallet.kp?.publicKey()
  const isParty = (pub?: string) => !!fetched && !!pub && (fetched.payer === pub || fetched.landlord === pub)
  const otherIsParty = isParty(otherPub)
  // Switch sides only when this side isn't on the lease; in a demo browser both sides often are.
  const switchSides = !mine && !isParty(myPub) && otherIsParty
  useEffect(() => {
    if (switchSides) setRole(other)
  }, [switchSides, other, setRole])

  const lease = mine ?? (isParty(myPub) ? fetched : null)
  if (lease) return <LeaseDetail lease={lease} role={role} onChange={refresh} />
  if (fetched && !otherIsParty) return <Proof id={id} back />
  if (error) return <Proof id={id} back />
  return (
    <main className="screen splash" aria-busy="true">
      <LoaderCircle className="spin" size={26} aria-label="Loading lease" />
    </main>
  )
}

const DANGER = new Set(['cancel', 'dispute'])
const ROW_ICON: Record<string, LucideIcon> = {
  cancel: X,
  dispute: Flag,
  end: CalendarX2,
  'cancel-end': Undo2,
  early: LockKeyhole,
  claim: HandCoins,
}
const ROW_SUB: Record<string, string> = {
  cancel: 'Everything comes back, fee included',
  dispute: 'Pauses payouts for mediation',
  end: 'Only if both sides agree',
  early: 'The lease rules will refuse it',
}

/** Icon tile for a less-common lease action; red for the ones that stop or undo things. */
function RowIcon({ id }: { id: string }) {
  const Icon = ROW_ICON[id] ?? ChevronRight
  return (
    <span className={`ico${DANGER.has(id) ? ' danger' : ''}`}>
      <Icon size={18} aria-hidden />
    </span>
  )
}

const isNothingDue = (e: unknown) => /Error\(Contract, #6\)/.test(e instanceof Error ? e.message : String(e))
const NEEDS_CONFIRM = new Set(['accept', 'hand-over', 'move-in', 'cancel', 'reclaim', 'end', 'dispute', 'stop-lending'])

function LeaseDetail({ lease, role, onChange }: { lease: Lease; role: Role; onChange: () => Promise<unknown> }) {
  const { wallet } = useApp()
  const kp = wallet.kp!
  const now = useNow()
  const toast = useToast()
  const share = useShare()
  const [code] = useHomeCurrency()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Action | null>(null)
  const [blockedAt, setBlockedAt] = useState<number | null>(null)
  const [shake, setShake] = useState(false)
  const [lendInfo, setLendInfo] = useState(false)
  const family = role === 'family'
  const h = headline(lease, role, kp.publicKey(), now)
  const actions = leaseActions(lease, role, kp, now)
  const primary = actions.find((a) => a.tier === 'primary')
  const secondary = actions.filter((a) => a.tier === 'secondary')
  const stopLending = actions.find((a) => a.id === 'stop-lending')
  const quiet = actions.filter((a) => a.tier === 'quiet' && a !== stopLending)
  const slices = leaseSlices(lease, role)
  const total = slices.reduce((s, x) => s + x.value, 0)
  const txs = txsFor(lease.id)
  const proof = () => share(verifyLink(lease.id), 'Proof link', 'Send it to your landlord.')
  const home = currency(code)

  const run = async (a: Action) => {
    setConfirm(null)
    setError(null)
    setBlockedAt(null)
    setBusy(a.id)
    const t0 = performance.now()
    try {
      hushNews(lease.id)
      const { hash } = await a.run()
      if (hash) logTx({ leaseId: lease.id, label: a.done, hash, at: Date.now() })
      toast({ title: a.done, body: a.doneBody, hash, secs: (performance.now() - t0) / 1000 })
      await onChange()
    } catch (e) {
      if (a.id === 'early' && isNothingDue(e)) {
        setBlockedAt(lease.paidPeriods)
        setShake(true)
        setTimeout(() => setShake(false), 600)
      } else setError(explainError(e))
    } finally {
      setBusy(null)
    }
  }
  const pick = (a: Action) => (NEEDS_CONFIRM.has(a.id) ? setConfirm(a) : run(a))
  const label = (a: Action) => (busy === a.id ? 'Confirming on Stellar…' : a.label)

  return (
    <main className="screen wide">
      <div className="top">
        <a className="icon-btn" href="#/" aria-label="Back to home">
          <ArrowLeft size={20} aria-hidden />
        </a>
        <h1>Lease {lease.id}</h1>
        {family && (
          <button className="icon-btn" onClick={proof} aria-label="Share proof link">
            <Share size={18} aria-hidden />
          </button>
        )}
      </div>

      <div className="cols">
        <div className="col">
          <section className="glass card hero-card syrup">
            <span className="label">{family ? 'Locked' : 'Locked for you'}</span>
            <Amount units={lease.held} />
            <span className="approx">
              {family && home.code !== 'CAD' && `≈ ${fmtMoney((Number(lease.held) / 1e7) * perCad(home.code), home.code)} · `}
              {fmtCAD(lease.rent)} a month · {lease.periods} months
            </span>
            <div className="hero-foot">
              <Status {...h} />
            </div>
            {blockedAt === lease.paidPeriods && periodsDue(lease, now) === 0 && (
              <p className="callout locked" role="status" style={{ marginTop: 14 }}>
                <LockKeyhole size={17} aria-hidden />
                <span>Refused. Nobody can pay out early, not even Stroop.</span>
              </p>
            )}
            {family && lease.status === 'Funded' && (
              <button className="btn primary wide" onClick={proof}>
                <Share size={18} aria-hidden /> Share proof link
              </button>
            )}
            {primary && (
              <button
                className="btn primary wide"
                onClick={() => pick(primary)}
                disabled={!!busy}
                aria-busy={busy === primary.id}
              >
                {busy === primary.id ? (
                  <LoaderCircle className="spin" size={18} aria-hidden />
                ) : (
                  primary.Icon && <primary.Icon size={18} aria-hidden />
                )}
                {label(primary)}
              </button>
            )}
            {secondary.map((a) => (
              <button
                key={a.id}
                className="btn secondary wide"
                style={{ marginTop: 10 }}
                onClick={() => pick(a)}
                disabled={!!busy}
              >
                {busy === a.id ? (
                  <LoaderCircle className="spin" size={18} aria-hidden />
                ) : (
                  a.Icon && <a.Icon size={18} aria-hidden />
                )}
                {label(a)}
              </button>
            ))}
            {error && <Problem text={error} />}
          </section>

          <h2 className="section-title">
            <span>Months</span>
          </h2>
          <section className="glass card">
            <MonthTiles lease={lease} now={now} shake={shake} />
            <div className="tiles-meta">
              <span>
                {lease.paidPeriods} paid
                {periodsDue(lease, now) > 0 && ` · ${periodsDue(lease, now)} ready to ${family ? 'pay out' : 'collect'}`}
              </span>
              <span>
                {lease.status === 'Funded' || lease.status === 'Accepted'
                  ? 'Month 1 pays at move-in'
                  : `${lease.periods - lease.paidPeriods} to go`}
              </span>
            </div>
          </section>
        </div>
        <div className="col">
          <h2 className="section-title">Where the money is</h2>
          <section className="glass card">
            <MoneyBar slices={slices} />
            <Ledger
              slices={slices.filter((s) => s.value > 0)}
              total={{ label: family ? 'You put in' : 'Lease total', amount: fmtCAD(BigInt(Math.round(total * 1e7))) }}
            />
            {/* Blend rounds to the unit; only mention a gap someone could notice (a cent or more). */}
            {lease.covered >= 100_000n && (
              <p className="callout good" style={{ marginTop: 12 }}>
                <ShieldCheck size={17} aria-hidden />
                <span>Lending came back {fmtCAD(lease.covered)} short. Stroop paid it, so the lease is whole.</span>
              </p>
            )}
          </section>

          <h2 className="section-title">Details</h2>
          <dl className="facts glass">
            <div>
              <dt>{family ? 'Landlord' : 'Tenant'}</dt>
              <dd className="mono">{short(family ? lease.landlord : lease.payer)}</dd>
            </div>
            {!family && (
              <div>
                <dt>Each month in your bank</dt>
                <dd>≈ {fmtMoney(landlordPayout(Number(lease.rent) / 1e7).receive, 'CAD')}</dd>
              </div>
            )}
            {(lease.status === 'Funded' || lease.status === 'Accepted') && (
              <div>
                <dt>Move in by</dt>
                <dd>{fmtDate(lease.moveInBy)}</dd>
              </div>
            )}
            <div>
              <dt>Disputes</dt>
              <dd>{mediatorName(lease.mediator)}</dd>
            </div>
          </dl>

          <ul className="list glass" style={{ marginTop: 14 }}>
            {quiet.map((a) => (
              <li key={a.id}>
                <button className={`row${DANGER.has(a.id) ? ' danger' : ''}`} onClick={() => pick(a)} disabled={!!busy}>
                  <RowIcon id={a.id} />
                  <span className="txt">
                    <strong>{label(a)}</strong>
                    {ROW_SUB[a.id] && <span>{ROW_SUB[a.id]}</span>}
                  </span>
                  <ChevronRight className="chev" size={18} aria-hidden />
                </button>
              </li>
            ))}
            {lease.lend && (
              <li>
                <button className="row" onClick={() => setLendInfo(true)}>
                  <span className="ico locked">
                    <HandCoins size={18} aria-hidden />
                  </span>
                  <span className="txt">
                    <strong>Lending is on</strong>
                    <span>{lease.lent > 0n ? `${fmtCAD(lease.lent)} lent · back before it’s due` : 'Nothing lent right now'}</span>
                  </span>
                  <ChevronRight className="chev" size={18} aria-hidden />
                </button>
              </li>
            )}
            <li>
              <a className="row" href={`#/proof/${lease.id}`}>
                <span className="ico">
                  <ShieldCheck size={18} aria-hidden />
                </span>
                <span className="txt">
                  <strong>Proof page</strong>
                  <span>What your {family ? 'landlord' : 'tenant'} sees</span>
                </span>
                <ChevronRight className="chev" size={18} aria-hidden />
              </a>
            </li>
            <li>
              <a className="row" href={explorer.contract(CONTRACTS.rentReserve)} target="_blank" rel="noreferrer">
                <span className="ico">
                  <ArrowUpRight size={18} aria-hidden />
                </span>
                <span className="txt">
                  <strong>Lease rules on Stellar</strong>
                  <span>Public record</span>
                </span>
              </a>
            </li>
          </ul>

          {txs.length > 0 && (
            <>
              <h2 className="section-title">Receipts</h2>
              <ul className="list glass">
                {[...txs].reverse().map((t) => (
                  <li key={t.hash}>
                    <a className="row" href={explorer.tx(t.hash)} target="_blank" rel="noreferrer">
                      <span className="ico">
                        <ReceiptText size={18} aria-hidden />
                      </span>
                      <span className="txt">
                        <strong>{t.label}</strong>
                        <span>
                          {new Date(t.at).toLocaleString('en-CA', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </span>
                      <ArrowUpRight className="chev" size={16} aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <LendingSheet
        rent={Number(lease.rent) / 1e7}
        months={lease.periods}
        open={lendInfo}
        onClose={() => setLendInfo(false)}
      >
        {stopLending && (
          <div className="actions">
            <button
              className="btn secondary"
              onClick={() => {
                setLendInfo(false)
                pick(stopLending)
              }}
              disabled={!!busy}
            >
              Stop lending
            </button>
          </div>
        )}
        {lease.lent > 0n && (
          <button
            className="link-btn"
            disabled={!!busy}
            onClick={() => {
              setLendInfo(false)
              run({
                id: 'pool-loss',
                label: 'Demo: pool loses 10%',
                done: 'Pool lost 10%',
                doneBody: 'Stroop pays the gap when the rent comes back.',
                tier: 'quiet',
                run: () => simulatePoolLoss(kp, 1000),
              })
            }}
          >
            Testnet demo: make the pool lose 10%
          </button>
        )}
      </LendingSheet>

      {confirm && (
        <ConfirmSheet
          action={confirm}
          lease={lease}
          role={role}
          now={now}
          onClose={() => setConfirm(null)}
          onConfirm={() => run(confirm)}
        />
      )}
    </main>
  )
}

/** Before anything consequential: what happens, in money terms. */
function ConfirmSheet(props: {
  action: Action
  lease: Lease
  role: Role
  now: number
  onClose: () => void
  onConfirm: () => void
}) {
  const { action: a, lease: l, now, onClose, onConfirm } = props
  const rent = fmtCAD(l.rent)
  const fee = leaseFee(l)
  const owed = l.rent * BigInt(periodsDue(l, now))
  const [code] = useHomeCurrency()
  // Refunds land in C$; sending them home costs an exchange, so show what actually arrives.
  const home = (units: bigint) =>
    code === 'CAD'
      ? undefined
      : `≈ ${fmtMoney(offRampQuote(Number(units) / 1e7, code).receive, code)} at home, at today’s rate`
  const spec: { title: string; lede?: string; rows: [string, string, string?][]; cta: string; danger?: boolean } = (() => {
    switch (a.id) {
      case 'accept':
        return {
          title: 'Accept this lease?',
          lede: `Your tenant must move in by ${fmtDate(l.moveInBy)}`,
          rows: [
            ['Each month', rent, 'Lands in full in your bank'],
            ['Term', `${l.periods} months`],
            ['Stroop’s fee for you', 'None'],
            ['Rent is set in C$', 'No exchange rate risk'],
          ],
          cta: 'Accept lease',
        }
      case 'hand-over':
        return {
          title: 'Keys handed over?',
          lede: `Your tenant gets ${fmtDuration(disputeWindowSecs(l))} to report a problem. If they don’t, rent starts.`,
          rows: [],
          cta: 'Yes, keys handed over',
        }
      case 'move-in':
        return {
          title: 'Confirm move-in?',
          lede: 'Only once you have the keys.',
          rows: [
            ['Month 1 to landlord', rent],
            [`Stroop fee · ${FEE_PCT}`, fmtCAD(fee)],
            ['Stays locked', fmtCAD(l.held - l.rent)],
          ],
          cta: 'Confirm move-in',
        }
      case 'cancel':
      case 'reclaim':
        return {
          title: 'Take your rent back?',
          lede: 'The lease is cancelled. Nothing is charged.',
          rows: [['Back to your balance', fmtCAD(l.held + l.fee), home(l.held + l.fee)]],
          cta: 'Take it back',
        }
      case 'end':
        return {
          title: l.endProposedBy ? 'Agree to end early?' : 'End the lease early?',
          lede: l.endProposedBy
            ? 'The lease ends now.'
            : `Only happens if your ${props.role === 'family' ? 'landlord' : 'tenant'} agrees.`,
          rows: [
            ['Rent owed to landlord', fmtCAD(owed)],
            ['Back to the family', fmtCAD(l.held - owed)],
          ],
          cta: l.endProposedBy ? 'Agree and end' : 'Send request',
        }
      case 'stop-lending':
        return {
          title: 'Stop lending?',
          lede: 'Lent rent comes back to the lease now. Your fee doesn’t change.',
          rows: l.lent > 0n ? [['Comes back', fmtCAD(l.lent)]] : [],
          cta: 'Stop lending',
        }
      case 'dispute':
        return {
          title: 'Report a problem?',
          lede: `Payouts pause. ${mediatorName(l.mediator)} splits the locked ${fmtCAD(l.held)}. Rent already paid stays paid.`,
          rows: [],
          cta: 'Pause and report',
          danger: true,
        }
      default:
        return { title: a.label, rows: [], cta: a.label }
    }
  })()
  return (
    <Sheet open onClose={onClose} title={spec.title}>
      {spec.lede && <p className="lede">{spec.lede}</p>}
      {spec.rows.length > 0 && (
        <dl className="facts glass strong" style={{ borderRadius: 20 }}>
          {spec.rows.map(([k, v, sub]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>
                {v}
                {sub && <small>{sub}</small>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="actions">
        <button className={`btn ${spec.danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
          {spec.cta}
        </button>
        <button className="btn secondary" onClick={onClose}>
          Not now
        </button>
      </div>
    </Sheet>
  )
}
