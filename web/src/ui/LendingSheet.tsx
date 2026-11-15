import { useEffect, useState } from 'react'
import { HandCoins, LockKeyhole, ShieldCheck } from 'lucide-react'
import { CASH_MONTHS, LEND_DISCOUNT, coverStatus, fmtUSD } from '../stellar'
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
 * what you get), then the honest limit in one line. No rates: the family earns nothing
 * from lending, so a rate would only invite the wrong comparison.
 */
export function LendingSheet(props: {
  open: boolean
  onClose: () => void
  /** Offer mode: ask for consent. Without it the sheet just explains. */
  onAccept?: () => void
  children?: React.ReactNode
}) {
  const { open, onClose, onAccept, children } = props
  const cover = useCover()
  const coverLine = cover
    ? `Stroop’s cover fund holds ${fmtUSD(cover.cover)} on Stellar, open for anyone to check.`
    : 'Stroop’s cover fund is held on Stellar, open for anyone to check.'
  return (
    <Sheet open={open} onClose={onClose} title={onAccept ? `Save ${fmtUSD(LEND_DISCOUNT)}` : 'How lending works'}>
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
              <strong>If lending loses money, Stroop pays it back</strong>
              <span>{coverLine}</span>
            </span>
          </div>
        </li>
        <li>
          <div className="row">
            <span className="ico">
              <HandCoins size={18} aria-hidden />
            </span>
            <span className="txt">
              <strong>Stroop keeps what lending earns</strong>
              <span>You get {fmtUSD(LEND_DISCOUNT)} off Stroop’s fee instead. Turn it off any time.</span>
            </span>
          </div>
        </li>
      </ul>
      <p className="fine" style={{ marginTop: 12 }}>
        Lent through Blend, a lending pool on Stellar (simulated on testnet). Not a bank deposit or insurance. If losses
        ever went past the cover fund, the lease could come up short.
      </p>
      {children}
      {onAccept && (
        <div className="actions">
          <button className="btn primary" onClick={onAccept}>
            Turn on lending
          </button>
          <button className="btn secondary" onClick={onClose}>
            No thanks
          </button>
        </div>
      )}
    </Sheet>
  )
}
