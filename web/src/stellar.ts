// Stellar plumbing for the RentProof demo: in-browser testnet wallets, onboarding,
// balances and typed calls into the rent_reserve contract.
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  contract,
} from '@stellar/stellar-sdk'
import ids from './contracts.json'
import { fmtMoney } from './money'

export const NET = {
  passphrase: Networks.TESTNET,
  rpcUrl: 'https://soroban-testnet.stellar.org',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  friendbot: 'https://friendbot.stellar.org',
}
export const CONTRACTS = ids
export const USDC = new Asset('USDC', ids.usdcIssuer)
const UNIT = 10_000_000n // USDC has 7 decimals on Stellar

// Demo clock: one rent "month" passes every minute so the whole lease fits in a demo.
export const DEMO_PERIOD_SECS = 60
export const DEMO_MOVE_IN_WINDOW_SECS = 30 * 60

export type Role = 'family' | 'landlord'

export const STATUS = ['Funded', 'Accepted', 'Active', 'Completed', 'Ended', 'Refunded', 'Disputed'] as const
export type StatusName = (typeof STATUS)[number]

export interface Lease {
  id: number
  payer: string
  landlord: string
  /** Neutral party named on the lease; can only split a disputed lease between the two sides. */
  mediator: string
  rent: bigint
  periods: number
  periodSecs: number
  createdAt: number
  moveInBy: number
  /** When the landlord marked the keys handed over; 0 if not yet. */
  handedOverAt: number
  start: number
  paidPeriods: number
  held: bigint
  /** 1% service fee: held until move-in, refunded if move-in never happens. */
  fee: bigint
  /** Rent the landlord couldn't receive yet; claimable. */
  landlordOwed: bigint
  status: StatusName
  endProposedBy?: string
  endProposedAt: number
  /** Payer opted into lending rent due after the next `CASH_MONTHS`. */
  lend: boolean
  /** Part of `held` lent out right now. */
  lent: bigint
  /** Lending shortfall Stroop's cover fund has paid into this lease. */
  covered: bigint
}

/** Rent for the next this-many months always stays in the lease, never lent (contract rule). */
export const CASH_MONTHS = 3
/** Leases need this many months to opt into lending (contract rule). */
export const MIN_LEND_MONTHS = 9
/** Flat amount off the fee for leases that opt into lending. */
export const LEND_DISCOUNT = BigInt(ids.lendDiscount)

/** Service fee the contract adds on top of the reserve (charged only at move-in). */
export const feeFor = (reserveUnits: bigint, lend = false) => {
  const fee = (reserveUnits * BigInt(ids.feeBps)) / 10_000n
  if (!lend) return fee
  return fee > LEND_DISCOUNT ? fee - LEND_DISCOUNT : 0n
}

/** The fee agreed on this lease. The contract zeroes it only on a full refund, and lending can be switched off later. */
export const leaseFee = (l: Lease) => (l.fee > 0n ? l.fee : feeFor(l.rent * BigInt(l.periods), l.lend))

const horizon = new Horizon.Server(NET.horizonUrl)

