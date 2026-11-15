// Which buttons each side sees on a lease, mirroring the contract's rules.
import type { Keypair } from '@stellar/stellar-sdk'
import { BadgeCheck, HandCoins, KeyRound, LockKeyhole, type LucideIcon } from 'lucide-react'
import {
  type Lease,
  type Role,
  disputeWindowSecs,
  fmtUSD,
  periodsDue,
  proposalOpen,
  reserve,
  startsOnRelease,
} from '../stellar'
import { feeLine, fmtDuration, inDisputeWindow } from '../leaseText'

export type Tier = 'primary' | 'secondary' | 'quiet'

export interface Action {
  id: string
  label: string
  /** Toast title once the transaction lands; also the receipt label. */
  done: string
  doneBody?: string
  tier: Tier
  Icon?: LucideIcon
  run: () => Promise<{ hash?: string }>
}

function familyActions(lease: Lease, kp: Keypair, now: number): Action[] {
  const id = lease.id
  const handedOver = lease.handedOverAt > 0
  const reclaim = () => reserve.reclaim(kp, id)
  const actions: Action[] = []

  if (lease.status === 'Funded')
    actions.push({
      id: 'cancel',
      label: 'Cancel lease',
      done: 'Lease cancelled',
      doneBody: 'Everything is back in your balance.',
      tier: 'quiet',
      run: reclaim,
    })

  if (lease.status === 'Accepted') {
    const window = inDisputeWindow(lease, now)
    // Before a handover, move-in must beat the deadline; after one, only the dispute window matters.
    if (handedOver ? window : now <= lease.moveInBy)
      actions.push({
        id: 'move-in',
        label: 'Confirm move-in',
        done: 'Move-in confirmed',
        doneBody: `Month 1 paid. ${feeLine(lease).amount} Stroop fee taken.`,
        tier: 'primary',
        Icon: KeyRound,
        run: () => reserve.moveIn(kp, id),
      })
    if (!handedOver && now > lease.moveInBy)
      actions.push({
        id: 'reclaim',
        label: 'Take it all back',
        done: 'Rent and fee returned',
        doneBody: 'Everything is back in your balance.',
        tier: 'primary',
        run: reclaim,
      })
    if (handedOver)
      actions.push({
        id: 'dispute',
        label: 'Report a problem',
        done: 'Problem reported',
        doneBody: 'Payouts are paused for mediation.',
        tier: window ? 'secondary' : 'quiet',
        run: () => reserve.dispute(kp, id),
      })
  }

  if (lease.status === 'Active')
    actions.push({
      id: 'dispute',
      label: 'Report a problem',
      done: 'Problem reported',
      doneBody: 'Payouts are paused for mediation.',
      tier: 'quiet',
      run: () => reserve.dispute(kp, id),
    })
  return actions
}

function landlordActions(lease: Lease, kp: Keypair, now: number): Action[] {
  const id = lease.id
  const due = periodsDue(lease, now)
  const release = () => reserve.release(kp, id)
  const actions: Action[] = []

  if (lease.status === 'Funded')
    actions.push({
      id: 'accept',
      label: 'Accept lease',
      done: 'Lease accepted',
      doneBody: 'Your tenant can move in.',
      tier: 'primary',
      Icon: BadgeCheck,
      run: () => reserve.accept(kp, id),
    })
  if (lease.status === 'Accepted' && lease.handedOverAt === 0 && now <= lease.moveInBy)
    actions.push({
      id: 'hand-over',
      label: 'Keys handed over',
      done: 'Keys marked handed over',
      doneBody: `Rent starts in ${fmtDuration(disputeWindowSecs(lease))} unless your tenant objects.`,
      tier: 'primary',
      Icon: KeyRound,
      run: () => reserve.handOver(kp, id),
    })
  if (startsOnRelease(lease, now))
    actions.push({
      id: 'start',
      label: `Start lease · collect ${fmtUSD(lease.rent * BigInt(due))}`,
      done: 'Lease started',
      doneBody: `${fmtUSD(lease.rent * BigInt(due))} is in your balance.`,
      tier: 'primary',
      Icon: HandCoins,
      run: release,
    })
  if (lease.status === 'Active' && due > 0)
    actions.push({
      id: 'collect',
      label: `Collect ${fmtUSD(lease.rent * BigInt(due))}`,
      done: 'Rent collected',
      doneBody: `${fmtUSD(lease.rent * BigInt(due))} is in your balance.`,
      tier: 'primary',
      Icon: HandCoins,
      run: release,
    })
  // Demo of the core protection: with nothing due, the contract refuses to pay out.
  if (lease.status === 'Active' && due === 0)
    actions.push({ id: 'early', label: 'Collect next month early', done: 'Rent collected', tier: 'secondary', Icon: LockKeyhole, run: release })
  if (lease.landlordOwed > 0n)
    actions.push({
      id: 'claim',
      label: `Claim ${fmtUSD(lease.landlordOwed)}`,
      done: 'Rent claimed',
      doneBody: `${fmtUSD(lease.landlordOwed)} is in your balance.`,
      tier: 'secondary',
      Icon: HandCoins,
      run: () => reserve.claim(kp, id),
    })
  return actions
}

/** Ending early: one side proposes, the other agrees before the proposal lapses. */
function endEarlyActions(lease: Lease, kp: Keypair, now: number): Action[] {
  if (lease.status !== 'Active') return []
  const open = proposalOpen(lease, now)
  if (open && lease.endProposedBy === kp.publicKey())
    return [
      {
        id: 'cancel-end',
        label: 'Withdraw end request',
        done: 'Request withdrawn',
        doneBody: 'The lease continues.',
        tier: 'quiet',
        run: () => reserve.cancelEnd(kp, lease.id),
      },
    ]
  return [
    {
      id: 'end',
      label: open ? 'Agree to end early' : 'End lease early',
      done: open ? 'Lease ended early' : 'End request sent',
      doneBody: open ? 'Rent owed was paid. The rest went back to the family.' : 'Nothing changes unless they agree.',
      tier: open ? 'primary' : 'quiet',
      run: () => reserve.endEarly(kp, lease.id),
    },
  ]
}

export function leaseActions(lease: Lease, role: Role, kp: Keypair, now: number): Action[] {
  const actions = [
    ...(role === 'family' ? familyActions(lease, kp, now) : landlordActions(lease, kp, now)),
    ...endEarlyActions(lease, kp, now),
  ]
  // One primary action at a time; any later "primary" steps down a level.
  const first = actions.findIndex((a) => a.tier === 'primary')
  return actions.map((a, i) => (a.tier === 'primary' && i !== first ? { ...a, tier: 'secondary' } : a))
}
