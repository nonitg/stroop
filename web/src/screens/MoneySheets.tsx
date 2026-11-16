import { useEffect, useState } from 'react'
import type { Keypair } from '@stellar/stellar-sdk'
import { ArrowUpRight, Check, CircleAlert, Landmark, LoaderCircle, X } from 'lucide-react'
import { addTestMoney, explainError } from '../stellar'
import {
  CASH_OUT_FEE,
  FX_FEE,
  QUOTE_HOLD_SECS,
  fmtMoney,
  offRampQuote,
  onRampQuote,
  pct,
  rampRoute,
} from '../money'
import { authenticate, discoverAnchor, startWithdrawal, withdrawalStatus } from '../sep24'
import { useToast } from '../components/useToast'
import { Sheet } from '../ui/Sheet'

type AddPhase = 'quote' | 'pay' | 'arriving'
const ARRIVING = ['Partner receives your transfer', 'Converted to Canadian dollars', 'Added to your Stroop balance']
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`

/** Seconds left on a quote; a new quote starts each time it runs out. */
function useQuoteClock(running: boolean) {
  const [left, setLeft] = useState(QUOTE_HOLD_SECS)
  useEffect(() => {
    if (!running) return
    setLeft(QUOTE_HOLD_SECS)
    const t = setInterval(() => setLeft((s) => (s <= 1 ? QUOTE_HOLD_SECS : s - 1)), 1000)
    return () => clearInterval(t)
  }, [running])
  return left
}

/**
 * On-ramp: the family's bank transfer becomes C$ on Stroop through a licensed exchange partner.
 * The rate is fixed here, once; after that the lease is in C$ and never moves.
 * Testnet: the partner is simulated and the faucet mints the C$ the transfer would have bought.
 */
export function AddMoneySheet(props: {
  open: boolean
  onClose: () => void
  kp: Keypair
  code: string
  /** C$ needed, when a lease asks for an exact amount. */
  cad?: number
  onAdded: () => Promise<unknown>
}) {
  const { open, onClose, kp, code, onAdded } = props
  const toast = useToast()
  const [phase, setPhase] = useState<AddPhase>('quote')
  const [typed, setTyped] = useState('5000')
  const [done, setDone] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const left = useQuoteClock(open && phase !== 'arriving')
  useEffect(() => {
    if (open) {
      setPhase('quote')
      setDone(-1)
      setError(null)
    }
  }, [open])

  const cad = props.cad ?? Math.max(0, Number(typed) || 0)
  const q = onRampQuote(cad, code)
  const route = rampRoute(code)
  const foreign = code !== 'CAD'
  const reference = `STROOP-${kp.publicKey().slice(-6)}`

  const arrive = async () => {
    setPhase('arriving')
    setError(null)
    try {
      setDone(0)
      await pause(700)
      if (foreign) {
        setDone(1)
        await pause(700)
      }
      setDone(2)
      await addTestMoney(kp, cad)
      await onAdded()
      setDone(3)
      toast({ title: 'Money added', body: `${fmtMoney(cad, 'CAD', { cents: true })} is in your balance.` })
      await pause(600)
      onClose()
    } catch (e) {
      setError(explainError(e))
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add money">
      {phase === 'quote' && (
        <>
          {props.cad === undefined && (
            <label className="big-input" htmlFor="add-cad" style={{ marginBottom: 6 }}>
              <span className="cur">C$</span>
              <input
                id="add-cad"
                inputMode="decimal"
                value={typed}
                onChange={(e) => setTyped(e.target.value.replace(/[^\d.]/g, ''))}
                style={{ width: `${Math.max(2, typed.length) + 0.15}ch` }}
                aria-label="Canadian dollars to add"
              />
            </label>
          )}
          <dl className="facts glass strong" style={{ borderRadius: 20 }}>
            <div>
              <dt>You send</dt>
              <dd>
                {fmtMoney(q.pay, code)}
                <small>From {route.from}</small>
              </dd>
            </div>
            {foreign && (
              <div>
                <dt>Rate</dt>
                <dd>
                  C$1 = {fmtMoney(q.rate, code, { cents: q.rate < 100 })}
                  <small>Held for {clock(left)}</small>
                </dd>
              </div>
            )}
            {foreign && (
              <div>
                <dt>Exchange fee, est. {pct(FX_FEE)}</dt>
                <dd>
                  {fmtMoney(q.fee, code)}
                  <small>Kept by the exchange partner</small>
                </dd>
              </div>
            )}
            <div>
              <dt>You get</dt>
              <dd>
                {fmtMoney(cad, 'CAD', { cents: cad % 1 !== 0 })}
                <small>{foreign ? 'Fixed now. Rent never moves with the rate.' : 'C$ in, C$ out. No exchange.'}</small>
              </dd>
            </div>
            <div>
              <dt>Arrives</dt>
              <dd>
                {route.time}
                <small>{route.method}</small>
              </dd>
            </div>
          </dl>
          <div className="actions">
            <button className="btn primary" onClick={() => setPhase('pay')} disabled={cad <= 0}>
              Continue
            </button>
          </div>
        </>
      )}

      {phase === 'pay' && (
        <>
          <p className="lede" style={{ marginTop: 0 }}>
            {foreign ? 'Send this from your bank’s app:' : 'Send an Interac e-Transfer from your bank’s app:'}
          </p>
          <dl className="facts glass strong" style={{ borderRadius: 20 }}>
            <div>
              <dt>Amount</dt>
              <dd>{fmtMoney(foreign ? q.pay : cad, code, { cents: !foreign })}</dd>
            </div>
            <div>
              <dt>To</dt>
              <dd>
                {foreign ? 'Stroop exchange partner' : 'deposit@partner.example'}
                <small>Licensed partner · demo</small>
              </dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd className="mono">{reference}</dd>
            </div>
          </dl>
          <p className="help">The reference tells the partner it’s yours. Your Stroop account never holds bank details.</p>
          <div className="actions">
            <button className="btn primary" onClick={arrive}>
              <Landmark size={18} aria-hidden /> I’ve sent it
            </button>
          </div>
          <p className="help">Testnet: no real bank. This adds test C$ with no value.</p>
        </>
      )}

      {phase === 'arriving' && (
        <>
          <ol className="steps" aria-live="polite">
            {ARRIVING.filter((_, i) => foreign || i !== 1).map((label) => {
              const i = ARRIVING.indexOf(label)
              const state = i < done ? 'done' : i === done && !error ? 'active' : ''
              return (
                <li key={label} className={state}>
                  <span className="mark" aria-hidden>
                    {state === 'done' && <Check size={14} strokeWidth={3} />}
                    {state === 'active' && <LoaderCircle className="spin" size={16} />}
                    {error && i === done && <X size={14} strokeWidth={3} />}
                  </span>
                  {label}
                </li>
              )
            })}
          </ol>
          <p className="help">
            Real life: {route.time} ({route.method}). On Stellar the last step takes about 5 seconds.
          </p>
          {error && (
            <>
              <Problem text={error} />
              <div className="actions">
                <button className="btn primary" onClick={arrive}>
                  Try again
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Sheet>
  )
}

type Phase = 'idle' | 'working' | 'open' | 'error'
const STEPS = ['Connect to the cash-out partner', 'Sign in with your Stroop account', 'Enter your bank on their form']

/**
 * Off-ramp: C$ on Stroop go to a bank through a licensed partner (real SEP-10/SEP-24 on SDF's test anchor).
 * Landlords cash out to a Canadian bank with the fee paid back; renters choose a Canadian bank or home.
 */
export function CashOutSheet(props: {
  open: boolean
  onClose: () => void
  kp: Keypair
  amount: number
  /** The renter's home currency; offered as a second destination. */
  code?: string
  covered?: boolean
  title?: string
}) {
  const { open, onClose, kp, amount, code = 'CAD', covered = false, title = 'Cash out' } = props
  const [dest, setDest] = useState('CAD')
  const [phase, setPhase] = useState<Phase>('idle')
  const [step, setStep] = useState(-1)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [poll, setPoll] = useState<(() => Promise<string>) | null>(null)
  const q = offRampQuote(amount, dest, covered)
  const route = rampRoute(dest)
  const foreign = dest !== 'CAD'

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
      {code !== 'CAD' && phase === 'idle' && (
        <ul className="list glass strong" style={{ borderRadius: 20, marginBottom: 12 }}>
          {['CAD', code].map((c) => (
            <li key={c}>
              <button className="row" aria-pressed={dest === c} onClick={() => setDest(c)}>
                <span className="txt">
                  <strong>{c === 'CAD' ? 'Canadian bank' : `Bank at home · ${c}`}</strong>
                  <span>{rampRoute(c).time}</span>
                </span>
                {dest === c && <Check size={18} aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="big-total">
        <span className="label">Lands in your bank</span>
        <span className="amount md num">≈ {fmtMoney(q.receive, dest, { cents: !foreign })}</span>
      </div>
      <dl className="facts glass strong" style={{ borderRadius: 20, marginTop: 10 }}>
        <div>
          <dt>Your balance</dt>
          <dd>{fmtMoney(amount, 'CAD', { cents: true })}</dd>
        </div>
        {foreign && (
          <div>
            <dt>Rate</dt>
            <dd>
              C$1 = {fmtMoney(q.rate, dest, { cents: q.rate < 100 })}
              <small>That day’s rate, when you cash out</small>
            </dd>
          </div>
        )}
        <div>
          <dt>
            {foreign ? 'Exchange fee' : 'Cash-out fee'}, est. {pct(foreign ? FX_FEE : CASH_OUT_FEE)}
          </dt>
          <dd>
            −{fmtMoney(q.fee, dest, { cents: !foreign })}
            <small>Kept by the cash-out partner</small>
          </dd>
        </div>
        {covered && (
          <div className="good-row">
            <dt>Paid back by Stroop</dt>
            <dd>+{fmtMoney(q.rebate, dest, { cents: true })}</dd>
          </div>
        )}
        <div>
          <dt>Arrives</dt>
          <dd>
            {route.time}
            <small>{foreign ? route.method : 'Interac e-Transfer or bank deposit'}</small>
          </dd>
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
      <p className="help">
        You confirm your ID and bank once; after that, cash-outs go straight through. Testnet: the sign-in and bank
        form are real, on Stellar’s test partner. No money moves.
      </p>
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
