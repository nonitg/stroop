#!/usr/bin/env bash
# End-to-end check against the deployed testnet contracts:
#  lease A (lending on): fund -> accept -> move in (fee collected, months 5+ lent)
#           -> blocked early release -> monthly release -> vault loses money
#           -> mutual early end: lent rent recalled, cover fund pays the loss, full refund
#  lease B: fund -> accept -> keys handed over -> dispute -> mediator split
set -euo pipefail
cd "$(dirname "$0")/.."
NET=testnet
C=$(python3 -c 'import json;print(json.load(open("web/src/contracts.json"))["rentReserve"])')
SAC=$(python3 -c 'import json;print(json.load(open("web/src/contracts.json"))["tokenSac"])')
FAUCET=$(python3 -c 'import json;print(json.load(open("web/src/contracts.json"))["faucet"])')
ISSUER=$(python3 -c 'import json;print(json.load(open("web/src/contracts.json"))["tokenIssuer"])')
CODE=$(python3 -c 'import json;print(json.load(open("web/src/contracts.json"))["tokenCode"])')
MEDIATOR=$(python3 -c 'import json;print(json.load(open("web/src/contracts.json"))["mediator"])')
VAULT=$(python3 -c 'import json;print(json.load(open("web/src/contracts.json"))["vault"])')
RUN=$RANDOM
inv() { stellar contract invoke --network $NET "$@" 2>/dev/null; }

for r in payer landlord; do
  stellar keys generate "smoke-$r-$RUN" --network $NET --fund >/dev/null 2>&1
  stellar tx new change-trust --line "$CODE:$ISSUER" --source "smoke-$r-$RUN" --network $NET >/dev/null 2>&1
done
P=$(stellar keys address smoke-payer-$RUN); L=$(stellar keys address smoke-landlord-$RUN)
inv --id $FAUCET --source smoke-payer-$RUN -- drip --to $P >/dev/null
bal() { inv --id $SAC --source smoke-payer-$RUN -- balance --id "$1"; }
echo "payer funded: $(bal $P)"

create() { inv --id $C --source smoke-payer-$RUN -- create --payer $P --landlord $L --mediator $MEDIATOR \
  --rent 1000000000 --periods 12 --period_secs 60 --move_in_window_secs 3600 ${1:-} | tr -d '"'; }
ID=$(create --lend)
echo "lease $ID created; contract holds lease funds; payer now $(bal $P)"
inv --id $C --source smoke-landlord-$RUN -- accept --id $ID >/dev/null && echo "landlord accepted"
inv --id $C --source smoke-payer-$RUN -- move_in --id $ID >/dev/null && echo "moved in; landlord: $(bal $L)"
echo "cover fund, total lent: $(inv --id $C --source smoke-payer-$RUN -- cover_status)"
if inv --id $C --source smoke-landlord-$RUN -- release --id $ID >/dev/null; then echo "FAIL: early release allowed"; exit 1; else echo "early release blocked (expected)"; fi
echo "waiting 65s for next period..."; sleep 65
inv --id $C --source smoke-landlord-$RUN -- release --id $ID && echo "landlord: $(bal $L)"
inv --id $VAULT --source smoke-payer-$RUN -- simulate_loss --bps 1000 >/dev/null && echo "vault lost 10%"
inv --id $C --source smoke-landlord-$RUN -- end_early --id $ID --caller $L >/dev/null && echo "landlord proposed end"
inv --id $C --source smoke-payer-$RUN -- end_early --id $ID --caller $P && echo "payer agreed; payer: $(bal $P), landlord: $(bal $L)"
inv --id $C --source smoke-payer-$RUN -- get_lease --id $ID

B=$(create); echo "lease $B created"
inv --id $C --source smoke-landlord-$RUN -- accept --id $B >/dev/null
inv --id $C --source smoke-landlord-$RUN -- hand_over --id $B >/dev/null && echo "keys handed over"
if inv --id $C --source smoke-payer-$RUN -- reclaim --id $B >/dev/null; then echo "FAIL: reclaim after handover"; exit 1; else echo "reclaim after handover blocked (expected)"; fi
inv --id $C --source smoke-payer-$RUN -- dispute --id $B --caller $P >/dev/null && echo "payer disputed"
inv --id $C --source rp-admin -- resolve --id $B --to_landlord 500000000 >/dev/null && echo "mediator split; payer: $(bal $P), landlord: $(bal $L)"
inv --id $C --source smoke-payer-$RUN -- get_lease --id $B
