import { type FormEvent, useState } from 'react'
import type { Keypair } from '@stellar/stellar-sdk'
import { ChevronDown, CircleAlert, LoaderCircle, LockKeyhole, LockKeyholeOpen, Minus, Plus, UserRound } from 'lucide-react'
import { explainError, feeFor, fmtUSD, getKeypair, logTx, reserve, setupWallet, toUnits } from '../stellar'
import { FEE_PCT } from '../leaseText'
import { useLeases, useWallet } from '../hooks'
import { Dashboard } from './Dashboard'
import { Hero } from './Hero'
import { LeaseList } from './LeaseCard'
import { Money } from './Money'
import { MonthTiles } from './Schedule'
import { useToast } from './useToast'

const MAX_MONTHS = 24

export function FamilyView() {
  const wallet = useWallet('family')
  const { leases, reload } = useLeases(wallet.kp?.publicKey())
  const refreshAll = () => Promise.all([reload(), wallet.refresh()])
  if (wallet.checked && !wallet.balances) return <Hero role="family" wallet={wallet} />
  return (
    <Dashboard role="family" wallet={wallet} leases={leases}>
      {wallet.kp && <LeaseList role="family" kp={wallet.kp} leases={leases} onChange={refreshAll} />}
      {wallet.kp && wallet.balances && leases && (
        <NewLeaseForm kp={wallet.kp} collapsed={leases.length > 0} onCreated={refreshAll} />
      )}
    </Dashboard>
  )
}

function NewLeaseForm({ kp, collapsed, onCreated }: { kp: Keypair; collapsed: boolean; onCreated: () => Promise<unknown> }) {
  const toast = useToast()
  const [landlord, setLandlord] = useState(getKeypair('landlord')?.publicKey() ?? '')
  const [rent, setRent] = useState(1000)
  const [months, setMonths] = useState(12)
  const [busy, setBusy] = useState<'landlord' | 'lock' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Guard against Infinity/NaN from the number inputs so formatting never throws.
  const units = (n: number) => toUnits(Number.isFinite(n) ? n : 0)
  const rentTotal = units(rent * months)
  // The contract locks a service fee on top of the rent; it's only charged at move-in.
  const fee = feeFor(rentTotal)
  const total = fmtUSD(rentTotal + fee)
  const valid = !!landlord && rent > 0 && months >= 1 && months <= MAX_MONTHS
  const setMonthsClamped = (n: number) => setMonths(Math.min(MAX_MONTHS, Math.max(1, Math.round(n) || 1)))

  const pickDemoLandlord = async () => {
    setError(null)
    setBusy('landlord')
    try {
      const k = await setupWallet('landlord', () => {})
      setLandlord(k.publicKey())
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(null)
    }
  }

  const lock = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy('lock')
    const t0 = performance.now()
    try {
      const { result, hash } = await reserve.create(kp, landlord.trim(), rent, months)
      const id = Number(result)
      if (hash) logTx({ leaseId: id, label: 'Rent locked', hash, at: Date.now() })
      toast({ title: 'Rent locked', body: `${total} is held for lease ${id}.`, hash, secs: (performance.now() - t0) / 1000 })
      await onCreated()
      // Bring the new lease card into view; the form below it just collapsed.
      requestAnimationFrame(() =>
        document.getElementById(`lease-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      )
    } catch (err) {
      setError(explainError(err))
    } finally {
      setBusy(null)
    }
  }

  const form = (
    <form className="lease-form" onSubmit={lock}>
      <div className="field">
        <label htmlFor="landlord">Landlord's Stellar account</label>
        <div className="input-row">
          <input
            id="landlord"
            className="input mono"
            value={landlord}
            onChange={(e) => setLandlord(e.target.value)}
            placeholder="G…"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="landlord-hint"
          />
          {!landlord && (
            <button type="button" className="btn secondary" onClick={pickDemoLandlord} disabled={!!busy} aria-busy={busy === 'landlord'}>
              {busy === 'landlord' ? <LoaderCircle className="spin" size={16} aria-hidden /> : <UserRound size={16} aria-hidden />}
              {busy === 'landlord' ? 'Creating…' : 'Use a demo landlord'}
            </button>
          )}
        </div>
        <p className="field-hint" id="landlord-hint">
          Starts with G. Your landlord copies it from their Stroop account.
        </p>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="rent">Monthly rent</label>
          <div className="input affix">
            <span aria-hidden>$</span>
            <input id="rent" type="number" min={1} inputMode="decimal" value={rent} onChange={(e) => setRent(Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="months">Months</label>
          <div className="input stepper">
            <button type="button" onClick={() => setMonthsClamped(months - 1)} disabled={months <= 1} aria-label="One month fewer">
              <Minus size={16} aria-hidden />
            </button>
            <input
              id="months"
              type="number"
              min={1}
              max={MAX_MONTHS}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              onBlur={() => setMonthsClamped(months)}
            />
            <button type="button" onClick={() => setMonthsClamped(months + 1)} disabled={months >= MAX_MONTHS} aria-label="One month more">
              <Plus size={16} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <div className="lock-summary">
        <div className="lock-total">
          <span className="eyebrow">Total to lock</span>
          <Money units={rentTotal + fee} className="lock-amount" />
        </div>
        <MonthTiles states={Array(Math.min(Math.max(months || 1, 1), MAX_MONTHS)).fill('locked')} />
        <dl className="breakdown num">
          <div>
            <dt>Rent</dt>
            <dd>
              {fmtUSD(units(rent))} × {months || 0}
            </dd>
          </div>
          <div>
            <dt>Service fee ({FEE_PCT})</dt>
            <dd>
              {fmtUSD(fee)} <span className="dd-note">charged at move-in</span>
            </dd>
          </div>
        </dl>
      </div>

      <button className="btn primary lg wide lock-btn" type="submit" disabled={!!busy || !valid} aria-busy={busy === 'lock'}>
        {busy === 'lock' ? (
          <LoaderCircle className="spin" size={18} aria-hidden />
        ) : (
          <span className="lock-icon" aria-hidden>
            <LockKeyholeOpen size={18} className="open" />
            <LockKeyhole size={18} className="shut" />
          </span>
        )}
        {busy === 'lock' ? 'Locking on Stellar…' : `Lock ${total}`}
      </button>
      <p className="demo-note">Demo clock: 1 month = 1 minute. No keys within 30 minutes? Take everything back.</p>
      {error && (
        <p className="alert error" role="alert">
          <CircleAlert size={16} aria-hidden /> {error}
        </p>
      )}
    </form>
  )

  if (collapsed)
    return (
      <details className="card new-lease">
        <summary>
          <span>Lock rent for another lease</span>
          <ChevronDown className="chev" size={18} aria-hidden />
        </summary>
        {form}
      </details>
    )
  return (
    <section className="card new-lease" aria-labelledby="new-lease-title">
      <h3 id="new-lease-title" className="card-title">
        Lock rent for a new lease
      </h3>
      {form}
    </section>
  )
}
