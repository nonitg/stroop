import { ArrowLeft, ArrowUpRight, BadgeCheck, LoaderCircle } from 'lucide-react'
import { CASH_MONTHS, CONTRACTS, explorer, fmtUSD } from '../stellar'
import { useLease, useNow } from '../hooks'
import { fmtDate, headline } from '../leaseText'
import { fmtMoney, offRampQuote } from '../money'
import { mediatorName } from '../mediators'
import { Amount } from '../ui/Amount'
import { useCover } from '../ui/LendingSheet'
import { Brand } from '../ui/BrandMark'
import { MonthTiles } from '../ui/MonthTiles'
import { Status } from '../ui/Status'
import { Problem } from './MoneySheets'

/** Public proof of rent: what a landlord (or anyone with the link) checks before trusting a tenant. */
export function Proof({ id, back }: { id: number; back?: boolean }) {
  const { lease, error } = useLease(id)
  const now = useNow()
  const cover = useCover()
  const top = (
    <div className="top">
      {back ? (
        <a className="icon-btn" href="#/" aria-label="Back to home">
          <ArrowLeft size={20} aria-hidden />
        </a>
      ) : (
        <a href="#/" style={{ textDecoration: 'none' }}>
          <Brand />
        </a>
      )}
      <span className="spacer" />
      {lease && (
        <span className="chip" data-mood="good">
          <BadgeCheck size={15} aria-hidden /> Verified on Stellar
        </span>
      )}
    </div>
  )
  if (!lease)
    return (
      <main className="screen bare">
        {top}
        {error ? (
          <Problem text={error} />
        ) : (
          <div className="splash" style={{ minHeight: '50dvh' }}>
            <LoaderCircle className="spin" size={26} aria-label="Checking Stellar" />
          </div>
        )}
      </main>
    )
  // Public viewers see the landlord's side of the story: what's promised to them.
  const h = headline(lease, 'landlord', '', now)
  const monthly = offRampQuote(Number(lease.rent) / 1e7)
  return (
    <main className="screen bare">
      {top}
      <h1 className="page-title">Proof of rent</h1>
      <section className="glass card hero-card syrup">
        <span className="label">Locked for the landlord · Lease {lease.id}</span>
        <Amount units={lease.held} />
        <span className="approx">Checked just now. Nobody can move it early.</span>
        <MonthTiles lease={lease} now={now} />
        <div className="hero-foot">
          <Status {...h} sub={undefined} />
        </div>
      </section>
      <dl className="facts glass" style={{ marginTop: 14 }}>
        <div>
          <dt>Each month</dt>
          <dd>
            {fmtUSD(lease.rent)}
            <small>
              ≈ {fmtMoney(monthly.receive, 'CAD')} in the bank after a 0.5% cash-out fee (
              {fmtMoney(monthly.fee, 'CAD', { cents: true })})
            </small>
          </dd>
        </div>
        <div>
          <dt>Term</dt>
          <dd>{lease.periods} months</dd>
        </div>
        {lease.lend && (
          <div>
            <dt>Later months</dt>
            <dd>
              Tenant chose lending
              <small>
                Next {CASH_MONTHS} months always stay here. Stroop covers any loss
                {cover && ` · cover fund ${fmtUSD(cover.cover)}`}
              </small>
            </dd>
          </div>
        )}
        <div>
          <dt>Paid so far</dt>
          <dd>{fmtUSD(lease.rent * BigInt(lease.paidPeriods))}</dd>
        </div>
        {(lease.status === 'Funded' || lease.status === 'Accepted') && (
          <div>
            <dt>Move in by</dt>
            <dd>{fmtDate(lease.moveInBy)}</dd>
          </div>
        )}
        <div>
          <dt>Stroop’s fee for landlords</dt>
          <dd>None</dd>
        </div>
        <div>
          <dt>Disputes</dt>
          <dd>{mediatorName(lease.mediator)}</dd>
        </div>
      </dl>
      <ul className="list glass" style={{ marginTop: 14 }}>
        <li>
          <a className="row" href={explorer.contract(CONTRACTS.rentReserve)} target="_blank" rel="noreferrer">
            <span className="txt">
              <strong>See the record on Stellar</strong>
              <span>Public, can’t be edited</span>
            </span>
            <ArrowUpRight className="chev" size={18} aria-hidden />
          </a>
        </li>
      </ul>
    </main>
  )
}
