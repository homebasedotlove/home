# Wiring the kernel into a fork

Three packages sit between a fork and the reader:

| | |
| --- | --- |
| [`home-personalization`](../../packages/home-personalization) | The kernel. No React, no API client, no storage engine. |
| [`farcaster-adapter`](../../packages/farcaster-adapter) | The type boundary, and the replacement for the feed `flatMap`. |
| [`home-client-core`](../../packages/home-client-core) | Everything between storage and the screen, with no screen. |

They are already wired to each other. This is the list of places a fork of
[`farcasterxyz/client`](https://github.com/farcasterxyz/client) has to touch to
connect them to a running app. Paths and line numbers are against snapshot
`b6922e2`; they will drift, but the shapes will not.

There are six call sites. None of them require backend changes.

## Before anything else: does it still fit?

```bash
SNAPSHOT=../client pnpm verify:compat
```

This compiles the adapter against the snapshot's own generated `api.ts` and
asserts the shape of all 34 fields it reads, plus exact equality on the two
enumerations Home mirrors — the author-quality tiers and the ranking reasons.
If upstream renamed something, this names it before you start.

`pnpm verify:compat:drift` then mutates upstream eleven ways and fails if any
goes undetected, because a compatibility check that cannot fail is worse than
no check. Both run in CI.

---

## 0. Add the packages

```yaml
# pnpm-workspace.yaml — the client already globs packages/*
packages:
  - packages/*
  - apps/*
```

Copy all three in and add `"home-client-core": "workspace:*"` to the mobile and
web app manifests. They pin the same Node the client does (20.19.5), use the
client's prettier config and tsconfig shape, and have no runtime dependencies
between them and the outside world.

---

## 1. The adapter — already written

`farcaster-adapter` maps `ApiCastFeedItem` onto the kernel's `FeedItemView`,
including the three fields the reference client receives and never reads:
`meta.includeReason`, `meta.score`, `meta.authorQuality`. It also classifies
embeds by what they *are* rather than which array they arrived in, so a URL
embed carrying a token payload is a token post to a reader muting token charts.

Nothing to write. The only thing worth knowing is that it declares the API
slice it reads locally (`src/apiShapes.ts`) rather than importing
`farcaster-client-data`, so it builds and tests anywhere — and that
`verify:compat` is what stops that local copy from drifting.

---

## 2. The feed pipeline — the one important change

**`packages/farcaster-client-hooks/src/hooks/data/queries/feedItems/useMixedFeedItems.ts:311`**

The reference client flattens pages into a render list with a plain `flatMap`.
That memo is the seam. Replace it with `personalizeMixedFeed`:

```ts
import { personalizeMixedFeed } from 'farcaster-adapter';

const personalized = useMemo(() => {
  const raw = data?.pages.flatMap(/* unchanged */) ?? [];
  return personalizeMixedFeed(raw, {
    isCast: (row) => row.type === FeedItemType.Cast,
    getCast: (row) => row.item,
    spec,
    context: { now: Date.now(), affinity },
  });
}, [data, spec, affinity]);
```

It returns `{ items, receipts, mix, hiddenCount }`, where `items` are the
**original row objects** — the components downstream keep receiving the API
types they already know how to draw.

Three behaviours it already handles, each of which is a bug if you write it
yourself:

- **Interstitials keep their place.** Suggested-user and trending-topic rows
  have no author, timestamp or reason. They are pinned to the *fraction* of the
  list they occupied, so a row a quarter of the way down stays a quarter of the
  way down after a re-rank that removed half the casts. Anchoring to the
  absolute index pushes every interstitial to the end of a filtered feed.
- **Deleted casts never reach the pipeline**, and do not count as filtered — a
  deleted cast is not something the reader hid.
- **`receipts` and `mix` are the UI.** They are what the feed receipts line and
  the mix dial render; thread them out of the hook.

`runFeedPipeline` underneath is pure and synchronous, so the same call powers
the feed editor's live preview over a cached page. One code path, no second
implementation.

## 3. The theme provider

**`packages/farcaster-expo/src/theme/index.ts:44`** —
`getTheme(scheme: AppThemeName)` is already a pure function from a name to a
token set. Widen the input:

```ts
export const getTheme = (input: AppThemeName | DerivedTheme) => {
  const derived = typeof input === 'string' ? deriveTheme(presetFor(input)) : input;
  const colors = colorsFromDerived(derived);   // the adapter below
  return { ...tw, dark: derived.mode === 'dark', colors, /* unchanged */ };
};
```

The work is `colorsFromDerived`: mapping ~10 derived roles onto the 797 tokens
in `colors.ts`. Most of them collapse — dozens of `bg*` tokens resolve to
`background.default`, `elevated`, or `sunken`. Do it once, mechanically, and
keep the existing light/dark sets as the fallback while it is in progress.

Then **`apps/farcaster-mobile/src/hooks/useAppThemeName.ts`** reads the active
seed from preferences instead of a four-value union, and
**`components/settings/ThemeSettings.tsx`** becomes the seed editor.

The contrast enforcement in
[`deriveTheme`](../../packages/home-personalization/src/theme/index.ts) is what makes
this safe to expose. Without it, opening the palette to readers ships
unreadable themes.

---

## 4. Preferences storage

**`apps/farcaster-mobile/src/hooks/useAppThemeName.ts`** already shows the
pattern — `useMMKVString` for reactive local state. Wrap MMKV in the kernel's
`KVStore`:

```ts
import { MMKV } from 'react-native-mmkv';
const mmkv = new MMKV();
export const store: KVStore = {
  getString: (k) => mmkv.getString(k),
  setString: (k, v) => mmkv.set(k, v),
  remove: (k) => mmkv.delete(k),
};
```

On web, the same three methods over `localStorage`. Keep it **synchronous**:
preferences are read during the first render of the feed, and an async read there
means a frame of the wrong theme on every cold start.

`HomeClient` from `home-client-core` already holds the document, persists on
change, and exposes `update(fn)` taking any of the pure actions from
`home-personalization/prefs/actions`. A `PreferencesProvider` is a thin React
wrapper over it:

```ts
// The entire path from tapping "Less" on a why-chip to a changed feed.
client.update((p) => nudgeReason(p, feedId, 'discovery', 'down'));
```

Because it is local state, changes apply on the next frame — which is what
retires *["Restart your app to see your updated default
feed!"](../research/reference-client-audit.md#3-changing-your-default-feed-asks-you-to-restart-the-app)*.

Server preferences stay authoritative for what the server owns: notifications,
blocks, account settings. The kernel document owns presentation and ranking.
Don't merge them — the split is clean because the server does not need to know
how a reader sorts their own feed.

---

## 5. Feed tabs from FeedSpecs

**`apps/farcaster-mobile/src/components/HomeFeedPagers/Pagers.tsx:38–82`**
hard-codes `HOME_FEED` and `FOLLOWING_FEED` and appends favourited channels.
Replace with `preferences.feedOrder.map(id => feedsById[id])`.

`Feed.tsx` then takes a `FeedSpec` rather than a `feedKey`/`feedType` pair, and
resolves the fetch from `spec.source`:

| `source.kind` | Fetch |
| --- | --- |
| `home`, `following` | `useMixedFeedItems({ feedKey: kind, feedType: 'default' })` — unchanged |
| `channel` | same hook, `feedKey: channelKey` |
| `search` | `searchCasts({ q: source.query })`, paged |
| `list` | fan out over the list's fids, or one search, then merge |
| `blend` | fetch each part, interleave at normalised weights, then one pipeline pass |

Only `search`, `list`, and `blend` need new fetch code, and all three use
endpoints that already exist.

---

## 6. Boundaries

Forward the platform's AppState transitions to `client.foreground()` and
`client.background()`; everything else is done. `renderFeed()` returns a
`boundary` whose `desaturation` drives a saturation matrix over the root view
and whose `status` drives the end-of-feed component.

For catch-up, call `client.markRead(timestampMs)` from the existing
`setFeedSeen` / viewability plumbing in `Feed.tsx`. `renderFeed()` then reports
`caughtUp` and `moreAvailable` separately, because *"you're caught up"* and
*"that's everything since Tuesday, there's more below"* are different sentences
to show someone.

---

## Suggested order

1. **Adapter + why-chip.** One render change, no new state. Proves the reason
   data is real and immediately makes the client feel different.
2. **Preferences provider.** Everything else depends on it.
3. **Pipeline at the seam.** Unlocks Sift and Sort at once.
4. **Receipts.** Ships with the pipeline or the filters are untrustworthy.
5. **Theme seeds.** Largest mechanical change; entirely parallelisable.
6. **Feed tabs from specs, then share links.**
7. **Boundaries.**

Steps 1–4 are the product. Everything after is depth.

## Seeing it work before you touch the app

```bash
pnpm --filter home-client-core demo
```

Drives the client core through the whole journey — cold start, tapping a
why-chip, a mute expiring after a week, a session budget winding down, catch-up
ending the feed, a config moving to a new device, a feed encoded as a link — and
prints the feed at each step. Every claim in `docs/design` is observable there
without a simulator, an API key, or a phone.

## Testing across the seam

204 tests across the three packages, all in `vitest run`, none needing a
simulator:

| | |
| --- | --- |
| `home-personalization` | 162 — the pipeline, themes, boundaries, preferences |
| `farcaster-adapter` | 21 — adaptation, embed classification, the seam |
| `home-client-core` | 21 — the end-to-end journey above, asserted |

Keep it that way. When a ranking or filtering bug appears it should be
reproducible as a fixture in that suite, not as a tap sequence on a phone. The
React layer added in the steps above should contain nothing but rendering.
