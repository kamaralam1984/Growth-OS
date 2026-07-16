#!/usr/bin/env bash
# Real wrapper around `k6 run scripts/load-test.js`.
#
# k6 is a standalone Go binary, NOT an npm package — it cannot be installed
# via this project's package.json/npm (see scripts/load-test.js's own header
# comment). This wrapper exists purely so `npm run test:load` gives a clear,
# actionable error instead of npm's generic "command not found" when k6
# isn't on PATH, rather than to fake having a real load-test runner.
#
# Usage:
#   npm run test:load                                   # BASE_URL defaults to http://localhost:3000
#   BASE_URL=https://staging.example.com npm run test:load
#
# Install k6 first:
#   macOS:   brew install k6
#   Linux:   https://k6.io/docs/get-started/installation/#linux
#   Docker:  docker run --rm -i grafana/k6 run - < scripts/load-test.js
set -euo pipefail

if ! command -v k6 >/dev/null 2>&1; then
  echo "[test:load] k6 is not installed on PATH." >&2
  echo "[test:load] Install it first — see https://k6.io/docs/get-started/installation/" >&2
  echo "[test:load]   macOS:  brew install k6" >&2
  echo "[test:load]   Docker: docker run --rm -i grafana/k6 run - < scripts/load-test.js" >&2
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[test:load] Running k6 against BASE_URL=${BASE_URL:-http://localhost:3000}" >&2
exec k6 run "$PROJECT_ROOT/scripts/load-test.js" "$@"
