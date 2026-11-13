import { CONTRACTS, explorer, resetDemo, short } from './stellar'
import { type Route, useRoute } from './hooks'
import { ExplorerLink } from './components/ExplorerLink'
import { FamilyView } from './components/FamilyView'
import { LandlordView } from './components/LandlordView'
import { ToastProvider } from './components/ToastProvider'
import { VerifyView } from './components/VerifyView'
import './App.css'

const NAV: { view: Route['view']; href: string; label: string; short: string }[] = [
  { view: 'family', href: '#/family', label: 'Student & family', short: 'Family' },
  { view: 'landlord', href: '#/landlord', label: 'Landlord', short: 'Landlord' },
  { view: 'verify', href: '#/verify', label: 'Verify a lease', short: 'Verify' },
]

export default function App() {
  const route = useRoute()
  return (
    <ToastProvider>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/family" aria-label="RentProof home">
            <BrandMark />
            <span className="wordmark">RentProof</span>
          </a>
          <span className="pill">Testnet demo</span>
          <nav aria-label="Views">
            {NAV.map((n) => (
              <a key={n.view} href={n.href} aria-current={route.view === n.view ? 'page' : undefined}>
                <span className="nav-long">{n.label}</span>
                <span className="nav-short" aria-hidden>
                  {n.short}
                </span>
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main>
        {route.view === 'family' && <FamilyView />}
        {route.view === 'landlord' && <LandlordView />}
        {route.view === 'verify' && <VerifyView key={route.id ?? 'lookup'} id={route.id} />}
      </main>
      <footer className="site-foot">
        <p>
          Testnet prototype. Demo accounts are created in this browser and hold test money only; in production, people
          sign in with a passkey and never see a seed phrase. Rent contract{' '}
          <ExplorerLink href={explorer.contract(CONTRACTS.rentReserve)} text={short(CONTRACTS.rentReserve)} />.
        </p>
        <button
          className="btn quiet small"
          onClick={() => {
            resetDemo()
            window.location.reload()
          }}
        >
          Reset demo accounts
        </button>
      </footer>
    </ToastProvider>
  )
}

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" width="32" height="32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--spruce)" />
      <path
        d="M7.5 15.2 16 8.5l8.5 6.7V24a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.5 24z"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="m12.4 18.6 2.6 2.6 4.6-4.8" fill="none" stroke="var(--marigold)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
