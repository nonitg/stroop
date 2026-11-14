import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Keypair } from '@stellar/stellar-sdk'
import { type Lease, type Role, explainError, getBalances, getKeypair, leasesFor, setupWallet, txFee } from './stellar'

// ---------- Routing (hash based so the static build works anywhere) ----------

export type Route = { view: 'family' } | { view: 'landlord' } | { view: 'verify'; id?: number } | { view: 'how' }

function parseRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (h.startsWith('lease/')) return { view: 'verify', id: Number(h.split('/')[1]) }
  if (h === 'verify') return { view: 'verify' }
  if (h === 'landlord') return { view: 'landlord' }
  if (h === 'how') return { view: 'how' }
  return { view: 'family' }
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

export const verifyLink = (id: number) => `${window.location.origin}${window.location.pathname}#/lease/${id}`

// ---------- Shared hooks ----------

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Applies a state change as a cross-fade between screens where the browser supports it. */
export function withTransition(update: () => void) {
  if (!document.startViewTransition || reducedMotion()) return update()
  document.startViewTransition(() => flushSync(update))
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
  const [balances, setBalances] = useState<{ xlm: number; usdc: number } | null>(null)
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

/** Total network fees (XLM) Stellar charged for these transactions; null until all are known. */
export function useNetworkFees(hashes: string[]) {
  const [xlm, setXlm] = useState<number | null>(null)
  const key = hashes.join(',')
  useEffect(() => {
    let live = true
    if (!key) return
    Promise.all(key.split(',').map(txFee))
      .then((fees) => live && setXlm(fees.reduce((a, b) => a + b, 0)))
      .catch(() => live && setXlm(null))
    return () => {
      live = false
    }
  }, [key])
  return key ? xlm : 0
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
