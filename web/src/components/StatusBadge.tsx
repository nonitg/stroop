import type { Lease } from '../stellar'
import { statusBadge } from '../leaseText'

export function StatusBadge({ lease, now }: { lease: Lease; now: number }) {
  const { label, tone } = statusBadge(lease, now)
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" aria-hidden />
      {label}
    </span>
  )
}
