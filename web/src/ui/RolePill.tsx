import { Building2, GraduationCap } from 'lucide-react'
import type { Role } from '../stellar'

/** Whose app this is, always visible. Tapping it goes to Account, where you can switch sides. */
export function RolePill({ role }: { role: Role }) {
  const family = role === 'family'
  const Icon = family ? GraduationCap : Building2
  return (
    <a className="role-pill" href="#/account" aria-label={`${family ? 'Renter' : 'Landlord'} account`}>
      <i>
        <Icon size={13} aria-hidden />
      </i>
      {family ? 'Renter' : 'Landlord'}
    </a>
  )
}
