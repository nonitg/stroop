import { ChevronDown } from 'lucide-react'
import { useApp } from '../app'
import { FEE_PCT } from '../stellar'
import { ON_RAMP_FEE, OFF_RAMP_FEE, pct } from '../money'

interface QA {
  q: string
  a: string
}

const MONEY_IN: QA[] = [
  {
    q: 'How do I put money in?',
    a: 'Pay from your own bank, in your own currency: bank transfer, UPI or card, depending on your country. A licensed exchange partner converts it to US dollars and sends it to your Stroop account, usually within minutes.',
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
    a: `The partner sets it from live market rates. Before you pay, Stroop shows their exact quote: the rate, their fee (about ${pct(ON_RAMP_FEE)} going in, ${pct(OFF_RAMP_FEE)} going out) and the amount that arrives. Stroop adds no markup.`,
  },
  {
    q: 'What does Stroop charge?',
    a: `${FEE_PCT} of the rent, taken only when you move in. If you never move in, you pay nothing. Stroop earns no interest on your rent, takes no cut of the exchange, and charges landlords nothing.`,
  },
  {
    q: 'Who carries the exchange-rate risk?',
    a: 'Rent is locked in US dollars, so the renter’s amount is fixed the day they lock. The landlord’s C$ amount on each payday follows that day’s rate.',
  },
]

const MONEY_OUT: QA[] = [
  {
    q: 'Landlords: how does rent reach my bank?',
    a: 'Cash out to any Canadian bank through a licensed Canadian partner. It usually arrives in 1–2 business days.',
  },
  {
    q: 'Landlords: does cashing out cost me?',
    a: `The partner charges about ${pct(OFF_RAMP_FEE)}. Stroop pays that fee back to you, so the full C$ amount arrives. Landlords never pay Stroop anything.`,
  },
  {
    q: 'Renters: how do refunds work?',
    a: 'Unused rent comes back to your Stroop balance straight away. If you never moved in, Stroop’s fee comes back too. You can then send it to your bank in your own currency through the same kind of partner. Their exchange fee applies.',
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
