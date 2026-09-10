# The integration, as it was actually applied

Not a description. These are the files from a real integration of Home into a
`farcasterxyz/client` checkout at snapshot `b6922e2`, which built and was
tested. Reproduce it with:

```bash
cp -r /path/to/home/packages/{home-personalization,farcaster-adapter,home-client-core} \
      /path/to/client/packages/
cd /path/to/client
git apply /path/to/home/docs/integration/reference-patch/seam-and-chip.patch
cp /path/to/home/docs/integration/reference-patch/HomeWhyChip.tsx \
   apps/farcaster-web/src/components/casts/
cp /path/to/home/docs/integration/reference-patch/HomeWhyChip.test.tsx \
   apps/farcaster-web/src/components/casts/__tests__/
corepack pnpm install --no-frozen-lockfile
corepack pnpm --filter './packages/**' build
corepack pnpm --filter farcaster-web exec vitest run src/components/casts/__tests__
corepack pnpm --filter farcaster-web build
```

You will also need `"home-personalization"` and `"farcaster-adapter"` as
`workspace:*` dependencies of `farcaster-client-hooks`, and
`"home-client-core"` of `farcaster-web`.

## What the patch contains

| | |
| --- | --- |
| `useFeedItems.ts` | The seam. Both flatten sites, at `:332` and `:646`. |
| `UnfocusedCast.tsx` | Two lines: destructure `includeReason` and `score` from the cast context, and render the chip in the same slot as the existing top hat. |
| `HomeWhyChip.tsx` | The chip and its sheet. 114 lines. |
| `HomeWhyChip.test.tsx` | Five assertions, run in the client's own vitest + jsdom. |

## The seam is not where the docs first said it was

`docs/integration/wiring-into-a-fork.md` named `useMixedFeedItems.ts:311`. That
is the **mobile** hook. The web app uses `useFeedItems`, which has *two*
flatten sites and hands back a plain `ApiCastFeedItem[]` with `suggestedUsers`
already separated — simpler than the mobile seam, since there are no
interstitials to preserve. Both are now documented.

## What this measured

- The web bundle grew from 268.84 kB to 272.12 kB on the `UnfocusedCast` chunk:
  the chip, the reason taxonomy and the whole pipeline, gzipped to about 1 kB.
- Home's packages compile under the client's TypeScript, which is version 7 via
  its `@typescript/native` override, not the 5.9 they were written against.

## What it does not include

A preferences provider. The patched seam uses a module-level `FeedSpec`
constant standing in for `preferences.feeds[activeFeedId]`, so the pipeline can
be proven before the settings UI exists. `onAdjust` on the chip is wired to
nothing here; in a fork it calls `client.update(p => nudgeReason(...))`.
