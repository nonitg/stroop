import { type Lease, type Role, fromUnits, txsFor } from '../stellar'
import { FEE_PCT, feeLine, moneyTrail } from '../leaseText'
import { fmtMoney, fmtNetworkFee, offRampQuote, onRampQuote } from '../money'
import { useHomeCurrency, useNetworkFees } from '../hooks'
import { Money } from './Money'

/** Every dollar on a lease: what went in, where it is now, and what each side paid in fees. */
export function MoneyTrail({ lease, role }: { lease: Lease; role: Role }) {
  const m = moneyTrail(lease)
  const [code] = useHomeCurrency()
  const txs = txsFor(lease.id)
  const networkXlm = useNetworkFees(txs.map((t) => t.hash))
  const fee = feeLine(lease)
  const family = role === 'family'

  const rows: [string, bigint | string, string?][] = family
    ? [
        [
          'You put in',
          m.putIn,
          code === 'USD' ? undefined : `≈ ${fmtMoney(onRampQuote(fromUnits(m.putIn), code).pay, code)} from your bank, incl. est. on-ramp fee`,
        ],
        ['Paid to your landlord', m.paid],
        [`Stroop fee, ${FEE_PCT}`, m.fee, fee.state],
        ['Returned to you', m.returned],
        ['Still locked', m.locked],
      ]
    : [
        ['Rent locked for you', m.rentTotal],
        ['Paid to you', m.paid, m.paid > 0n ? `≈ ${fmtMoney(offRampQuote(fromUnits(m.paid)).receive, 'CAD')} in your bank after est. cash-out fee` : undefined],
        ...(lease.landlordOwed > 0n ? ([['Waiting for you to claim', lease.landlordOwed]] as [string, bigint][]) : []),
        ['Returned to the family', m.returned],
        ['Still locked', lease.held],
        ['Stroop fee you pay', 'None', `The family pays the ${FEE_PCT} fee`],
      ]

  return (
    <section className="trail" aria-label="Money on this lease">
      <h4 className="trail-title">Money on this lease</h4>
      <dl className="ledger num">
        {rows.map(([k, v, note]) => (
          <div key={k}>
            <dt>
              {k}
              {note && <span className="ledger-note">{note}</span>}
            </dt>
            <dd>{typeof v === 'string' ? v : <Money units={v} />}</dd>
          </div>
        ))}
        <div>
          <dt>
            Network fees you’ve paid
            <span className="ledger-note">
              {txs.length} {txs.length === 1 ? 'action' : 'actions'} from this browser, paid in XLM
            </span>
          </dt>
          <dd>{networkXlm === null ? '…' : fmtNetworkFee(networkXlm)}</dd>
        </div>
      </dl>
    </section>
  )
}
