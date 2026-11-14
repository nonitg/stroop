import { fromUnits } from '../stellar'
import { useTween } from '../hooks'

const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** A dollar amount that eases to new values; cents sit quieter than dollars. */
export function Money({ units, className = '' }: { units: bigint | number; className?: string }) {
  const target = typeof units === 'bigint' ? fromUnits(units) : units
  const shown = useTween(target)
  const text = fmt(shown)
  const dot = text.lastIndexOf('.')
  return (
    <span className={`money num ${className}`}>
      <span className="sr-only">{fmt(target)}</span>
      <span aria-hidden>{text.slice(0, dot)}</span>
      <span className="cents" aria-hidden>
        {text.slice(dot)}
      </span>
    </span>
  )
}
