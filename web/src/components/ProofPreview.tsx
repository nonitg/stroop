import { ShieldCheck } from 'lucide-react'
import { MonthTiles, type MonthState } from './Schedule'

const EXAMPLE_YEAR: MonthState[] = ['paid', 'paid', 'paid', ...Array<MonthState>(9).fill('locked')]

/** Shown before onboarding: a labelled example of the proof page a landlord opens. */
export function ProofPreview() {
  return (
    <figure className="preview">
      <div className="preview-card" aria-hidden>
        <div className="preview-head">
          <ShieldCheck size={18} />
          <span>Rent reserve proof</span>
          <span className="preview-tag">Example</span>
        </div>
        <div className="preview-body">
          <span className="label">Locked for this lease right now</span>
          <p className="amount">
            $9,000.00 <span className="unit">test USDC</span>
          </p>
          <MonthTiles states={EXAMPLE_YEAR} />
          <p className="preview-note">3 of 12 months paid to the landlord. The other 9 stay locked until they're due.</p>
        </div>
      </div>
      <figcaption>
        What your landlord sees when they open your proof link: the amount locked and the schedule, read live from
        Stellar.
      </figcaption>
    </figure>
  )
}
