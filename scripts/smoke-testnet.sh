#!/usr/bin/env bash
# End-to-end check against the deployed testnet contracts: fund -> accept -> move in
# -> monthly release -> blocked early release -> mutual early end with refund.
set -euo pipefail
cd "$(dirname "$0")/.."
NET=testnet
C=$(python3 -c 'import json;print(json.load(open("web/src/contracts.json"))["rentReserve"])')
SAC=$(python3 -c 'import json;print(json.load(open("web/src/contracts.json"))["usdcSac"])')
FAUCET=$(python3 -c 'import json;print(json.load(open("web/src/contracts.json"))["faucet"])')
ISSUER=$(python3 -c 'import json;print(json.load(open("web/src/contracts.json"))["usdcIssuer"])')
RUN=$RANDOM
inv() { stellar contract invoke --network $NET "$@" 2>/dev/null; }

for r in payer landlord; do
  stellar keys generate "smoke-$r-$RUN" --network $NET --fund >/dev/null 2>&1
  stellar tx new change-trust --line "USDC:$ISSUER" --source "smoke-$r-$RUN" --network $NET >/dev/null 2>&1
done
P=$(stellar keys address smoke-payer-$RUN); L=$(stellar keys address smoke-landlord-$RUN)
inv --id $FAUCET --source smoke-payer-$RUN -- drip --to $P >/dev/null
bal() { inv --id $SAC --source smoke-payer-$RUN -- balance --id "$1"; }
echo "payer funded: $(bal $P)"

ID=$(inv --id $C --source smoke-payer-$RUN -- create --payer $P --landlord $L --token $SAC \
  --rent 10000000000 --periods 12 --period_secs 60 --move_in_window_secs 3600)
echo "lease $ID created; contract holds lease funds; payer now $(bal $P)"
inv --id $C --source smoke-landlord-$RUN -- accept --id $ID >/dev/null && echo "landlord accepted"
inv --id $C --source smoke-payer-$RUN -- move_in --id $ID >/dev/null && echo "moved in; landlord: $(bal $L)"
if inv --id $C --source smoke-landlord-$RUN -- release --id $ID >/dev/null; then echo "FAIL: early release allowed"; exit 1; else echo "early release blocked (expected)"; fi
echo "waiting 65s for next period..."; sleep 65
inv --id $C --source smoke-landlord-$RUN -- release --id $ID && echo "landlord: $(bal $L)"
inv --id $C --source smoke-landlord-$RUN -- end_early --id $ID --caller $L >/dev/null && echo "landlord proposed end"
inv --id $C --source smoke-payer-$RUN -- end_early --id $ID --caller $P && echo "payer agreed; payer: $(bal $P), landlord: $(bal $L)"
inv --id $C --source smoke-payer-$RUN -- get_lease --id $ID
