# Validation

What has actually been executed, what it proved, and what it did not.

Everything below was run against `farcasterxyz/client` at snapshot `b6922e2`
on Linux. Nothing here is inferred from reading code.

---

## The chain

| # | Gate | Command | Result |
| --- | --- | --- | --- |
| 1 | Home's own suite | `pnpm test` | 257 tests |
| 2 | Types match upstream | `pnpm verify:compat` | 34 fields, 2 enumerations, exact |
| 3 | That check can fail | `pnpm verify:compat:drift` | 11/11 mutations caught |
| 4 | Docs match the snapshot | `node scripts/audit-claims.mjs` | 34/34 claims hold |
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

## Defects a second pass found

A review of the whole branch against its own commit history, run on the
client's pinned Node 20.19.5 rather than the sandbox's default, found ten
more. All are fixed; each code defect carries a test that fails without the
fix.

1. **CI could not run the claims audit.** `verify-compat.sh` made a sparse
   checkout of one directory and the audit read the whole snapshot, so the
   first claim it checked crashed. Now a full shallow clone, and the audit is
   a plain Node script rather than a second runtime.
2. **Imported boundaries and skin were spread verbatim.** A preferences file
   carrying `quietHours: { startMinute: -5, endMinute: 9999 }` put the app
   into permanent quiet hours, and `sessionBudgetMinutes: "twenty"` became
   NaN arithmetic. Both blocks now pass through validators, as feeds and
   themes already did.
3. **Storage that parsed but was wrong was trusted.** A session record with
   `sessionMs: "abc"` rendered `remainingMs: null`; a corrupt affinity
   record decayed silently to nothing. Both are shape-checked on read.
4. **A crash mid-sitting ended the next session before it started.** An open
   stretch is only closed by a background event, so a killed process left
   `activeSince` in storage and the next cold start billed the whole gap as
   reading. The stretch is dropped on restore and its start becomes the
   last-active mark, so the thirty-minute rule still decides the sitting.
5. **The regex validator compiled without the `u` flag the pipeline uses.**
   `foo{bar` passed validation and then failed to compile at match time: a
   rule the reader could see in their settings that never fired.
6. **A typed regex skipped the ReDoS guard.** It ran only on import, so a
   reader who typed `(a+)+$` froze their own feed. `muteKeyword` refuses
   it too.
7. **An imported spec could boost promoted content.** The global weight
   ceiling let `promoted: 4` through, while the reason sheet had always
   capped it at neutral. The ceiling is per group, in one place both paths
   use.
8. **A share link lost its diversity caps.** Compaction drops the default
   diversity block, and validation read the absent key as "no caps". Absent
   now means the default; an explicit `{}` still means none.
9. **The drift check needed Python.** Its one mutation step is now Node, so
   the whole chain runs on the toolchain the client already pins.
10. **A null inside a rule list threw.** `keywords: [null]` in a share link
    threw out of `decodeShare`, and the same junk inside a stored feed threw
    out of `loadPreferences`: a cold start that never recovers. Surfaced by
    the security review; junk entries now fall through the same skipped paths
    as any other malformed rule.

## Keeping it true

`pnpm check:all` runs gates 1–3. Gate 4 is `scripts/audit-claims.mjs`. Gates 5–8
need a client checkout and are the reproduction steps in
[`../integration/reference-patch/README.md`](../integration/reference-patch/README.md).

Run gate 4 after every snapshot update. The numbers this project argues from —
117 of 149, 797 tokens, 47 placeholders, a seam at a named line — are the first
things to rot when upstream regenerates. Gate 4 also greps Home's own docs for
the retracted wording of the three corrected claims, because the design
artifact carried it for two commits after the audit changed.

Both gates 2 and 4 prefer a sibling checkout (`../client`,
`../farcasterxyz/client`) over cloning one. That checkout has to be pristine:
one carrying the reference patch moves the seam lines and fails the audit,
which is the audit working as intended.
