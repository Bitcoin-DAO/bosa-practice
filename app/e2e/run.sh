#!/bin/bash
# End-to-end tests: a local relay (relay/ under wrangler), a mock chain API, the built app, Playwright.
# Needs: npm install in app/ and relay/, Playwright with Chromium, ffmpeg (camera test).
# Usage: bash e2e/run.sh [founding|governance|payouts|all]   (CHAIN=blockbook: the mock chain answers as Blockbook only)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/.."
RELAY="$APP/../relay"
OUT="$HERE/out"
WHICH="${1:-all}"
mkdir -p "$OUT"
node -e '
const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
Object.assign(c, { site: "http://localhost:4173", passkeyDomain: "localhost", relays: ["ws://127.0.0.1:8787"],
  chainApi: process.env.CHAIN === "blockbook" ? ["blockbook:http://127.0.0.1:3002/bb"] : ["http://127.0.0.1:3002/api"] });
c.rules.votingPeriodDays = 0.0015; // about 2 minutes
require("fs").writeFileSync(process.argv[2], JSON.stringify(c, null, 2));
' "$APP/../config/example.testnet4.json" "$OUT/dao.test.json"
echo '{}' > "$OUT/funded.json"

kill_matching() { for p in $(ps -eo pid,args | grep -E "$1" | grep -v grep | awk '{print $1}'); do kill "$p" 2>/dev/null || true; done; }
start_relay() {
  kill_matching "workerd|node .*wrangler"
  sleep 1
  (cd "$RELAY" && rm -rf .wrangler && npx wrangler dev --local --port 8787 > "$OUT/relay.log" 2>&1) &
  for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:8787/ && return; sleep 1; done
  echo "relay did not start"; exit 1
}
cleanup() { kill_matching "workerd|node .*wrangler|vite preview|esplora-mock"; }
trap cleanup EXIT

node "$HERE/esplora-mock.mjs" > "$OUT/esplora.log" 2>&1 &
(cd "$APP" && DAO_CONFIG="$OUT/dao.test.json" DAO_CHARTER="$APP/../config/example.charter.it.md" npx vite build --outDir "$OUT/dist" --emptyOutDir > "$OUT/build.log" 2>&1 && npx vite preview --outDir "$OUT/dist" --port 4173 --strictPort --host localhost > "$OUT/preview.log" 2>&1) &
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:4173/ && break; sleep 1; done

if [ "$WHICH" = all ] || [ "$WHICH" = founding ]; then
  start_relay
  node "$HERE/founding.e2e.cjs"
  node "$HERE/camera.e2e.cjs"
fi
if [ "$WHICH" = all ] || [ "$WHICH" = governance ]; then
  start_relay
  node "$HERE/governance.e2e.cjs"
fi
if [ "$WHICH" = all ] || [ "$WHICH" = payouts ]; then
  start_relay
  kill_matching "esplora-mock"
  node "$HERE/esplora-mock.mjs" > "$OUT/esplora.log" 2>&1 &
  sleep 1
  node "$HERE/payouts.e2e.cjs"
fi
