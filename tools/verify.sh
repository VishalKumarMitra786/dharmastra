#!/usr/bin/env bash
# One command for the whole gate. Run before every push: ./tools/verify.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== unit tests";   node src/test/run.mjs | tail -3
echo "== server tests"; node --test server/test/*.test.mjs | grep -E "^# (tests|pass|fail)"
echo "== events data"; node tools/check-events.mjs
echo "== budget";       node tools/check-budget.mjs
echo "== browser smoke"; node tools/smoke.mjs
echo "ALL CHECKS PASSED"
