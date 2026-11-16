#!/usr/bin/env bash
# Deploys RentProof to Stellar Testnet and writes contract IDs for the web app.
# Re-runnable: reuses identities, the test stablecoin and its faucet; deploys a fresh
# rent reserve each run. CODE picks the stablecoin: CAD (default, leases in C$) or USDC.
set -euo pipefail
cd "$(dirname "$0")/.."
NET=testnet
CODE=${CODE:-CAD}

for id in rp-issuer rp-admin; do
  stellar keys address "$id" >/dev/null 2>&1 || stellar keys generate "$id" --network $NET --fund
done
ISSUER=$(stellar keys address rp-issuer)
ADMIN=$(stellar keys address rp-admin)

stellar contract build

# Demo stablecoin: a classic Stellar asset wrapped by its Stellar Asset Contract (SAC).
# CAD stands in for a regulated Canadian-dollar stablecoin, so rent is held in the landlord's currency.
SAC=$(stellar contract id asset --asset "$CODE:$ISSUER" --network $NET)
stellar contract asset deploy --asset "$CODE:$ISSUER" --source rp-issuer --network $NET 2>/dev/null || true

SAC_ADMIN=$(stellar contract invoke --id "$SAC" --source rp-issuer --network $NET -- admin 2>/dev/null | tr -d '"' || true)
if [[ "$SAC_ADMIN" == C* ]]; then
  FAUCET=$SAC_ADMIN
else
  FAUCET=$(stellar contract deploy --wasm target/wasm32v1-none/release/demo_faucet.wasm \
    --source rp-admin --network $NET -- --token "$SAC")
  # Hand minting rights to the faucet so the issuer key never leaves this machine.
  stellar contract invoke --id "$SAC" --source rp-issuer --network $NET -- set_admin --new_admin "$FAUCET"
fi

# 0.5% service fee (50 bps) to the operator treasury; rp-admin doubles as the demo mediator.
# The treasury needs a trustline to receive fees.
stellar tx new change-trust --line "$CODE:$ISSUER" --source rp-admin --network $NET >/dev/null 2>&1 || true
FEE_BPS=${FEE_BPS:-50}
# Leases that opt into lending get a flat 50 (C$ or US$) off; Stroop keeps the vault's earnings.
LEND_DISCOUNT=500000000
# Testnet stand-in for the Blend pool adapter.
VAULT=$(stellar contract deploy --wasm target/wasm32v1-none/release/demo_vault.wasm \
  --source rp-admin --network $NET -- --token "$SAC" --admin "$ADMIN")
RESERVE=$(stellar contract deploy --wasm target/wasm32v1-none/release/rent_reserve.wasm \
  --source rp-admin --network $NET -- --token "$SAC" --treasury "$ADMIN" --fee_bps $FEE_BPS \
  --lend_discount $LEND_DISCOUNT --vault "$VAULT")

# Seed the cover fund with test money from the faucet (20,000 backs up to 200,000 of lent rent).
stellar contract invoke --id "$FAUCET" --source rp-admin --network $NET -- drip --to "$ADMIN" >/dev/null
stellar contract invoke --id "$RESERVE" --source rp-admin --network $NET -- add_cover --from "$ADMIN" --amount 200000000000 >/dev/null

cat > web/src/contracts.json <<JSON
{
  "network": "testnet",
  "rentReserve": "$RESERVE",
  "tokenCode": "$CODE",
  "tokenSac": "$SAC",
  "tokenIssuer": "$ISSUER",
  "faucet": "$FAUCET",
  "treasury": "$ADMIN",
  "feeBps": $FEE_BPS,
  "lendDiscount": $LEND_DISCOUNT,
  "vault": "$VAULT",
  "mediator": "$ADMIN"
}
JSON
cat web/src/contracts.json
