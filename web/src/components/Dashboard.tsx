import type { ReactNode } from 'react'
import type { Lease, Role } from '../stellar'
import type { Wallet } from '../hooks'
import { AccountSkeleton, AccountSummary } from './Account'

const TITLES: Record<Role, string> = { family: 'Student & family', landlord: 'Landlord' }

/** Signed-in layout: one focused column with the account on top and leases below. */
export function Dashboard(props: { role: Role; wallet: Wallet; leases: Lease[] | null; children: ReactNode }) {
  const { role, wallet, leases, children } = props
  const count = leases?.length
  // Rent still sitting in this account's reserves: the family's money until due, the landlord's once it is.
  const reserved = (leases ?? []).reduce((sum, l) => sum + l.held, 0n)
  return (
    <div className="dash">
      <h1 className="sr-only">{TITLES[role]} dashboard</h1>
      {wallet.balances ? <AccountSummary role={role} wallet={wallet} reserved={reserved} /> : <AccountSkeleton />}
      {!!count && (
        <div className="section-head">
          <h2>Leases</h2>
          <span className="count num">{count}</span>
        </div>
      )}
      {children}
    </div>
  )
}
