import { useEffect, useState } from 'react'
import { fmtUSD, getKeypair } from './stellar'
import { ANCHOR_DOMAIN, authenticate, discoverAnchor, startWithdrawal, withdrawalStatus } from './sep24'

type Phase = 'idle' | 'working' | 'open' | 'error'

// Landlord withdraws received USDC to a bank account through a Stellar anchor.
// The SEP-10 sign-in and SEP-24 form are real (SDF's test anchor); on testnet no money moves.
export function CashOut({ onClose, amount }: { onClose: () => void; amount: bigint }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [step, setStep] = useState('')
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
    const win = window.open('', 'rentproof-anchor', 'width=480,height=760')
    setPhase('working')
    setError('')
    try {
      setStep('Finding the anchor (SEP-1)')
      const anchor = await discoverAnchor()
      setStep('Signing in with your Stellar account (SEP-10)')
      const token = await authenticate(kp, anchor)
      setStep("Opening the anchor's secure withdrawal form (SEP-24)")
      const w = await startWithdrawal(kp, anchor, token)
      if (win) win.location.href = w.url
      else window.open(w.url, '_blank')
      const check = () => withdrawalStatus(anchor, token, w.id)
      setPoll(() => check)
      setStatus(await check())
      setPhase('open')
    } catch (e) {
      win?.close()
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  return (
    <div className="cashout">
      <h4>Cash out to a Canadian bank account</h4>
      <p>
        {fmtUSD(amount)} in USDC received. Withdraw it through a Stellar anchor, which verifies your identity and pays
        out to your bank.
      </p>
      {phase === 'idle' && <button onClick={start}>Withdraw via anchor</button>}
      {phase === 'working' && <p className="muted">{step}…</p>}
      {phase === 'open' && (
        <p>
          Anchor form opened in a new window. Withdrawal status: <strong>{status?.replace(/_/g, ' ')}</strong>
        </p>
      )}
      {phase === 'error' && (
        <>
          <p className="error">{error}</p>
          <button onClick={start}>Try again</button>
        </>
      )}
      <p className="muted">
        Testnet: sign-in and form are real, using SDF's reference anchor ({ANCHOR_DOMAIN}); no money moves. In
        production a licensed Canadian off-ramp pays out in CAD.
      </p>
      <button className="secondary" onClick={onClose}>
        Close
      </button>
    </div>
  )
}
