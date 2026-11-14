import { Inbox } from 'lucide-react'
import { useLeases, useWallet } from '../hooks'
import { Dashboard } from './Dashboard'
import { Hero } from './Hero'
import { LeaseList } from './LeaseCard'

export function LandlordView() {
  const wallet = useWallet('landlord')
  const { leases, reload } = useLeases(wallet.kp?.publicKey())
  const refreshAll = () => Promise.all([reload(), wallet.refresh()])
  if (wallet.checked && !wallet.balances) return <Hero role="landlord" wallet={wallet} />
  return (
    <Dashboard role="landlord" wallet={wallet} leases={leases}>
      {wallet.kp && <LeaseList role="landlord" kp={wallet.kp} leases={leases} onChange={refreshAll} />}
      {leases?.length === 0 && (
        <section className="card empty">
          <span className="empty-icon" aria-hidden>
            <Inbox size={20} />
          </span>
          <h3>No leases yet</h3>
          <p>Share your account address with the student. When they lock rent for it, the lease appears here in seconds.</p>
        </section>
      )}
    </Dashboard>
  )
}
