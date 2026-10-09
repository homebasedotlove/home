# Validation

What has actually been executed, what it proved, and what it did not.

Everything below was run against `farcasterxyz/client` at snapshot `b6922e2`
on Linux. Nothing here is inferred from reading code.

---

## The chain

| # | Gate | Command | Result |
| --- | --- | --- | --- |
| 1 | Home's own suite | `pnpm test` | 259 tests |
| 2 | Types match upstream | `pnpm verify:compat` | 34 fields, 2 enumerations, exact |
| 3 | That check can fail | `pnpm verify:compat:drift` | 11/11 mutations caught |
| 4 | Docs match the snapshot | `node scripts/audit-claims.mjs` | 34/34 claims hold |
| 5 | Packages build in the fork | `tsc -p tsconfig.build.json` in the client | 3/3, under **TypeScript 7** |
| 6 | The app bundles with them | `pnpm --filter farcaster-web build` | ✓ in 1m 12s |
| 7 | The seam works on real artifacts | opt-in `integration.test.ts` | 7 assertions |
| 8 | The chip, the hidden row and the seam | client's own vitest + jsdom | 14 assertions |
| 9 | Protocol facts match their sources | `pnpm audit:protocol` | 65/65 claims hold at the pinned commits |

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

Three suites run in the **client's own** vitest, React and Testing Library, in
jsdom. `HomeWhyChip.test.tsx` asserts the chip renders for all ten reasons the
API can send — including the two the upstream `SourceLabel` renders as
`null` — labels an unknown future reason rather than going silent, opens a
sheet with the explanation and the score, offers no controls outside a feed,
writes Less and None to the reader's preferences inside one, closes on Escape
and on a tap outside, and never offers to boost promoted content. `HomeHiddenRow.test.tsx` asserts the row accounts for
every removal on a real fixture page, one row per rule, and that undo reverses
exactly the rule on that row. `homePersonalize.test.ts` asserts the seam leaves
a page untouched without a spec and personalises it with one. Each suite fails
when its fix is removed.

## Cost

The web bundle's `UnfocusedCast` chunk went from **268.84 kB to 272.12 kB** —
the chip, the reason taxonomy and the whole pipeline, roughly 1 kB gzipped.
With the preferences provider and the hidden row added it is **270.65 kB**: the
constant spec left the chunk and the provider lives in the shared hooks bundle.
With the chip’s sheet on the client’s own popover it is **268.94 kB**, back
within a tenth of a kilobyte of upstream.

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

## The three moves

The frame-by-frame review of the sign-in flow found the fork's why-chip wired
to nothing, its receipts computed and never shown, and six of its ten chips
rendering black. All three are closed in the reference patch:

1. **The chip is wired.** `HomePreferencesProvider` holds the reader's
   document over the platform's key-value store; `useFeedItems` reads the spec
   for its feed key from it instead of a constant; the chip's Less, None and
   More go through the feed scope to `nudgeReason` and `muteReasonGroup`.
   Outside a feed the sheet explains and offers no controls.
2. **The hidden row renders what the hook returned.** "N casts hidden on this
   page." above the home feed, a ledger of one row per rule behind it, and a
   button on each row that reverses that rule through the kernel's new
   `undoDrop`, which is tested against all eleven causes the sift can produce.
3. **The colour tokens are fixed.** `text-success` resolved to a variable
   scoped to `.snap-theme-scope`, and `text-action-blue` was not a utility the
   client's config generates. The chip now uses the client's own light and dark
   tokens for each group.

Verified: 197 kernel tests; 13 assertions inside the fork, each suite failing
when its fix is removed; the web app typechecks with zero errors and builds;
the patch applies cleanly to a pristine checkout of the snapshot.

## The rebrand and the simplification pass

The fork is branded Home. The brand purple stays; the dark end of the palette
carries a hint of blue instead of going to black. Each dark grey keeps the
client's own OKLab lightness and gains hue 268 (between the purple at 286 and
the client's blue at 249), chroma 0.045 at the darkest steps tapering to
nothing near white, so the contrast of every text token on every surface is
what it was: secondary text 7.77:1 on the new ground against 7.72:1 on black.
The landing gradient, the title, the theme colour, the manifest, the icon set
and the Open Graph card follow. The client's two logo components keep their
size API and draw Home's mark, which rebrands every place they are used
without touching those places.

