#!/usr/bin/env bash
# Deploys RentProof to Stellar Testnet and writes contract IDs for the web app.
# Re-runnable: reuses existing local identities, deploys fresh contracts each run.
set -euo pipefail
cd "$(dirname "$0")/.."
NET=testnet

for id in rp-issuer rp-admin; do
  stellar keys address "$id" >/dev/null 2>&1 || stellar keys generate "$id" --network $NET --fund
done
ISSUER=$(stellar keys address rp-issuer)
ADMIN=$(stellar keys address rp-admin)

stellar contract build

# Demo "USDC": a classic Stellar asset wrapped by its Stellar Asset Contract (SAC).
SAC=$(stellar contract id asset --asset "USDC:$ISSUER" --network $NET)
stellar contract asset deploy --asset "USDC:$ISSUER" --source rp-issuer --network $NET 2>/dev/null || true

FAUCET=$(stellar contract deploy --wasm target/wasm32v1-none/release/demo_faucet.wasm \
  --source rp-admin --network $NET -- --token "$SAC")
# Hand minting rights to the faucet so the issuer key never leaves this machine.
stellar contract invoke --id "$SAC" --source rp-issuer --network $NET -- set_admin --new_admin "$FAUCET"

RESERVE=$(stellar contract deploy --wasm target/wasm32v1-none/release/rent_reserve.wasm \
  --source rp-admin --network $NET -- --resolver "$ADMIN")

cat > web/src/contracts.json <<JSON
{
  "network": "testnet",
  "rentReserve": "$RESERVE",
  "usdcSac": "$SAC",
  "usdcIssuer": "$ISSUER",
  "faucet": "$FAUCET",
  "resolver": "$ADMIN"
}
JSON
cat web/src/contracts.json
