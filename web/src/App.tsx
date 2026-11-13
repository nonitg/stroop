import { useCallback, useEffect, useState } from 'react'
import type { Keypair } from '@stellar/stellar-sdk'
import {
  CONTRACTS,
  type Lease,
  type Role,
  explainError,
  explorer,
  fmtUSD,
  getBalances,
  getKeypair,
  getLease,
  leasesFor,
  logTx,
  periodsDue,
  reserve,
  resetDemo,
  secsToNextRelease,
  setupWallet,
  short,
  txsFor,
} from './stellar'
import { CashOut } from './CashOut'
import './App.css'

// ---------- Routing (hash based so the static build works anywhere) ----------

type Route = { view: 'family' } | { view: 'landlord' } | { view: 'verify'; id?: number }

function parseRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (h.startsWith('lease/')) return { view: 'verify', id: Number(h.split('/')[1]) }
  if (h === 'verify') return { view: 'verify' }
  if (h === 'landlord') return { view: 'landlord' }
  return { view: 'family' }
}

function useRoute() {
  const [route, setRoute] = useState<Route>(parseRoute)
  useEffect(() => {
    const on = () => setRoute(parseRoute())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

const verifyLink = (id: number) => `${window.location.origin}${window.location.pathname}#/lease/${id}`

// ---------- Shared hooks ----------

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now() / 1000)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

function useWallet(role: Role) {
  const [kp, setKp] = useState<Keypair | null>(() => getKeypair(role))
  const [balances, setBalances] = useState<{ xlm: number; usdc: number } | null>(null)
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (kp) setBalances(await getBalances(kp.publicKey()))
  }, [kp])

  useEffect(() => {
    refresh()
  }, [refresh])

  const setup = async () => {
    setError(null)
    try {
      const k = await setupWallet(role, setStep)
      setKp(k)
      setBalances(await getBalances(k.publicKey()))
    } catch (e) {
      setError(explainError(e))
    } finally {
      setStep(null)
    }
  }
  return { kp, balances, step, error, setup, refresh }
}

function useLeases(pub: string | undefined) {
  const [leases, setLeases] = useState<Lease[] | null>(null)
  const load = useCallback(async () => {
    if (!pub) return
    try {
      setLeases(await leasesFor(pub))
    } catch {
      /* transient RPC errors: keep the last good list */
    }
  }, [pub])
  useEffect(() => {
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])
  return { leases, reload: load }
}

// ---------- App shell ----------

export default function App() {
  const route = useRoute()
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          RentProof
        </a>
        <span className="pill">Stellar Testnet demo</span>
        <nav>
          <a className={route.view === 'family' ? 'active' : ''} href="#/family">
            Student &amp; family
          </a>
          <a className={route.view === 'landlord' ? 'active' : ''} href="#/landlord">
            Landlord
          </a>
          <a className={route.view === 'verify' ? 'active' : ''} href="#/verify">
            Verify a lease
          </a>
        </nav>
      </header>
      <main>
        {route.view === 'family' && <FamilyView />}
        {route.view === 'landlord' && <LandlordView />}
        {route.view === 'verify' && <VerifyView id={route.id} />}
      </main>
      <footer>
        <p>
          Testnet prototype. Demo wallets are generated in your browser and hold play money only; production
          uses passkey wallets with no seed phrases. Rent contract{' '}
          <a href={explorer.contract(CONTRACTS.rentReserve)} target="_blank">
            {short(CONTRACTS.rentReserve)}
          </a>
          .{' '}
          <button
            className="link"
            onClick={() => {
              resetDemo()
              window.location.reload()
            }}
          >
            Reset demo wallets
          </button>
        </p>
      </footer>
    </div>
  )
}

// ---------- Wallet panel ----------

