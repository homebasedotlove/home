#!/usr/bin/env bash
#
# Compile the adapter against the real farcasterxyz/client types.
#
# The snapshot is not vendored — it is a one-way generated mirror that is
# replaced wholesale on every update, so pinning a copy here would rot. This
# fetches it (or reuses a checkout you already have) and runs tsc with the
# generated api.ts wired in as `farcaster-client-data-types`.
#
#   SNAPSHOT=/path/to/client pnpm verify:compat   # reuse a local checkout
#   pnpm verify:compat                            # clone into .snapshot/
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

snapshot="${SNAPSHOT:-}"
default_checkouts=(
  "$here/.snapshot"
  "$here/../../../farcasterxyz/client"
)

if [ -z "$snapshot" ]; then
  for candidate in "${default_checkouts[@]}"; do
    if [ -f "$candidate/packages/farcaster-client-data/src/types/api.ts" ]; then
      snapshot="$candidate"
      break
    fi
  done
fi

if [ -z "$snapshot" ]; then
  echo "No snapshot found. Cloning farcasterxyz/client into .snapshot ..."
  rm -rf "$here/.snapshot"
  GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/farcasterxyz/client "$here/.snapshot"
  git -C "$here/.snapshot" sparse-checkout set packages/farcaster-client-data/src/types
  snapshot="$here/.snapshot"
fi

api="$snapshot/packages/farcaster-client-data/src/types/api.ts"
if [ ! -f "$api" ]; then
  echo "error: no generated API types at $api" >&2
  exit 1
fi

rev="$(git -C "$snapshot" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "Checking against farcasterxyz/client @ $rev"
echo "  $api"

generated="$here/tsconfig.compat.generated.json"
trap 'rm -f "$generated"' EXIT
sed "s|\${SNAPSHOT}|$snapshot|g" "$here/tsconfig.compat.json" > "$generated"

npx tsc -p "$generated" --noEmit
echo "Compatible: every asserted type, field and enumeration matches upstream."
