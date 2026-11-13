import type { Lease } from '../stellar'
import { statusBadge } from '../leaseText'

export function StatusBadge({ lease }: { lease: Lease }) {
  const { label, tone } = statusBadge(lease)
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" aria-hidden />
      {label}
    </span>
  )
}