function WalletPanel({ role, wallet }: { role: Role; wallet: ReturnType<typeof useWallet> }) {
  const label = role === 'family' ? 'Family wallet' : 'Landlord wallet'
  if (!wallet.kp || !wallet.balances) {
    return (
      <section className="card">
        <h3>{label}</h3>
        <p>
          {role === 'family'
            ? 'Create a testnet wallet with 20,000 test USDC to try the flow.'
            : 'Create a testnet wallet to receive rent.'}
        </p>
        <button onClick={wallet.setup} disabled={!!wallet.step}>
          {wallet.step ?? 'Create demo wallet'}
        </button>
        {wallet.error && <p className="error">{wallet.error}</p>}
      </section>
    )
  }
  return (
    <section className="card wallet">
      <h3>{label}</h3>
      <div className="balance">{wallet.balances.usdc.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} USDC</div>
      <p className="muted">
        <a href={explorer.account(wallet.kp.publicKey())} target="_blank">
          {short(wallet.kp.publicKey())}
        </a>{' '}
        · {wallet.balances.xlm.toFixed(0)} XLM for fees
      </p>
    </section>
  )
}

// ---------- Family ----------

function FamilyView() {
  const wallet = useWallet('family')
  const { leases, reload } = useLeases(wallet.kp?.publicKey())
  const landlordWallet = getKeypair('landlord')
  const [landlord, setLandlord] = useState(landlordWallet?.publicKey() ?? '')
  const [rent, setRent] = useState(1000)
  const [months, setMonths] = useState(12)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const useDemoLandlord = async () => {
    setBusy('Creating demo landlord wallet…')
    try {
      const k = await setupWallet('landlord', () => {})
      setLandlord(k.publicKey())
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(null)
    }
  }

  const lock = async () => {
    if (!wallet.kp) return
    setError(null)
    setBusy('Locking rent in escrow…')
    try {
      const { result, hash } = await reserve.create(wallet.kp, landlord.trim(), rent, months)
      if (hash) logTx({ leaseId: Number(result), label: 'Rent locked', hash, at: Date.now() })
      await Promise.all([reload(), wallet.refresh()])
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid">
      <section className="intro">
        <h1>Prove you can pay rent without handing over a year of cash.</h1>
        <p>
          Lock the lease's rent in a Stellar smart contract. Your landlord can verify it, gets paid one month at a
          time, and anything not yet owed stays protected.
        </p>
      </section>
      <WalletPanel role="family" wallet={wallet} />
      {wallet.kp && (
        <section className="card">
          <h3>Lock rent for a new lease</h3>
          <label>
            Landlord's Stellar address
            <input value={landlord} onChange={(e) => setLandlord(e.target.value)} placeholder="G…" />
          </label>
          {!landlord && (
            <button className="secondary" onClick={useDemoLandlord} disabled={!!busy}>
              Use a demo landlord
            </button>
          )}
          <div className="row">
            <label>
              Monthly rent (USD)
              <input type="number" min={1} value={rent} onChange={(e) => setRent(Number(e.target.value))} />
            </label>
            <label>
              Months
              <input type="number" min={1} max={24} value={months} onChange={(e) => setMonths(Number(e.target.value))} />
            </label>
          </div>
          <p className="muted">Demo speed: 1 month = 1 minute. Move-in must be confirmed within 30 minutes or you can reclaim everything.</p>
          <button onClick={lock} disabled={!!busy || !landlord || rent <= 0 || months < 1}>
            {busy ?? `Lock ${fmtUSD(BigInt(Math.round(rent * months * 1e7)))} in escrow`}
          </button>
          {error && <p className="error">{error}</p>}
        </section>
      )}
      {wallet.kp && <LeaseList role="family" kp={wallet.kp} leases={leases} onChange={() => Promise.all([reload(), wallet.refresh()])} />}
    </div>
  )
}

// ---------- Landlord ----------

function LandlordView() {
  const wallet = useWallet('landlord')
  const { leases, reload } = useLeases(wallet.kp?.publicKey())
  return (
    <div className="grid">
      <section className="intro">
        <h1>See the rent is there before you hand over the keys.</h1>
        <p>Every lease shows the locked balance, the payout schedule, and the rules, read straight from Stellar.</p>
      </section>
      <WalletPanel role="landlord" wallet={wallet} />
      {wallet.kp && <LeaseList role="landlord" kp={wallet.kp} leases={leases} onChange={() => Promise.all([reload(), wallet.refresh()])} />}
    </div>
  )
}

// ---------- Lease list & card ----------

function LeaseList(props: { role: Role; kp: Keypair; leases: Lease[] | null; onChange: () => Promise<unknown> }) {
  if (!props.leases) return <p className="muted">Loading leases…</p>
  if (props.leases.length === 0)
    return <p className="muted">{props.role === 'family' ? 'No leases yet.' : 'No leases name this wallet yet.'}</p>
  return (
    <section className="leases">
      {props.leases.map((l) => (
        <LeaseCard key={l.id} lease={l} role={props.role} kp={props.kp} onChange={props.onChange} />
      ))}
    </section>
  )
}

function LeaseCard({ lease, role, kp, onChange }: { lease: Lease; role: Role; kp: Keypair; onChange: () => Promise<unknown> }) {
  const now = useNow()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cashout, setCashout] = useState(false)
  const due = periodsDue(lease, now)
  const next = secsToNextRelease(lease, now)
  const me = kp.publicKey()
  const proposedByMe = lease.endProposedBy === me
  const proposedByOther = !!lease.endProposedBy && !proposedByMe

  const act = async (label: string, fn: () => Promise<{ hash?: string }>) => {
    setError(null)
    setBusy(label)
    try {
      const { hash } = await fn()
      if (hash) logTx({ leaseId: lease.id, label, hash, at: Date.now() })
      await onChange()
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(null)
    }
  }

  const actions: { label: string; run: () => Promise<{ hash?: string }>; kind?: string }[] = []
  if (role === 'family') {
    if (lease.status === 'Accepted') actions.push({ label: 'Confirm move-in (I have the keys)', run: () => reserve.moveIn(kp, lease.id) })
    if (lease.status === 'Funded') actions.push({ label: 'Cancel and get refund', run: () => reserve.reclaim(kp, lease.id), kind: 'secondary' })
    if (lease.status === 'Accepted' && now > lease.moveInBy)
      actions.push({ label: 'Reclaim reserve (no move-in)', run: () => reserve.reclaim(kp, lease.id), kind: 'secondary' })
  } else {
    if (lease.status === 'Funded') actions.push({ label: 'Accept lease', run: () => reserve.accept(kp, lease.id) })
    if (due > 0) actions.push({ label: `Collect ${due} month${due > 1 ? 's' : ''} of rent`, run: () => reserve.release(kp, lease.id) })
    if (lease.status === 'Active')
      actions.push({ label: 'Try to withdraw early', run: () => reserve.release(kp, lease.id), kind: 'ghost' })
  }
  if (lease.status === 'Active' && !proposedByMe)
    actions.push({
      label: proposedByOther ? 'Agree to end lease early' : 'Propose ending lease early',
      run: () => reserve.endEarly(kp, lease.id),
      kind: 'secondary',
    })

  return (
    <article className="card lease">
      <header>
        <h3>Lease #{lease.id}</h3>
        <span className={`status s-${lease.status.toLowerCase()}`}>{statusText(lease)}</span>
      </header>
      <div className="figures">
        <div>
          <span className="muted">Locked now</span>
          <strong>{fmtUSD(lease.held)}</strong>
        </div>
        <div>
          <span className="muted">Paid to landlord</span>
          <strong>{fmtUSD(lease.rent * BigInt(lease.paidPeriods))}</strong>
        </div>
        <div>
          <span className="muted">Rent</span>
          <strong>
            {fmtUSD(lease.rent)} × {lease.periods}
          </strong>
        </div>
      </div>
      <Schedule lease={lease} now={now} />
      {next !== null && <p className="muted">Next month unlocks in {next}s</p>}
      {proposedByMe && <p className="muted">You proposed ending early. Waiting for the other side to agree.</p>}
      <div className="actions">
        {actions.map((a) => (
          <button key={a.label} className={a.kind} disabled={!!busy} onClick={() => act(a.label, a.run)}>
            {busy === a.label ? 'Signing…' : a.label}
          </button>
        ))}
        {role === 'landlord' && lease.paidPeriods > 0 && (
          <button className="secondary" onClick={() => setCashout(true)}>
            Cash out to CAD
          </button>
        )}
        <a className="button ghost" href={`#/lease/${lease.id}`}>
          Verification page
        </a>
        <button className="ghost" onClick={() => navigator.clipboard?.writeText(verifyLink(lease.id))}>
          Copy link
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {cashout && <CashOut onClose={() => setCashout(false)} amount={lease.rent * BigInt(lease.paidPeriods)} />}
      <TxHistory leaseId={lease.id} />
    </article>
  )
}

