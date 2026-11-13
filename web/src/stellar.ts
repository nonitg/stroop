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

export const STATUS = ['Funded', 'Accepted', 'Active', 'Completed', 'Ended', 'Refunded'] as const
export type StatusName = (typeof STATUS)[number]

export interface Lease {
  id: number
  payer: string
  landlord: string
  token: string
  rent: bigint
  periods: number
  periodSecs: number
  createdAt: number
  moveInBy: number
  start: number
  paidPeriods: number
  held: bigint
  status: StatusName
  endProposedBy?: string
}

const horizon = new Horizon.Server(NET.horizonUrl)

export const explorer = {
  account: (a: string) => `https://stellar.expert/explorer/testnet/account/${a}`,
  contract: (c: string) => `https://stellar.expert/explorer/testnet/contract/${c}`,
  tx: (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`,
}

export const toUnits = (dollars: number) => BigInt(Math.round(dollars * 100)) * (UNIT / 100n)
export const fromUnits = (units: bigint) => Number(units) / Number(UNIT)
export const fmtUSD = (units: bigint) =>
  fromUnits(units).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
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
  onStep('Ready')
  return kp
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
  2: 'Those lease terms are not valid.',
  3: 'Lease not found.',
  4: 'That action is not allowed at this stage of the lease.',
  5: 'Only the tenant or landlord on this lease can do that.',
  6: 'No rent is due yet. The contract never pays ahead of schedule.',
  7: 'The move-in window is still open, so the reserve stays locked.',
  8: 'The move-in deadline has passed.',
  9: 'Invalid amount.',
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
  create: (kp: Keypair, landlord: string, rentDollars: number, months: number) =>
    send<bigint>(kp, 'create', {
      payer: kp.publicKey(),
      landlord,
      token: ids.usdcSac,
      rent: toUnits(rentDollars),
      periods: months,
      period_secs: BigInt(DEMO_PERIOD_SECS),
      move_in_window_secs: BigInt(DEMO_MOVE_IN_WINDOW_SECS),
    }),
  accept: (kp: Keypair, id: number) => send<void>(kp, 'accept', { id: BigInt(id) }),
  moveIn: (kp: Keypair, id: number) => send<void>(kp, 'move_in', { id: BigInt(id) }),
  release: (kp: Keypair, id: number) => send<bigint>(kp, 'release', { id: BigInt(id) }),
  reclaim: (kp: Keypair, id: number) => send<bigint>(kp, 'reclaim', { id: BigInt(id) }),
  endEarly: (kp: Keypair, id: number) => send<bigint>(kp, 'end_early', { id: BigInt(id), caller: kp.publicKey() }),
}

export async function getLease(id: number): Promise<Lease> {
  const client = await reserveClient(null)
  const raw = (await client.get_lease({ id: BigInt(id) })).result
  return {
    id,
    payer: raw.payer,
    landlord: raw.landlord,
    token: raw.token,
    rent: BigInt(raw.rent),
    periods: Number(raw.periods),
    periodSecs: Number(raw.period_secs),
    createdAt: Number(raw.created_at),
    moveInBy: Number(raw.move_in_by),
    start: Number(raw.start),
    paidPeriods: Number(raw.paid_periods),
    held: BigInt(raw.held),
    status: STATUS[Number(raw.status)] ?? 'Funded',
    endProposedBy: raw.end_proposed_by ?? undefined,
  }
}

/** Leases where `pub` is the payer or landlord, newest first (scans the most recent 40). */
export async function leasesFor(pub: string): Promise<Lease[]> {
  const client = await reserveClient(null)
  const count = Number((await client.lease_count()).result)
  const ids = Array.from({ length: Math.min(count, 40) }, (_, i) => count - 1 - i)
  const leases = await Promise.all(ids.map((id) => getLease(id).catch(() => null)))
  return leases.filter((l): l is Lease => !!l && (l.payer === pub || l.landlord === pub))
}

/** Rent periods the landlord could collect right now (mirrors the contract's rule). */
export function periodsDue(l: Lease, nowSecs = Date.now() / 1000): number {
  if (l.status !== 'Active') return 0
  const due = Math.min(l.periods, 1 + Math.floor((nowSecs - l.start) / l.periodSecs))
  return Math.max(0, due - l.paidPeriods)
}

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
