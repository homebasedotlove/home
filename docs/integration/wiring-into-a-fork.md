# Wiring the kernel into a fork

[`packages/personalization`](../../packages/personalization) is deliberately
inert: no React, no React Native, no API client, no storage engine. This is the
list of places a fork of
[`farcasterxyz/client`](https://github.com/farcasterxyz/client) has to touch to
make it do something. Paths and line numbers are against snapshot `b6922e2`;
they will drift, but the shapes will not.

There are six call sites. None of them require backend changes.

---

## 0. Add the package

```yaml
# pnpm-workspace.yaml — the client already globs packages/*
packages:
  - packages/*
  - apps/*
```

Copy `packages/personalization` in and add `"@home/personalization":
"workspace:*"` to the mobile and web app manifests. It has no dependencies, so
there is nothing else to resolve.

---

## 1. The adapter — `ApiCastFeedItem` → `FeedItemView`

**New file**, roughly forty lines. The only place that knows about both type
systems, which is what keeps the rest of the kernel portable.

```ts
import type { ApiCastFeedItem } from 'farcaster-client-data';
import type { FeedItemView } from '@home/personalization';

export function toFeedItemView(item: ApiCastFeedItem): FeedItemView {
  const cast = item.cast;
  const view: FeedItemView = {
    id: item.id,
    timestampMs: item.timestamp,
    authorFid: cast.author.fid,
    text: cast.text ?? '',
    isRecast: Boolean(cast.recast),
    isReply: Boolean(cast.parentHash),
    embedKinds: classifyEmbeds(cast),
    engagement: {
      likes: cast.reactions?.count ?? 0,
      recasts: cast.recasts?.count ?? 0,
      replies: cast.replies?.count ?? 0,
    },
  };
  if (cast.channel?.key) view.channelKey = cast.channel.key;
  // The three fields the reference client receives and never reads.
  if (item.meta?.includeReason) view.reason = item.meta.includeReason.type;
  if (item.meta?.score !== undefined) view.score = item.meta.score;
  if (item.meta?.authorQuality) view.authorQuality = item.meta.authorQuality;
  return view;
}
```

Verify the field names against the current snapshot's `ApiCast` before relying
on them — the meta block is stable but the cast shape is not.

---

## 2. The feed pipeline — the one important change

**`packages/farcaster-client-hooks/src/hooks/data/queries/feedItems/useMixedFeedItems.ts:311`**

The reference client flattens pages into a render list with a plain `flatMap`:

```ts
const flatItems = useMemo(
  () => data?.pages.flatMap((page) => [ ...page.result.items.map(...) ]),
  [data],
);
```

That memo is the seam. Everything in the
[Sift and Sort axes](../design/the-six-axes.md) happens by running the kernel
over the result:

```ts
const flatItems = useMemo(() => {
  const raw = data?.pages.flatMap(/* unchanged */) ?? [];
  const casts = raw.filter(isCastItem);
  const { items, receipts, mix } = runFeedPipeline(
    casts.map((c) => toFeedItemView(c.item)),
    spec,
    { now: Date.now(), affinity },
  );
  const byId = new Map(casts.map((c) => [c.item.id, c]));
  return {
    items: items.map((v) => byId.get(v.id)!),          // back to render items
    interstitials: raw.filter((r) => !isCastItem(r)),  // suggestions, topics
    receipts,
    mix,
  };
}, [data, spec, affinity]);
```

Three notes:

- **Map back to the original render items.** `FeedItemView` is for deciding;
  the existing components should keep receiving the API types they already know.
- **Keep interstitials out of the pipeline.** Suggested-user and
  trending-topic rows are not casts and should not be ranked as if they were;
  reinsert them at their original positions.
- **`receipts` and `mix` are the UI.** Thread them out of the hook — they are
  what [feed receipts and the mix dial](../design/signature-interactions.md)
  render.

`runFeedPipeline` is pure and synchronous, so it is also what the feed editor's
live preview calls on the cached page. Same code path, no second implementation.

---

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
[`deriveTheme`](../../packages/personalization/src/theme/index.ts) is what makes
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

A `PreferencesProvider` holds the document in context and writes through on
change. Because it is local state, changes apply on the next frame — which is
what retires *["Restart your app to see your updated default
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

A `SessionProvider` accumulating foreground time, feeding
[`evaluateBoundaries`](../../packages/personalization/src/boundaries/index.ts)
on a slow interval. `state.desaturation` drives a saturation matrix over the
root view; `state.status` drives the end-of-feed component.

For catch-up, persist the newest `timestampMs` the reader has actually seen —
the existing `setFeedSeen` / viewability plumbing in `Feed.tsx` already tracks
this — and pass it to `applyCatchUp` before rendering.

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

## Testing across the seam

The kernel has [88 tests](../../packages/personalization/test) that run in
`node --test` with no dependencies and no simulator. Keep it that way: when a
ranking or filtering bug appears, it should be reproducible as a fixture in that
suite rather than as a tap sequence on a phone. The adapter in step 1 is the
only file that should ever need the app's test harness.
