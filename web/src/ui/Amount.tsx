import { fromUnits } from '../stellar'
import { useTween } from '../hooks'
import { fmtMoney } from '../money'

/** A big amount that eases to new values, so money visibly moves when it moves. C$ by default. */
export function Amount({ units, code = 'CAD', size }: { units: bigint | number; code?: string; size?: 'md' }) {
  const target = typeof units === 'bigint' ? fromUnits(units) : units
  const shown = useTween(target)
  const text = fmtMoney(shown, code, { cents: true })
  const first = text.search(/\d/)
  const dot = text.lastIndexOf('.')
  return (
    <span className={`amount${size ? ` ${size}` : ''}`}>
      <span className="sr-only">{fmtMoney(target, code, { cents: true })}</span>
      <span aria-hidden>
        <span className="cur">{text.slice(0, first)}</span>
        {text.slice(first, dot)}
        <span className="cents">{text.slice(dot)}</span>
      </span>
    </span>
  )
}
