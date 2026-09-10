#!/usr/bin/env bash
# Build and verify Zotero Neo as an installable .xpi file.
# Usage: ./tools/build.sh
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Error: Node.js 24 and npm are required." >&2
  exit 1
fi
if [[ ! -d node_modules ]]; then
  echo "Error: dependencies are missing; run 'npm ci' first." >&2
  exit 1
fi

npm run verify

echo ""
echo "Done: zotero-neo.xpi"
echo "To install: Zotero → Tools → Plugins → gear → Install Plugin From File..."
