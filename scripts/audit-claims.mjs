#!/usr/bin/env node
/**
 * Re-verify every factual claim the docs make about farcasterxyz/client.
 *
 * The audit and the design argue from specific numbers — 117 of 149 preference
 * fields, 797 colour tokens, 47 placeholders, a seam at a named line. Upstream
 * replaces the snapshot wholesale on every update, so those numbers rot
 * silently and the argument quietly stops being true. This fails loudly
 * instead, and names the claim that moved.
 *
 *   SNAPSHOT=/path/to/client node scripts/audit-claims.mjs
 *
 * Plain Node, no dependencies, no compile step: the client's own bin scripts
 * are JavaScript run directly, and a second language runtime for one script
 * was the wrong trade.
 *
 * Three claims in this file have already been wrong once. Each is now
 * expressed as precisely as the code allows, with the correction recorded next
 * to it, so a future reader can see what the trap was:
 *
 *   - includeReason is NOT analytics-only; SourceLabel renders eight of ten
 *     reasons in a menu, and IncludeReasonTopHat renders two on the row.
 *     Neither has a press handler.
 *   - meta.score is NOT unreferenced; it is plumbed into the web cast context
 *     and rendered on one internal admin page, never in the user-facing feed.
 *   - ApiUserQuality is seven values, not a three-tier ladder.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'lib',
  'build',
  'Pods',
  '.expo',
]);

function findSnapshot() {
  const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const candidates = [
    process.env.SNAPSHOT,
    join(here, 'packages/farcaster-adapter/.snapshot'),
    join(here, '../client'),
    join(here, '../farcasterxyz/client'),
    join(here, '../../client'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(join(c, 'packages/farcaster-client-data/src/types/api.ts'))) {
      return resolve(c);
    }
  }
  console.error(
    'error: no client checkout found; set SNAPSHOT=/path/to/client',
  );
  process.exit(1);
}

const ROOT = findSnapshot();

/** Source files only. node_modules once made this take five minutes. */
function* walk(subdirs, suffixes = ['.ts', '.tsx']) {
  const roots = subdirs.length ? subdirs.map((s) => resolve(ROOT, s)) : [ROOT];
  const stack = roots.filter((r) => existsSync(r));
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name)) stack.push(full);
      } else if (!suffixes.length || suffixes.some((s) => name.endsWith(s))) {
        yield full;
      }
    }
  }
}

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** The lines from a `start` match through the next `end` match. */
function block(text, start, end = /^\};/) {
  const lines = text.split('\n');
  const s = lines.findIndex((l) => start.test(l));
  if (s === -1) throw new Error(`block start not found: ${start}`);
  const e = lines.findIndex((l, i) => i > s && end.test(l));
  if (e === -1) throw new Error(`block end not found after: ${start}`);
  return lines.slice(s, e + 1).join('\n');
}

/** Members of `export type Name = | a | b;` or `= a | b;`. */
function unionMembers(text, name) {
  const multi = new RegExp(
    `^export type ${name} =\\n((?:\\s+\\|.*\\n)+)`,
    'm',
  );
  let m = text.match(multi);
  if (m) {
    return m[1]
      .split('\n')
      .map((l) => l.trim().replace(/^\|\s*/, ''))
      .filter(Boolean);
  }
  const single = new RegExp(`^export type ${name} =([^;]*);`, 'ms');
  m = text.match(single);
  return m ? m[1].split('|').map((p) => p.trim()).filter(Boolean) : [];
}

function grepFiles(pattern, subdirs, suffixes) {
  const hits = [];
  for (const f of walk(subdirs, suffixes)) {
    if (pattern.test(readFileSync(f, 'utf8'))) hits.push(relative(ROOT, f));
  }
  return hits.sort();
}

function grepCount(pattern, subdirs, suffixes) {
  const rx = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  let n = 0;
  for (const f of walk(subdirs, suffixes)) {
    n += (readFileSync(f, 'utf8').match(rx) ?? []).length;
  }
  return n;
}

const count = (text, rx) => (text.match(rx) ?? []).length;

const results = [];
const check = (label, expected, actual, note = '') => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  results.push({ ok, label: note ? `${label}  (${note})` : label, expected, actual });
};

const API = read('packages/farcaster-client-data/src/types/api.ts');

