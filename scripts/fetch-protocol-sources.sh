#!/usr/bin/env bash
# Clone the repositories the protocol pages were read from, at the commits in
# scripts/protocol-sources.json, so scripts/audit-protocol-claims.mjs can
# re-verify every claim.
#
#   bash scripts/fetch-protocol-sources.sh            # the pinned commits
#   bash scripts/fetch-protocol-sources.sh --latest   # upstream HEAD
#
# Two kinds of pin:
#
#   living  the page is a reference that must stay true. --latest moves these to
#           upstream HEAD, and a claim that fails there is a claim to re-read.
#   frozen  ("frozen": true) a dated witness: what a repository said on the day
#           a page quoted it. --latest leaves these at their pinned commit,
#           because a third party rewriting its README does not unsay what it
#           said, and should not drown the claims that did move.
#
# A pin with "sparse" paths fetches only those files (a blobless, depth-one
# fetch), which is what keeps a 180 MB client repository at about a megabyte.
#
# Sources land in $PROTOCOL_SOURCES (default: .protocol-sources, git-ignored).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="${PROTOCOL_SOURCES:-$here/.protocol-sources}"
latest=0
[ "${1:-}" = "--latest" ] && latest=1
mkdir -p "$dest"
export GIT_LFS_SKIP_SMUDGE=1

while read -r name url sha frozen sparse; do
  dir="$dest/$name"
  ref="$sha"
  refresh=0
  if [ "$latest" = 1 ] && [ "$frozen" != 1 ]; then
    ref=HEAD
    refresh=1
  elif [ ! -d "$dir/.git" ] || [ "$(git -C "$dir" rev-parse HEAD)" != "$sha" ]; then
    refresh=1
  fi
  if [ "$refresh" = 1 ]; then
    rm -rf "$dir"
    mkdir -p "$dir"
    git -C "$dir" init --quiet
    git -C "$dir" remote add origin "$url"
    if [ "$sparse" != "-" ]; then
      git -C "$dir" sparse-checkout init --no-cone
      # Paths are repository-relative patterns without spaces.
      # shellcheck disable=SC2086
      git -C "$dir" sparse-checkout set ${sparse//,/ }
      git -C "$dir" fetch --quiet --depth 1 --filter=blob:none origin "$ref"
    else
      git -C "$dir" fetch --quiet --depth 1 origin "$ref"
    fi
    git -C "$dir" checkout --quiet FETCH_HEAD
  fi
  printf '%-22s %s %s%s\n' "$name" "$(git -C "$dir" rev-parse --short HEAD)" "$(git -C "$dir" log -1 --format=%cs)" "$([ "$frozen" = 1 ] && echo '  frozen' || true)"
done < <(node -e '
  const pins = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  for (const [name, p] of Object.entries(pins))
    console.log(name, p.url, p.sha, p.frozen ? 1 : 0, p.sparse?.length ? p.sparse.join(",") : "-");
' "$here/scripts/protocol-sources.json")
