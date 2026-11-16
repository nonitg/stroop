import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Keypair } from '@stellar/stellar-sdk'
import { type Lease, type Role, explainError, getBalances, getKeypair, getLease, leasesFor, setupWallet } from './stellar'

// ---------- Routing (hash based so the static build works anywhere) ----------

export type Route =
  | { view: 'home'; role?: Role }
  | { view: 'activity' }
  | { view: 'account' }
  | { view: 'help' }
  | { view: 'new'; to?: string }
  | { view: 'lease'; id: number }
  | { view: 'proof'; id: number }

export function parseRoute(hash = window.location.hash): Route {
  const [a, b] = hash.replace(/^#\/?/, '').split('/')
  const id = Number(b)
  if (a === 'lease' && b && Number.isInteger(id)) return { view: 'lease', id }
  if (a === 'proof' && b && Number.isInteger(id)) return { view: 'proof', id }
  if (a === 'new') return { view: 'new', to: b || undefined }
  if (a === 'activity' || a === 'account' || a === 'help') return { view: a }
  // Old links (#/family, #/landlord) open that side of the app.
  if (a === 'family' || a === 'landlord') return { view: 'home', role: a }
  return { view: 'home' }
}

export const go = (path: string) => {
  window.location.hash = path
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(parseRoute)
  useEffect(() => {
    const on = () =>
      withTransition(() => {
        setRoute(parseRoute())
        window.scrollTo(0, 0)
      })
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

const base = () => `${window.location.origin}${window.location.pathname}`
export const verifyLink = (id: number) => `${base()}#/lease/${id}`
/** A landlord's invite: opens the new-lease flow with their account filled in. */
export const inviteLink = (landlord: string) => `${base()}#/new/${landlord}`

const ROLE_KEY = 'rp:role'

/** Which side of the app this browser shows. Both can exist in one browser for demos. */
export function useRole() {
  const [role, setState] = useState<Role | null>(() => {
    try {
      const saved = localStorage.getItem(ROLE_KEY)
      if (saved === 'family' || saved === 'landlord') return saved
    } catch {
      /* no storage: fall through */
    }
    return getKeypair('family') ? 'family' : getKeypair('landlord') ? 'landlord' : null
  })
  const setRole = useCallback((r: Role | null) => {
    try {
      if (r) localStorage.setItem(ROLE_KEY, r)
      else localStorage.removeItem(ROLE_KEY)
    } catch {
      /* preference only */
    }
    withTransition(() => setState(r))
  }, [])
  return [role, setRole] as const
}

/** One lease, read live from Stellar and refreshed every few seconds. */
export function useLease(id: number) {
  const [lease, setLease] = useState<Lease | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(
    () =>
      getLease(id)
        .then((l) => {
          setLease(l)
          setError(null)
        })
        .catch((e) => setError(explainError(e))),
    [id],
  )
  useEffect(() => {
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])
  return { lease, error, reload: load }
}

// ---------- Shared hooks ----------

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Applies a state change as a cross-fade between screens where the browser supports it. */
export function withTransition(update: () => void) {
  if (!document.startViewTransition || reducedMotion()) return update()
  const t = document.startViewTransition(() => flushSync(update))
  // A newer navigation can skip this one; that's expected, not an error.
  t.ready.catch(() => {})
  t.finished.catch(() => {})
}

/** Eases a displayed number toward `target`, so balances visibly move when money moves. */
export function useTween(target: number, ms = 900) {
  const [value, setValue] = useState(target)
  const shown = useRef(target)
  useEffect(() => {
    const from = shown.current
    if (from === target || reducedMotion()) {
      shown.current = target
      setValue(target)
      return
    }
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      const v = from + (target - from) * (1 - Math.pow(1 - p, 4))
      shown.current = v
      setValue(v)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return value
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now() / 1000)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function useWallet(role: Role) {
  const [kp, setKp] = useState<Keypair | null>(() => getKeypair(role))
  const [balances, setBalances] = useState<{ xlm: number; cad: number } | null>(null)
  // False until the first balance lookup finishes, so a returning user sees a loading state, not onboarding.
  const [checked, setChecked] = useState(!kp)
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!kp) return
    setBalances(await getBalances(kp.publicKey()))
    setChecked(true)
  }, [kp])

  useEffect(() => {
    refresh()
    // Money can arrive without this person acting (move-in, monthly payouts), so keep the balance live.
    const t = setInterval(refresh, 8000)
    return () => clearInterval(t)
  }, [refresh])

  const setup = async () => {
    setError(null)
    try {
      const k = await setupWallet(role, setStep)
      const b = await getBalances(k.publicKey())
      // The welcome screen fades into the dashboard.
      withTransition(() => {
        setKp(k)
        setBalances(b)
        setChecked(true)
        setStep(null)
      })
    } catch (e) {
      setError(explainError(e))
    } finally {
      setStep(null)
    }
  }
  return { kp, balances, checked, step, error, setup, refresh }
}

export type Wallet = ReturnType<typeof useWallet>

export function useLeases(pub: string | undefined) {
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

/** The currency a family pays from, remembered in this browser. */
export function useHomeCurrency() {
  const [code, setCode] = useState(() => {
    try {
      return localStorage.getItem('rp:currency') ?? 'INR'
    } catch {
      return 'INR'
    }
  })
  const set = (c: string) => {
    setCode(c)
    try {
      localStorage.setItem('rp:currency', c)
    } catch {
      /* preference only */
    }
  }
  return [code, set] as const
}
