#!/usr/bin/env bash
# Proves lending works against the real Blend v2 testnet pool, not the demo vault.
# Uses Blend's testnet USDC (borrowed against friendbot XLM, since there's no faucet),
# a separate rent reserve, and blend_adapter. The demo app's deployment is untouched.
#   lease (lending on) -> move in: 9 months supplied to Blend
#   -> month 2 released: Blend pays some back -> lending off: the rest comes home
#   -> nothing short, cover fund untouched, Stroop harvests the interest
set -euo pipefail
cd "$(dirname "$0")/.."
NET=testnet
POOL=CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF   # Blend TestnetV2 pool
USDC=CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU   # Blend testnet USDC (SAC)
XLM=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
USDC_ISSUER=GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56
RUN=$RANDOM
inv() { stellar contract invoke --network $NET "$@" 2>/dev/null; }

stellar contract build >/dev/null

# Stroop (treasury + mediator), the paying family, and the landlord.
for r in stroop family landlord; do
  stellar keys generate "blend-$r-$RUN" --network $NET --fund >/dev/null 2>&1
  stellar tx new change-trust --line "USDC:$USDC_ISSUER" --source "blend-$r-$RUN" --network $NET >/dev/null 2>&1
done
S=$(stellar keys address blend-stroop-$RUN); F=$(stellar keys address blend-family-$RUN); L=$(stellar keys address blend-landlord-$RUN)
bal() { inv --id $USDC --source blend-stroop-$RUN -- balance --id "$1"; }

# Borrow 300 test USDC from Blend against 3,000 XLM.
inv --id $POOL --source blend-stroop-$RUN -- submit --from $S --spender $S --to $S --requests \
  "[{\"request_type\":2,\"address\":\"$XLM\",\"amount\":\"30000000000\"},{\"request_type\":4,\"address\":\"$USDC\",\"amount\":\"3000000000\"}]" >/dev/null
inv --id $USDC --source blend-stroop-$RUN -- transfer --from $S --to $F --amount 1300000000 >/dev/null
echo "family has $(bal $F) Blend test USDC"

ADAPTER=$(stellar contract deploy --wasm target/wasm32v1-none/release/blend_adapter.wasm \
  --source blend-stroop-$RUN --network $NET -- --pool $POOL --token $USDC --admin $S)
RESERVE=$(stellar contract deploy --wasm target/wasm32v1-none/release/rent_reserve.wasm \
  --source blend-stroop-$RUN --network $NET -- --token $USDC --treasury $S --fee_bps 100 \
  --lend_discount 5000000 --vault $ADAPTER)
echo "adapter $ADAPTER"
echo "reserve $RESERVE"
inv --id $RESERVE --source blend-stroop-$RUN -- add_cover --from $S --amount 200000000 >/dev/null

# US$10/month for 12 one-minute months, lending on.
ID=$(inv --id $RESERVE --source blend-family-$RUN -- create --payer $F --landlord $L --mediator $S \
  --rent 100000000 --periods 12 --period_secs 60 --move_in_window_secs 3600 --lend | tr -d '"')
inv --id $RESERVE --source blend-landlord-$RUN -- accept --id $ID >/dev/null
inv --id $RESERVE --source blend-family-$RUN -- move_in --id $ID >/dev/null
echo "moved in; lent to Blend: $(inv --id $RESERVE --source blend-stroop-$RUN -- cover_status)"
echo "adapter's Blend position worth: $(inv --id $ADAPTER --source blend-stroop-$RUN -- value)"

echo "waiting 65s for month 2..."; sleep 65
inv --id $RESERVE --source blend-landlord-$RUN -- release --id $ID >/dev/null
echo "month 2 released; landlord: $(bal $L); lent now: $(inv --id $RESERVE --source blend-stroop-$RUN -- cover_status)"

inv --id $RESERVE --source blend-family-$RUN -- set_lending --id $ID --on false >/dev/null
LEASE=$(inv --id $RESERVE --source blend-stroop-$RUN -- get_lease --id $ID)
echo "lending off: $LEASE"
python3 - "$LEASE" <<'PY'
import json, sys
l = json.loads(sys.argv[1])
assert int(l["lent"]) == 0, "rent still lent"
assert int(l["covered"]) == 0, "Blend came back short"
print("all lent rent back from Blend, nothing short")
PY
echo "Stroop's interest from Blend: $(inv --id $ADAPTER --source blend-stroop-$RUN -- earnings)"
