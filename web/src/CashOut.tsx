import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, CircleAlert, Landmark, LoaderCircle, X } from 'lucide-react'
import { getKeypair } from './stellar'
import { ANCHOR_DOMAIN, authenticate, discoverAnchor, startWithdrawal, withdrawalStatus } from './sep24'
import { Money } from './components/Money'

type Phase = 'idle' | 'working' | 'open' | 'error'

const STEPS = [
  { label: 'Find the anchor', tag: 'SEP-1' },
  { label: 'Sign in with your Stellar account', tag: 'SEP-10' },
  { label: 'Open the secure withdrawal form', tag: 'SEP-24' },
]

// Landlord withdraws received USDC to a bank account through a Stellar anchor.
// The SEP-10 sign-in and SEP-24 form are real (SDF's test anchor); on testnet no money moves.
export function CashOut({ onClose, amount }: { onClose: () => void; amount: bigint }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [step, setStep] = useState(-1)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [poll, setPoll] = useState<(() => Promise<string>) | null>(null)

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
    <section className="cashout" aria-labelledby="cashout-title">
      <header className="cashout-head">
        <span className="cashout-icon" aria-hidden>
          <Landmark size={18} />
        </span>
        <div>
          <h4 id="cashout-title">Cash out to a Canadian bank</h4>
          <p>
            <Money units={amount} /> received in USDC
          </p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close cash out">
          <X size={16} aria-hidden />
        </button>
      </header>

      {phase !== 'idle' && (
        <ol className="cashout-steps" aria-live="polite">
          {STEPS.map((s, i) => {
            const state = i < step ? 'done' : i === step && phase === 'working' ? 'active' : phase === 'error' && i === step ? 'failed' : 'todo'
            return (
              <li key={s.tag} className={state}>
                <span className="step-mark" aria-hidden>
                  {state === 'done' && <Check size={12} strokeWidth={3} />}
                  {state === 'active' && <LoaderCircle className="spin" size={14} />}
                  {state === 'failed' && <X size={12} strokeWidth={3} />}
                </span>
                {s.label}
                <span className="tag mono">{s.tag}</span>
              </li>
            )
          })}
        </ol>
      )}

      {phase === 'open' && (
        <p className="cashout-status">
          Form open in a new window · status <strong>{status?.replace(/_/g, ' ')}</strong>
        </p>
      )}
      {phase === 'error' && (
        <p className="alert error" role="alert">
          <CircleAlert size={16} aria-hidden /> {error}
        </p>
      )}
      {(phase === 'idle' || phase === 'error') && (
        <button className="btn primary" onClick={start}>
          {phase === 'error' ? 'Try again' : 'Withdraw via anchor'} <ArrowUpRight size={16} aria-hidden />
        </button>
      )}
      <p className="fine">
        Testnet: the sign-in and form are real, on SDF's reference anchor ({ANCHOR_DOMAIN}); no money moves. In production a
        licensed Canadian off-ramp pays out in CAD.
      </p>
    </section>
  )
}
