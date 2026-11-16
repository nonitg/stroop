import { type ReactNode, useState } from 'react'
import { StrKey } from '@stellar/stellar-sdk'
import { ArrowLeft, Check, ChevronRight, HandCoins, LoaderCircle, LockKeyhole, Minus, Plus, Share, Sparkles, X } from 'lucide-react'
import { useApp } from '../app'
import {
  FEE_PCT,
  LEND_DISCOUNT,
  lendSaving,
  MIN_LEND_MONTHS,
  explainError,
  feeFor,
  fmtCAD,
  fromUnits,
  getKeypair,
  logTx,
  reserve,
  setupWallet,
  toUnits,
} from '../stellar'
import { FX_FEE, LOCK_FEE_XLM, XLM_CAD, fmtMoney, onRampQuote, perCad } from '../money'
import { STROOP_DESK, mediatorName, mediatorProblem } from '../mediators'
import { go, useHomeCurrency, verifyLink } from '../hooks'
import { useToast } from '../components/useToast'
import { hushNews } from '../news'
import { Ledger, MoneyBar, type Slice } from '../ui/MoneyBar'
import { Sheet } from '../ui/Sheet'
import { CurrencySheet } from '../ui/CurrencySheet'
import { LendingSheet } from '../ui/LendingSheet'
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
  const [sheet, setSheet] = useState<'currency' | 'mediator' | 'add' | 'lend' | null>(null)
  const [lendChoice, setLendChoice] = useState(false)
  const [busy, setBusy] = useState<'demo' | 'lock' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<number | null>(null)

  const rentNum = Math.max(0, Number(rent) || 0)
  const canLend = months >= MIN_LEND_MONTHS
  const lend = lendChoice && canLend
  const rentTotal = toUnits(rentNum * months)
  const fee = feeFor(rentTotal, lend)
  const lockUnits = rentTotal + fee
  const landlordOk = StrKey.isValidEd25519PublicKey(landlord.trim()) && landlord.trim() !== kp.publicKey()
  const balance = wallet.balances?.cad ?? 0
  const enough = balance >= fromUnits(lockUnits)
  // Rounded up to the cent so one top-up always covers the lock.
  const shortfall = Math.ceil((fromUnits(lockUnits) - balance) * 100) / 100

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
      const { result, hash } = await reserve.create(kp, landlord.trim(), mediator, rentNum, months, lend)
      const id = Number(result)
      hushNews(id)
      if (hash) logTx({ leaseId: id, label: 'Rent locked', hash, at: Date.now() })
      toast({
        title: 'Rent locked',
        body: `${fmtCAD(lockUnits)} is held for lease ${id}.`,
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
            Send your landlord the proof link. They’ll see {fmtCAD(rentTotal)} waiting for them.
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
          <p className="q-sub">Open the invite link they sent, or paste their Stroop ID.</p>
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
              <span className="cur">C$</span>
              <input
                id="rent"
                inputMode="decimal"
                value={rent}
                onChange={(e) => setRent(e.target.value.replace(/[^\d.]/g, ''))}
                style={{ width: `${Math.max(2, rent.length) + 0.15}ch` }}
                aria-label="Monthly rent in Canadian dollars"
              />
            </label>
            <button
              className="approx link-btn"
              style={{ margin: '0 auto 10px', display: 'flex' }}
              onClick={() => setSheet('currency')}
            >
              {code === 'CAD' ? 'a month · paying from a Canadian bank' : `≈ ${fmtMoney(rentNum * perCad(code), code)} a month`}
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
          lend={lend}
          canLend={canLend}
          onLend={() => (lend ? setLendChoice(false) : setSheet('lend'))}
          onMediator={() => setSheet('mediator')}
          onCurrency={() => setSheet('currency')}
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
                {busy === 'lock' ? 'Locking on Stellar…' : `Lock ${fmtCAD(lockUnits)}`}
              </button>
            ) : (
              <button className="btn primary wide" onClick={() => setSheet('add')}>
                <Plus size={18} aria-hidden /> Add money from your bank
              </button>
            )}
            <p className="fine" style={{ marginTop: 8 }}>
              {enough
                ? `${fmtCAD(rentTotal)} for your landlord + ${fmtCAD(fee)} Stroop fee, from your C$ balance`
                : balance > 0
                  ? `You have ${fmtMoney(balance, 'CAD', { cents: true })}. Add the rest, then lock.`
                  : 'Step 1: add money. Step 2: lock it.'}
            </p>
          </div>
        </Review>
      )}

      <LendingSheet
        rent={rentNum}
        months={months}
        open={sheet === 'lend'}
        onClose={() => setSheet(null)}
        onAccept={() => {
          setLendChoice(true)
          setSheet(null)
        }}
      />
      <CurrencySheet open={sheet === 'currency'} onClose={() => setSheet(null)} value={code} onChange={setCode} />
      <MediatorSheet
        open={sheet === 'mediator'}
        onClose={() => setSheet(null)}
        value={mediator}
        onChange={setMediator}
        payer={kp.publicKey()}
        landlord={landlord}
      />
      <AddMoneySheet
        open={sheet === 'add'}
        onClose={() => setSheet(null)}
        kp={kp}
        code={code}
        cad={shortfall}
        onAdded={wallet.refresh}
      />
    </main>
  )
}

