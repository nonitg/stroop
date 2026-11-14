// Who settles a dispute on a lease. The family picks; the landlord sees it before accepting.
import { StrKey } from '@stellar/stellar-sdk'
import { CONTRACTS, short } from './stellar'

export const STROOP_DESK = {
  name: 'Stroop Resolution Desk',
  address: CONTRACTS.mediator,
}

export const mediatorName = (address: string) =>
  address === STROOP_DESK.address ? STROOP_DESK.name : `Chosen mediator ${short(address)}`

/** Why a pasted mediator account can't be used, or null if it can. Mirrors the contract's rule. */
export function mediatorProblem(address: string, payer: string, landlord: string): string | null {
  const a = address.trim()
  if (!a) return 'Paste the mediator’s account ID.'
  if (!StrKey.isValidEd25519PublicKey(a)) return 'That isn’t a complete account ID. Ask the mediator to copy it again; it’s 56 characters long.'
  if (a === payer) return 'The mediator can’t be you.'
  if (a === landlord.trim()) return 'The mediator can’t be your landlord.'
  return null
}
