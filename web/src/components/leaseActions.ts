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
      label: 'Cancel and get refund',
      done: 'Lease cancelled',
      doneBody: 'The full amount, fee included, is back in your account.',
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
        doneBody: `Month 1 is paid to your landlord and the ${feeLine(lease).amount} service fee was charged.`,
        tier: 'primary',
        Icon: KeyRound,
        run: () => reserve.moveIn(kp, id),
      })
    if (!handedOver && now > lease.moveInBy)
      actions.push({
        id: 'reclaim',
        label: 'Take everything back',
        done: 'Rent and fee returned',
        doneBody: 'The keys were never handed over, so the full amount is back in your account.',
        tier: 'primary',
        run: reclaim,
      })
    if (handedOver)
      actions.push({
        id: 'dispute',
        label: window ? "Something's wrong? Raise a dispute" : 'Raise a dispute',
        done: 'Dispute raised',
        doneBody: 'Payouts are paused until the mediator settles it.',
        tier: window ? 'secondary' : 'quiet',
        run: () => reserve.dispute(kp, id),
      })
  }

  if (lease.status === 'Active')
    actions.push({
      id: 'dispute',
      label: 'Raise a dispute',
      done: 'Dispute raised',
      doneBody: 'Payouts are paused until the mediator settles it.',
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
      doneBody: 'The student can now confirm move-in.',
      tier: 'primary',
      Icon: BadgeCheck,
      run: () => reserve.accept(kp, id),
    })
  if (lease.status === 'Accepted' && lease.handedOverAt === 0 && now <= lease.moveInBy)
    actions.push({
      id: 'hand-over',
      label: 'Mark keys handed over',
      done: 'Keys marked as handed over',
      doneBody: `The student has ${fmtDuration(disputeWindowSecs(lease))} to confirm move-in or raise a dispute.`,
      tier: 'primary',
      Icon: KeyRound,
      run: () => reserve.handOver(kp, id),
    })
  if (startsOnRelease(lease, now))
    actions.push({
      id: 'start',
      label: 'Start lease & collect rent',
      done: 'Lease started',
      doneBody: `${fmtUSD(lease.rent * BigInt(due))} of rent from the handover date is now in your account.`,
      tier: 'primary',
      Icon: HandCoins,
      run: release,
    })
  if (lease.status === 'Active' && due > 0)
    actions.push({
      id: 'collect',
      label: `Collect ${due} month${due > 1 ? 's' : ''} of rent`,
      done: 'Rent collected',
      doneBody: `${fmtUSD(lease.rent * BigInt(due))} is now in your account.`,
      tier: 'primary',
      Icon: HandCoins,
      run: release,
    })
  // Demo of the core protection: with nothing due, the contract refuses to pay out.
  if (lease.status === 'Active' && due === 0)
    actions.push({ id: 'early', label: 'Try collecting next month early', done: 'Rent collected', tier: 'secondary', Icon: LockKeyhole, run: release })
  if (lease.landlordOwed > 0n)
    actions.push({
      id: 'claim',
      label: `Claim ${fmtUSD(lease.landlordOwed)}`,
      done: 'Rent claimed',
      doneBody: `${fmtUSD(lease.landlordOwed)} is now in your account.`,
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
        label: 'Withdraw proposal',
        done: 'Proposal withdrawn',
        doneBody: 'The lease continues as normal.',
        tier: 'quiet',
        run: () => reserve.cancelEnd(kp, lease.id),
      },
    ]
  return [
    {
      id: 'end',
      label: open ? 'Agree to end lease early' : 'Propose ending lease early',
      done: open ? 'Lease ended early' : 'Early end proposed',
      doneBody: open
        ? 'Rent owed went to the landlord; the rest went back to the family.'
        : 'Nothing changes unless the other side agrees.',
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
