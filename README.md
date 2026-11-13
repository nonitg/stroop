# RentProof

**Proof of rent, not prepayment.**

Newcomers to Canada have the money to pay rent, but no local credit history, so landlords ask them to prepay 6–12 months in cash, often to a stranger, sometimes for a listing that turns out to be fake. RentProof replaces that lump sum with a rent reserve on Stellar: the family locks the lease's rent in a Soroban smart contract, the landlord verifies it on-chain, and rent is released one month at a time. Money that isn't owed yet stays protected.

First customer: international students (about 690,000 study-permit holders in Canada), whose families fund rent from abroad.

- **Live app:** _[[add Vercel URL]]_
- **Demo video (1 min):** _[[add YouTube/Loom link]]_
- **Network:** Stellar Testnet

## Deployed contracts (Testnet)

| Contract | ID |
| --- | --- |
| Rent reserve (Soroban) | [`CAAV5OIX7LCWNOLNIBQODIDNQ3E5GTU6H6PYU5PXAHIDZL7WH6Q4JBA6`](https://stellar.expert/explorer/testnet/contract/CAAV5OIX7LCWNOLNIBQODIDNQ3E5GTU6H6PYU5PXAHIDZL7WH6Q4JBA6) |
| Test USDC (Stellar Asset Contract) | [`CBPPI4PD6JOCLHDKRQ4ROBL5Z2YRIATOG4A5K6MPLUERBUXPQHXHU5OD`](https://stellar.expert/explorer/testnet/contract/CBPPI4PD6JOCLHDKRQ4ROBL5Z2YRIATOG4A5K6MPLUERBUXPQHXHU5OD) |
| Test USDC faucet (SAC admin) | [`CCYT3OCJ4N5TJSXULBW5HBHDNJSJ6NNXRVEPSBO72DEA6E3YU4LB5BYH`](https://stellar.expert/explorer/testnet/contract/CCYT3OCJ4N5TJSXULBW5HBHDNJSJ6NNXRVEPSBO72DEA6E3YU4LB5BYH) |

The test USDC is a classic Stellar asset (`USDC:GDLAVU5VJNJJFAL7TDMPYASQ6SFTENCCUNZBCQU6MC62PJ3CF3E2MDFV`) issued by us for the demo. It has no value, and anyone can mint it from the faucet. The rent contract's token is fixed at deployment (so a lease can't be "funded" with a look-alike token); on mainnet it is deployed with Circle's USDC.

## How it works

```
Family (abroad)                 Rent reserve contract                 Landlord (Canada)
     │  create(): lock rent × months ──►  held: 12,000 USDC
     │                                    │ ◄── accept(): landlord commits
     │  move_in(): "I have the keys" ───► │ ──► month 1 paid
     │                                    │ ──► release(): one month per period, never early
     │  ◄── reclaim(): no move-in by deadline (fake listing) → full refund
     │  ◄── end_early(): both sides agree → unused rent refunded
                                                                          │
                                       SEP-10 + SEP-24 anchor ◄────────── cash out to bank
```

### Rules the contract enforces

| Rule | Function | Who must sign |
| --- | --- | --- |
| Lock `rent × months` + a 1% service fee for a named landlord and mediator | `create` | payer |
| Landlord commits to the terms and mediator (payer can cancel freely before this) | `accept` | landlord |
| Landlord records the keys as handed over; payer can no longer reclaim | `hand_over` | landlord |
| Move-in starts the schedule, pays month one, collects the fee | `move_in` | payer |
| Pay every month that has come due, only to the landlord, never early or twice; also starts a handed-over lease once the dispute window passes quietly | `release` | anyone (the keeper) |
| Full refund, fee included, if the keys weren't handed over by the deadline (fake listing) | `reclaim` | payer |
| End early: one side proposes, the other agrees before it lapses; due rent paid, rest refunded | `end_early` / `cancel_end` | payer and landlord |
| Pause payouts and ask the mediator | `dispute` | payer or landlord |
| Mediator splits the locked rent between the two parties only (fee refunded if never moved in) | `resolve` | the lease's mediator |
| Landlord collects rent that couldn't be delivered earlier (e.g. a missing trustline) | `claim` | landlord |

There is no admin withdrawal path. The operator can't touch a lease's funds; the mediator is named per lease, accepted by the landlord, can act only after a dispute, and can only split between payer and landlord. A landlord who can't receive funds never blocks the payer's refund: their share is recorded as owed instead. Terms are bounded (1–24 months, periods of 1 minute to 31 days, fee ≤ 5%), and every state change emits an event.

### On-chain / off-chain split

- **On-chain (Soroban):** custody of the reserve, the payout schedule, refund and termination rules, a public lease record anyone can verify.
- **Off-chain:** the web app (static React; reads and writes through Stellar RPC and Horizon), the landlord's KYC and bank payout (anchor via SEP-10/SEP-24), and a keeper (`web/scripts/keeper.ts`) that calls `release` when rent comes due. It holds no special rights: the contract decides who gets paid and when.
- **Demo clock:** one rent month = 60 seconds, so a full lease fits in a demo. Production uses 30-day periods.

## What's real and what's simulated

| Piece | Status |
| --- | --- |
| Rent reserve contract, all rules above | Real, deployed on Testnet, 16 unit tests + scripted end-to-end run |
| USDC movement | Real Testnet transfers of our test USDC through its Stellar Asset Contract |
| Landlord verification page | Real, reads contract state live |
| Anchor cash-out | SEP-1/SEP-10/SEP-24 calls are real, against SDF's reference anchor (`testanchor.stellar.org`); no money moves on Testnet |
| Wallets | Demo keypairs generated in the browser and funded by Friendbot. Production: passkey smart wallets and sponsored fees |
| CAD payout | Not built. Production needs a licensed Canadian off-ramp |

## Run it

Prerequisites: Rust with the `wasm32v1-none` target, [Stellar CLI](https://developers.stellar.org/docs/tools/cli), Node 20+.

```sh
# Contracts: unit tests and build
cargo test
stellar contract build

# Deploy fresh contracts to Testnet (writes web/src/contracts.json)
./scripts/deploy-testnet.sh

# End-to-end check on Testnet: fund, accept, move in, blocked early release, monthly release, early end
./scripts/smoke-testnet.sh

# Web app
cd web && npm install && npm run dev

# Rent-day scheduler: releases every lease's due rent (anyone can run it)
cd web && bun scripts/keeper.ts 10
```

## Security notes

- Every state change checks the right signer with `require_auth`; payouts can only go to the lease's landlord or back to its payer (plus the fee to the treasury at move-in).
- The reserve token is fixed at deployment; terms are bounded; integer math is checked.
- The mediator is per lease, needs a dispute first, and can only split between the two parties.
- Payouts to the landlord can't block refunds (`try_transfer` falls back to a claimable balance).
- Early-end proposals lapse after one period and can be withdrawn.
- Lease storage TTL is extended on every access so records don't expire mid-lease.
- SEP-10: the challenge is validated (server signature, home and web-auth domains, client account) before signing; the SEP-24 form only opens on the anchor's https host, with no `opener` back into the app.
- The contract was reviewed internally against fake tokens, griefing, stale proposals, blocked refunds and resolver abuse; each finding has a regression test.
- Demo wallets hold Testnet play money only and live in the browser's local storage. Don't reuse them.
- Before mainnet: an independent audit, KYC on both sides through the anchor and onboarding partner, and a legal review of holding prepaid rent under provincial tenancy law.

## Roadmap

1. Pilot with one Waterloo property manager and one student cohort.
2. Passkey wallets with sponsored fees, so families never see a seed phrase or pay XLM.
3. Licensed CAD off-ramp for landlord payouts; family on-ramps in India, China, Nigeria and the Philippines.
4. On-time payments become a portable rent history, the credit record newcomers arrive without.

## Repo layout

```
contracts/rent_reserve   Soroban rent reserve (Rust) + tests
contracts/demo_faucet    Testnet-only faucet, admin of the test USDC asset
scripts/                 Deploy and end-to-end smoke test
web/                     React app (Vite + @stellar/stellar-sdk)
```
