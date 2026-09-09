#!/usr/bin/env bash
#
# Negative test for verify-compat.sh.
#
# A compatibility check that cannot fail is worse than no check: it is a green
# light that means nothing. This mutates a copy of the real generated types one
# field at a time and asserts the checker catches each one. Two of these
# scenarios were passing silently when the assertions were structural only —
# a renamed *optional* field is still assignable to an all-optional local shape,
# so every field the adapter reads is now named explicitly in assertCompat.ts.
#
#   SNAPSHOT=/path/to/client bash scripts/verify-compat-detects-drift.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

snapshot="${SNAPSHOT:-}"
if [ -z "$snapshot" ]; then
  for candidate in "$here/.snapshot" "$here/../../../farcasterxyz/client"; do
    [ -f "$candidate/packages/farcaster-client-data/src/types/api.ts" ] && snapshot="$candidate" && break
  done
fi
api="$snapshot/packages/farcaster-client-data/src/types/api.ts"
if [ ! -f "$api" ]; then
  echo "error: no snapshot found; run verify-compat.sh first" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/packages/farcaster-client-data/src/types"
mutated="$work/packages/farcaster-client-data/src/types/api.ts"

# Each scenario: a label, the type to mutate, and a sed-style field rename or
# removal applied only inside that type's declaration.
run_case() {
  local label="$1" type_name="$2" from="$3" to="$4" expect="$5"
  python3 - "$api" "$mutated" "$type_name" "$from" "$to" <<'PY'
import re, sys
src, dst, type_name, frm, to = sys.argv[1:6]
lines = open(src).read().split('\n')
start = next(
    i for i, l in enumerate(lines)
    if re.match(rf'^export (type|interface) {re.escape(type_name)}\b', l)
)
end = next(i for i in range(start + 1, len(lines)) if lines[i].startswith('};') or lines[i] == '}')
hit = False
for i in range(start, end + 1):
    if frm in lines[i]:
        lines[i] = lines[i].replace(frm, to)
        hit = True
        break
if not hit:
    raise SystemExit(f'drift fixture stale: {frm!r} not found in {type_name}')
open(dst, 'w').write('\n'.join(lines))
PY

  local status=pass
  SNAPSHOT="$work" bash "$here/scripts/verify-compat.sh" >/dev/null 2>&1 || status=caught
  if [ "$status" = "$expect" ]; then
    printf '  ok    %-46s %s\n' "$label" "$status"
  else
    printf '  FAIL  %-46s expected %s, got %s\n' "$label" "$expect" "$status"
    return 1
  fi
}

echo "Drift detection matrix (against $(git -C "$snapshot" rev-parse --short HEAD 2>/dev/null || echo unknown)):"

cp "$api" "$mutated"
control=pass
SNAPSHOT="$work" bash "$here/scripts/verify-compat.sh" >/dev/null 2>&1 || control=caught
[ "$control" = pass ] || { echo "  FAIL  unmutated control did not pass"; exit 1; }
printf '  ok    %-46s %s\n' "control (unmutated)" "$control"

failures=0
run_case "meta.includeReason renamed"     ApiCastFeedItemMeta 'includeReason?:' 'inclusionReason?:' caught || failures=1
run_case "meta.score removed"             ApiCastFeedItemMeta 'score?: number;' '' caught || failures=1
run_case "meta.authorQuality renamed"     ApiCastFeedItemMeta 'authorQuality?:' 'quality?:' caught || failures=1
run_case "cast.channel renamed"           ApiCast 'channel?:' 'channelInfo?:' caught || failures=1
run_case "cast.author loses fid"          ApiCast 'author: ApiUser;' 'author: string;' caught || failures=1
run_case "cast.reactions becomes optional" ApiCast 'reactions: {' 'reactions?: {' caught || failures=1
run_case "feedItem.timestamp renamed"     ApiCastFeedItem 'timestamp:' 'createdAt:' caught || failures=1
run_case "embeds.snap renamed"            ApiCastEmbeds 'snap?:' 'miniApps?:' caught || failures=1
run_case "embeds.urls removed"            ApiCastEmbeds 'urls: ApiCastUrlEmbed[];' '' caught || failures=1
run_case "urlEmbed.tokenV2 removed"       ApiCastUrlEmbed 'tokenV2?:' '' caught || failures=1
run_case "new quality tier added"         ApiUserQuality "| 'high'" "| 'exceptional'
  | 'high'" caught || failures=1

if [ "$failures" -ne 0 ]; then
  echo "Drift matrix failed: the compatibility check is not catching real changes."
  exit 1
fi
echo "All scenarios caught. verify-compat.sh is doing its job."
