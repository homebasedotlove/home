#!/usr/bin/env python3
"""Re-verify every factual claim the docs make about farcasterxyz/client.

The audit and the design argue from specific numbers — 117 of 149 preference
fields, 797 colour tokens, 47 placeholders, a seam at a named line. Upstream
replaces the snapshot wholesale on every update, so those numbers rot silently
and the argument quietly stops being true. This fails loudly instead, and names
the claim that moved.

    SNAPSHOT=/path/to/client python3 scripts/audit_claims.py

Three claims in this file have already been wrong once. Each is now expressed
as precisely as the code allows, with the correction recorded next to it, so a
future reader can see what the trap was:

  - includeReason is NOT analytics-only; SourceLabel renders eight of ten
    reasons, in a menu, with no press handler.
  - meta.score is NOT unreferenced; it is plumbed into the web cast context and
    rendered on one internal admin page, never in the user-facing feed.
  - ApiUserQuality is seven values, not a three-tier ladder.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

SKIP_DIRS = {"node_modules", ".git", "dist", "lib", "build", "Pods", ".expo"}


def find_snapshot() -> Path:
    env = os.environ.get("SNAPSHOT")
    candidates = [Path(env)] if env else []
    here = Path(__file__).resolve().parent.parent
    candidates += [
        here / "packages/farcaster-adapter/.snapshot",
        here.parent / "client",
        here.parent / "farcasterxyz/client",
    ]
    for c in candidates:
        if (c / "packages/farcaster-client-data/src/types/api.ts").is_file():
            return c
    sys.exit("error: no client checkout found; set SNAPSHOT=/path/to/client")


ROOT = find_snapshot()


def walk(*subdirs: str, suffixes=(".ts", ".tsx")):
    """Source files only. node_modules is the reason the first version of this
    script hung for five minutes and then reported 59 placeholders instead of
    47."""
    roots = [ROOT / s for s in subdirs] if subdirs else [ROOT]
    for root in roots:
        if not root.exists():
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for name in filenames:
                if not suffixes or name.endswith(suffixes):
                    yield Path(dirpath) / name


def read(rel: str) -> str:
    return (ROOT / rel).read_text(errors="replace")


def block(text: str, start_pattern: str, end_pattern: str = r"^\};") -> str:
    lines = text.split("\n")
    start = next(i for i, l in enumerate(lines) if re.match(start_pattern, l))
    end = next(
        i for i in range(start + 1, len(lines)) if re.match(end_pattern, lines[i])
    )
    return "\n".join(lines[start : end + 1])


def union_members(text: str, name: str) -> list[str]:
    m = re.search(rf"^export type {re.escape(name)} =\n((?:\s+\|.*\n)+)", text, re.M)
    if not m:
        m = re.search(rf"^export type {re.escape(name)} =(.*?);", text, re.M | re.S)
        return [p.strip() for p in m.group(1).split("|") if p.strip()] if m else []
    return [l.strip().lstrip("| ").strip() for l in m.group(1).split("\n") if l.strip()]


def grep_files(pattern: str, *subdirs: str, suffixes=(".ts", ".tsx")) -> list[str]:
    rx = re.compile(pattern)
    hits = []
    for f in walk(*subdirs, suffixes=suffixes):
        try:
            if rx.search(f.read_text(errors="replace")):
                hits.append(str(f.relative_to(ROOT)))
        except OSError:
            pass
    return sorted(hits)


def grep_count(pattern: str, *subdirs: str, suffixes=(".ts", ".tsx")) -> int:
    rx = re.compile(pattern)
    n = 0
    for f in walk(*subdirs, suffixes=suffixes):
        try:
            n += len(rx.findall(f.read_text(errors="replace")))
        except OSError:
            pass
    return n


RESULTS: list[tuple[bool, str, object, object]] = []


def check(label: str, expected, actual, note: str = "") -> None:
    RESULTS.append((expected == actual, label + (f"  ({note})" if note else ""), expected, actual))


API = read("packages/farcaster-client-data/src/types/api.ts")

# --- docs/research/reference-client-audit.md --------------------------------
prefs = block(API, r"^export type ApiUserPreferences = \{")
check("ApiUserPreferences fields", 149, len(re.findall(r"^\s+\w+\??:", prefs, re.M)))
check(
    "  of which notification/email toggles",
    117,
    len(re.findall(r"^\s+(?:send|email|push|inApp)", prefs, re.M)),
)
check(
    "colour tokens in theme/colors.ts",
    797,
    len(re.findall(r"^\s+\w+:", read("packages/farcaster-expo/src/theme/colors.ts"), re.M)),
)
check(
    "AppThemeName variants",
    4,
    len(union_members(read("packages/farcaster-expo/src/theme/AppThemeNames.ts"), "AppThemeName")),
)
check("ApiCastFeedIncludeReason members", 10, len(union_members(API, "ApiCastFeedIncludeReason")))
check("ApiUserQuality members", 7, len(union_members(API, "ApiUserQuality")),
      "not a 3-tier ladder; a wrong assumption once")
check(
    "muted keyword scope properties",
    3,
    len(re.findall(r"^\s+\w+:", block(API, r"^export type ApiMutedKeywordProperties = \{"), re.M)),
)
check("ApiDefaultFeedPreference choices", 2, len(union_members(API, "ApiDefaultFeedPreference")))

# The three claims that have been wrong before, stated precisely.
check(
    "SourceLabel exists on both platforms",
    2,
    len([p for p in ("apps/farcaster-mobile/src/components/casts/SourceLabel.tsx",
                     "apps/farcaster-web/src/components/casts/SourceLabel.tsx")
         if (ROOT / p).is_file()]),
    "includeReason IS rendered — the audit once wrongly said never",
)
check(
    "  reasons SourceLabel gives copy for",
    8,
    len(re.findall(r"case '", read("apps/farcaster-mobile/src/components/casts/SourceLabel.tsx"))),
    "following-author + evergreen fall through to null",
)
check(
    "  SourceLabel has no press handler",
    0,
    sum(
        len(re.findall(r"onPress|Pressable|onClick", read(p)))
        for p in ("apps/farcaster-mobile/src/components/casts/SourceLabel.tsx",
                  "apps/farcaster-web/src/components/casts/SourceLabel.tsx")
    ),
    "a caption, not a control",
)
check(
    "meta.score plumbed into web cast context",
    2,
    len(re.findall(r"score: meta\?\.score", read("apps/farcaster-web/src/utils/castUtils.ts"))),
    "the audit once wrongly said zero references",
)
check(
    "  consumers of context.score",
    ["apps/farcaster-web/src/pages/adminFeedsComparison/AdminFeedContent.tsx"],
    grep_files(r"context\.score", "apps"),
    "admin-only; no user-facing component reads it",
)
check("meta.authorQuality read outside types", [], grep_files(r"meta\??\.authorQuality", "apps"))

check(
    "restart-required toast",
    1,
    read("apps/farcaster-mobile/src/screens/Feeds/FeedsScreen.tsx").count(
        "Restart your app to see your updated default feed"
    ),
)
check("feed row gestures disabled", 1,
      read("apps/farcaster-mobile/src/screens/Feed/Feed.tsx").count("swipeEnabled={false}"))
check("bottom tabs", 5,
      read("apps/farcaster-mobile/src/navigation/BottomTabNavigator.tsx").count("BottomTab.Screen"))
check("user-defined feed sources", 0,
      len(grep_files(r"kind: 'list'|savedSearch|userDefinedFeed", "apps")))

# --- docs/integration/wiring-into-a-fork.md ---------------------------------
seam_path = "packages/farcaster-client-hooks/src/hooks/data/queries/feedItems/useMixedFeedItems.ts"
seam_src = read(seam_path)
seam_line = next(
    (i + 1 for i, l in enumerate(seam_src.split("\n")) if "const flatItems = useMemo" in l), 0
)
check("seam: flatItems memo line", 311, seam_line, seam_path)
check(
    "getTheme is a pure name->tokens function",
    1,
    read("packages/farcaster-expo/src/theme/index.ts").count(
        "export const getTheme = (scheme: AppThemeName)"
    ),
)
check("FeedItemType.Cast discriminant exists", 1,
      len(re.findall(r"^\s+Cast,", read("packages/farcaster-client-hooks/src/types.ts"), re.M)))

# --- docs/operations/running-the-client.md ----------------------------------
placeholder_files = grep_files("REPLACE_ME", suffixes=())
check("files containing REPLACE_ME", 17, len(placeholder_files))
check("REPLACE_ME occurrences", 47, grep_count("REPLACE_ME", suffixes=()))
check(
    "EXPO_PUBLIC_* variables",
    ["EXPO_PUBLIC_DISABLE_APPSTORE_PROMPT",
     "EXPO_PUBLIC_DISABLE_NOTIFICATION_PROMPT",
     "EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN"],
    sorted(set(re.findall(r"EXPO_PUBLIC_[A-Z0-9_]+", "".join(
        f.read_text(errors="replace") for f in walk("apps", "packages", suffixes=(".ts", ".tsx", ".json", ".cjs"))
    )))),
)
check("mobile API host hardcoded to prod", 1,
      read("apps/farcaster-mobile/src/constants/Api.ts").count("const forceProdApi = true"))
check(
    "web API host",
    1,
    len(
        re.findall(
            # The assignment, not the doc comment above it that also names the host.
            r"baseApiHost = .*'farcaster\.xyz/~api'",
            read("apps/farcaster-web/src/constants/api.ts"),
        )
    ),
)
check("App Check attestation is mobile-only",
      ["apps/farcaster-mobile/src/services/MobileClientIntegrityService.ts"],
      grep_files(r"X-Firebase-AppCheck", "apps", "packages"))
check("bearer auth on the api client", 1,
      read("packages/farcaster-client-data/src/client/AbstractFarcasterApiClient.ts").count(
          "Bearer ${token.secret}"))
check("pinned Node", "20.19.5", read(".node-version").strip().lstrip("v"))
check("root postinstall runs pnpm-sync", 1, read("package.json").count("pnpm-sync prepare"))
check("no public backend (sync-api reads ../backend)", 1,
      read("Makefile").count("BACKEND_PATH ?= ../backend"))

# --- report -----------------------------------------------------------------
rev = subprocess.run(
    ["git", "-C", str(ROOT), "rev-parse", "--short", "HEAD"],
    capture_output=True, text=True,
).stdout.strip() or "unknown"

print(f"Claims audit against farcasterxyz/client @ {rev}\n")
failures = 0
for ok, label, expected, actual in RESULTS:
    if ok:
        shown = actual if not isinstance(actual, list) else f"{len(actual)} match(es)"
        print(f"  ok    {label:<58} {shown}")
    else:
        failures += 1
        print(f"  FAIL  {label:<58} expected {expected!r}, got {actual!r}")

print()
if failures:
    print(f"{failures} of {len(RESULTS)} claims no longer hold. Update the docs before relying on them.")
    sys.exit(1)
print(f"All {len(RESULTS)} claims hold against this snapshot.")
