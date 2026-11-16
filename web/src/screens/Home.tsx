import { type ReactNode, useState } from 'react'
import { Landmark, LockKeyhole, Plus, Send, Share } from 'lucide-react'
import { useApp } from '../app'
import { fmtUSD, secsToNextRelease, toUnits } from '../stellar'
import { inviteLink, useHomeCurrency, useNow, verifyLink } from '../hooks'
import { currency, fmtMoney, landlordPayout } from '../money'
import { fmtClock, headline } from '../leaseText'
import { Amount } from '../ui/Amount'
import { BrandMark } from '../ui/BrandMark'
import { LeaseHero, LeaseRow, featured } from '../ui/LeaseCards'
import { RolePill } from '../ui/RolePill'
import { useShare } from '../ui/share'
import { AddMoneySheet, CashOutSheet } from './MoneySheets'

function LeaseSkeleton() {
  return (
    <div className="glass card" aria-busy="true" aria-label="Loading leases">
      <span className="sk" style={{ width: 110, height: 14 }} />
      <span className="sk" style={{ width: 210, height: 44, marginTop: 12 }} />
      <span className="sk" style={{ height: 8, marginTop: 20 }} />
    </div>
  )
}

/** Logo + whose app this is, then whatever the screen wants on the right. */
function HomeTop({ role, children }: { role: 'family' | 'landlord'; children?: ReactNode }) {
  return (
    <div className="top">
      <span className="mobile-only">
        <BrandMark />
      </span>
      <RolePill role={role} />
      <span className="spacer" />
      {children}
    </div>
  )
}

export function FamilyHome() {
  const { wallet, leases } = useApp()
  const [code] = useHomeCurrency()
  const share = useShare()
  const [sheet, setSheet] = useState<'add' | 'send' | null>(null)
  const kp = wallet.kp!
  const me = kp.publicKey()
  const usdc = wallet.balances?.usdc ?? 0
  const home = currency(code)
  const top = leases?.length ? featured(leases) : null
  const rest = leases?.filter((l) => l !== top) ?? []
  const paid = (leases ?? []).reduce((s, l) => s + l.rent * BigInt(l.paidPeriods), 0n)
  return (
    <main className="screen">
      <HomeTop role="family">
        {!!leases?.length && (
          <a className="pill-btn" href="#/new">
            <Plus size={18} aria-hidden /> New lease
          </a>
        )}
      </HomeTop>
      {!leases && <LeaseSkeleton />}
      {leases?.length === 0 && (
        <section className="glass card empty">
          <span className="ico-lg">
            <LockKeyhole size={26} aria-hidden />
          </span>
          <h2>Lock your first lease</h2>
          <p>Your landlord sees it’s real. Rent pays monthly. What isn’t owed stays yours.</p>
          <a className="btn primary wide" href="#/new">
            Start
          </a>
          <p className="fine" style={{ marginTop: 14 }}>
            {fmtUSD(toUnits(usdc))} test money ready
          </p>
        </section>
      )}
      {top && <LeaseHero lease={top} role="family" me={me} home={{ code, perUsd: home.perUsd }} />}
      {top && (
        <>
          <div className="quick">
            <button onClick={() => setSheet('add')}>
              <span className="qi">
                <Plus size={19} aria-hidden />
              </span>
              Add money
            </button>
            <button onClick={() => setSheet('send')}>
              <span className="qi">
                <Send size={18} aria-hidden />
              </span>
              Send to bank
            </button>
            <button onClick={() => share(verifyLink(top.id), 'Proof link', 'Send it to your landlord.')}>
              <span className="qi">
                <Share size={18} aria-hidden />
              </span>
              Share proof
            </button>
          </div>
          <div className="stat-row">
            <a className="stat" href="#/account" style={{ textDecoration: 'none' }}>
              <span className="label">Your balance</span>
              <strong>{fmtUSD(toUnits(usdc))}</strong>
              {home.code !== 'USD' && <span className="small">≈ {fmtMoney(usdc * home.perUsd, home.code)}</span>}
            </a>
            <div className="stat">
              <span className="label">Paid to landlords</span>
              <strong>{fmtUSD(paid)}</strong>
              <span className="small">Every payment has a receipt</span>
            </div>
          </div>
        </>
      )}
      {rest.length > 0 && (
        <>
          <h2 className="section-title">Other leases</h2>
          <ul className="list glass">
            {rest.map((l) => (
              <li key={l.id}>
                <LeaseRow lease={l} role="family" me={me} />
              </li>
            ))}
          </ul>
        </>
      )}
      <AddMoneySheet open={sheet === 'add'} onClose={() => setSheet(null)} kp={kp} code={code} onAdded={wallet.refresh} />
      <CashOutSheet
        open={sheet === 'send'}
        onClose={() => setSheet(null)}
        kp={kp}
        amount={usdc}
        code={code}
        title="Send to your bank"
      />
    </main>
  )
}

