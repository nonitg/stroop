import { type FormEvent, useState } from 'react'
import type { Keypair } from '@stellar/stellar-sdk'
import { ChevronDown, CircleAlert, LoaderCircle, LockKeyhole, UserRound } from 'lucide-react'
import { explainError, feeFor, fmtUSD, getKeypair, logTx, reserve, setupWallet, toUnits } from '../stellar'
import { FEE_PCT } from '../leaseText'
import { useLeases, useWallet } from '../hooks'
import { AccountPanel } from './Account'
import { LeaseList } from './LeaseCard'
import { ProofPreview } from './ProofPreview'
import { FamilyStory } from './Story'
import { useToast } from './useToast'

export function FamilyView() {
  const wallet = useWallet('family')
  const { leases, reload } = useLeases(wallet.kp?.publicKey())
  const refreshAll = () => Promise.all([reload(), wallet.refresh()])
  return (
    <div className={`split${wallet.balances ? ' has-account' : ''}`}>
      <FamilyStory />
      <div className="workspace">
        <AccountPanel role="family" wallet={wallet} />
        {wallet.checked && !wallet.balances && <ProofPreview />}
        {wallet.kp && <LeaseList role="family" kp={wallet.kp} leases={leases} onChange={refreshAll} />}
        {wallet.kp && wallet.balances && (
          <NewLeaseForm kp={wallet.kp} collapsed={!!leases?.length} onCreated={refreshAll} />
        )}
      </div>
    </div>
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
  const valid = !!landlord && rent > 0 && months >= 1

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
    try {
      const { result, hash } = await reserve.create(kp, landlord.trim(), rent, months)
      const id = Number(result)
      if (hash) logTx({ leaseId: id, label: 'Rent locked', hash, at: Date.now() })
      toast({ title: 'Rent locked', body: `${total} is now held for lease ${id}.`, hash })
      await onCreated()
      // Bring the new lease card into view; the form above it just collapsed.
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
        <input
          id="landlord"
          className="mono-input"
          value={landlord}
          onChange={(e) => setLandlord(e.target.value)}
          placeholder="G…"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="landlord-hint"
        />
        <div className="field-hint" id="landlord-hint">
          <span>Starts with G. Your landlord copies it from their RentProof account.</span>
          {!landlord && (
            <button type="button" className="btn secondary small" onClick={pickDemoLandlord} disabled={!!busy} aria-busy={busy === 'landlord'}>
              {busy === 'landlord' ? <LoaderCircle className="spin" size={16} aria-hidden /> : <UserRound size={16} aria-hidden />}
              {busy === 'landlord' ? 'Creating demo landlord…' : 'Use a demo landlord'}
            </button>
          )}
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="rent">Monthly rent</label>
          <div className="affix">
            <span aria-hidden>$</span>
            <input id="rent" type="number" min={1} inputMode="decimal" value={rent} onChange={(e) => setRent(Number(e.target.value))} />
          </div>
        </div>
        <div className="field months">
          <label htmlFor="months">Months</label>
          <input id="months" type="number" min={1} max={24} value={months} onChange={(e) => setMonths(Number(e.target.value))} />
        </div>
      </div>
      <div className="lock-summary">
        <div>
          <span className="label">Total to lock</span>
          <span className="amount">{total}</span>
          <span className="unit">test USDC</span>
        </div>
        <dl className="breakdown">
          <div>
            <dt>Rent</dt>
            <dd>{fmtUSD(rentTotal)}</dd>
            <dd className="breakdown-note">{fmtUSD(units(rent))} a month goes to the landlord, never early.</dd>
          </div>
          <div>
            <dt>Service fee ({FEE_PCT})</dt>
            <dd>{fmtUSD(fee)}</dd>
            <dd className="breakdown-note">Charged only after you move in; refunded if you don't.</dd>
          </div>
        </dl>
        <p className="demo-note">
          Demo speed: 1 month = 1 minute. If the keys aren't handed over within 30 minutes, you can take everything
          back.
        </p>
      </div>
      <button className="btn primary wide" type="submit" disabled={!!busy || !valid} aria-busy={busy === 'lock'}>
        {busy === 'lock' ? <LoaderCircle className="spin" size={18} aria-hidden /> : <LockKeyhole size={18} aria-hidden />}
        {busy === 'lock' ? 'Locking rent…' : `Lock ${total}`}
      </button>
      {error && (
        <p className="alert error" role="alert">
          <CircleAlert size={18} aria-hidden /> {error}
        </p>
      )}
    </form>
  )

  if (collapsed)
    return (
      <details className="panel new-lease">
        <summary>
          <h2>Lock rent for another lease</h2>
          <ChevronDown className="chev" size={20} aria-hidden />
        </summary>
        {form}
      </details>
    )
  return (
    <section className="panel new-lease" aria-labelledby="new-lease-title">
      <h2 id="new-lease-title">Lock rent for a new lease</h2>
      {form}
    </section>
  )
}
