import { type CSSProperties, useState } from 'react'
import { ArrowRight, Check, CircleAlert, Copy, Landmark, LoaderCircle, Plus } from 'lucide-react'
import { type Role, explorer, fromUnits, short } from '../stellar'
import type { Wallet } from '../hooks'
import { CAD, fmtMoney, fmtNetworkFee } from '../money'
import { CashOut } from '../CashOut'
import { AddMoney } from './AddMoney'
import { Money } from './Money'
import { useCopy } from './useCopy'

// Friendly names for the step strings setupWallet reports.
const SETUP_STEPS: { match: string; label: string; role?: Role }[] = [
  { match: 'Creating account', label: 'Open account' },
  { match: 'Adding USDC', label: 'Enable USDC' },
  { match: 'Receiving', label: 'Add 20,000 test USDC', role: 'family' },
]

const ROLE_COPY: Record<Role, { label: string; meta: string; held: string }> = {
  family: { label: 'Available to lock', meta: 'About 15 seconds · comes with US$20,000 of test money', held: 'Locked in your leases' },
  landlord: { label: 'Received rent', meta: 'About 10 seconds · free for landlords', held: 'Locked for you' },
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

/** The account's money: what's in hand, what's locked, and the one way to move it (top up or cash out). */
export function AccountSummary({ role, wallet, reserved }: { role: Role; wallet: Wallet; reserved: bigint }) {
  const copy = useCopy()
  const [copied, setCopied] = useState(false)
  const [panel, setPanel] = useState(false)
  if (!wallet.kp || !wallet.balances) return null
  const pub = wallet.kp.publicKey()
  const { usdc, xlm } = wallet.balances
  const family = role === 'family'
  const copyAddress = async () => {
    if (!(await copy(pub, { title: 'Address copied' }, { silent: true }))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  return (
    <section className="card account" aria-label="Your account">
      <p className="label">{ROLE_COPY[role].label}</p>
      <p className="account-balance">
        <Money units={usdc} />
      </p>
      <p className="account-sub num">
        USDC, a digital US dollar · ≈ {fmtMoney(usdc * CAD.perUsd, 'CAD')}
      </p>

      {!panel && (
        <button className="btn secondary wide" onClick={() => setPanel(true)}>
          {family ? <Plus size={16} aria-hidden /> : <Landmark size={16} aria-hidden />}
          {family ? 'Add money' : 'Cash out to your bank'}
        </button>
      )}
      {panel &&
        (family ? (
          <AddMoney kp={wallet.kp} onClose={() => setPanel(false)} onAdded={wallet.refresh} />
        ) : (
          <CashOut amount={usdc} onClose={() => setPanel(false)} />
        ))}

      <dl className="account-facts num">
        <div>
          <dt>{ROLE_COPY[role].held}</dt>
          <dd>
            <Money units={fromUnits(reserved)} />
          </dd>
        </div>
        <div>
          <dt>XLM for network fees</dt>
          <dd title={fmtNetworkFee(xlm)}>{xlm.toLocaleString('en-US', { maximumFractionDigits: 0 })} XLM</dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd className="address">
            <a className="mono" href={explorer.account(pub)} target="_blank" rel="noreferrer" title="View on Stellar Expert">
              {short(pub)}
            </a>
            <button className="icon-btn" onClick={copyAddress} aria-label="Copy account address">
              {copied ? <Check size={14} className="pop" aria-hidden /> : <Copy size={14} aria-hidden />}
            </button>
          </dd>
        </div>
      </dl>
      <a className="text-link" href="#/how">
        How fees work <ArrowRight size={14} aria-hidden />
      </a>
    </section>
  )
}

export function AccountSkeleton() {
  return (
    <section className="card account skeleton" aria-busy="true" aria-label="Loading account">
      <span className="sk sk-line" style={{ width: 96 }} />
      <span className="sk sk-amount" />
    </section>
  )
}
