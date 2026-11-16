import { useEffect, useState } from 'react'
import { HandCoins, LockKeyhole, ShieldCheck } from 'lucide-react'
import { CASH_MONTHS, coverStatus, fmtCAD, lendEarningsEstimate, lendSaving } from '../stellar'
import { fmtMoney } from '../money'
import { Sheet } from './Sheet'

/** Stroop's cover fund, read live from the contract. */
export function useCover() {
  const [cover, setCover] = useState<{ cover: bigint; lent: bigint } | null>(null)
  useEffect(() => {
    coverStatus().then(setCover, () => setCover(null))
  }, [])
  return cover
}

/**
 * The one place lending is explained. Three plain facts (what stays, what if it loses,
 * who earns what), with the fund's limit stated right next to the promise. Stroop's
 * likely earnings are shown in dollars; no rate, since the family earns nothing from it.
 */
export function LendingSheet(props: {
  open: boolean
  onClose: () => void
  rent: number
  months: number
  /** Offer mode: ask for consent. Without it the sheet just explains. */
  onAccept?: () => void
  children?: React.ReactNode
}) {
  const { open, onClose, rent, months, onAccept, children } = props
  const cover = useCover()
  const fund = cover ? `Stroop’s fund (${fmtCAD(cover.cover)}, public on Stellar)` : 'Stroop’s fund (public on Stellar)'
  const earns = fmtMoney(lendEarningsEstimate(rent, months), 'CAD')
  const saves = fmtCAD(lendSaving(rent, months))
  return (
    <Sheet open={open} onClose={onClose} title={onAccept ? 'Lend unused months?' : 'How lending works'}>
      <p className="lede">Stroop lends out rent you won’t need for months, and brings it back before it’s due.</p>
      <ul className="list glass" style={{ marginTop: 4 }}>
        <li>
          <div className="row">
            <span className="ico locked">
              <LockKeyhole size={18} aria-hidden />
            </span>
            <span className="txt">
              <strong>The next {CASH_MONTHS} months are never lent</strong>
              <span>Your landlord is paid on time, every month.</span>
            </span>
          </div>
        </li>
        <li>
          <div className="row">
            <span className="ico good">
              <ShieldCheck size={18} aria-hidden />
            </span>
            <span className="txt">
              <strong>If lending loses money, Stroop’s fund pays it</strong>
              <span>
                {fund} pays any loss. Only a loss bigger than the whole fund could leave your lease short.
              </span>
            </span>
          </div>
        </li>
        <li>
          <div className="row">
            <span className="ico">
              <HandCoins size={18} aria-hidden />
            </span>
            <span className="txt">
              <strong>
                Stroop keeps what lending earns, about {earns}
              </strong>
              <span>
                You get {saves} off Stroop’s fee. Switch off any time: lent rent comes back right away,
                the discount stays.
              </span>
            </span>
          </div>
        </li>
      </ul>
      <p className="fine" style={{ marginTop: 12 }}>
        Lent through Blend, a lending service on Stellar. Earnings are an estimate. Not a bank deposit or insurance.
      </p>
      {children}
      {onAccept && (
        <div className="actions">
          <button className="btn primary" onClick={onAccept}>
            Lend and save {saves}
          </button>
          <button className="btn secondary" onClick={onClose}>
            No thanks
          </button>
        </div>
      )}
    </Sheet>
  )
}
