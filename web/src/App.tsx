import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { CONTRACTS, explorer, resetDemo, short } from './stellar'
import { type Route, useRoute } from './hooks'
import { BrandMark } from './components/BrandMark'
import { FamilyView } from './components/FamilyView'
import { LandlordView } from './components/LandlordView'
import { ToastProvider } from './components/ToastProvider'
import { VerifyView } from './components/VerifyView'
import './App.css'

const NAV: { view: Route['view']; href: string; label: string; short: string }[] = [
  { view: 'family', href: '#/family', label: 'Student & family', short: 'Family' },
  { view: 'landlord', href: '#/landlord', label: 'Landlord', short: 'Landlord' },
  { view: 'verify', href: '#/verify', label: 'Verify', short: 'Verify' },
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
          <RoleNav view={route.view} />
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

/** Role switcher; a pill glides to the current view. */
function RoleNav({ view }: { view: Route['view'] }) {
  const links = useRef<Partial<Record<Route['view'], HTMLAnchorElement | null>>>({})
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)
  const [glide, setGlide] = useState(false)

  useLayoutEffect(() => {
    const place = () => {
      const el = links.current[view]
      if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth })
    }
    place()
    document.fonts?.ready.then(place)
    window.addEventListener('resize', place)
    // Only glide after the first placement, so the pill doesn't fly in on load.
    const t = requestAnimationFrame(() => setGlide(true))
    return () => {
      window.removeEventListener('resize', place)
      cancelAnimationFrame(t)
    }
  }, [view])

  return (
    <nav className="rolenav" aria-label="Views">
      {pill && (
        <span
          className={`rolenav-pill${glide ? ' glide' : ''}`}
          style={{ transform: `translateX(${pill.x}px)`, width: pill.w }}
          aria-hidden
        />
      )}
      {NAV.map((n) => (
        <a
          key={n.view}
          ref={(el) => {
            links.current[n.view] = el
          }}
          href={n.href}
          aria-label={n.label}
          aria-current={view === n.view ? 'page' : undefined}
        >
          <span className="nav-long">{n.label}</span>
          <span className="nav-short" aria-hidden>
            {n.short}
          </span>
        </a>
      ))}
    </nav>
  )
}