export function LandlordHome() {
  const { wallet, leases } = useApp()
  const now = useNow()
  const share = useShare()
  const [cashing, setCashing] = useState(false)
  const kp = wallet.kp!
  const me = kp.publicKey()
  const usdc = wallet.balances?.usdc ?? 0
  const locked = (leases ?? []).reduce((s, l) => s + l.held, 0n)
  const earned = (leases ?? []).reduce((s, l) => s + l.rent * BigInt(l.paidPeriods), 0n)
  const nextSecs = (leases ?? [])
    .map((l) => secsToNextRelease(l, now))
    .filter((s): s is number => s !== null)
    .sort((a, b) => a - b)[0]
  // A lease waiting on the landlord goes first: that's the one thing to do.
  const urgent = leases?.find((l) => headline(l, 'landlord', me, now).mood === 'you')
  const invite = () => share(inviteLink(me), 'Invite link', 'Send it to your tenant. Their lease will be set up for you.')
  return (
    <main className="screen">
      <HomeTop role="landlord">
        <button className="pill-btn" onClick={invite}>
          <Share size={17} aria-hidden /> Invite tenant
        </button>
      </HomeTop>

      {urgent && <LeaseHero lease={urgent} role="landlord" me={me} />}

      <section className="glass card hero-card" style={urgent ? { marginTop: 14 } : undefined}>
        <span className="label">Ready to cash out</span>
        <Amount units={landlordPayout(usdc).receive} code="CAD" />
        <span className="approx">
          {usdc > 0
            ? `${fmtMoney(usdc, 'USD', { cents: usdc % 1 !== 0 })} received · cash-out fee on us`
            : 'Rent lands here on each payday.'}
        </span>
        <button className="btn primary wide" onClick={() => setCashing(true)} disabled={usdc <= 0}>
          <Landmark size={18} aria-hidden /> Cash out to your bank
        </button>
      </section>

      {!!leases?.length && (
        <div className="stat-row">
          <div className="stat">
            <span className="label">Earned so far</span>
            <strong>{fmtUSD(earned)}</strong>
            <span className="small">≈ {fmtMoney(landlordPayout(Number(earned) / 1e7).receive, 'CAD')}</span>
          </div>
          <div className="stat">
            <span className="label">Locked for you</span>
            <strong>{fmtUSD(locked)}</strong>
            <span className="small num">
              {nextSecs !== undefined ? `Next rent in ${fmtClock(nextSecs)}` : 'Paid out monthly'}
            </span>
          </div>
        </div>
      )}

      {leases === null && <LeaseSkeleton />}
      {leases?.length === 0 && (
        <section className="glass card empty" style={{ marginTop: 14 }}>
          <h2>No tenants yet</h2>
          <p>Send your invite link. When a tenant locks rent, it shows up here.</p>
          <button className="btn secondary wide" onClick={invite}>
            <Share size={18} aria-hidden /> Share invite link
          </button>
        </section>
      )}
      {leases && leases.some((l) => l !== urgent) && (
        <>
          <h2 className="section-title">Leases</h2>
          <ul className="list glass">
            {leases
              .filter((l) => l !== urgent)
              .map((l) => (
                <li key={l.id}>
                  <LeaseRow lease={l} role="landlord" me={me} />
                </li>
              ))}
          </ul>
        </>
      )}
      <CashOutSheet open={cashing} onClose={() => setCashing(false)} kp={kp} amount={usdc} covered />
    </main>
  )
}
