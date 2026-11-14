import { CONTRACTS } from '../stellar'
import { FEE_PCT } from '../leaseText'
import { LOCK_FEE_XLM, OFF_RAMP_FEE, ON_RAMP_FEE, fmtMoney, fmtNetworkFee, offRampQuote, onRampQuote, pct } from '../money'

const usd = (n: number) => fmtMoney(n, 'USD', { cents: true })

/** Every hop the rent takes, top to bottom: the family's bank, the contract, the landlord's bank. */
export function MoneyFlow(props: { rent: number; months: number; code: string; you?: 'family' | 'landlord' }) {
  const { rent, months, code, you } = props
  const rentTotal = rent * months
  const fee = (rentTotal * CONTRACTS.feeBps) / 10_000
  const locked = rentTotal + fee
  const ramp = onRampQuote(locked, code)
  const out = offRampQuote(rent)
  const family = you === 'family' ? 'your' : 'the family’s'
  const landlord = you === 'landlord' ? 'your' : you === 'family' ? 'your landlord’s' : 'the landlord’s'

  return (
    <ol className="flow">
      <li>
        <div className="flow-head">
          <span>From {family} bank</span>
          <strong className="num">{fmtMoney(ramp.pay, code)}</strong>
        </div>
        <dl className="flow-rows num">
          {code === 'USD' ? (
            <Row k="Sent in US dollars, 1 USD = 1 USDC" />
          ) : (
            <>
              <Row k={`Converted at 1 USDC = ${fmtMoney(ramp.rate, code, { cents: true })}`} v={fmtMoney(ramp.pay - ramp.fee, code)} />
              <Row k={`On-ramp fee, est. ${pct(ON_RAMP_FEE)}`} v={fmtMoney(ramp.fee, code)} />
            </>
          )}
        </dl>
      </li>
      <li>
        <div className="flow-head">
          <span>Locked in the Stroop contract</span>
          <strong className="num">{usd(locked)}</strong>
        </div>
        <dl className="flow-rows num">
          <Row k={`Rent, ${fmtMoney(rent, 'USD')} × ${months} months`} v={usd(rentTotal)} />
          <Row k={`Stroop fee, ${FEE_PCT}`} note="Charged only after move-in. Refunded if it never happens." v={usd(fee)} />
          <Row k="Stellar network fee to lock" v={fmtNetworkFee(LOCK_FEE_XLM)} />
        </dl>
      </li>
      <li>
        <div className="flow-head">
          <span>To {landlord} account, monthly</span>
          <strong className="num">
            {usd(rent)} <span className="times">× {months}</span>
          </strong>
        </div>
        <dl className="flow-rows num">
          <Row
            k={`In ${landlord} Canadian bank`}
            note={`After an est. ${pct(OFF_RAMP_FEE)} cash-out fee, paid by the landlord`}
            v={`≈ ${fmtMoney(out.receive, 'CAD')} / mo`}
          />
          <Row k="Stroop fee for the landlord" v="None, the family pays it" />
        </dl>
      </li>
    </ol>
  )
}

function Row({ k, v, note }: { k: string; v?: string; note?: string }) {
  return (
    <div className="flow-row">
      <dt>
        {k}
        {note && <span className="flow-note">{note}</span>}
      </dt>
      {v && <dd>{v}</dd>}
    </div>
  )
}
