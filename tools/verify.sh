#!/usr/bin/env bash
# One command for the whole gate. Run before every push: ./tools/verify.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== unit tests";   node src/test/run.mjs | tail -3
echo "== budget";       node tools/check-budget.mjs
echo "== browser smoke"; node tools/smoke.mjs
echo "ALL CHECKS PASSED"
