# The integration, as it was actually applied

Not a description. `seam-and-chip.patch` is the diff of a real integration of
Home into a `farcasterxyz/client` checkout at snapshot `b6922e2`: the seam,
the preferences provider, the chip, the hidden row, and the web app's
rebranding to Home, applied, typechecked, built and tested there. It carries
the icon set as binary hunks, so apply it with `git apply`, not `patch`.
Reproduce it with:

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
| three test files | Fourteen assertions in the client's own vitest and jsdom: the seam helper, the chip writing to preferences and closing like every other menu, the row's undo. |

## The rebrand

| | |
| --- | --- |
| `tailwind.config.js` | The dark end of the palette carries a hint of blue instead of going to black. Every dark grey keeps the client's own OKLab lightness and gains hue 268 (between the brand purple at 286 and the client's blue at 249) with chroma 0.045 at the darkest steps, tapering to nothing near white. Contrast ratios are unchanged to the second decimal. The purple is untouched. |
| `index.css`, `index.html`, `manifest.json` | The landing gradient ends in the same indigo; the title, theme colour, manifest name and description say Home. |
| `public/*.png` | The favicon, the app icons and the Open Graph card, rendered from the same mark the React component draws. |
| `HomeMark.tsx`, `FilledLogo.tsx`, `Logo.tsx` | The mark and wordmark. The client's two logo components keep their size API and draw the mark, so every place that used them is rebranded without being touched. |
| `HomeLandingPage.tsx` | Two ways in, a live preview of the chip in place of the marketing video, one honest sentence about accounts, and email login on phones, where the reference client offered nothing but a download link. |
| `LeftSideBarLogo.tsx`, `StandalonePage.tsx`, `DownloadPage.tsx` | The shell's mark without the brand-asset menu; the standalone header goes back to Home; the sign-up page says plainly that accounts are created in the Farcaster app. |
| `LoginMagicLinkWithInstructions.tsx` | A failed request no longer tells the reader their address is invalid. |

## What this measured

- The web app typechecks with the patch applied (`tsc --noEmit`, zero errors)
  and builds. The `UnfocusedCast` chunk is 268.94 kB with the provider, the
  chip and the row in it, against 268.84 kB upstream: the chip's sheet is the
  client's own popover, which the chunk already carried.
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
else. Nothing here touches the mobile app, which keeps upstream behaviour and
upstream branding until it mounts the provider; the runbook lists its renames.
