import type { Lease, Role } from '../stellar'
import { statusBadge } from '../leaseText'

/** Lease status as quiet text with a colored dot. */
export function StatusBadge({ lease, now, role }: { lease: Lease; now: number; role?: Role }) {
  const { label, tone } = statusBadge(lease, now, role)
  return (
    <span className={`status ${tone}`}>
      <span className="status-dot" aria-hidden />
      {label}
    </span>
  )
}
