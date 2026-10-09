#!/usr/bin/env bash
#
# Clone the repositories docs/operations/plugging-into-snapchain.md was read
# against, at the commits it cites, so scripts/audit-protocol-claims.mjs can
# re-check every number in it.
#
#   bash scripts/fetch-protocol-sources.sh            # the pinned commits
#   bash scripts/fetch-protocol-sources.sh --latest   # each repo's HEAD instead
#
# The pinned run must always pass. The --latest run is how you find out what
# has moved since the page was written: a failure there is a claim to re-read,
# not a bug in the audit.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="${PROTOCOL_SOURCES:-$here/.protocol-sources}"
latest=0
[ "${1:-}" = "--latest" ] && latest=1
mkdir -p "$dest"
export GIT_LFS_SKIP_SMUDGE=1

while read -r name url sha; do
  dir="$dest/$name"
  if [ "$latest" = 1 ]; then
    rm -rf "$dir"
    git clone --quiet --depth 1 "$url" "$dir"
  elif [ ! -d "$dir/.git" ] || [ "$(git -C "$dir" rev-parse HEAD)" != "$sha" ]; then
    rm -rf "$dir"
    mkdir -p "$dir"
    git -C "$dir" init --quiet
    git -C "$dir" remote add origin "$url"
    git -C "$dir" fetch --quiet --depth 1 origin "$sha"
    git -C "$dir" checkout --quiet FETCH_HEAD
  fi
  printf '%-14s %s %s\n' "$name" "$(git -C "$dir" rev-parse --short HEAD)" "$(git -C "$dir" log -1 --format=%cs)"
done < <(node -e '
  const pins = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  for (const [name, p] of Object.entries(pins)) console.log(name, p.url, p.sha);
' "$here/scripts/protocol-sources.json")
