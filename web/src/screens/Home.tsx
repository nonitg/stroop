import { useState } from 'react'
import { Landmark, LockKeyhole, Plus, Share } from 'lucide-react'
import { useApp } from '../app'
import { fmtUSD, secsToNextRelease } from '../stellar'
import { inviteLink, useHomeCurrency, useNow } from '../hooks'
import { CAD, currency, fmtMoney } from '../money'
import { fmtClock } from '../leaseText'
import { Amount } from '../ui/Amount'
import { Brand } from '../ui/BrandMark'
import { LeaseHero, LeaseRow, featured } from '../ui/LeaseCards'
import { useShare } from '../ui/share'
import { CashOutSheet } from './MoneySheets'

function LeaseSkeleton() {
  return (
    <div className="glass card" aria-busy="true" aria-label="Loading leases">
      <span className="sk" style={{ width: 110, height: 14 }} />
      <span className="sk" style={{ width: 210, height: 44, marginTop: 12 }} />
      <span className="sk" style={{ height: 8, marginTop: 20 }} />
    </div>
  )
}

export function FamilyHome() {
  const { wallet, leases } = useApp()
  const [code] = useHomeCurrency()
  const me = wallet.kp!.publicKey()
  const top = leases?.length ? featured(leases) : null
  const rest = leases?.filter((l) => l !== top) ?? []
  return (
    <main className="screen">
      <div className="top">
        <span className="mobile-only">
          <Brand />
        </span>
        <span className="spacer" />
        {!!leases?.length && (
          <a className="pill-btn" href="#/new">
            <Plus size={18} aria-hidden /> New lease
          </a>
        )}
      </div>
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
            {fmtUSD(BigInt(Math.round((wallet.balances?.usdc ?? 0) * 1e7))).replace('.00', '')} test money ready
          </p>
        </section>
      )}
      {top && <LeaseHero lease={top} role="family" me={me} home={{ code, perUsd: currency(code).perUsd }} />}
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
  const nextSecs = (leases ?? [])
    .map((l) => secsToNextRelease(l, now))
    .filter((s): s is number => s !== null)
    .sort((a, b) => a - b)[0]
  const invite = () => share(inviteLink(me), 'Invite link', 'Send it to your tenant. Their lease will be set up for you.')
  return (
    <main className="screen">
      <div className="top">
        <span className="mobile-only">
          <Brand />
        </span>
        <span className="spacer" />
        <button className="pill-btn" onClick={invite}>
          <Share size={17} aria-hidden /> Invite tenant
        </button>
      </div>

      <section className="glass card hero-card syrup">
        <span className="label">Your balance</span>
        <Amount units={usdc} />
        <span className="approx">≈ {fmtMoney(usdc * CAD.perUsd, 'CAD')}</span>
        <button className="btn primary wide" onClick={() => setCashing(true)}>
          <Landmark size={18} aria-hidden /> Cash out
        </button>
        {locked > 0n && (
          <div className="hero-foot">
            <span className="small" style={{ flex: 1 }}>
              <strong style={{ color: 'var(--ink)' }}>{fmtUSD(locked).replace('.00', '')}</strong> locked for you
            </span>
            {nextSecs !== undefined && <span className="chip num">Next rent {fmtClock(nextSecs)}</span>}
          </div>
        )}
      </section>

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
      {!!leases?.length && (
        <>
          <h2 className="section-title">Leases</h2>
          <ul className="list glass">
            {leases.map((l) => (
              <li key={l.id}>
                <LeaseRow lease={l} role="landlord" me={me} />
              </li>
            ))}
          </ul>
        </>
      )}
      <CashOutSheet open={cashing} onClose={() => setCashing(false)} kp={kp} amount={usdc} />
    </main>
  )
}
