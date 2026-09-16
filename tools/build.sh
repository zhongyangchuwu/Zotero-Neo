#!/usr/bin/env bash
# Temporary formatting diagnostic for the Tag Workspace draft.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

npx prettier --write src/main/tag-workspace.ts
git diff -- src/main/tag-workspace.ts
exit 1
