import type { Lease } from '../stellar'
import { statusBadge } from '../leaseText'

/** Lease status as quiet text with a colored dot. */
export function StatusBadge({ lease, now }: { lease: Lease; now: number }) {
  const { label, tone } = statusBadge(lease, now)
  return (
    <span className={`status ${tone}`}>
      <span className="status-dot" aria-hidden />
      {label}
    </span>
  )
}
