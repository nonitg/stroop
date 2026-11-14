import { type CSSProperties, useState } from 'react'
import { ArrowRight, Check, CircleAlert, Copy, LoaderCircle } from 'lucide-react'
import { type Role, explorer, short } from '../stellar'
import type { Wallet } from '../hooks'
import { Money } from './Money'
import { useCopy } from './useCopy'

// Friendly names for the step strings setupWallet reports.
const SETUP_STEPS: { match: string; label: string; role?: Role }[] = [
  { match: 'Creating account', label: 'Open account' },
  { match: 'Adding USDC', label: 'Enable USDC' },
  { match: 'Receiving', label: 'Add 20,000 test USDC', role: 'family' },
]

const ROLE_COPY: Record<Role, { label: string; meta: string }> = {
  family: { label: 'Family account', meta: 'About 15 seconds · comes with 20,000 test USDC' },
  landlord: { label: 'Landlord account', meta: 'About 10 seconds · receives rent' },
}

/** One button, then a three-step progress line while Stellar sets the account up. */
export function AccountSetup({ role, wallet }: { role: Role; wallet: Wallet }) {
  const steps = SETUP_STEPS.filter((s) => !s.role || s.role === role)
  const current = wallet.step === 'Ready' ? steps.length : steps.findIndex((s) => wallet.step?.startsWith(s.match))
  return (
    <div className="setup">
      {wallet.step ? (
        <ol className="setup-steps" aria-live="polite" style={{ '--n': steps.length } as CSSProperties}>
          {steps.map((s, i) => {
            const state = i < current ? 'done' : i === current ? 'active' : 'todo'
            return (
              <li key={s.match} className={state}>
                <span className="step-mark" aria-hidden>
                  {state === 'done' && <Check size={12} strokeWidth={3} />}
                  {state === 'active' && <LoaderCircle className="spin" size={14} />}
                </span>
                <span className="step-label">{s.label}</span>
                {state === 'active' && <span className="sr-only"> (in progress)</span>}
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="setup-cta">
          <button className="btn primary lg" onClick={wallet.setup}>
            {wallet.error ? 'Try again' : 'Create demo account'} <ArrowRight className="nudge" size={18} aria-hidden />
          </button>
          <span className="hint">{ROLE_COPY[role].meta}</span>
        </div>
      )}
      {wallet.error && (
        <p className="alert error" role="alert">
          <CircleAlert size={16} aria-hidden /> {wallet.error}
        </p>
      )}
    </div>
  )
}

export function AccountSummary({ role, wallet }: { role: Role; wallet: Wallet }) {
  const copy = useCopy()
  const [copied, setCopied] = useState(false)
  if (!wallet.kp || !wallet.balances) return null
  const pub = wallet.kp.publicKey()
  const { usdc, xlm } = wallet.balances
  const copyAddress = async () => {
    if (!(await copy(pub, { title: 'Address copied' }, { silent: true }))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  return (
    <section className="account" aria-label={ROLE_COPY[role].label}>
      <div className="account-main">
        <span className="eyebrow">{ROLE_COPY[role].label}</span>
        <p className="account-balance">
          <Money units={usdc} />
          <span className="unit">test USDC</span>
        </p>
      </div>
      <div className="account-side">
        <div className="address">
          <a className="mono" href={explorer.account(pub)} target="_blank" rel="noreferrer" title="View on Stellar Expert">
            {short(pub)}
          </a>
          <button className="icon-btn" onClick={copyAddress} aria-label="Copy account address">
            {copied ? <Check size={15} className="pop" aria-hidden /> : <Copy size={15} aria-hidden />}
          </button>
        </div>
        <span className="fees num">{xlm.toLocaleString('en-US', { maximumFractionDigits: 0 })} XLM for fees</span>
      </div>
    </section>
  )
}

export function AccountSkeleton() {
  return (
    <section className="account skeleton" aria-busy="true" aria-label="Loading account">
      <div className="account-main">
        <span className="sk sk-line" style={{ width: 96 }} />
        <span className="sk sk-amount" />
      </div>
    </section>
  )
}
