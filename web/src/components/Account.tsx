import { type CSSProperties, useState } from 'react'
import { ArrowRight, Check, CircleAlert, Copy, LoaderCircle } from 'lucide-react'
import { type Role, explorer, fromUnits, short } from '../stellar'
import type { Wallet } from '../hooks'
import { Money } from './Money'
import { useCopy } from './useCopy'

// Friendly names for the step strings setupWallet reports.
const SETUP_STEPS: { match: string; label: string; role?: Role }[] = [
  { match: 'Creating account', label: 'Open account' },
  { match: 'Adding USDC', label: 'Enable USDC' },
  { match: 'Receiving', label: 'Add 20,000 test USDC', role: 'family' },
]

const ROLE_COPY: Record<Role, { label: string; meta: string; free: string; held: string }> = {
  family: { label: 'Family account', meta: 'About 15 seconds · comes with 20,000 test USDC', free: 'Available', held: 'Locked in reserve' },
  landlord: { label: 'Landlord account', meta: 'About 10 seconds · receives rent', free: 'Received', held: 'Locked for you' },
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

export function AccountSummary({ role, wallet, reserved }: { role: Role; wallet: Wallet; reserved: bigint }) {
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
      <div className="account-top">
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
      </div>
      {reserved > 0n && <SplitBar role={role} free={usdc} held={fromUnits(reserved)} />}
    </section>
  )
}

/** Where this account's money is: in hand, or locked in reserves (same glass as locked months). */
function SplitBar({ role, free, held }: { role: Role; free: number; held: number }) {
  const c = ROLE_COPY[role]
  return (
    <div className="split">
      <div className="split-bar" aria-hidden>
        <span className="split-free" style={{ flexGrow: free }} />
        <span className="split-held" style={{ flexGrow: held }} />
      </div>
      <ul className="legend split-legend">
        <li>
          <span className="swatch paid" aria-hidden />
          {c.free} <Money units={free} className="legend-n" />
        </li>
        <li>
          <span className="swatch locked" aria-hidden />
          {c.held} <Money units={held} className="legend-n" />
        </li>
      </ul>
    </div>
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
