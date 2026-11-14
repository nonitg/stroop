import { type FormEvent, useState } from 'react'
import type { Keypair } from '@stellar/stellar-sdk'
import { ChevronDown, CircleAlert, LoaderCircle, LockKeyhole, Minus, Plus, UserRound } from 'lucide-react'
import { explainError, feeFor, fmtUSD, getKeypair, logTx, reserve, setupWallet, toUnits } from '../stellar'
import { CAD, CURRENCIES, fmtMoney } from '../money'
import { STROOP_DESK, mediatorProblem } from '../mediators'
import { useHomeCurrency, useLeases, useWallet } from '../hooks'
import { Dashboard } from './Dashboard'
import { Hero } from './Hero'
import { LeaseList } from './LeaseCard'
import { MoneyFlow } from './MoneyFlow'
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
  const [mediatorKind, setMediatorKind] = useState<'stroop' | 'custom'>('stroop')
  const [customMediator, setCustomMediator] = useState('')
  const [code, setCode] = useHomeCurrency()
  const [busy, setBusy] = useState<'landlord' | 'lock' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Guard against Infinity/NaN from the number inputs so formatting never throws.
  const safeRent = Number.isFinite(rent) && rent > 0 ? rent : 0
  const safeMonths = Number.isFinite(months) ? Math.min(MAX_MONTHS, Math.max(1, Math.round(months))) : 1
  const rentTotal = toUnits(safeRent * safeMonths)
  const total = fmtUSD(rentTotal + feeFor(rentTotal))
  const mediator = mediatorKind === 'stroop' ? STROOP_DESK.address : customMediator.trim()
  const mediatorError = mediatorKind === 'custom' ? mediatorProblem(customMediator, kp.publicKey(), landlord) : null
  const valid = !!landlord && safeRent > 0 && months >= 1 && months <= MAX_MONTHS && !mediatorError
  const blocker = !landlord.trim()
    ? 'Add your landlord’s account in step 1 to continue.'
    : safeRent <= 0
      ? 'Enter the monthly rent to continue.'
      : mediatorError
        ? 'Add a valid mediator account in step 2, or pick the Stroop Resolution Desk.'
        : null
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
      const { result, hash } = await reserve.create(kp, landlord.trim(), mediator, safeRent, safeMonths)
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
      <section className="form-section" aria-labelledby="lease-terms">
        <h3 className="form-section-title" id="lease-terms">
          <span className="step-n">1</span> The lease
        </h3>
        <div className="field">
          <label htmlFor="landlord">Landlord’s account ID</label>
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
            Your landlord copies it from their Stroop landlord page and sends it to you.
          </p>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="rent">Monthly rent</label>
            <div className="input affix">
              <span aria-hidden>US$</span>
              <input id="rent" type="number" min={1} inputMode="decimal" value={rent} onChange={(e) => setRent(Number(e.target.value))} aria-describedby="rent-hint" />
            </div>
            <p className="field-hint num" id="rent-hint">
              ≈ {fmtMoney(safeRent * CAD.perUsd, 'CAD')} a month in Canadian dollars
            </p>
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
      </section>

      <section className="form-section" aria-labelledby="lease-mediator">
        <h3 className="form-section-title" id="lease-mediator">
          <span className="step-n">2</span> Mediator, if there’s ever a dispute
        </h3>
        <div className="choices" role="radiogroup" aria-label="Mediator">
          <label className="choice">
            <input type="radio" name="mediator" checked={mediatorKind === 'stroop'} onChange={() => setMediatorKind('stroop')} />
            <span>
              <strong>{STROOP_DESK.name}</strong>
              <span className="choice-sub">Default. Stroop’s dispute team. They can only split the rent between you two.</span>
            </span>
          </label>
          <label className="choice">
            <input type="radio" name="mediator" checked={mediatorKind === 'custom'} onChange={() => setMediatorKind('custom')} />
            <span>
              <strong>Someone you both trust</strong>
              <span className="choice-sub">A settlement agency, school housing office or lawyer.</span>
            </span>
          </label>
        </div>
        {mediatorKind === 'custom' && (
          <div className="field">
            <label htmlFor="mediator">Mediator’s account ID</label>
            <input
              id="mediator"
              className="input mono"
              value={customMediator}
              onChange={(e) => setCustomMediator(e.target.value)}
              placeholder="G…"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!customMediator && !!mediatorError}
              aria-describedby="mediator-hint"
            />
            {customMediator && mediatorError && (
              <p className="field-hint error" id="mediator-hint">
                {mediatorError}
              </p>
            )}
          </div>
        )}
        <p className="fine">
          The mediator only steps in if you or your landlord raise a dispute. They can split the locked rent between the two of
          you, and nothing else: they can’t keep any of it or send it anywhere else. Your landlord sees this choice before
          accepting.
        </p>
      </section>

      <section className="form-section" aria-labelledby="lease-paying">
        <h3 className="form-section-title" id="lease-paying">
          <span className="step-n">3</span> Paying from
        </h3>
        <div className="field">
          <label htmlFor="currency">Your bank’s currency</label>
          <select id="currency" className="input" value={code} onChange={(e) => setCode(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>
        <div className="summary">
          <h3 className="summary-title">Where your money goes</h3>
          <MoneyFlow rent={safeRent} months={safeMonths} code={code} you="family" />
        </div>
        <p className="fine">
          Testnet demo: the lock uses the test USDC already in your account, and rates and partner fees are estimates. In
          production, a licensed on-ramp converts your bank transfer to USDC first.
        </p>
      </section>

      <button className="btn primary lg wide" type="submit" disabled={!!busy || !valid} aria-busy={busy === 'lock'}>
        {busy === 'lock' ? <LoaderCircle className="spin" size={18} aria-hidden /> : <LockKeyhole size={18} aria-hidden />}
        {busy === 'lock' ? 'Locking on Stellar…' : `Lock ${total}`}
      </button>
      <p className="demo-note">
        {blocker && !busy ? blocker : 'Demo clock: 1 month = 1 minute. No keys within 30 minutes? You take everything back.'}
      </p>
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
      <h2 id="new-lease-title" className="card-title">
        Lock rent for a new lease
      </h2>
      {form}
    </section>
  )
}