export const explorer = {
  account: (a: string) => `https://stellar.expert/explorer/testnet/account/${a}`,
  contract: (c: string) => `https://stellar.expert/explorer/testnet/contract/${c}`,
  tx: (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`,
}

export const toUnits = (dollars: number) => BigInt(Math.round(dollars * 100)) * (UNIT / 100n)
export const fromUnits = (units: bigint) => Number(units) / Number(UNIT)
export const fmtUSD = (units: bigint) => fmtMoney(fromUnits(units), 'USD', { cents: units % (UNIT / 1n) !== 0n })
export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`

// ---------- Demo wallets (testnet only; production would use passkey smart wallets) ----------

const keyName = (role: Role) => `rp:key:${role}`

export function getKeypair(role: Role): Keypair | null {
  try {
    const secret = localStorage.getItem(keyName(role))
    return secret ? Keypair.fromSecret(secret) : null
  } catch {
    return null
  }
}

export function resetDemo() {
  for (const role of ['family', 'landlord'] as Role[]) localStorage.removeItem(keyName(role))
  localStorage.removeItem('rp:txs')
}

/** Creates and funds a testnet wallet: XLM for fees, a USDC trustline, and demo USDC. */
export async function setupWallet(role: Role, onStep: (step: string) => void): Promise<Keypair> {
  const kp = getKeypair(role) ?? Keypair.random()
  localStorage.setItem(keyName(role), kp.secret())

  onStep('Creating account on Stellar Testnet')
  if (!(await accountExists(kp.publicKey()))) {
    const res = await fetch(`${NET.friendbot}?addr=${kp.publicKey()}`)
    if (!res.ok && !(await accountExists(kp.publicKey()))) throw new Error('Friendbot could not fund the account')
  }

  onStep('Adding USDC to the wallet')
  const account = await horizon.loadAccount(kp.publicKey())
  const hasTrust = account.balances.some(
    (b) => 'asset_code' in b && b.asset_code === 'USDC' && b.asset_issuer === ids.usdcIssuer,
  )
  if (!hasTrust) {
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NET.passphrase })
      .addOperation(Operation.changeTrust({ asset: USDC }))
      .setTimeout(60)
      .build()
    tx.sign(kp)
    await horizon.submitTransaction(tx)
  }

  if (role === 'family') {
    onStep('Receiving 20,000 test USDC from the faucet')
    await dripTestUsdc(kp)
  }
  onStep('Ready')
  return kp
}

export const TEST_DRIP_USDC = 20_000

/** Testnet stand-in for an on-ramp: mints 20,000 test USDC to the account. */
export async function dripTestUsdc(kp: Keypair) {
  const faucet = await contract.Client.from({
    contractId: ids.faucet,
    networkPassphrase: NET.passphrase,
    rpcUrl: NET.rpcUrl,
    publicKey: kp.publicKey(),
    ...contract.basicNodeSigner(kp, NET.passphrase),
  })
  const tx = await (faucet as any).drip({ to: kp.publicKey() })
  await tx.signAndSend()
}

async function accountExists(pub: string) {
  try {
    await horizon.loadAccount(pub)
    return true
  } catch {
    return false
  }
}

export async function getBalances(pub: string): Promise<{ xlm: number; usdc: number } | null> {
  try {
    const acc = await horizon.loadAccount(pub)
    let xlm = 0
    let usdc = 0
    for (const b of acc.balances) {
      if (b.asset_type === 'native') xlm = Number(b.balance)
      else if ('asset_code' in b && b.asset_code === 'USDC' && b.asset_issuer === ids.usdcIssuer) usdc = Number(b.balance)
    }
    return { xlm, usdc }
  } catch {
    return null
  }
}

// ---------- Contract calls ----------

const clients = new Map<string, Promise<any>>()

function reserveClient(kp?: Keypair | null): Promise<any> {
  const key = kp?.publicKey() ?? 'readonly'
  if (!clients.has(key)) {
    clients.set(
      key,
      contract.Client.from({
        contractId: ids.rentReserve,
        networkPassphrase: NET.passphrase,
        rpcUrl: NET.rpcUrl,
        ...(kp ? { publicKey: kp.publicKey(), ...contract.basicNodeSigner(kp, NET.passphrase) } : {}),
      }),
    )
  }
  return clients.get(key)!
}

const ERRORS: Record<number, string> = {
  1: 'The contract is misconfigured.',
  2: 'Those lease terms are not valid.',
  3: 'Lease not found.',
  4: 'That action is not allowed at this stage of the lease.',
  5: 'Only the tenant or landlord on this lease can do that.',
  6: 'No rent is due yet. The contract never pays ahead of schedule.',
  7: 'The move-in window is still open, so the reserve stays locked.',
  8: 'The move-in deadline has passed.',
  9: 'Invalid amount.',
  10: 'The landlord has marked the keys as handed over, so the reserve can no longer be reclaimed. Raise a dispute instead.',
  11: 'Only the side that proposed ending early can withdraw the proposal.',
  12: 'Stroop’s cover fund can’t go lower while rent is lent out.',
}

