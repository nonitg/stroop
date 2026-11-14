import { fromUnits } from '../stellar'
import { useTween } from '../hooks'
import { fmtMoney } from '../money'

/** A USDC amount in US dollars that eases to new values; the currency and cents sit quieter. */
export function Money({ units, className = '' }: { units: bigint | number; className?: string }) {
  const target = typeof units === 'bigint' ? fromUnits(units) : units
  const shown = useTween(target)
  const digits = fmtMoney(shown, 'USD', { cents: true }).replace('US$', '')
  const dot = digits.lastIndexOf('.')
  return (
    <span className={`money num ${className}`}>
      <span className="sr-only">{fmtMoney(target, 'USD', { cents: true })}</span>
      <span className="cur" aria-hidden>
        US$
      </span>
      <span aria-hidden>{digits.slice(0, dot)}</span>
      <span className="cents" aria-hidden>
        {digits.slice(dot)}
      </span>
    </span>
  )
}
