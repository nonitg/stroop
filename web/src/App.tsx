import { ArrowUpRight } from 'lucide-react'
import { CONTRACTS, explorer, resetDemo, short } from './stellar'
import { type Route, useRoute } from './hooks'
import { BrandMark } from './components/BrandMark'
import { FamilyView } from './components/FamilyView'
import { HowItWorks } from './components/HowItWorks'
import { LandlordView } from './components/LandlordView'
import { ToastProvider } from './components/ToastProvider'
import { VerifyView } from './components/VerifyView'
import './App.css'

const NAV: { view: Route['view']; href: string; label: string; short: string }[] = [
  { view: 'family', href: '#/family', label: 'Student & family', short: 'Family' },
  { view: 'landlord', href: '#/landlord', label: 'Landlord', short: 'Landlord' },
  { view: 'verify', href: '#/verify', label: 'Verify a lease', short: 'Verify' },
  { view: 'how', href: '#/how', label: 'How it works', short: 'How it works' },
]

export default function App() {
  const route = useRoute()
  return (
    <ToastProvider view={route.view}>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/family" aria-label="Stroop home">
            <BrandMark />
            <span className="wordmark">Stroop</span>
          </a>
          <nav className="nav" aria-label="Views">
            {NAV.map((n) => (
              <a key={n.view} href={n.href} aria-current={route.view === n.view ? 'page' : undefined}>
                <span className="nav-long">{n.label}</span>
                <span className="nav-short" aria-hidden>
                  {n.short}
                </span>
              </a>
            ))}
          </nav>
          <a
            className="network"
            href={explorer.contract(CONTRACTS.rentReserve)}
            target="_blank"
            rel="noreferrer"
            title="Live on Stellar Testnet. Test money only."
          >
            <span className="live-dot" aria-hidden />
            Testnet
          </a>
        </div>
      </header>
      <main>
        {route.view === 'family' && <FamilyView />}
        {route.view === 'landlord' && <LandlordView />}
        {route.view === 'verify' && <VerifyView key={route.id ?? 'lookup'} id={route.id} />}
        {route.view === 'how' && <HowItWorks />}
      </main>
      <footer className="site-foot">
        <span>Testnet prototype · test money only · demo accounts live in this browser</span>
        <a href={explorer.contract(CONTRACTS.rentReserve)} target="_blank" rel="noreferrer" className="foot-link">
          Contract <span className="mono">{short(CONTRACTS.rentReserve)}</span> <ArrowUpRight size={13} aria-hidden />
        </a>
        <button
          className="foot-link"
          onClick={() => {
            resetDemo()
            window.location.reload()
          }}
        >
          Reset demo
        </button>
      </footer>
    </ToastProvider>
  )
}
