#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if (( $(node -p 'process.versions.node.split(".")[0]') < 22 )); then
    echo "CI requires Node.js 22 or later." >&2
    exit 1
fi
export NEXT_TELEMETRY_DISABLED=1
export DATABASE_URL="${DATABASE_URL:-file:./ci.db}"
npm ci --no-audit --no-fund
npx --no-install prisma generate
npm run lint
npm test
python3 -m unittest discover -s tests/publication -v
python3 scripts/check-public-history.py HEAD
bash -n scripts/ci.sh scripts/build-image.sh
sh -n docker-entrypoint.sh
for f in packaging/runtime/launcher.js packaging/npm/bin/wrong-notebook.js packaging/desktop/main.js scripts/package/build.mjs; do node --check "$f"; done
for f in packaging/fnos/cmd/*; do bash -n "$f"; done
npm run build
