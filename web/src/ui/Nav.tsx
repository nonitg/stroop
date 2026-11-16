import { CircleHelp, House, ReceiptText, UserRound } from 'lucide-react'
import type { Route } from '../hooks'
import type { Role } from '../stellar'
import { Brand } from './BrandMark'
import { RolePill } from './RolePill'

const TABS = [
  { view: 'home', href: '#/', label: 'Home', Icon: House },
  { view: 'activity', href: '#/activity', label: 'Activity', Icon: ReceiptText },
  { view: 'help', href: '#/help', label: 'Help', Icon: CircleHelp },
  { view: 'account', href: '#/account', label: 'Account', Icon: UserRound },
] as const

/** Floating glass tab bar on phones; a rail on desktop. */
export function Nav({ route, role, mobile }: { route: Route; role: Role; mobile: boolean }) {
  const current = (v: string) => (route.view === v ? 'page' : undefined)
  return (
    <>
      <nav className="rail glass" aria-label="Main">
        <a href="#/" style={{ textDecoration: 'none' }}>
          <Brand />
        </a>
        <div style={{ padding: '0 8px 14px' }}>
          <RolePill role={role} />
        </div>
        {TABS.map((t) => (
          <a key={t.view} className="nav" href={t.href} aria-current={current(t.view)}>
            <t.Icon size={19} aria-hidden /> {t.label}
          </a>
        ))}
        <p className="rail-foot">Stellar testnet · test money</p>
      </nav>
      {mobile && (
        <nav className="tabbar glass" aria-label="Main">
          {TABS.map((t) => (
            <a key={t.view} href={t.href} aria-current={current(t.view)}>
              <t.Icon size={20} aria-hidden />
              {t.label}
            </a>
          ))}
        </nav>
      )}
    </>
  )
}
