import { Check, CircleAlert, Copy, LoaderCircle } from 'lucide-react'
import { type Role, explorer, short } from '../stellar'
import type { Wallet } from '../hooks'
import { ExplorerLink } from './ExplorerLink'
import { useCopy } from './useCopy'

// Friendly names for the step strings setupWallet reports.
const SETUP_STEPS: { match: string; label: string; role?: Role }[] = [
  { match: 'Creating account', label: 'Opening your account on Stellar Testnet' },
  { match: 'Adding USDC', label: 'Turning on a US dollar (USDC) balance' },
  { match: 'Receiving', label: 'Adding 20,000 test USDC', role: 'family' },
]

const ROLE_COPY: Record<Role, { title: string; setup: string; label: string }> = {
  family: {
    title: 'Create your family account',
    setup: 'Try the whole flow with a free test account. It comes with 20,000 test USDC: play money with no real value.',
    label: 'Family account',
  },
  landlord: {
    title: 'Create your landlord account',
    setup: 'Set up a free test account to receive rent. Students and their families lock rent for this account.',
    label: 'Landlord account',
  },
}

export function AccountPanel({ role, wallet }: { role: Role; wallet: Wallet }) {
  if (wallet.kp && !wallet.checked)
    return (
      <section className="panel account-loading" aria-busy="true">
        <LoaderCircle className="spin" size={18} aria-hidden /> Loading your account…
      </section>
    )
  if (!wallet.kp || !wallet.balances) return <AccountSetup role={role} wallet={wallet} />
  return <AccountSummary role={role} pub={wallet.kp.publicKey()} balances={wallet.balances} />
}

function AccountSetup({ role, wallet }: { role: Role; wallet: Wallet }) {
  const steps = SETUP_STEPS.filter((s) => !s.role || s.role === role)
  const current = wallet.step === 'Ready' ? steps.length : steps.findIndex((s) => wallet.step?.startsWith(s.match))
  return (
    <section className="panel setup" aria-labelledby="setup-title">
      <h2 id="setup-title">{ROLE_COPY[role].title}</h2>
      <p className="lede">{ROLE_COPY[role].setup}</p>
      {wallet.step ? (
        <div className="setup-progress" aria-live="polite">
          <div className="meter" aria-hidden>
            <span style={{ width: `${((Math.max(current, 0) + 0.5) / steps.length) * 100}%` }} />
          </div>
          <ol className="setup-steps">
            {steps.map((s, i) => {
              const state = i < current ? 'done' : i === current ? 'active' : 'todo'
              return (
                <li key={s.match} className={state}>
                  <span className="step-mark" aria-hidden>
                    {state === 'done' && <Check size={14} strokeWidth={3} />}
                    {state === 'active' && <LoaderCircle className="spin" size={16} />}
                  </span>
                  {s.label}
                  {state === 'active' && <span className="sr-only"> (in progress)</span>}
                </li>
              )
            })}
          </ol>
        </div>
      ) : (
        <div className="setup-cta">
          <button className="btn primary" onClick={wallet.setup}>
            {wallet.error ? 'Try again' : 'Create demo account'}
          </button>
          <span className="hint">Takes about 15 seconds.</span>
        </div>
      )}
      {wallet.error && (
        <p className="alert error" role="alert">
          <CircleAlert size={18} aria-hidden /> {wallet.error}
        </p>
      )}
    </section>
  )
}

function AccountSummary({ role, pub, balances }: { role: Role; pub: string; balances: { xlm: number; usdc: number } }) {
  const copy = useCopy()
  return (
    <section className="panel account" aria-label={ROLE_COPY[role].label}>
      <div className="account-balance">
        <span className="label">{ROLE_COPY[role].label}</span>
        <span className="balance">
          {balances.usdc.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          <span className="unit">test USDC</span>
        </span>
      </div>
      <div className="account-meta">
        <div className="account-links">
          <ExplorerLink href={explorer.account(pub)} text={short(pub)} />
          <button className="btn quiet small" onClick={() => copy(pub, { title: 'Account address copied' })}>
            <Copy size={15} aria-hidden /> Copy address
          </button>
        </div>
        <span className="fees">{balances.xlm.toLocaleString('en-US', { maximumFractionDigits: 0 })} test XLM for network fees</span>
      </div>
    </section>
  )
}