/** What leaves the family's bank for this lease, split by who keeps each part, in their own currency. */
function quoteLease(rent: number, months: number, code: string, lend: boolean) {
  const cadRent = rent * months
  const cadFee = fromUnits(feeFor(toUnits(cadRent), lend))
  const cadNet = LOCK_FEE_XLM * XLM_CAD
  const q = onRampQuote(cadRent + cadFee, code)
  const rate = q.rate
  const local = (n: number) => fmtMoney(n, code)
  const pay = q.pay + cadNet * rate
  const slices: Slice[] = [
    {
      tone: 'locked',
      value: cadRent * rate,
      label: 'Rent',
      who: `Locked, paid to your landlord monthly`,
      amount: local(cadRent * rate),
    },
    {
      tone: 'fee',
      value: cadFee * rate,
      label: lend ? `Stroop fee · ${FEE_PCT} − ${fmtCAD(LEND_DISCOUNT)}` : `Stroop fee · ${FEE_PCT}`,
      who: 'Only if you move in',
      amount: local(cadFee * rate),
    },
  ]
  if (q.fee > 0)
    slices.push({
      tone: 'partner',
      value: q.fee,
      label: `Currency exchange · ~${FX_FEE * 100}%`,
      who: 'Exchange partner, not Stroop',
      amount: local(q.fee),
    })
  slices.push({
    tone: 'partner',
    value: cadNet * rate,
    label: 'Network fee',
    who: 'Stellar',
    amount: fmtMoney(cadNet * rate, code, { cents: cadNet * rate < 1 }),
  })
  return { slices, pay, rate, ofHundred: Math.floor(((cadRent * rate) / pay) * 100) }
}

/** Where your money goes: the one number that leaves your bank, then who keeps each part. */
function Review(props: {
  rent: number
  months: number
  code: string
  mediator: string
  lend: boolean
  canLend: boolean
  onLend: () => void
  onMediator: () => void
  onCurrency: () => void
  children: ReactNode
}) {
  const { rent, months, code, mediator, lend, canLend, onLend, onMediator, onCurrency, children } = props
  const { slices, pay, rate, ofHundred } = quoteLease(rent, months, code, lend)
  const local = (n: number) => fmtMoney(n, code)
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
          {months} × {fmtMoney(rent, 'CAD')} rent
          {code !== 'CAD' && ` · C$1 = ${fmtMoney(rate, code, { cents: rate < 100 })}`}
        </span>
      </div>
      <section className="glass card" style={{ marginTop: 16 }}>
        <MoneyBar slices={slices} />
        <Ledger slices={slices} total={{ label: 'You pay', amount: local(pay) }} />
        <p className="callout locked" style={{ marginTop: 12 }}>
          {local(ofHundred)} of every {local(100)} becomes rent.
        </p>
      </section>
      <ul className="list glass" style={{ marginTop: 14 }}>
        {canLend && (
          <li>
            <button className="row" onClick={onLend} role="switch" aria-checked={lend}>
              <span className="ico locked">
                <HandCoins size={18} aria-hidden />
              </span>
              <span className="txt">
                <strong>Lend unused months</strong>
                <span>{fmtCAD(lendSaving(rent, months))} off Stroop’s fee</span>
              </span>
              <span className="switch" aria-hidden />
            </button>
          </li>
        )}
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
              <span>Rent and Stroop’s fee come back. Exchange fees don’t.</span>
            </span>
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
