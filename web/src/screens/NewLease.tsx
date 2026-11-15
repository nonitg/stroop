import { type ReactNode, useState } from 'react'
import { StrKey } from '@stellar/stellar-sdk'
import { ArrowLeft, Check, ChevronRight, LoaderCircle, LockKeyhole, Minus, Plus, Share, Sparkles, X } from 'lucide-react'
import { useApp } from '../app'
import { explainError, feeFor, fmtUSD, fromUnits, getKeypair, logTx, reserve, setupWallet, toUnits } from '../stellar'
import { LOCK_FEE_XLM, ON_RAMP_FEE, XLM_USD, currency, fmtMoney, onRampQuote } from '../money'
import { STROOP_DESK, mediatorName, mediatorProblem } from '../mediators'
import { go, useHomeCurrency, verifyLink } from '../hooks'
import { useToast } from '../components/useToast'
import { Ledger, MoneyBar, type Slice } from '../ui/MoneyBar'
import { Sheet } from '../ui/Sheet'
import { CurrencySheet } from '../ui/CurrencySheet'
import { useShare } from '../ui/share'
import { AddMoneySheet, Problem } from './MoneySheets'

const MAX_MONTHS = 24

/** Family: who → how much → where every unit goes → locked. One question per screen. */
export function NewLease({ to }: { to?: string }) {
  const { wallet, refresh } = useApp()
  const kp = wallet.kp!
  const toast = useToast()
  const share = useShare()
  const [step, setStep] = useState(to ? 1 : 0)
  const [landlord, setLandlord] = useState(to ?? '')
  const [rent, setRent] = useState('1000')
  const [months, setMonths] = useState(12)
  const [mediator, setMediator] = useState(STROOP_DESK.address)
  const [code, setCode] = useHomeCurrency()
  const [sheet, setSheet] = useState<'currency' | 'mediator' | 'add' | null>(null)
  const [busy, setBusy] = useState<'demo' | 'lock' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<number | null>(null)

  const rentNum = Math.max(0, Number(rent) || 0)
  const rentTotal = toUnits(rentNum * months)
  const fee = feeFor(rentTotal)
  const lockUnits = rentTotal + fee
  const landlordOk = StrKey.isValidEd25519PublicKey(landlord.trim()) && landlord.trim() !== kp.publicKey()
  const balance = wallet.balances?.usdc ?? 0
  const enough = balance >= fromUnits(lockUnits)

  const useDemoLandlord = async () => {
    setBusy('demo')
    setError(null)
    try {
      const k = getKeypair('landlord') ?? (await setupWallet('landlord', () => {}))
      setLandlord(k.publicKey())
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(null)
    }
  }

  const lock = async () => {
    setBusy('lock')
    setError(null)
    const t0 = performance.now()
    try {
      const { result, hash } = await reserve.create(kp, landlord.trim(), mediator, rentNum, months)
      const id = Number(result)
      if (hash) logTx({ leaseId: id, label: 'Rent locked', hash, at: Date.now() })
      toast({
        title: 'Rent locked',
        body: `${fmtUSD(lockUnits)} is held for lease ${id}.`,
        hash,
        secs: (performance.now() - t0) / 1000,
      })
      setCreated(id)
      setStep(3)
      refresh()
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(null)
    }
  }

  if (step === 3 && created !== null)
    return (
      <main className="screen bare">
        <div className="welcome" style={{ textAlign: 'center', alignItems: 'center' }}>
          <span className="done-mark">
            <LockKeyhole size={36} aria-hidden />
          </span>
          <h1 style={{ margin: '0 0 10px' }}>Rent locked.</h1>
          <p className="lede" style={{ margin: '0 auto' }}>
            Send your landlord the proof link. They’ll see {fmtUSD(lockUnits).replace('.00', '')} waiting for them.
          </p>
          <div style={{ display: 'grid', gap: 10, width: '100%', marginTop: 32 }}>
            <button className="btn primary" onClick={() => share(verifyLink(created), 'Proof link', 'Send it to your landlord.')}>
              <Share size={18} aria-hidden /> Share proof link
            </button>
            <a className="btn secondary" href={`#/lease/${created}`}>
              View lease
            </a>
          </div>
        </div>
      </main>
    )

  const back = () => (step === 0 || (step === 1 && to) ? go('#/') : setStep(step - 1))
  return (
    <main className="screen bare">
      <div className="top">
        <button className="icon-btn" onClick={back} aria-label="Back">
          <ArrowLeft size={20} aria-hidden />
        </button>
        <div className="flow-progress" aria-label={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
        <a className="icon-btn" href="#/" aria-label="Close">
          <X size={20} aria-hidden />
        </a>
      </div>

      {step === 0 && (
        <>
          <h1 className="q">Who’s your landlord?</h1>
          <p className="q-sub">Paste their Stroop ID. Landlords find it under Account.</p>
          <div className="field">
            <label htmlFor="landlord">Landlord’s Stroop ID</label>
            <input
              id="landlord"
              className="input mono"
              value={landlord}
              onChange={(e) => setLandlord(e.target.value)}
              placeholder="G…"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!landlord && !landlordOk}
            />
            {landlord && !landlordOk && (
              <p className="help err">That ID isn’t complete. It starts with G and is 56 characters.</p>
            )}
          </div>
          {!landlord && (
            <button className="link-btn" onClick={useDemoLandlord} disabled={!!busy}>
              {busy === 'demo' ? <LoaderCircle className="spin" size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
              {busy === 'demo' ? 'Setting up a demo landlord…' : 'Use a demo landlord'}
            </button>
          )}
          {error && <Problem text={error} />}
          <div className="footer-cta">
            <button className="btn primary wide" disabled={!landlordOk} onClick={() => setStep(1)}>
              Continue
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          {to && (
            <p className="callout good" style={{ marginTop: 8 }}>
              <Check size={17} aria-hidden /> Your landlord’s invite is linked.
            </p>
          )}
          <h1 className="q">How much is rent?</h1>
          <section className="glass card" style={{ padding: '6px 20px' }}>
            <label className="big-input" htmlFor="rent">
              <span className="cur">US$</span>
              <input
                id="rent"
                inputMode="decimal"
                value={rent}
                onChange={(e) => setRent(e.target.value.replace(/[^\d.]/g, ''))}
                style={{ width: `${Math.max(2, rent.length) + 0.15}ch` }}
                aria-label="Monthly rent in US dollars"
              />
            </label>
            <button
              className="approx link-btn"
              style={{ margin: '0 auto 10px', display: 'flex' }}
              onClick={() => setSheet('currency')}
            >
              {code === 'USD' ? 'a month · paying in US$' : `≈ ${fmtMoney(rentNum * currency(code).perUsd, code)} a month`}
              <ChevronRight size={15} aria-hidden />
            </button>
          </section>
          <div className="glass stepper" style={{ marginTop: 14, borderRadius: 22 }}>
            <span>
              For <output className="num">{months}</output> months
            </span>
            <span className="ctrl">
              <button
                className="icon-btn"
                onClick={() => setMonths(Math.max(1, months - 1))}
                disabled={months <= 1}
                aria-label="One month fewer"
              >
                <Minus size={18} aria-hidden />
              </button>
              <button
                className="icon-btn"
                onClick={() => setMonths(Math.min(MAX_MONTHS, months + 1))}
                disabled={months >= MAX_MONTHS}
                aria-label="One month more"
              >
                <Plus size={18} aria-hidden />
              </button>
            </span>
          </div>
          <div className="footer-cta">
            <button className="btn primary wide" disabled={rentNum <= 0} onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <Review
          rent={rentNum}
          months={months}
          code={code}
          mediator={mediator}
          onMediator={() => setSheet('mediator')}
          onCurrency={() => setSheet('currency')}
          balance={balance}
        >
          {error && <Problem text={error} />}
          <div className="footer-cta">
            {enough ? (
              <button className="btn primary wide" onClick={lock} disabled={!!busy} aria-busy={busy === 'lock'}>
                {busy === 'lock' ? (
                  <LoaderCircle className="spin" size={18} aria-hidden />
                ) : (
                  <LockKeyhole size={18} aria-hidden />
                )}
                {busy === 'lock' ? 'Locking on Stellar…' : `Lock ${fmtUSD(lockUnits).replace('.00', '')}`}
              </button>
            ) : (
              <button className="btn primary wide" onClick={() => setSheet('add')}>
                <Plus size={18} aria-hidden /> Add money to continue
              </button>
            )}
          </div>
        </Review>
      )}

      <CurrencySheet open={sheet === 'currency'} onClose={() => setSheet(null)} value={code} onChange={setCode} />
      <MediatorSheet
        open={sheet === 'mediator'}
        onClose={() => setSheet(null)}
        value={mediator}
        onChange={setMediator}
        payer={kp.publicKey()}
        landlord={landlord}
      />
      <AddMoneySheet open={sheet === 'add'} onClose={() => setSheet(null)} kp={kp} code={code} onAdded={wallet.refresh} />
    </main>
  )
}

/** Where your money goes, in your own currency: what leaves the bank, and who keeps each part. */
function Review(props: {
  rent: number
  months: number
  code: string
  mediator: string
  balance: number
  onMediator: () => void
  onCurrency: () => void
  children: ReactNode
}) {
  const { rent, months, code, mediator, balance, onMediator, onCurrency, children } = props
  const usdRent = rent * months
  const usdFee = fromUnits(feeFor(toUnits(usdRent)))
  const usdNet = LOCK_FEE_XLM * XLM_USD
  const q = onRampQuote(usdRent + usdFee, code)
  const perUsd = q.rate
  const local = (usd: number) => fmtMoney(usd, code)
  const pay = q.pay + usdNet * perUsd
  const slices: Slice[] = [
    {
      tone: 'locked',
      value: usdRent * perUsd,
      label: 'Rent',
      who: `Locked, paid to your landlord monthly`,
      amount: local(usdRent * perUsd),
    },
    { tone: 'fee', value: usdFee * perUsd, label: 'Stroop fee · 1%', who: 'Only if you move in', amount: local(usdFee * perUsd) },
  ]
  if (q.fee > 0)
    slices.push({
      tone: 'partner',
      value: q.fee,
      label: `Currency exchange · ~${ON_RAMP_FEE * 100}%`,
      who: 'Exchange partner, not Stroop',
      amount: local(q.fee),
    })
  slices.push({
    tone: 'partner',
    value: usdNet * perUsd,
    label: 'Network fee',
    who: 'Stellar',
    amount: fmtMoney(usdNet * perUsd, code, { cents: true }),
  })
  const ofHundred = Math.floor(((usdRent * perUsd) / pay) * 100)
  return (
    <>
      <h1 className="q">Where your money goes</h1>
      <div className="big-total">
        <button className="label link-btn" style={{ minHeight: 32 }} onClick={onCurrency}>
          Leaves your bank · {code} <ChevronRight size={14} aria-hidden />
        </button>
        <span className="amount num" style={{ display: 'block' }}>
          {local(pay)}
        </span>
        <span className="approx">
          {months} × {fmtMoney(rent, 'USD')} rent
          {code !== 'USD' && ` · 1 US$ = ${fmtMoney(perUsd, code, { cents: perUsd < 100 })}`}
        </span>
      </div>
      <section className="glass card" style={{ marginTop: 16 }}>
        <MoneyBar slices={slices} />
        <Ledger slices={slices} total={{ label: 'You pay', amount: local(pay) }} />
        <p className="callout locked" style={{ marginTop: 12 }}>
          {code === 'USD' ? `US$${ofHundred}` : local(ofHundred)} of every {code === 'USD' ? 'US$100' : local(100)} becomes rent.
          Stroop earns no interest and no exchange markup.
        </p>
      </section>
      <ul className="list glass" style={{ marginTop: 14 }}>
        <li>
          <button className="row" onClick={onMediator}>
            <span className="txt">
              <strong>If there’s a dispute</strong>
              <span>{mediatorName(mediator)}</span>
            </span>
            <ChevronRight className="chev" size={18} aria-hidden />
          </button>
        </li>
        <li>
          <div className="row">
            <span className="txt">
              <strong>No move-in?</strong>
              <span>Rent and Stroop’s fee come back to you.</span>
            </span>
          </div>
        </li>
        <li>
          <div className="row">
            <span className="txt">
              <strong>Paying from</strong>
              <span>Stroop balance · test money</span>
            </span>
            <span className="end">{fmtMoney(balance, 'USD')}</span>
          </div>
        </li>
      </ul>
      {children}
    </>
  )
}

function MediatorSheet(props: {
  open: boolean
  onClose: () => void
  value: string
  onChange: (v: string) => void
  payer: string
  landlord: string
}) {
  const { open, onClose, value, onChange, payer, landlord } = props
  const [custom, setCustom] = useState(value === STROOP_DESK.address ? '' : value)
  const [kind, setKind] = useState<'desk' | 'own'>(value === STROOP_DESK.address ? 'desk' : 'own')
  const problem = kind === 'own' ? mediatorProblem(custom, payer, landlord) : null
  const save = () => {
    onChange(kind === 'desk' ? STROOP_DESK.address : custom.trim())
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Who settles disputes?">
      <p className="lede">They can only split the locked rent between you two. Nothing else.</p>
      <div className="seg" role="group" aria-label="Mediator">
        <button aria-pressed={kind === 'desk'} onClick={() => setKind('desk')}>
          Stroop desk
        </button>
        <button aria-pressed={kind === 'own'} onClick={() => setKind('own')}>
          Someone you trust
        </button>
      </div>
      {kind === 'own' && (
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="mediator">Their Stroop ID</label>
          <input
            id="mediator"
            className="input mono"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="G…"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!!custom && !!problem}
          />
          {custom && problem && <p className="help err">{problem}</p>}
          <p className="help">A school housing office, settlement agency or lawyer.</p>
        </div>
      )}
      <div className="actions">
        <button className="btn primary" onClick={save} disabled={!!problem}>
          Done
        </button>
      </div>
    </Sheet>
  )
}
