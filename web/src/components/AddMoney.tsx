import { useState } from 'react'
import type { Keypair } from '@stellar/stellar-sdk'
import { CircleAlert, LoaderCircle, X } from 'lucide-react'
import { TEST_DRIP_USDC, dripTestUsdc, explainError } from '../stellar'
import { CURRENCIES, ON_RAMP_FEE, fmtMoney, onRampQuote, pct } from '../money'
import { useHomeCurrency } from '../hooks'
import { useToast } from './useToast'

/** The on-ramp: a bank transfer in the family's currency becomes USDC in their account. Testnet mints test USDC instead. */
export function AddMoney({ kp, onClose, onAdded }: { kp: Keypair; onClose: () => void; onAdded: () => Promise<unknown> }) {
  const toast = useToast()
  const [code, setCode] = useHomeCurrency()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const q = onRampQuote(TEST_DRIP_USDC, code)
  const usdc = fmtMoney(TEST_DRIP_USDC, 'USD', { cents: true })

  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      await dripTestUsdc(kp)
      await onAdded()
      toast({ title: 'Money added', body: `${usdc} in test USDC is in your account.` })
      onClose()
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="add-money-title">
      <header className="panel-head">
        <h3 id="add-money-title">Add money</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close add money">
          <X size={16} aria-hidden />
        </button>
      </header>
      <div className="field">
        <label htmlFor="add-currency">Pay from a bank account in</label>
        <select id="add-currency" className="input" value={code} onChange={(e) => setCode(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </div>
      <dl className="quote num">
        <div>
          <dt>You send</dt>
          <dd>{fmtMoney(q.pay, code)}</dd>
        </div>
        {q.fee > 0 && (
          <div>
            <dt>Includes on-ramp fee, est. {pct(ON_RAMP_FEE)}</dt>
            <dd>{fmtMoney(q.fee, code)}</dd>
          </div>
        )}
        <div>
          <dt>Rate</dt>
          <dd>1 USDC = {fmtMoney(q.rate, code, { cents: true })}</dd>
        </div>
        <div className="quote-total">
          <dt>Arrives in your account</dt>
          <dd>{usdc}</dd>
        </div>
      </dl>
      <p className="fine">
        In production, a licensed on-ramp takes your bank transfer and sends USDC here, usually within minutes. On testnet
        this adds test USDC with no real value.
      </p>
      <button className="btn primary wide" onClick={add} disabled={busy} aria-busy={busy}>
        {busy && <LoaderCircle className="spin" size={16} aria-hidden />}
        {busy ? 'Adding on Stellar…' : `Add ${TEST_DRIP_USDC.toLocaleString('en-US')} test USDC`}
      </button>
      {error && (
        <p className="alert error" role="alert">
          <CircleAlert size={16} aria-hidden /> {error}
        </p>
      )}
    </section>
  )
}
