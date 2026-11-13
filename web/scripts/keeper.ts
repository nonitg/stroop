// Rent-day scheduler. Contracts can't wake themselves up, so in production a keeper
// calls `release` when rent comes due. Safe to run by anyone: the contract only ever
// pays the lease's landlord, and only for periods already due.
//
// Usage (from web/): bun scripts/keeper.ts [intervalSeconds]
import { Keypair } from '@stellar/stellar-sdk'
import { NET, fmtUSD, periodsDue, recentLeases, reserve } from '../src/stellar'

const intervalMs = Number(process.argv[2] ?? 10) * 1000

async function fundedKeeper(): Promise<Keypair> {
  // Throwaway testnet account: the keeper only pays network fees.
  const kp = Keypair.random()
  const res = await fetch(`${NET.friendbot}?addr=${kp.publicKey()}`)
  if (!res.ok) throw new Error('Friendbot could not fund the keeper account')
  return kp
}

async function tick(kp: Keypair) {
  const due = (await recentLeases()).filter((l) => periodsDue(l) > 0)
  for (const lease of due) {
    try {
      const { result, hash } = await reserve.release(kp, lease.id)
      console.log(`${new Date().toISOString()} lease #${lease.id}: paid ${fmtUSD(result)} to landlord (tx ${hash})`)
    } catch (e) {
      // Another caller may have released first; the contract rejects the duplicate.
      console.log(`lease #${lease.id}: skipped (${e instanceof Error ? e.message.slice(0, 80) : e})`)
    }
  }
}

const kp = await fundedKeeper()
console.log(`keeper ${kp.publicKey()} checking every ${intervalMs / 1000}s`)
for (;;) {
  await tick(kp).catch((e) => console.error('tick failed:', e instanceof Error ? e.message : e))
  await new Promise((r) => setTimeout(r, intervalMs))
}
