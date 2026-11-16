import { ChevronDown } from 'lucide-react'
import { useApp } from '../app'
import { FEE_PCT } from '../stellar'
import { CASH_OUT_FEE, FX_FEE, pct } from '../money'

interface QA {
  q: string
  a: string
}

const MONEY_IN: QA[] = [
  {
    q: 'How do I put money in?',
    a: 'Send it from your own bank. From a Canadian bank, it’s an Interac e-Transfer and arrives in minutes. From a bank abroad, it’s an international transfer, which takes 1–3 business days. A licensed exchange partner turns it into Canadian dollars on your Stroop account.',
  },
  {
    q: 'How is my bank connected?',
    a: 'The first time, the partner asks for your ID and bank details on their own secure form. That’s a legal requirement for moving money across borders. After that it takes one tap. Stroop never sees your bank login.',
  },
  {
    q: 'How does Stroop pick the partner?',
    a: 'Licensed partners on the Stellar network publish which countries and currencies they serve, and they give live quotes. Stroop asks every partner that serves your currency for a quote and shows you the cheapest.',
  },
]

const RATES: QA[] = [
  {
    q: 'Who sets the exchange rate?',
    a: `The partner sets it from live market rates. Before you pay, Stroop shows their exact quote: the rate, their fee (about ${pct(FX_FEE)} to change currency, ${pct(CASH_OUT_FEE)} to cash out to a Canadian bank) and the amount that arrives. Stroop adds no markup.`,
  },
  {
    q: 'What does Stroop charge?',
    a: `${FEE_PCT} of the rent, taken only when you move in. If you never move in, you pay nothing. Stroop earns no interest on your rent, takes no cut of the exchange, and charges landlords nothing.`,
  },
  {
    q: 'Who carries the exchange-rate risk?',
    a: 'Nobody, after day one. Leases are in Canadian dollars. The renter changes money once, at a rate fixed when they add it. From then on, the landlord gets the exact C$ rent every month. Only money sent back home later uses that day’s rate.',
  },
]

const MONEY_OUT: QA[] = [
  {
    q: 'Landlords: how does rent reach my bank?',
    a: 'Cash out to any Canadian bank through a licensed Canadian partner. Rent is already in C$, so there’s no exchange. Interac arrives in minutes; a bank deposit takes 1–2 business days.',
  },
  {
    q: 'Landlords: does cashing out cost me?',
    a: `The partner charges about ${pct(CASH_OUT_FEE)}. Stroop pays that fee back to you, so the full C$ amount arrives. Landlords never pay Stroop anything.`,
  },
  {
    q: 'Renters: how do refunds work?',
    a: 'Unused rent comes back to your Stroop balance straight away. If you never moved in, Stroop’s fee comes back too. Send it to a Canadian bank (minutes, no exchange) or to your bank at home at that day’s rate (1–3 business days, exchange fee applies).',
  },
]

const SAFETY: QA[] = [
  {
    q: 'Can anyone take the money early?',
    a: 'No. The lease rules on Stellar release one month at a time, on schedule. Nobody can override them: not the landlord, not the renter, not Stroop.',
  },
  {
    q: 'What if something goes wrong?',
    a: 'Either side can report a problem. Payouts pause, and the mediator named on the lease splits the locked rent between you two. They can’t send it anywhere else. Rent already paid stays paid.',
  },
  {
    q: 'What is Stellar?',
    a: 'A public payment network. Every step of a lease has a public receipt that anyone can check, which is how your landlord knows the money is real.',
  },
]

function Group({ title, items }: { title: string; items: QA[] }) {
  return (
    <>
      <h2 className="section-title">{title}</h2>
      <div className="faq glass">
        {items.map((x) => (
          <details key={x.q}>
            <summary>
              {x.q}
              <ChevronDown className="chev" size={18} aria-hidden />
            </summary>
            <p>{x.a}</p>
          </details>
        ))}
      </div>
    </>
  )
}

/** Plain answers to what people ask most about money in, rates, money out and safety. */
export function Help() {
  const { role } = useApp()
  const family = role === 'family'
  return (
    <main className="screen">
      <div className="top" />
      <h1 className="page-title">Help</h1>
      {family ? (
        <Group title="Getting money in" items={MONEY_IN} />
      ) : (
        <Group title="Getting paid" items={MONEY_OUT.slice(0, 2)} />
      )}
      <Group title="Rates and fees" items={RATES} />
      {family && <Group title="Refunds" items={MONEY_OUT.slice(2)} />}
      <Group title="Safety" items={SAFETY} />
      <p className="fine">This demo runs on Stellar testnet with test money and a test partner.</p>
    </main>
  )
}
