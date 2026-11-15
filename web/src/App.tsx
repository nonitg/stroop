import { useEffect } from 'react'
import { LoaderCircle } from 'lucide-react'
import { AppContext } from './app'
import { type Route, useLeases, useRole, useRoute, useWallet } from './hooks'
import type { Role } from './stellar'
import { ToastProvider } from './components/ToastProvider'
import { useToast } from './components/useToast'
import { useLeaseNews } from './news'
import { Nav } from './ui/Nav'
import { AccountScreen } from './screens/AccountScreen'
import { Activity } from './screens/Activity'
import { Help } from './screens/Help'
import { FamilyHome, LandlordHome } from './screens/Home'
import { LeaseScreen } from './screens/LeaseScreen'
import { NewLease } from './screens/NewLease'
import { Proof } from './screens/Proof'
import { Welcome } from './screens/Welcome'

export default function App() {
  const route = useRoute()
  const [role, setRole] = useRole()
  // Old links and invite links decide which side of the app opens.
  useEffect(() => {
    if (route.view === 'home' && route.role) setRole(route.role)
    if (route.view === 'new' && role !== 'family') setRole('family')
  }, [route, role, setRole])

  return (
    <ToastProvider view={route.view}>
      <div className="aurora" aria-hidden data-role={route.view === 'proof' ? undefined : (role ?? undefined)}>
        <i />
        <i />
        <i />
      </div>
      {route.view === 'proof' ? (
        <div className="app">
          <Proof id={route.id} />
        </div>
      ) : role ? (
        <SignedIn key={role} role={role} setRole={setRole} route={route} />
      ) : (
        <div className="app">
          <Welcome role={null} onPick={setRole} />
        </div>
      )}
    </ToastProvider>
  )
}

function SignedIn({ role, setRole, route }: { role: Role; setRole: (r: Role | null) => void; route: Route }) {
  const wallet = useWallet(role)
  const { leases, reload } = useLeases(wallet.kp?.publicKey())
  const toast = useToast()
  useLeaseNews(leases, role, wallet.kp?.publicKey() ?? '', toast)
  const refresh = () => Promise.all([reload(), wallet.refresh()])
  if (!wallet.checked)
    return (
      <div className="splash">
        <LoaderCircle className="spin" size={26} aria-label="Loading your account" />
      </div>
    )
  if (!wallet.kp || !wallet.balances)
    return (
      <div className="app">
        <Welcome role={role} wallet={wallet} onPick={setRole} />
      </div>
    )
  // Full-screen tasks hide the tab bar on phones.
  const tabs = ['home', 'activity', 'help', 'account'].includes(route.view)
  return (
    <AppContext.Provider value={{ role, setRole, wallet, leases, refresh }}>
      <div className="app" data-role={role}>
        <Nav route={route} role={role} mobile={tabs} />
        {route.view === 'home' && (role === 'family' ? <FamilyHome /> : <LandlordHome />)}
        {route.view === 'activity' && <Activity />}
        {route.view === 'account' && <AccountScreen />}
        {route.view === 'help' && <Help />}
        {route.view === 'new' && <NewLease to={route.to} />}
        {route.view === 'lease' && <LeaseScreen key={route.id} id={route.id} />}
      </div>
    </AppContext.Provider>
  )
}
