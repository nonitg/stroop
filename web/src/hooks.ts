import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Keypair } from '@stellar/stellar-sdk'
import { type Lease, type Role, explainError, getBalances, getKeypair, leasesFor, setupWallet } from './stellar'

// ---------- Routing (hash based so the static build works anywhere) ----------

export type Route = { view: 'family' } | { view: 'landlord' } | { view: 'verify'; id?: number }

function parseRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (h.startsWith('lease/')) return { view: 'verify', id: Number(h.split('/')[1]) }
  if (h === 'verify') return { view: 'verify' }
  if (h === 'landlord') return { view: 'landlord' }
  return { view: 'family' }
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(parseRoute)
  useEffect(() => {
    const on = () => {
      const swap = () => {
        flushSync(() => setRoute(parseRoute()))
        window.scrollTo(0, 0)
      }
      // Cross-fade between screens where the browser supports it.
      if (document.startViewTransition && !reducedMotion()) document.startViewTransition(swap)
      else swap()
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export const verifyLink = (id: number) => `${window.location.origin}${window.location.pathname}#/lease/${id}`

// ---------- Shared hooks ----------

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

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
      setKp(k)
      setBalances(await getBalances(k.publicKey()))
      setChecked(true)
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