function statusText(l: Lease) {
  switch (l.status) {
    case 'Funded':
      return 'Funded · awaiting landlord'
    case 'Accepted':
      return 'Accepted · awaiting move-in'
    case 'Active':
      return `Active · month ${l.paidPeriods} of ${l.periods}`
    case 'Completed':
      return 'Completed'
    case 'Ended':
      return 'Ended early · unused rent refunded'
    case 'Refunded':
      return 'Refunded in full'
  }
}

function Schedule({ lease, now }: { lease: Lease; now: number }) {
  const dueTotal = lease.paidPeriods + periodsDue(lease, now)
  return (
    <ol className="schedule" aria-label="Rent schedule">
      {Array.from({ length: lease.periods }, (_, i) => {
        const state = i < lease.paidPeriods ? 'paid' : i < dueTotal ? 'due' : lease.held === 0n ? 'refunded' : 'locked'
        return <li key={i} className={state} title={`Month ${i + 1}: ${state}`} />
      })}
    </ol>
  )
}

function TxHistory({ leaseId }: { leaseId: number }) {
  const txs = txsFor(leaseId)
  if (txs.length === 0) return null
  return (
    <details className="txs">
      <summary>On-chain receipts ({txs.length})</summary>
      <ul>
        {txs.map((t) => (
          <li key={t.hash}>
            {t.label} ·{' '}
            <a href={explorer.tx(t.hash)} target="_blank">
              {short(t.hash)}
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}

// ---------- Public verification ----------

function VerifyView({ id }: { id?: number }) {
  const [input, setInput] = useState(id?.toString() ?? '')
  const [lease, setLease] = useState<Lease | null>(null)
  const [error, setError] = useState<string | null>(null)
  const now = useNow()

  useEffect(() => {
    if (id === undefined || Number.isNaN(id)) return
    let live = true
    const load = () =>
      getLease(id)
        .then((l) => live && (setLease(l), setError(null)))
        .catch((e) => live && setError(explainError(e)))
    load()
    const t = setInterval(load, 8000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [id])

  if (id === undefined || Number.isNaN(id)) {
    return (
      <section className="card">
        <h1>Verify a tenant's rent reserve</h1>
        <p>Enter the lease number from the tenant's RentProof link.</p>
        <div className="row">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Lease number" />
          <button onClick={() => (window.location.hash = `#/lease/${input.trim()}`)}>Verify</button>
        </div>
      </section>
    )
  }
  if (error) return <p className="error">{error}</p>
  if (!lease) return <p className="muted">Reading lease #{id} from Stellar…</p>

  const total = lease.rent * BigInt(lease.periods)
  return (
    <section className="card verify">
      <p className="muted">Lease #{lease.id} · read live from Stellar Testnet</p>
      <h1>{fmtUSD(lease.held)} USDC locked for this lease</h1>
      <p>{statusText(lease)}</p>
      <Schedule lease={lease} now={now} />
      <ul className="rules">
        <li>{fmtUSD(total)} total: {fmtUSD(lease.rent)} per month for {lease.periods} months.</li>
        <li>Rent can only be paid to the landlord's account, one month at a time, never ahead of schedule.</li>
        <li>Once the landlord accepts, the tenant cannot withdraw the reserve.</li>
        <li>
          If move-in isn't confirmed by {new Date(lease.moveInBy * 1000).toLocaleString()}, the reserve returns to the
          payer.
        </li>
        <li>Ending early needs both sides to agree; unused rent goes back to the payer.</li>
      </ul>
      <dl>
        <dt>Landlord</dt>
        <dd>
          <a href={explorer.account(lease.landlord)} target="_blank">
            {short(lease.landlord)}
          </a>
        </dd>
        <dt>Payer</dt>
        <dd>
          <a href={explorer.account(lease.payer)} target="_blank">
            {short(lease.payer)}
          </a>
        </dd>
        <dt>Contract</dt>
        <dd>
          <a href={explorer.contract(CONTRACTS.rentReserve)} target="_blank">
            {CONTRACTS.rentReserve}
          </a>
        </dd>
      </dl>
    </section>
  )
}
