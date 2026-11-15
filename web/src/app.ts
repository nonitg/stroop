import { createContext, useContext } from 'react'
import type { Lease, Role } from './stellar'
import type { Wallet } from './hooks'

/** Everything a signed-in screen needs: who you are, your wallet and your leases (polled from Stellar). */
export interface AppCtx {
  role: Role
  setRole: (r: Role | null) => void
  wallet: Wallet
  leases: Lease[] | null
  refresh: () => Promise<unknown>
}

export const AppContext = createContext<AppCtx | null>(null)

export function useApp(): AppCtx {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp outside a signed-in screen')
  return ctx
}