// --- docs/research/reference-client-audit.md --------------------------------
const prefs = block(API, /^export type ApiUserPreferences = \{/);
check('ApiUserPreferences fields', 149, count(prefs, /^\s+\w+\??:/gm));
check(
  '  of which notification/email toggles',
  117,
  count(prefs, /^\s+(?:send|email|push|inApp)/gm),
);
check(
  'colour tokens in theme/colors.ts',
  797,
  count(read('packages/farcaster-expo/src/theme/colors.ts'), /^\s+\w+:/gm),
);
check(
  'AppThemeName variants',
  4,
  unionMembers(
    read('packages/farcaster-expo/src/theme/AppThemeNames.ts'),
    'AppThemeName',
  ).length,
);
check(
  'ApiCastFeedIncludeReason members',
  10,
  unionMembers(API, 'ApiCastFeedIncludeReason').length,
);
check(
  'ApiUserQuality members',
  7,
  unionMembers(API, 'ApiUserQuality').length,
  'not a 3-tier ladder; a wrong assumption once',
);
check(
  'muted keyword scope properties',
  3,
  count(block(API, /^export type ApiMutedKeywordProperties = \{/), /^\s+\w+:/gm),
);
check(
  'ApiDefaultFeedPreference choices',
  2,
  unionMembers(API, 'ApiDefaultFeedPreference').length,
);

// The three claims that have been wrong before, stated precisely.
const sourceLabels = [
  'apps/farcaster-mobile/src/components/casts/SourceLabel.tsx',
  'apps/farcaster-web/src/components/casts/SourceLabel.tsx',
];
check(
  'SourceLabel exists on both platforms',
  2,
  sourceLabels.filter((p) => existsSync(join(ROOT, p))).length,
  'includeReason IS rendered — the audit once wrongly said never',
);
check(
  '  reasons SourceLabel gives copy for',
  8,
  count(read(sourceLabels[0]), /case '/g),
  'following-author + evergreen fall through to null',
);
check(
  '  SourceLabel has no press handler',
  0,
  sourceLabels.reduce((n, p) => n + count(read(p), /onPress|Pressable|onClick/g), 0),
  'a caption, not a control',
);
check(
  'IncludeReasonTopHat reasons on the web row',
  2,
  // Distinct reason strings, not occurrences: one of them appears twice.
  new Set(
    read('apps/farcaster-web/src/components/casts/IncludeReasonTopHat.tsx').match(
      /'(?:evergreen-following-author|high-quality-unfollowed)'/g,
    ) ?? [],
  ).size,
  'two of ten, passive',
);
check(
  'meta.score plumbed into web cast context',
  2,
  count(read('apps/farcaster-web/src/utils/castUtils.ts'), /score: meta\?\.score/g),
  'the audit once wrongly said zero references',
);
check(
  '  consumers of context.score',
  ['apps/farcaster-web/src/pages/adminFeedsComparison/AdminFeedContent.tsx'],
  grepFiles(/context\.score/, ['apps']),
  'admin-only; no user-facing component reads it',
);
check(
  'meta.authorQuality read outside types',
  [],
  grepFiles(/meta\??\.authorQuality/, ['apps']),
);

check(
  'restart-required toast',
  1,
  count(
    read('apps/farcaster-mobile/src/screens/Feeds/FeedsScreen.tsx'),
    /Restart your app to see your updated default feed/g,
  ),
);
check(
  'feed row gestures disabled',
  1,
  count(read('apps/farcaster-mobile/src/screens/Feed/Feed.tsx'), /swipeEnabled=\{false\}/g),
);
check(
  'bottom tabs',
  5,
  count(read('apps/farcaster-mobile/src/navigation/BottomTabNavigator.tsx'), /BottomTab\.Screen/g),
);
check(
  'user-defined feed sources',
  0,
  grepFiles(/kind: 'list'|savedSearch|userDefinedFeed/, ['apps']).length,
);

// --- docs/integration/wiring-into-a-fork.md ---------------------------------
const mobileSeam =
  'packages/farcaster-client-hooks/src/hooks/data/queries/feedItems/useMixedFeedItems.ts';
const webSeam =
  'packages/farcaster-client-hooks/src/hooks/data/queries/feedItems/useFeedItems.ts';
const lineOf = (text, needle) =>
  text.split('\n').findIndex((l) => l.includes(needle)) + 1;
const linesOf = (text, needle) =>
  text
    .split('\n')
    .map((l, i) => (l.includes(needle) ? i + 1 : 0))
    .filter(Boolean);

check('mobile seam: flatItems memo line', 311, lineOf(read(mobileSeam), 'const flatItems = useMemo'), mobileSeam);
check(
  'web seam: flatten sites',
  [332, 643],
  linesOf(read(webSeam), "lastUniqBy('id')(flatItems)"),
  webSeam,
);
check(
  'getTheme is a pure name->tokens function',
  1,
  count(
    read('packages/farcaster-expo/src/theme/index.ts'),
    /export const getTheme = \(scheme: AppThemeName\)/g,
  ),
);
check(
  'FeedItemType.Cast discriminant exists',
  1,
  count(read('packages/farcaster-client-hooks/src/types.ts'), /^\s+Cast,/gm),
);

// --- docs/operations/running-the-client.md ----------------------------------
check('files containing REPLACE_ME', 17, grepFiles(/REPLACE_ME/, [], []).length);
check('REPLACE_ME occurrences', 47, grepCount(/REPLACE_ME/, [], []));
check(
  'EXPO_PUBLIC_* variables',
  [
    'EXPO_PUBLIC_DISABLE_APPSTORE_PROMPT',
    'EXPO_PUBLIC_DISABLE_NOTIFICATION_PROMPT',
    'EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN',
  ],
  [
    ...new Set(
      [...walk(['apps', 'packages'], ['.ts', '.tsx', '.json', '.cjs'])].flatMap(
        (f) => readFileSync(f, 'utf8').match(/EXPO_PUBLIC_[A-Z0-9_]+/g) ?? [],
      ),
    ),
  ].sort(),
);
check(
  'mobile API host hardcoded to prod',
  1,
  count(read('apps/farcaster-mobile/src/constants/Api.ts'), /const forceProdApi = true/g),
);
check(
  'web API host',
  1,
  // The assignment, not the doc comment above it that also names the host.
  count(read('apps/farcaster-web/src/constants/api.ts'), /baseApiHost = .*'farcaster\.xyz\/~api'/g),
);
check(
  'App Check attestation is mobile-only',
  ['apps/farcaster-mobile/src/services/MobileClientIntegrityService.ts'],
  grepFiles(/X-Firebase-AppCheck/, ['apps', 'packages']),
);
check(
  'bearer auth on the api client',
  1,
  count(
    read('packages/farcaster-client-data/src/client/AbstractFarcasterApiClient.ts'),
    /Bearer \$\{token\.secret\}/g,
  ),
);
check('pinned Node', '20.19.5', read('.node-version').trim().replace(/^v/, ''));
check('root postinstall runs pnpm-sync', 1, count(read('package.json'), /pnpm-sync prepare/g));
check(
  'no public backend (sync-api reads ../backend)',
  1,
  count(read('Makefile'), /BACKEND_PATH \?= \.\.\/backend/g),
);

// --- Home's own docs must not resurrect a retracted claim -------------------
// The corrections in the header are pinned against the snapshot above. This
// pins the prose against them: the design artifact kept the retracted wording
// for two commits after the audit changed, and nothing here noticed.
const HOME = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RETRACTED = [
  /shows the reader nothing/,
  /all of them attaching it to a tracking payload/,
  /It is not on the cast\./,
  /meta\.score\S* and \S*meta\.authorQuality[^.]*\bzero\b/,
  /drops it on the floor/,
  /ranking reasons sent, none shown/,
];
const resurrected = [];
for (const f of [
  resolve(HOME, 'README.md'),
  ...walk([resolve(HOME, 'docs')], ['.md', '.html']),
]) {
  const text = readFileSync(f, 'utf8');
  for (const rx of RETRACTED) {
    if (rx.test(text)) resurrected.push(`${relative(HOME, f)}: ${rx.source}`);
  }
}
check('retracted claims resurrected in Home docs', [], resurrected);

// --- report -----------------------------------------------------------------
let rev = 'unknown';
try {
  rev = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
} catch {
  /* not a git checkout; fine */
}

console.log(`Claims audit against farcasterxyz/client @ ${rev}\n`);
let failures = 0;
for (const { ok, label, expected, actual } of results) {
  if (ok) {
    const shown = Array.isArray(actual) ? `${actual.length} match(es)` : actual;
    console.log(`  ok    ${label.padEnd(58)} ${shown}`);
  } else {
    failures++;
    console.log(
      `  FAIL  ${label.padEnd(58)} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
console.log();
if (failures) {
  console.log(
    `${failures} of ${results.length} claims no longer hold. Update the docs before relying on them.`,
  );
  process.exit(1);
}
console.log(`All ${results.length} claims hold against this snapshot.`);