The same pass tightened the experience where the frames showed friction:

- **The chip's sheet is the client's own anchored popover.** It flips to stay
  on screen and closes on Escape or a tap outside, like every other menu in the
  app. The hand-positioned div that overflowed its row is gone.
- **The ledger's row labels come from the kernel.** `groupReceipts` names each
  row, so web, mobile and the demo CLI call a muted group by the same word, and
  the row component only lays rows out.
- **The landing page has two ways in** and one honest sentence about accounts.
  The marketing video, the store badges and the "or" divider are gone; a live
  preview of the chip shows the product instead. On a phone the reference
  client offered only a download link; Home offers email login there.
- **A failed magic-link request no longer says "Invalid email."**
- **The provider no longer carries a `notes` array nothing reads.**

Verified: 197 kernel tests, including the row label for every receipt cause;
14 assertions inside the fork; the web app typechecks with zero errors and
builds; every frame re-rendered from the rebuilt bundle.

## The second validation pass (2026-10-09)

Everything above was re-run, and two new checks were added, after the
Snapchain page was written.

- **Gate 9 exists.** `scripts/audit-protocol-claims.mjs` re-derives the 65
  checkable numbers in [`plugging-into-snapchain.md`](plugging-into-snapchain.md)
  from the seven repositories it cites, cloned at the pinned commits by
  `scripts/fetch-protocol-sources.sh` (7 s, 49 MB from scratch). All 65 hold.
  Its `--network` mode confirmed the seven npm versions the page quotes are
  still the latest. The six web-only facts (FIP statuses and dates) were
  re-read by hand the same day and had not moved.
- **Upstream has moved once.** `farcasterxyz/client` replaced the snapshot on
  2026-09-30 (`0c289ed`). Against it: the reference patch applies cleanly, with
  only `apps/farcaster-web/package.json` changed among the 34 files it touches;
  `verify:compat` passes and all eleven drift mutations are still caught; with
  the patch applied, installed and built there, all 14 fork assertions pass and
  the web app typechecks with zero errors; 33 of the 34 client claims hold, the exception being the mobile seam, which moved
  from `useMixedFeedItems.ts:311` to `:326`. The generated API types grew by
  five lines. Home's citations still say `b6922e2`; re-pinning is bookkeeping
  and is item 3 of the L1 list in [`path-to-operational.md`](path-to-operational.md).
- **One correction.** Snapchain rejects timestamps more than 10 minutes in the
  future; the docs page says 15. The page cites the code.

The three unproven items above are unchanged: no request has reached the
production API, the authenticated shell has not booted against it, and nothing
has run on iOS. What each would take is in
[`path-to-operational.md`](path-to-operational.md) §6.

## Keeping it true

`pnpm check:all` runs gates 1–3. Gate 4 is `scripts/audit-claims.mjs`. Gates 5–8
need a client checkout and are the reproduction steps in
[`../integration/reference-patch/README.md`](../integration/reference-patch/README.md).

Gate 9 is `pnpm audit:protocol` after `pnpm fetch:protocol-sources`; with
`--latest` the fetch clones each repository's HEAD instead, and a failure then
names the protocol fact that has moved. The `protocol-audit` workflow runs both
variants weekly.

Run gate 4 after every snapshot update. The numbers this project argues from —
117 of 149, 797 tokens, 47 placeholders, a seam at a named line — are the first
things to rot when upstream regenerates. Gate 4 also greps Home's own docs for
the retracted wording of the three corrected claims, because the design
artifact carried it for two commits after the audit changed.

Both gates 2 and 4 prefer a sibling checkout (`../client`,
`../farcasterxyz/client`) over cloning one. That checkout has to be pristine:
one carrying the reference patch moves the seam lines and fails the audit,
which is the audit working as intended.
