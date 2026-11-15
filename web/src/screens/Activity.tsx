import { ArrowUpRight, ReceiptText } from 'lucide-react'
import { useApp } from '../app'
import { allTxs, explorer } from '../stellar'

/** Every action taken in this browser, each with its public receipt. */
export function Activity() {
  const { leases } = useApp()
  const ids = new Set((leases ?? []).map((l) => l.id))
  const txs = allTxs().filter((t) => ids.has(t.leaseId))
  return (
    <main className="screen">
      <div className="top" />
      <h1 className="page-title">Activity</h1>
      {txs.length === 0 ? (
        <section className="glass card empty">
          <span className="ico-lg">
            <ReceiptText size={26} aria-hidden />
          </span>
          <h2>Nothing yet</h2>
          <p>Every step of a lease shows up here, with a receipt.</p>
        </section>
      ) : (
        <ul className="list glass">
          {txs.map((t) => (
            <li key={t.hash}>
              <a className="row" href={explorer.tx(t.hash)} target="_blank" rel="noreferrer">
                <span className="ico">
                  <ReceiptText size={18} aria-hidden />
                </span>
                <span className="txt">
                  <strong>{t.label}</strong>
                  <span>
                    Lease {t.leaseId} ·{' '}
                    {new Date(t.at).toLocaleString('en-CA', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </span>
                <ArrowUpRight className="chev" size={16} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
