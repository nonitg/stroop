// Tells each side what the other side just did, by diffing leases between polls.
import { useEffect, useRef } from 'react'
import { type Lease, type Role, fmtUSD } from './stellar'
import type { ToastInput } from './components/useToast'

const hushed = new Map<number, number>()

/** This browser just acted on the lease; its own toast says so, so skip the news for a moment. */
export const hushNews = (id: number) => hushed.set(id, Date.now() + 20_000)

type Snap = Pick<Lease, 'status' | 'paidPeriods' | 'handedOverAt' | 'endProposedBy'>

/** What changed on one lease, as a toast for this side, or null if nothing worth saying. */
export function leaseNews(before: Snap | undefined, l: Lease, role: Role, me: string): ToastInput | null {
  const family = role === 'family'
  const href = `#/lease/${l.id}`
  if (!before)
    return family
      ? null
      : { title: 'New lease from a tenant', body: `${fmtUSD(l.held)} is locked for you. Review and accept.`, href }
  if (before.status !== l.status) {
    if (l.status === 'Accepted')
      return family ? { title: 'Your landlord accepted', body: 'Move in when you have the keys.', href } : null
    if (l.status === 'Active')
      return family ? null : { title: 'Your tenant moved in', body: `${fmtUSD(l.rent)} for month 1 is in your balance.`, href }
    if (l.status === 'Disputed') return { title: 'A problem was reported', body: 'Payouts are paused for mediation.', href }
    if (l.status === 'Refunded')
      return {
        title: family ? 'Your rent came back' : 'The tenant took the rent back',
        body: family ? 'It’s in your balance.' : 'The keys were never handed over.',
        href,
      }
    if (l.status === 'Ended')
      return {
        title: 'Lease ended early',
        body: family ? 'Unused rent is back in your balance.' : 'Rent owed was paid to you.',
        href,
      }
    if (l.status === 'Completed') return { title: 'Lease fully paid', body: `All ${l.periods} months are done.`, href }
  }
  if (!before.handedOverAt && l.handedOverAt && family)
    return { title: 'Keys handed over?', body: 'Confirm move-in, or report a problem.', href }
  if (!before.endProposedBy && l.endProposedBy && l.endProposedBy !== me)
    return {
      title: `${family ? 'Your landlord' : 'Your tenant'} wants to end early`,
      body: 'Nothing changes unless you agree.',
      href,
    }
  if (l.paidPeriods > before.paidPeriods) {
    const amount = fmtUSD(l.rent * BigInt(l.paidPeriods - before.paidPeriods))
    return family
      ? { title: `Month ${l.paidPeriods} paid`, body: `${amount} went to your landlord.`, href }
      : { title: 'Rent arrived', body: `${amount} for month ${l.paidPeriods}. Ready to cash out.`, href }
  }
  return null
}

/** Watches the polled leases and toasts changes made by the other side. */
export function useLeaseNews(leases: Lease[] | null, role: Role, me: string, toast: (t: ToastInput) => void) {
  const prev = useRef<Map<number, Snap> | null>(null)
  useEffect(() => {
    if (!leases) return
    const next = new Map(
      leases.map((l) => [
        l.id,
        { status: l.status, paidPeriods: l.paidPeriods, handedOverAt: l.handedOverAt, endProposedBy: l.endProposedBy },
      ]),
    )
    if (prev.current) {
      for (const l of leases) {
        if ((hushed.get(l.id) ?? 0) > Date.now()) continue
        const news = leaseNews(prev.current.get(l.id), l, role, me)
        if (news) toast(news)
      }
    }
    prev.current = next
  }, [leases, role, me, toast])
}
