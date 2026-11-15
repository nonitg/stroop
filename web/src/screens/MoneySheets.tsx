import { useEffect, useState } from 'react'
import type { Keypair } from '@stellar/stellar-sdk'
import { ArrowUpRight, Check, CircleAlert, LoaderCircle, X } from 'lucide-react'
import { TEST_DRIP_USDC, dripTestUsdc, explainError } from '../stellar'
import { ON_RAMP_FEE, OFF_RAMP_FEE, fmtMoney, offRampQuote, onRampQuote, pct } from '../money'
import { authenticate, discoverAnchor, startWithdrawal, withdrawalStatus } from '../sep24'
import { useToast } from '../components/useToast'
import { Sheet } from '../ui/Sheet'

/** On-ramp: a bank transfer in the family's currency becomes US dollars on Stroop. Testnet mints test USDC instead. */
export function AddMoneySheet(props: {
  open: boolean
  onClose: () => void
  kp: Keypair
  code: string
  onAdded: () => Promise<unknown>
}) {
  const { open, onClose, kp, code, onAdded } = props
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const q = onRampQuote(TEST_DRIP_USDC, code)
  const usd = fmtMoney(TEST_DRIP_USDC, 'USD')
  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      await dripTestUsdc(kp)
      await onAdded()
      toast({ title: 'Money added', body: `${usd} of test money is in your balance.` })
      onClose()
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Add money">
      <dl className="facts glass strong" style={{ borderRadius: 20 }}>
        <div>
          <dt>You send</dt>
          <dd>{fmtMoney(q.pay, code)}</dd>
        </div>
        {q.fee > 0 && (
          <div>
            <dt>Exchange fee, est. {pct(ON_RAMP_FEE)}</dt>
            <dd>
              {fmtMoney(q.fee, code)}
              <small>Kept by the exchange partner</small>
            </dd>
          </div>
        )}
        <div>
          <dt>You get</dt>
          <dd>{usd}</dd>
        </div>
      </dl>
      <p className="help">Testnet adds test money with no real value.</p>
      <div className="actions">
        <button className="btn primary" onClick={add} disabled={busy} aria-busy={busy}>
          {busy && <LoaderCircle className="spin" size={18} aria-hidden />}
          {busy ? 'Adding…' : `Add ${usd}`}
        </button>
      </div>
      {error && <Problem text={error} />}
    </Sheet>
  )
}

type Phase = 'idle' | 'working' | 'open' | 'error'
const STEPS = ['Connect to the cash-out partner', 'Sign in with your Stroop account', 'Enter your bank on their form']

/**
 * Off-ramp: US dollars on Stroop go to a bank through a licensed partner (real SEP-10/SEP-24 on SDF's test anchor).
 * Landlords cash out to C$ with the fee paid back; renters send refunds home in their own currency.
 */
export function CashOutSheet(props: {
  open: boolean
  onClose: () => void
  kp: Keypair
  amount: number
  code?: string
  covered?: boolean
  title?: string
}) {
  const { open, onClose, kp, amount, code = 'CAD', covered = false, title = 'Cash out' } = props
  const [phase, setPhase] = useState<Phase>('idle')
  const [step, setStep] = useState(-1)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [poll, setPoll] = useState<(() => Promise<string>) | null>(null)
  const q = offRampQuote(amount, code, covered)

  useEffect(() => {
    if (!poll) return
    const t = setInterval(
      () =>
        poll()
          .then(setStatus)
          .catch(() => {}),
      5000,
    )
    return () => clearInterval(t)
  }, [poll])

  const start = async () => {
    // Open the window during the click so it isn't blocked as a popup.
    const win = window.open('', 'stroop-anchor', 'width=480,height=760')
    if (win) win.opener = null
    setPhase('working')
    setError('')
    try {
      setStep(0)
      const anchor = await discoverAnchor()
      setStep(1)
      const token = await authenticate(kp, anchor)
      setStep(2)
      const w = await startWithdrawal(kp, anchor, token)
      if (win) win.location.href = w.url
      else window.open(w.url, '_blank')
      const check = () => withdrawalStatus(anchor, token, w.id)
      setPoll(() => check)
      setStatus(await check())
      setStep(3)
      setPhase('open')
    } catch (e) {
      win?.close()
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="big-total">
        <span className="label">Lands in your bank</span>
        <span className="amount md num">≈ {fmtMoney(q.receive, code, { cents: true })}</span>
      </div>
      <dl className="facts glass strong" style={{ borderRadius: 20, marginTop: 10 }}>
        <div>
          <dt>Your balance</dt>
          <dd>{fmtMoney(amount, 'USD', { cents: true })}</dd>
        </div>
        <div>
          <dt>Cash-out fee, est. {pct(OFF_RAMP_FEE)}</dt>
          <dd>
            −{fmtMoney(q.fee, code, { cents: true })}
            <small>Kept by the cash-out partner</small>
          </dd>
        </div>
        {covered && (
          <div className="good-row">
            <dt>Paid back by Stroop</dt>
            <dd>+{fmtMoney(q.rebate, code, { cents: true })}</dd>
          </div>
        )}
        <div>
          <dt>Stroop’s fee</dt>
          <dd>{fmtMoney(0, code)}</dd>
        </div>
      </dl>

      {phase !== 'idle' && (
        <ol className="steps" aria-live="polite" style={{ marginTop: 16 }}>
          {STEPS.map((label, i) => {
            const state = i < step ? 'done' : i === step && phase === 'working' ? 'active' : ''
            return (
              <li key={label} className={state}>
                <span className="mark" aria-hidden>
                  {state === 'done' && <Check size={14} strokeWidth={3} />}
                  {state === 'active' && <LoaderCircle className="spin" size={16} />}
                  {phase === 'error' && i === step && <X size={14} strokeWidth={3} />}
                </span>
                {label}
              </li>
            )
          })}
        </ol>
      )}
      {phase === 'open' && (
        <p className="callout good" style={{ marginTop: 12 }}>
          <Check size={17} aria-hidden /> Their form opened in a new window. Status: {status?.replace(/_/g, ' ')}
        </p>
      )}
      {phase === 'error' && <Problem text={error} />}
      <p className="help">Testnet: the sign-in and bank form are real, on Stellar’s test partner. No money moves.</p>
      {(phase === 'idle' || phase === 'error') && (
        <div className="actions">
          <button className="btn primary" onClick={start} disabled={amount <= 0}>
            {amount <= 0 ? 'Nothing to cash out yet' : phase === 'error' ? 'Try again' : 'Continue'}
            {amount > 0 && <ArrowUpRight size={18} aria-hidden />}
          </button>
        </div>
      )}
    </Sheet>
  )
}

export function Problem({ text }: { text: string }) {
  return (
    <p className="callout stop" role="alert" style={{ marginTop: 12 }}>
      <CircleAlert size={17} aria-hidden /> {text}
    </p>
  )
}
