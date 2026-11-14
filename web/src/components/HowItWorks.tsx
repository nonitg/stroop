import { CURRENCIES, LOCK_FEE_XLM, OFF_RAMP_FEE, ON_RAMP_FEE, fmtNetworkFee, pct } from '../money'
import { FEE_PCT } from '../leaseText'
import { useHomeCurrency } from '../hooks'
import { STROOP_DESK } from '../mediators'
import { MoneyFlow } from './MoneyFlow'

const PATH: { node: string; sub: string; hop?: string }[] = [
  { node: 'Family’s bank', sub: 'Rupees, yuan, naira, dollars…', hop: `On-ramp · est. ${pct(ON_RAMP_FEE)} · family pays` },
  { node: 'Stroop contract', sub: 'USDC, locked on Stellar', hop: 'One month each rent day · no fee' },
  { node: 'Landlord’s account', sub: 'USDC', hop: `Off-ramp · est. ${pct(OFF_RAMP_FEE)} · landlord pays` },
  { node: 'Landlord’s bank', sub: 'Canadian dollars' },
]

const FEES: [string, string, string, string][] = [
  ['Stroop fee', 'Family', `${FEE_PCT} of the rent locked`, 'Charged at move-in only. Refunded if move-in never happens.'],
  ['On-ramp', 'Family', `Est. ${pct(ON_RAMP_FEE)}, set by the licensed on-ramp`, 'When money is added from a bank.'],
  ['Stellar network', 'Whoever acts', `${fmtNetworkFee(LOCK_FEE_XLM)} to lock`, 'Mostly to store the lease on Stellar. Monthly payouts cost far less.'],
  ['Off-ramp', 'Landlord', `Est. ${pct(OFF_RAMP_FEE)}, set by the licensed off-ramp`, 'When cashing out to a Canadian bank.'],
  ['Anything else for landlords', 'Nobody', 'None', 'Landlords receive 100% of the rent.'],
]

/** One page answering: where does the money go, who takes a cut, and what's real in this demo. */
export function HowItWorks() {
  const [code, setCode] = useHomeCurrency()
  return (
    <div className="how">
      <header className="page-head">
        <h1>How the money moves</h1>
        <p className="lede">
          Every step between the family’s bank and the landlord’s bank, who pays for it, and who can touch the money.
        </p>
      </header>

      <ol className="path">
        {PATH.map((p) => (
          <li key={p.node}>
            <div className="path-node">
              <strong>{p.node}</strong>
              <span>{p.sub}</span>
            </div>
            {p.hop && <span className="path-hop">{p.hop}</span>}
          </li>
        ))}
      </ol>

      <section className="card how-section" aria-labelledby="how-example">
        <div className="how-section-head">
          <div>
            <h2 id="how-example">Example: US$1,000 a month for 12 months</h2>
            <p>Exactly what leaves the family’s bank, what’s locked, and what reaches the landlord.</p>
          </div>
          <div className="field compact">
            <label htmlFor="how-currency">Family pays in</label>
            <select id="how-currency" className="input" value={code} onChange={(e) => setCode(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
        </div>
        <MoneyFlow rent={1000} months={12} code={code} />
      </section>

      <section className="card how-section" aria-labelledby="how-fees">
        <h2 id="how-fees">Every fee</h2>
        <div className="table-wrap">
          <table className="fees">
            <thead>
              <tr>
                <th scope="col">Fee</th>
                <th scope="col">Who pays</th>
                <th scope="col">How much</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {FEES.map(([fee, who, much, when]) => (
                <tr key={fee}>
                  <th scope="row">{fee}</th>
                  <td>{who}</td>
                  <td className="num">{much}</td>
                  <td>{when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="how-grid">
        <section className="card how-section" aria-labelledby="how-mediator">
          <h2 id="how-mediator">The mediator</h2>
          <p>
            The family picks one when locking rent: the {STROOP_DESK.name} by default, or someone both sides trust, like a
            settlement agency, a school housing office or a lawyer. The landlord sees it on the proof page and agrees to it by
            accepting.
          </p>
          <dl className="can">
            <div>
              <dt>Can</dt>
              <dd>Split the locked rent between landlord and family, only after one of them raises a dispute.</dd>
            </div>
            <div>
              <dt>Can’t</dt>
              <dd>Keep any of it, send it anywhere else, act without a dispute, or touch rent already paid.</dd>
            </div>
          </dl>
        </section>

        <section className="card how-section" aria-labelledby="how-usdc">
          <h2 id="how-usdc">Why USDC</h2>
          <p>
            USDC is a digital US dollar that families can buy from almost any country, and it settles on Stellar in about five
            seconds. Rent is locked in USDC, so the landlord’s payout in Canadian dollars moves with the US–Canada exchange
            rate.
          </p>
        </section>
      </div>

      <section className="card how-section" aria-labelledby="how-real">
        <h2 id="how-real">What’s real in this demo</h2>
        <div className="real">
          <div>
            <h3>Real, on Stellar Testnet</h3>
            <ul>
              <li>The Stroop contract and every rule it enforces</li>
              <li>Every lock, payout and refund, each with a public receipt</li>
              <li>The network fees shown on each lease</li>
              <li>The off-ramp sign-in and withdrawal form, on SDF’s test anchor</li>
            </ul>
          </div>
          <div>
            <h3>Stand-ins for the demo</h3>
            <ul>
              <li>USDC is test money from a faucet, in place of a real on-ramp</li>
              <li>Exchange rates and partner fees are estimates</li>
              <li>One rent month passes every minute</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
