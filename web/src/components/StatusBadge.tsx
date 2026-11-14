import type { Lease } from '../stellar'
import { statusBadge } from '../leaseText'

export function StatusBadge({ lease, now }: { lease: Lease; now: number }) {
  const { label, tone } = statusBadge(lease, now)
  // Keyed on the label so a status change re-plays the badge's arrival.
  return (
    <span key={label} className={`badge ${tone}`}>
      <span className="badge-dot" aria-hidden />
      {label}
    </span>
  )
}
