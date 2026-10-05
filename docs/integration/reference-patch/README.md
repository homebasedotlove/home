# The integration, as it was actually applied

Not a description. `seam-and-chip.patch` is the diff of a real integration of
Home into a `farcasterxyz/client` checkout at snapshot `b6922e2`: fifteen
files, applied, typechecked, built and tested there. Reproduce it with:

```bash
cp -r /path/to/home/packages/{home-personalization,farcaster-adapter,home-client-core} \
      /path/to/client/packages/
cd /path/to/client
git apply /path/to/home/docs/integration/reference-patch/seam-and-chip.patch
corepack pnpm install --no-frozen-lockfile
corepack pnpm --filter './packages/**' build
corepack pnpm --filter farcaster-client-hooks exec vitest run \
  src/hooks/data/queries/feedItems/__tests__/homePersonalize.test.ts
corepack pnpm --filter farcaster-web exec vitest run \
  src/components/casts/__tests__ src/components/feeds/__tests__
corepack pnpm --filter farcaster-web typecheck
corepack pnpm --filter farcaster-web build
```

The patch carries the two `package.json` changes (the kernel and the adapter
as `workspace:*` dependencies of `farcaster-client-hooks` and
`farcaster-web`), so nothing is edited by hand.

## What the patch contains

| | |
| --- | --- |
| `HomePreferencesProvider.tsx` | The reader's preferences for the whole app: one document over the platform's `KVStore`, every change one of the kernel's pure actions. Also the feed scope a why-chip reads, and `useHomeAdjust`, which is what Less / None / More call. Lives in `farcaster-client-hooks` so mobile can mount it over MMKV. |
| `homePersonalize.ts` | The seam as one function: a page and the reader's spec in, the personalised page with receipts, mix and hidden count out. No spec, no change. |
| `useFeedItems.ts` | Both flatten sites call it with the spec the provider holds for that feed key. |
| `HomeWhyChip.tsx` | The chip and its sheet, wired through the feed scope. Outside a feed it explains and offers no controls. Group colours use the client's light and dark tokens. |
| `HomeHiddenRow.tsx` | "N casts hidden on this page." and the ledger: one row per rule, each with the button that reverses it through `undoDrop`. |
| `HomeFeedPageContent.tsx` | Provides the `'home'` scope and mounts the row above the list. |
| `UnfocusedCast.tsx` | Two lines: destructure `includeReason` and `score`, render the chip in the top hat's slot. Unchanged since the first integration. |
| `App.tsx`, `homePreferencesStore.ts` | Mount the provider over `localStorage`, every call guarded. |
| three test files | Thirteen assertions in the client's own vitest and jsdom: the seam helper, the chip writing to preferences, the row's undo. |

## What this measured

- The web app typechecks with the patch applied (`tsc --noEmit`, zero errors)
  and builds. The `UnfocusedCast` chunk is 270.65 kB with the provider, the
  chip and the row in it, against 268.84 kB upstream.
- In the production stylesheet, every chip group has a colour in both themes:
  green, blue and purple for direct, network and discovery, grey for promoted.
  Before, six of ten chips rendered in plain text colour.
- Each of the three client-side suites fails when its fix is removed: the chip
  cut off from the feed scope, the undo button doing nothing, the seam ignoring
  the spec.
- Home's packages compile under the client's TypeScript, which is version 7 via
  its `@typescript/native` override, not the 5.9 they were written against.

## What it does not include

Feed tabs from FeedSpecs, the feed editor, the share-link route, settings, the
session provider and the theme bridge. The client core's source resolution,
boundaries and affinity are still unconnected to the client: on web the
client's own hook owns fetching, so the provider holds the document and nothing
else. The chip's sheet is a positioned div rather than the client's sheet
primitive. Nothing here touches the mobile app, which keeps upstream behaviour
until it mounts the provider.
