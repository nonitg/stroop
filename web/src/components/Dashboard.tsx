import type { ReactNode } from 'react'
import type { Lease, Role } from '../stellar'
import type { Wallet } from '../hooks'
import { moneyTrail } from '../leaseText'
import { AccountSkeleton, AccountSummary } from './Account'

const TITLES: Record<Role, string> = { family: 'Your leases', landlord: 'Incoming rent' }

/** Signed-in layout: leases in the main column, the account and its money in a side column. */
export function Dashboard(props: { role: Role; wallet: Wallet; leases: Lease[] | null; children: ReactNode }) {
  const { role, wallet, leases, children } = props
  // Money still in this account's reserves: for the family that includes fees not yet charged.
  const reserved = (leases ?? []).reduce((sum, l) => sum + (role === 'family' ? moneyTrail(l).locked : l.held), 0n)
  return (
    <div className="dash">
      <aside className="dash-side">
        {wallet.balances ? <AccountSummary role={role} wallet={wallet} reserved={reserved} /> : <AccountSkeleton />}
      </aside>
      <div className="dash-main">
        <h1 className={leases?.length ? 'page-title' : 'sr-only'}>{TITLES[role]}</h1>
        {children}
      </div>
    </div>
  )
}
