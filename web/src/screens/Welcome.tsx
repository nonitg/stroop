import { ArrowLeft, Building2, Check, ChevronRight, CircleAlert, GraduationCap, LoaderCircle } from 'lucide-react'
import type { Role } from '../stellar'
import type { Wallet } from '../hooks'
import { BrandMark } from '../ui/BrandMark'

/** First run: pick a side, then create a testnet account for it. */
export function Welcome({ role, wallet, onPick }: { role: Role | null; wallet?: Wallet; onPick: (r: Role | null) => void }) {
  if (!role || !wallet)
    return (
      <main className="screen bare">
        <div className="welcome">
          <BrandMark size={52} />
          <h1>
            Rent you
            <br />
            can prove.
          </h1>
          <p className="lede">Lock it once. Your landlord sees it’s real. It pays out month by month.</p>
          <div className="choices">
            <button className="choice glass" onClick={() => onPick('family')}>
              <span className="ico">
                <GraduationCap size={22} aria-hidden />
              </span>
              <span>
                <strong>I’m renting</strong>
                <span>Student or family paying rent</span>
              </span>
              <ChevronRight className="chev" size={20} aria-hidden />
            </button>
            <button className="choice glass" onClick={() => onPick('landlord')}>
              <span className="ico">
                <Building2 size={22} aria-hidden />
              </span>
              <span>
                <strong>I’m a landlord</strong>
                <span>Get proof, then rent on time</span>
              </span>
              <ChevronRight className="chev" size={20} aria-hidden />
            </button>
          </div>
          <p className="fine">Stellar testnet · test money only</p>
        </div>
      </main>
    )

  const family = role === 'family'
  const steps = ['Open your account', 'Turn on US dollars', ...(family ? ['Add US$20,000 test money'] : [])]
  const matches = ['Creating account', 'Adding USDC', 'Receiving']
  const current = wallet.step === 'Ready' ? steps.length : matches.findIndex((m) => wallet.step?.startsWith(m))
  return (
    <main className="screen bare">
      <div className="top">
        <button className="icon-btn" onClick={() => onPick(null)} aria-label="Back" disabled={!!wallet.step}>
          <ArrowLeft size={20} aria-hidden />
        </button>
      </div>
      <div className="welcome" style={{ minHeight: 'calc(100dvh - 140px)' }}>
        <h1 style={{ marginTop: 0 }}>{family ? 'Let’s get you set up.' : 'Free for landlords.'}</h1>
        <p className="lede">
          {family
            ? 'About 15 seconds. You’ll start with test money to try a lease.'
            : 'About 10 seconds. You never pay Stroop a fee.'}
        </p>
        {wallet.step ? (
          <ol className="steps" aria-live="polite">
            {steps.map((s, i) => {
              const state = i < current ? 'done' : i === current ? 'active' : ''
              return (
                <li key={s} className={state}>
                  <span className="mark" aria-hidden>
                    {state === 'done' && <Check size={14} strokeWidth={3} />}
                    {state === 'active' && <LoaderCircle className="spin" size={16} />}
                  </span>
                  {s}
                </li>
              )
            })}
          </ol>
        ) : (
          <button className="btn primary wide" style={{ marginTop: 32 }} onClick={wallet.setup}>
            {wallet.error ? 'Try again' : 'Create account'}
          </button>
        )}
        {wallet.error && (
          <p className="callout stop" role="alert" style={{ marginTop: 14 }}>
            <CircleAlert size={17} aria-hidden /> {wallet.error}
          </p>
        )}
      </div>
    </main>
  )
}
