import { fromUnits } from '../stellar'
import { useTween } from '../hooks'
import { fmtMoney } from '../money'

/** A big US$ amount that eases to new values, so money visibly moves when it moves. */
export function Amount({ units, size }: { units: bigint | number; size?: 'md' }) {
  const target = typeof units === 'bigint' ? fromUnits(units) : units
  const shown = useTween(target)
  const digits = fmtMoney(shown, 'USD', { cents: true }).replace('US$', '')
  const dot = digits.lastIndexOf('.')
  return (
    <span className={`amount${size ? ` ${size}` : ''}`}>
      <span className="sr-only">{fmtMoney(target, 'USD', { cents: true })}</span>
      <span aria-hidden>
        <span className="cur">US$</span>
        {digits.slice(0, dot)}
        <span className="cents">{digits.slice(dot)}</span>
      </span>
    </span>
  )
}
