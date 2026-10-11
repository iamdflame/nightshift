#!/usr/bin/env bash
# Deploy the Nightshift contracts to BSC mainnet with the treasury agent's keystore.
#
#   bash deploy/deploy-contracts.sh            # dry run on a fork (writes deployments/56.dry-run.json)
#   bash deploy/deploy-contracts.sh --broadcast # real deployment (writes deployments/56.json)
#
# Requires: .env with NIGHTSHIFT_KEY_PASSWORD; keys/roles.json (agent wallets); treasury funded with BNB.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PATH:$HOME/.foundry/bin:/c/Users/Dflame/.foundry/bin"

set -a; [ -f .env ] && . ./.env; set +a
RPC="${BSC_RPC_URL:-https://bsc-dataseed.bnbchain.org}"
TREASURY=$(node -e "console.log(require('./keys/roles.json').treasury)")
KEYSTORE="keys/${TREASURY}.json"
[ -f "$KEYSTORE" ] || { echo "missing keystore $KEYSTORE"; exit 1; }

# The treasury owns the contracts and is the oracle reporter; collateral/feeds for the flagship bStocks.
export NIGHTSHIFT_OWNER="$TREASURY"
export NIGHTSHIFT_REPORTERS="$TREASURY"
export NIGHTSHIFT_IDENTITY_REGISTRY="0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"   # ERC-8004 AgentIdentity (BSC)
export NIGHTSHIFT_TOKENS="0x02fca66c1d1afb4e2a7884261eb00f63598a7436,0x5b1910eaad6450e50f816082aa078c41f10c292f,0x7138b48df7d98d7e3cc221bfe7192d0a178182d8,0x205812cdbed920aff76c6580abd681a46d11efc7,0x431a3bee82e2ca41e49895cbece5bb0f76a89b7a,0x585bde7c54abb5ccd7791f923d6c2187635f3952"  # NVDAB TSLAB SPYB QQQB AAPLB COINB

cd contracts
if [ "${1:-}" = "--broadcast" ]; then
  echo "Deploying to BSC mainnet from treasury $TREASURY ..."
  # Password via a private temp file: a value starting with "-" is parsed as a flag by forge, and a
  # file keeps it out of the process list. Legacy txs at 0.1 gwei: BSC's floor is 0.05 gwei.
  PWFILE=$(mktemp); chmod 600 "$PWFILE"; trap 'rm -f "$PWFILE"' EXIT
  printf '%s' "$NIGHTSHIFT_KEY_PASSWORD" > "$PWFILE"
  forge script script/Deploy.s.sol --rpc-url "$RPC" --keystore "../$KEYSTORE" --password-file "$PWFILE" --broadcast --slow --legacy --with-gas-price 100000000
  mkdir -p ../deployments && cp deployments/56.json ../deployments/56.json && echo "addresses → deployments/56.json (read by the Night Shift publisher)"
else
  echo "Dry run (fork) from treasury $TREASURY — add --broadcast to deploy for real"
  forge script script/Deploy.s.sol --rpc-url "$RPC" --sender "$TREASURY"
fi
