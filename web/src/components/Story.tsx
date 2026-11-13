import type { ReactNode } from 'react'
import { HandCoins, Landmark, ShieldCheck } from 'lucide-react'

function Story({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <aside className="story">
      <h1 className="display">{title}</h1>
      <p className="lede">{lede}</p>
      {children}
    </aside>
  )
}

export function FamilyStory() {
  return (
    <Story
      title="Proof of rent, not prepayment."
      lede="Landlords often ask newcomers with no Canadian credit history for 6 to 12 months of rent up front. Lock it here instead, and keep control of what isn't owed yet."
    >
      <ol className="steps">
        <li>
          <span className="step-n" aria-hidden>
            1
          </span>
          <div>
            <h2>Your family locks the rent</h2>
            <p>The lease's rent moves into a locked account with fixed rules, instead of into a landlord's bank.</p>
          </div>
        </li>
        <li>
          <span className="step-n" aria-hidden>
            2
          </span>
          <div>
            <h2>Your landlord checks it</h2>
            <p>They open your proof link and see the full amount locked, read live from Stellar.</p>
          </div>
        </li>
        <li>
          <span className="step-n" aria-hidden>
            3
          </span>
          <div>
            <h2>Paid monthly, rest protected</h2>
            <p>
              Rent goes to the landlord one month at a time, never early. Fake listing or early end? Unused rent comes
              back to the family.
            </p>
          </div>
        </li>
      </ol>
    </Story>
  )
}

export function LandlordStory() {
  return (
    <Story
      title="Verify the rent before you hand over the keys."
      lede="Every lease shows the locked amount, the monthly schedule and the rules, read straight from Stellar."
    >
      <ul className="benefits">
        <li>
          <ShieldCheck size={22} aria-hidden />
          <div>
            <h2>Locked before you commit</h2>
            <p>The full rent is already held when you accept the lease.</p>
          </div>
        </li>
        <li>
          <HandCoins size={22} aria-hidden />
          <div>
            <h2>Paid on schedule, only to you</h2>
            <p>Each month unlocks on time and can only go to your account.</p>
          </div>
        </li>
        <li>
          <Landmark size={22} aria-hidden />
          <div>
            <h2>Cash out to your bank</h2>
            <p>Withdraw through a Stellar off-ramp to a Canadian bank. On testnet, no real money moves.</p>
          </div>
        </li>
      </ul>
    </Story>
  )
}