export function explainError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  const m = msg.match(/Error\(Contract, #(\d+)\)/)
  if (m) return ERRORS[Number(m[1])] ?? `Contract rejected the transaction (code ${m[1]}).`
  if (/balance|underfunded|insufficient/i.test(msg)) return 'Not enough USDC in this wallet.'
  return msg.length > 160 ? msg.slice(0, 160) + '…' : msg
}

export interface TxResult<T> {
  result: T
  hash?: string
}

async function send<T>(kp: Keypair, method: string, args: Record<string, unknown>): Promise<TxResult<T>> {
  const client = await reserveClient(kp)
  const tx = await client[method](args)
  const sent = await tx.signAndSend()
  const hash: string | undefined = sent.sendTransactionResponse?.hash ?? sent.getTransactionResponse?.txHash
  return { result: sent.result as T, hash }
}

export const reserve = {
  create: (kp: Keypair, landlord: string, mediator: string, rentDollars: number, months: number, lend: boolean) =>
    send<bigint>(kp, 'create', {
      payer: kp.publicKey(),
      landlord,
      mediator,
      rent: toUnits(rentDollars),
      periods: months,
      period_secs: BigInt(DEMO_PERIOD_SECS),
      move_in_window_secs: BigInt(DEMO_MOVE_IN_WINDOW_SECS),
      lend,
    }),
  accept: (kp: Keypair, id: number) => send<void>(kp, 'accept', { id: BigInt(id) }),
  moveIn: (kp: Keypair, id: number) => send<void>(kp, 'move_in', { id: BigInt(id) }),
  release: (kp: Keypair, id: number) => send<bigint>(kp, 'release', { id: BigInt(id) }),
  reclaim: (kp: Keypair, id: number) => send<bigint>(kp, 'reclaim', { id: BigInt(id) }),
  endEarly: (kp: Keypair, id: number) => send<bigint>(kp, 'end_early', { id: BigInt(id), caller: kp.publicKey() }),
  cancelEnd: (kp: Keypair, id: number) => send<void>(kp, 'cancel_end', { id: BigInt(id), caller: kp.publicKey() }),
  handOver: (kp: Keypair, id: number) => send<void>(kp, 'hand_over', { id: BigInt(id) }),
  dispute: (kp: Keypair, id: number) => send<void>(kp, 'dispute', { id: BigInt(id), caller: kp.publicKey() }),
  claim: (kp: Keypair, id: number) => send<bigint>(kp, 'claim', { id: BigInt(id) }),
  setLending: (kp: Keypair, id: number, on: boolean) => send<void>(kp, 'set_lending', { id: BigInt(id), on }),
}

/** Stroop's cover fund and the rent it backs, straight from the contract. */
export async function coverStatus(): Promise<{ cover: bigint; lent: bigint }> {
  const client = await reserveClient(null)
  const [cover, lent] = (await client.cover_status()).result as [bigint, bigint]
  return { cover: BigInt(cover), lent: BigInt(lent) }
}

/** Testnet demo: the stand-in lending pool loses `bps` of what it holds. */
export async function simulatePoolLoss(kp: Keypair, bps: number) {
  const client: any = await contract.Client.from({
    contractId: ids.vault,
    networkPassphrase: NET.passphrase,
    rpcUrl: NET.rpcUrl,
    publicKey: kp.publicKey(),
    ...contract.basicNodeSigner(kp, NET.passphrase),
  })
  const sent = await (await client.simulate_loss({ bps: BigInt(bps) })).signAndSend()
  return { hash: sent.sendTransactionResponse?.hash as string | undefined }
}

export async function getLease(id: number): Promise<Lease> {
  const client = await reserveClient(null)
  const raw = (await client.get_lease({ id: BigInt(id) })).result
  // A missing lease comes back as a contract error from simulation, not a value.
  if (!raw || typeof raw !== 'object' || !('payer' in raw)) throw new Error(`Lease #${id} was not found on Stellar.`)
  return {
    id,
    payer: raw.payer,
    landlord: raw.landlord,
    mediator: raw.mediator,
    rent: BigInt(raw.rent),
    periods: Number(raw.periods),
    periodSecs: Number(raw.period_secs),
    createdAt: Number(raw.created_at),
    moveInBy: Number(raw.move_in_by),
    handedOverAt: Number(raw.handed_over_at),
    start: Number(raw.start),
    paidPeriods: Number(raw.paid_periods),
    held: BigInt(raw.held),
    fee: BigInt(raw.fee),
    landlordOwed: BigInt(raw.landlord_owed),
    status: STATUS[Number(raw.status)] ?? 'Funded',
    endProposedBy: raw.end_proposed_by ?? undefined,
    endProposedAt: Number(raw.end_proposed_at),
    lend: Boolean(raw.lend),
    lent: BigInt(raw.lent ?? 0),
    covered: BigInt(raw.covered ?? 0),
  }
}

/** The most recent `limit` leases, newest first. */
export async function recentLeases(limit = 40): Promise<Lease[]> {
  const client = await reserveClient(null)
  const count = Number((await client.lease_count()).result)
  const ids = Array.from({ length: Math.min(count, limit) }, (_, i) => count - 1 - i)
  const leases = await Promise.all(ids.map((id) => getLease(id).catch(() => null)))
  return leases.filter((l): l is Lease => !!l)
}

/** Leases where `pub` is the payer or landlord, newest first. */
export async function leasesFor(pub: string): Promise<Lease[]> {
  return (await recentLeases()).filter((l) => l.payer === pub || l.landlord === pub)
}

// Mirrors the contract: time the student has to dispute after the keys are handed
// over, and how long an early-end proposal stays open.
export const disputeWindowSecs = (l: Lease) => Math.min(l.periodSecs, 3 * 24 * 3600)
export const proposalWindowSecs = (l: Lease) => Math.min(l.periodSecs, 7 * 24 * 3600)

/** Keys handed over and the dispute window passed quietly: the lease starts on the next release. */
export const startsOnRelease = (l: Lease, nowSecs = Date.now() / 1000) =>
  l.status === 'Accepted' && l.handedOverAt > 0 && nowSecs >= l.handedOverAt + disputeWindowSecs(l)

/** Rent periods the landlord could collect right now (mirrors the contract's rule). */
export function periodsDue(l: Lease, nowSecs = Date.now() / 1000): number {
  const start = l.status === 'Active' ? l.start : startsOnRelease(l, nowSecs) ? l.handedOverAt : null
  if (start === null) return 0
  const due = Math.min(l.periods, 1 + Math.floor((nowSecs - start) / l.periodSecs))
  return Math.max(0, due - l.paidPeriods)
}

/** Whether the other side's early-end proposal is still open for agreement. */
export const proposalOpen = (l: Lease, nowSecs = Date.now() / 1000) =>
  !!l.endProposedBy && nowSecs <= l.endProposedAt + proposalWindowSecs(l)

/** Seconds until the next period unlocks, or null when nothing more will unlock. */
export function secsToNextRelease(l: Lease, nowSecs = Date.now() / 1000): number | null {
  if (l.status !== 'Active') return null
  const elapsedPeriods = Math.floor((nowSecs - l.start) / l.periodSecs)
  if (1 + elapsedPeriods >= l.periods) return null
  return Math.max(0, Math.ceil(l.start + (elapsedPeriods + 1) * l.periodSecs - nowSecs))
}

// Local log of tx hashes per lease so the UI can link every action to the explorer.
export interface TxLog {
  leaseId: number
  label: string
  hash: string
  at: number
}

export function logTx(entry: TxLog) {
  try {
    const all: TxLog[] = JSON.parse(localStorage.getItem('rp:txs') ?? '[]')
    all.push(entry)
    localStorage.setItem('rp:txs', JSON.stringify(all.slice(-200)))
  } catch {
    /* storage unavailable; links are a convenience */
  }
}

export function txsFor(leaseId: number): TxLog[] {
  try {
    const all: TxLog[] = JSON.parse(localStorage.getItem('rp:txs') ?? '[]')
    return all.filter((t) => t.leaseId === leaseId)
  } catch {
    return []
  }
}

/** Every logged transaction in this browser, newest first. */
export function allTxs(): TxLog[] {
  try {
    const all: TxLog[] = JSON.parse(localStorage.getItem('rp:txs') ?? '[]')
    return all.reverse()
  } catch {
    return []
  }
}
