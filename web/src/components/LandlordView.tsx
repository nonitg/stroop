import { Inbox } from 'lucide-react'
import { useLeases, useWallet } from '../hooks'
import { AccountPanel } from './Account'
import { LeaseList } from './LeaseCard'
import { LandlordStory } from './Story'

export function LandlordView() {
  const wallet = useWallet('landlord')
  const { leases, reload } = useLeases(wallet.kp?.publicKey())
  const refreshAll = () => Promise.all([reload(), wallet.refresh()])
  return (
    <div className={`split${wallet.balances ? ' has-account' : ''}`}>
      <LandlordStory />
      <div className="workspace">
        <AccountPanel role="landlord" wallet={wallet} />
        {wallet.kp && <LeaseList role="landlord" kp={wallet.kp} leases={leases} onChange={refreshAll} />}
        {wallet.balances && leases?.length === 0 && (
          <section className="panel empty">
            <Inbox size={28} aria-hidden />
            <h2>No leases yet</h2>
            <p>
              Share your account address with the student or their family. When they lock rent for it, the lease shows up here within a
              few seconds.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
