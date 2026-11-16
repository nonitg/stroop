import { useState } from 'react'
import {
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  Globe,
  Landmark,
  Plus,
  RotateCcw,
  Send,
  Share,
} from 'lucide-react'
import { useApp } from '../app'
import { explorer, resetDemo, short } from '../stellar'
import { go, inviteLink, useHomeCurrency } from '../hooks'
import { CAD, currency, fmtMoney, perCad } from '../money'
import { useCopy } from '../components/useCopy'
import { Amount } from '../ui/Amount'
import { Sheet } from '../ui/Sheet'
import { CurrencySheet } from '../ui/CurrencySheet'
import { useShare } from '../ui/share'
import { AddMoneySheet, CashOutSheet } from './MoneySheets'

export function AccountScreen() {
  const { role, setRole, wallet } = useApp()
  const copy = useCopy()
  const share = useShare()
  const [code, setCode] = useHomeCurrency()
  const [sheet, setSheet] = useState<'money' | 'send' | 'currency' | 'reset' | null>(null)
  const [copied, setCopied] = useState(false)
  const kp = wallet.kp!
  const pub = kp.publicKey()
  const cad = wallet.balances?.cad ?? 0
  const family = role === 'family'
  const local = family ? currency(code) : CAD

  const copyId = async () => {
    if (!(await copy(pub, { title: 'Stroop ID copied' }, { silent: true }))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }
  const switchSide = () => {
    setRole(family ? 'landlord' : 'family')
    go('#/')
  }

  return (
    <main className="screen">
      <div className="top" />
      <h1 className="page-title">Account</h1>

      <section className="glass card hero-card syrup">
        <span className="label">Balance</span>
        <Amount units={cad} />
        {local.code !== 'CAD' && <span className="approx">≈ {fmtMoney(cad * perCad(local.code), local.code)}</span>}
        {family ? (
          <div className="btn-pair">
            <button className="btn primary" onClick={() => setSheet('money')}>
              <Plus size={18} aria-hidden /> Add money
            </button>
            <button className="btn secondary" onClick={() => setSheet('send')} disabled={cad <= 0}>
              <Send size={18} aria-hidden /> Send to bank
            </button>
          </div>
        ) : (
          <button className="btn primary wide" onClick={() => setSheet('money')} disabled={cad <= 0}>
            <Landmark size={18} aria-hidden /> Cash out to your bank
          </button>
        )}
      </section>

      <ul className="list glass" style={{ marginTop: 14 }}>
        <li>
          <button className="row" onClick={copyId}>
            <span className="ico">{copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}</span>
            <span className="txt">
              <strong>Your Stroop ID</strong>
              <span className="mono">{short(pub)}</span>
            </span>
            <span className="small">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </li>
        {!family && (
          <li>
            <button className="row" onClick={() => share(inviteLink(pub), 'Invite link', 'Send it to your tenant.')}>
              <span className="ico">
                <Share size={18} aria-hidden />
              </span>
              <span className="txt">
                <strong>Invite a tenant</strong>
                <span>Their lease is set up for you</span>
              </span>
              <ChevronRight className="chev" size={18} aria-hidden />
            </button>
          </li>
        )}
        {family && (
          <li>
            <button className="row" onClick={() => setSheet('currency')}>
              <span className="ico">
                <Globe size={18} aria-hidden />
              </span>
              <span className="txt">
                <strong>Your currency</strong>
                <span>{currency(code).name}</span>
              </span>
              <ChevronRight className="chev" size={18} aria-hidden />
            </button>
          </li>
        )}
        <li>
          <a className="row" href={explorer.account(pub)} target="_blank" rel="noreferrer">
            <span className="ico">
              <ArrowUpRight size={18} aria-hidden />
            </span>
            <span className="txt">
              <strong>Account on Stellar</strong>
              <span>
                {(wallet.balances?.xlm ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} XLM for network fees
              </span>
            </span>
          </a>
        </li>
      </ul>

      <h2 className="section-title">Demo</h2>
      <ul className="list glass">
        <li>
          <button className="row" onClick={switchSide}>
            <span className="ico">
              <ArrowLeftRight size={18} aria-hidden />
            </span>
            <span className="txt">
              <strong>Switch to {family ? 'landlord' : 'renter'}</strong>
              <span>Both sides can live in this browser</span>
            </span>
            <ChevronRight className="chev" size={18} aria-hidden />
          </button>
        </li>
        <li>
          <button className="row danger" onClick={() => setSheet('reset')}>
            <span className="ico stop">
              <RotateCcw size={18} aria-hidden />
            </span>
            <span className="txt">
              <strong>Start over</strong>
            </span>
          </button>
        </li>
      </ul>
      <p className="fine">Stellar testnet · test money only · your keys stay in this browser</p>

      {family ? (
        <>
          <AddMoneySheet open={sheet === 'money'} onClose={() => setSheet(null)} kp={kp} code={code} onAdded={wallet.refresh} />
          <CashOutSheet
            open={sheet === 'send'}
            onClose={() => setSheet(null)}
            kp={kp}
            amount={cad}
            code={code}
            title="Send to your bank"
          />
        </>
      ) : (
        <CashOutSheet open={sheet === 'money'} onClose={() => setSheet(null)} kp={kp} amount={cad} covered />
      )}
      <CurrencySheet open={sheet === 'currency'} onClose={() => setSheet(null)} value={code} onChange={setCode} />
      <Sheet open={sheet === 'reset'} onClose={() => setSheet(null)} title="Start over?">
        <p className="lede">Both demo accounts in this browser are forgotten. Leases stay on Stellar.</p>
        <div className="actions">
          <button
            className="btn danger"
            onClick={() => {
              resetDemo()
              localStorage.removeItem('rp:role')
              window.location.hash = '#/'
              window.location.reload()
            }}
          >
            Start over
          </button>
          <button className="btn secondary" onClick={() => setSheet(null)}>
            Cancel
          </button>
        </div>
      </Sheet>
    </main>
  )
}
