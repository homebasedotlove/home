# Validation

What has actually been executed, what it proved, and what it did not.

Everything below was run against `farcasterxyz/client` at snapshot `b6922e2`
on Linux. Nothing here is inferred from reading code.

---

## The chain

| # | Gate | Command | Result |
| --- | --- | --- | --- |
| 1 | Home's own suite | `pnpm test` | 229 tests |
| 2 | Types match upstream | `pnpm verify:compat` | 34 fields, 2 enumerations, exact |
| 3 | That check can fail | `pnpm verify:compat:drift` | 11/11 mutations caught |
| 4 | Docs match the snapshot | `python3 scripts/audit_claims.py` | 31/31 claims hold |
| 5 | Packages build in the fork | `tsc -p tsconfig.build.json` in the client | 3/3, under **TypeScript 7** |
| 6 | The app bundles with them | `pnpm --filter farcaster-web build` | ✓ in 1m 12s |
| 7 | The seam works on real artifacts | opt-in `integration.test.ts` | 7 assertions |
| 8 | The chip renders | client's own vitest + jsdom | 5 assertions |

Gates 5–8 are the ones that were missing before, and they are the ones that
matter: everything prior tests Home against Home.

## What gate 7 proves

`packages/farcaster-adapter/test/integration.test.ts` imports the **compiled
`dist` artifacts from inside the client checkout** — the same files Vite
bundles into the web app — and drives them with the exact `FeedSpec` patched
into that client's `useFeedItems.ts`, over data shaped like a real
`ApiGetFeedItems200Response`.

It asserts, on that real path:

- the promoted cast is removed, and the receipt names `muted-group` / `promoted`
- a followed author scored `0.10` leads over a popular cast scored `0.95`
- **but** a gentler 1.8× weight does *not* invert that ordering — weights nudge
  within the normalised band rather than overriding the server, the same cap
  that governs affinity
- items + receipts always account for the whole page
- the render list holds the **original API objects**, not adapted copies
- every surviving item keeps its `meta` intact for the chip
- the mix reports what is visible, with the muted group absent

It skips rather than fails without a built client checkout, so a contributor
without one still gets a green suite:

```bash
HOME_CLIENT=/path/to/client pnpm --filter farcaster-adapter test
```

## What gate 8 proves

`HomeWhyChip.test.tsx` runs in the **client's own** vitest, React and Testing
Library, in jsdom. It asserts the chip renders for all ten reasons the API can
send — including the two the upstream `SourceLabel` renders as `null` — labels
an unknown future reason rather than going silent, opens a sheet with the
explanation and the score, reports the group and direction to its caller, and
never offers to boost promoted content.

## Cost

The web bundle's `UnfocusedCast` chunk went from **268.84 kB to 272.12 kB** —
the chip, the reason taxonomy and the whole pipeline, roughly 1 kB gzipped.

---

## What is still unproven

Three things, stated plainly.

**The full authenticated app never booted against synthetic fixtures.** I got a
long way — seeded auth into localforage, intercepted every API call, watched it
reach `/v2/feed-items` — and then spent seven iterations shaping responses for
sidebar widgets. Each failure was in the shell, never in the feed and never in
Home's code: `TrendingTopics.tsx:77` reads `data.topics.length` behind a `!data`
guard that an empty object passes; `useFeatureFlag` reads
`enabledFeatureFlags.includes`; `ClankerSpotlight` reads `.news`. That is a
fixture-completeness problem, not an integration one, and gates 6–8 cover the
same ground more precisely. Booting the real shell needs a real API session.

**No request has ever reached the production API.** This sandbox's egress proxy
blocks `client.farcaster.xyz` and `farcaster.xyz`. Whether that API accepts a
fork's traffic — rate limits, App Check enforcement on mobile endpoints, terms
of use — is an operator's question, not a technical one this repository can
answer. It is the single largest remaining unknown, and it should be settled
before building further.

**Nothing has run on iOS.** The Simulator path needs macOS. The mobile seam
(`useMixedFeedItems.ts:311`) is documented and the adapter is platform-neutral,
but the mobile integration has not been executed the way the web one has.

## Defects this validation found

Working against the real client surfaced four things that reading could not:

1. **The demo CLI was in the library build.** `home-client-core` shipped
   `src/cli.ts`, which needs node globals; inside a fork whose install did not
   resolve `@types/node` for that package, the build failed. Now excluded.
2. **The docs named only the mobile seam.** The web app uses `useFeedItems`,
   with two sites. Corrected.
3. **`meta.score` is not unreferenced.** It is plumbed into the web cast
   context and rendered on one internal admin page. Third correction to that
   claim; the audit now pins it precisely so it cannot drift again.
4. **`IncludeReasonTopHat` renders reasons on the web feed row** — two of ten,
   passively. Together with `SourceLabel` in the kebab menu, the reference
   client surfaces more than the first audit credited it with.

## Keeping it true

`pnpm check:all` runs gates 1–3. Gate 4 is `scripts/audit_claims.py`. Gates 5–8
need a client checkout and are the reproduction steps in
[`../integration/reference-patch/README.md`](../integration/reference-patch/README.md).

Run gate 4 after every snapshot update. The numbers this project argues from —
117 of 149, 797 tokens, 47 placeholders, a seam at a named line — are the first
things to rot when upstream regenerates.
