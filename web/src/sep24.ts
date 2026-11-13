// Landlord cash-out through a Stellar anchor: SEP-1 discovery, SEP-10 wallet auth and
// a SEP-24 interactive withdrawal. Testnet uses SDF's reference anchor; in production
// this points at a licensed CAD off-ramp and the payout itself settles to a bank.
import { Keypair, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk'

export const ANCHOR_DOMAIN = 'testanchor.stellar.org'
const PASSPHRASE = 'Test SDF Network ; September 2015'

interface AnchorInfo {
  webAuth: string
  sep24: string
  signingKey: string
}

export async function discoverAnchor(domain = ANCHOR_DOMAIN): Promise<AnchorInfo> {
  const toml = await (await fetch(`https://${domain}/.well-known/stellar.toml`)).text()
  const pick = (key: string) => toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1]
  const webAuth = pick('WEB_AUTH_ENDPOINT')
  const sep24 = pick('TRANSFER_SERVER_SEP0024')
  const signingKey = pick('SIGNING_KEY')
  if (!webAuth || !sep24 || !signingKey) throw new Error(`${domain} does not support SEP-10/SEP-24`)
  return { webAuth, sep24, signingKey }
}

/** SEP-10: prove control of the landlord's account and get a session token. */
export async function authenticate(kp: Keypair, anchor: AnchorInfo, domain = ANCHOR_DOMAIN): Promise<string> {
  const challenge = await (await fetch(`${anchor.webAuth}?account=${kp.publicKey()}`)).json()
  if (!challenge.transaction) throw new Error(challenge.error ?? 'Anchor did not return a challenge')
  // Refuse to sign anything that isn't a genuine challenge from this anchor.
  WebAuth.readChallengeTx(challenge.transaction, anchor.signingKey, PASSPHRASE, domain, domain)
  const tx = TransactionBuilder.fromXDR(challenge.transaction, PASSPHRASE)
  tx.sign(kp)
  const res = await fetch(anchor.webAuth, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: tx.toXDR() }),
  })
  const body = await res.json()
  if (!body.token) throw new Error(body.error ?? 'Anchor authentication failed')
  return body.token
}

export interface Withdrawal {
  id: string
  url: string
}

/** SEP-24: open an interactive withdrawal where the anchor collects KYC and bank details. */
export async function startWithdrawal(
  kp: Keypair,
  anchor: AnchorInfo,
  token: string,
): Promise<Withdrawal> {
  const res = await fetch(`${anchor.sep24}/transactions/withdraw/interactive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    // Amount is entered in the anchor's own form (SDF's test anchor caps withdrawals at 10).
    body: JSON.stringify({ asset_code: 'USDC', account: kp.publicKey(), lang: 'en' }),
  })
  const body = await res.json()
  if (!body.url) throw new Error(body.error ?? 'Anchor could not start the withdrawal')
  return { id: body.id, url: body.url }
}

export async function withdrawalStatus(anchor: AnchorInfo, token: string, id: string): Promise<string> {
  const res = await fetch(`${anchor.sep24}/transaction?id=${id}`, { headers: { Authorization: `Bearer ${token}` } })
  const body = await res.json()
  return body.transaction?.status ?? 'unknown'
}
