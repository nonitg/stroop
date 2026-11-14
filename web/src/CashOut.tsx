import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, CircleAlert, LoaderCircle, X } from 'lucide-react'
import { getKeypair } from './stellar'
import { ANCHOR_DOMAIN, authenticate, discoverAnchor, startWithdrawal, withdrawalStatus } from './sep24'
import { OFF_RAMP_FEE, fmtMoney, offRampQuote, pct } from './money'

type Phase = 'idle' | 'working' | 'open' | 'error'

const STEPS = ['Connect to the cash-out service', 'Sign in with your Stroop account', 'Enter your bank details on their secure form']

// Landlord withdraws received USDC to a Canadian bank through a Stellar anchor (the off-ramp).
// The SEP-10 sign-in and SEP-24 form are real (SDF's test anchor); on testnet no money moves.
export function CashOut({ onClose, amount }: { onClose: () => void; amount: number }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [step, setStep] = useState(-1)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [poll, setPoll] = useState<(() => Promise<string>) | null>(null)
  const q = offRampQuote(amount)

  useEffect(() => {
    if (!poll) return
    const t = setInterval(() => poll().then(setStatus).catch(() => {}), 5000)
    return () => clearInterval(t)
  }, [poll])

  const start = async () => {
    const kp = getKeypair('landlord')
    if (!kp) return
    // Open the window during the click so browsers don't block it as a popup.
    const win = window.open('', 'stroop-anchor', 'width=480,height=760')
    if (win) win.opener = null // the anchor page gets no handle back into this app
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
    <section className="panel" aria-labelledby="cashout-title">
      <header className="panel-head">
        <h3 id="cashout-title">Cash out to your bank</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close cash out">
          <X size={16} aria-hidden />
        </button>
      </header>

      <dl className="quote num">
        <div>
          <dt>You cash out</dt>
          <dd>{fmtMoney(amount, 'USD', { cents: true })}</dd>
        </div>
        <div>
          <dt>Rate</dt>
          <dd>1 USDC = {fmtMoney(q.rate, 'CAD', { cents: true })}</dd>
        </div>
        <div>
          <dt>Cash-out fee, est. {pct(OFF_RAMP_FEE)}</dt>
          <dd>−{fmtMoney(q.fee, 'CAD', { cents: true })}</dd>
        </div>
        <div className="quote-total">
          <dt>Lands in your bank</dt>
          <dd>≈ {fmtMoney(q.receive, 'CAD', { cents: true })}</dd>
        </div>
      </dl>

      {phase !== 'idle' && (
        <ol className="checklist" aria-live="polite">
          {STEPS.map((label, i) => {
            const state =
              i < step ? 'done' : i === step && phase === 'working' ? 'active' : phase === 'error' && i === step ? 'failed' : 'todo'
            return (
              <li key={label} className={state}>
                <span className="step-mark" aria-hidden>
                  {state === 'done' && <Check size={12} strokeWidth={3} />}
                  {state === 'active' && <LoaderCircle className="spin" size={14} />}
                  {state === 'failed' && <X size={12} strokeWidth={3} />}
                </span>
                {label}
              </li>
            )
          })}
        </ol>
      )}

      {phase === 'open' && (
        <p className="panel-status">
          Their form is open in a new window. Status: <strong>{status?.replace(/_/g, ' ')}</strong>
        </p>
      )}
      {phase === 'error' && (
        <p className="alert error" role="alert">
          <CircleAlert size={16} aria-hidden /> {error}
        </p>
      )}
      {amount === 0 && <p className="panel-status">Nothing to cash out yet. Rent lands here each month, starting at move-in.</p>}
      {amount > 0 && (phase === 'idle' || phase === 'error') && (
        <button className="btn primary wide" onClick={start}>
          {phase === 'error' ? 'Try again' : 'Continue to cash out'} <ArrowUpRight size={16} aria-hidden />
        </button>
      )}
      <p className="fine">
        A licensed Canadian cash-out service turns USDC into dollars in your bank. In this demo the sign-in and bank form are
        real, on the Stellar Foundation’s test service ({ANCHOR_DOMAIN}), but no money moves. Rate and fee are estimates.
      </p>
    </section>
  )
}
