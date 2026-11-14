import type { ReactNode } from 'react'
import type { Role } from '../stellar'
import type { Wallet } from '../hooks'
import { AccountSkeleton, AccountSummary } from './Account'

const TITLES: Record<Role, string> = { family: 'Student & family', landlord: 'Landlord' }

/** Signed-in layout: one focused column with the account on top and leases below. */
export function Dashboard({ role, wallet, count, children }: { role: Role; wallet: Wallet; count?: number; children: ReactNode }) {
  return (
    <div className="dash">
      <h1 className="sr-only">{TITLES[role]} dashboard</h1>
      {wallet.balances ? <AccountSummary role={role} wallet={wallet} /> : <AccountSkeleton />}
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
