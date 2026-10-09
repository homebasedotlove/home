# What Home still needs to be operational

The gap between the repository as it stands and a client real people can use,
measured on 2026-10-09 against the current state of every dependency. Each item
says what exists, what is missing, and how the claim was checked. Items that can
only be settled from a real network or a real device are marked **untested**
and come with the exact test to run.

Companion pages: [running the client](running-the-client.md) has every
credential and environment variable; [plugging into Snapchain](plugging-into-snapchain.md)
has the protocol facts; [validation](validation.md) has what has been executed.

---

## 0. Where Home is today, re-validated

| Finding | Status on 2026-10-09 | How it was checked |
| --- | --- | --- |
| The kernel, adapter and client-core build, typecheck and pass their tests | holds | `pnpm check:all` against the pinned client snapshot `b6922e2` |
| The 34 claims about the reference client | hold at `b6922e2`; **33 of 34 at the new upstream snapshot `0c289ed` (2026-09-30)**. The mobile seam moved from line 311 to 326 | `SNAPSHOT=… pnpm audit:claims` against both checkouts |
| The 65 checkable claims in the Snapchain page | hold | `scripts/audit-protocol-claims.mjs` against the seven pinned source commits, fetched from scratch by `scripts/fetch-protocol-sources.sh` in 7 s and 49 MB |
| The npm versions the Snapchain page quotes | unchanged | the audit's `--network` mode |
| The six web-only facts (FIP statuses and dates) | re-read, unchanged | fetched again on 2026-10-09; the Neynar blog itself did not resolve from this sandbox, so the acquisition date rests on press coverage |
| The reference patch applies to upstream | **applies cleanly to `0c289ed`**; of the 34 files it touches only `apps/farcaster-web/package.json` changed upstream. Applied, installed and built there, all 14 fork assertions pass and the web app typechecks with zero errors | `git apply --check` on both checkouts, then the fork gate on `0c289ed` |
| The adapter compiles against upstream's types | holds at `0c289ed`; the drift detector still catches all eleven mutations | `pnpm verify:compat`, `pnpm verify:compat:drift` |
| Upstream churn since the snapshot | small: web `src` 2 files changed and 3 added, hooks 4 changed, client-data 3 changed and 1 added, mobile 8 changed, 2 removed, 5 added; the generated API types grew by 5 lines | `diff -rq` between the two checkouts |

The one correction this pass produced: Snapchain rejects timestamps more than
**10** minutes in the future (`ALLOWED_CLOCK_SKEW_SECONDS`), not the 15 the
docs page says. The Snapchain page was fixed before it was committed.

---

## 1. Three definitions of "operational"

Home can be operational at three levels. They are not stages of one path; the
second and third are a different architecture from the first.

| Level | Meaning | Depends on |
| --- | --- | --- |
| **L1** | Home's web app on Home's domain; readers sign in with an existing Farcaster account and use the feed with the why-chip, the ledger and undo | Farcaster's private backend accepting Home's traffic |
| **L2** | Home reads and writes the protocol as a connected app: Snapchain data through Neynar or a node, the reader's own signer, Home's own ranking | a thin Home service, a Neynar account, an app FID |
| **L3** | Home creates accounts (a wallet app) and runs its own node | on-chain registration, custody handling, node operations |

The repository is built for L1 and designed so that L2 slots in underneath it.
Nothing below assumes L3; it is listed so the cost of the full ambition is
visible.

---

## 2. L1: shipping the fork as a client of Farcaster's backend

### 2.1 What exists

- A web build that renders the real client shell with Home's chip, ledger,
  undo, preferences provider and brand, built from `farcasterxyz/client` plus a
  34-file patch, with 14 fork assertions passing in the client's own test
  runner and `tsc` clean.
- Sign-in UI for email and phone on the landing page, calling the client's own
  endpoints (`/v2/magic-link`, `/v2/sign-in-with-farcaster`,
  `/v2/auth/sessions`).
- A download page that says, truthfully, that accounts are created in the
  Farcaster app.

### 2.2 What is missing

| # | Gap | Evidence | What settles it |
| --- | --- | --- | --- |
| 1 | **Whether the backend answers a different origin at all.** The web client calls `https://farcaster.xyz/~api` with an `Authorization: Bearer` header and an `Idempotency-Key` header, no cookies. From any origin other than `farcaster.xyz` that is a cross-origin request with a preflight, and a WebSocket to `wss://ws.farcaster.xyz/stream`. No request has ever left this sandbox for either host. | `apps/farcaster-web/src/constants/api.ts`, `AbstractFarcasterApiClient.ts:558-563`, `WebSocketsProvider.tsx:141` | **untested.** From a real network: `curl -si -X OPTIONS https://farcaster.xyz/~api/v2/feed-items -H 'Origin: https://<home-domain>' -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization,idempotency-key'`. A `200` with `Access-Control-Allow-Origin` covering Home's origin means L1 works as built. Anything else means a same-origin reverse proxy on Home's host (`/~api/*` forwarded to `farcaster.xyz/~api/*`) and a one-line change to the host constant |
| 2 | **Whether a fork is allowed to.** The Client API docs state per-endpoint rate limits for channel calls and nothing about third-party clients of `~api`; the `~api` surface is undocumented. | `docs` repo, `reference/farcaster/api/page.mdx:610` | a conversation with Neynar, who operate the backend. This is the operator's question the validation page has flagged since the first pass |
| 3 | **Re-pin to the current upstream snapshot.** Home cites `b6922e2`; upstream is `0c289ed`. The patch applies and the adapter compiles, so this is bookkeeping: 11 citations of the snapshot id across 8 files and 4 citations of `useMixedFeedItems.ts:311`, which is now `:326`. | §0 | one pass over the docs, then `pnpm check:all` and the fork gate against `0c289ed` |
| 4 | **Hosting.** `vite build` produces a static `build/` folder; any static host with an SPA fallback serves it. The build also runs a sitemap step that insists every URL is on `https://farcaster.xyz`. | `apps/farcaster-web/package.json:101-103`, `scripts/validateSitemaps.mjs:6` | a domain, a static host, and either Home's own sitemap or removing the step |
| 5 | **Universal links and app links are Farcaster's.** `.well-known/apple-app-site-association` and `assetlinks.json` carry `REPLACE_ME` team ids and Farcaster package names. | `apps/farcaster-web/public/.well-known/` | leave them out until there is a Home mobile app; they only matter for one |
| 6 | **Web sign-up is not available to Home.** The web app's only sign-up route is an invite flow behind a Cloudflare Turnstile widget whose site key is Farcaster's; Turnstile keys are bound to the hostnames registered for them. The docs say sign-up is mobile-only. | `pages/signup/CloudflareChallengePage.tsx:12`, `docs` apps page | nothing to do at L1: Home's download page already sends new readers to the Farcaster app. Sign-up is an L3 item |
| 7 | **Analytics and telemetry go to Farcaster's vendors.** PostHog reports to `ph.neynar.com` with placeholder keys; Datadog likewise. | `running-the-client.md` §6 | decide: Home's own keys, or strip the providers. Neither blocks launch |
| 8 | **No preferences sync.** Preferences live in `localStorage` per browser. | `homePreferencesStore.ts` | fine for L1; export and import exist in the kernel and have no UI yet (see §5) |

Items 1 and 2 are the whole of L1's risk. Everything else is a day of work.

### 2.3 Order of work for L1

1. Run the preflight test in item 1 from a laptop. Ten minutes; decides the
   architecture of the next week.
2. If it passes: register a domain, deploy `build/` to a static host, point
   the host constant at Home's domain only if a proxy is needed, and sign in
   with a real account. The first real session also settles the question the
   validation page could not: whether the authenticated shell boots against
   production data with Home's patch in place.
3. Re-pin to `0c289ed` (item 3) so the patch is maintained against what
   upstream ships.
4. Ask Neynar (item 2) before inviting anyone else in.

---

## 3. L2: a connected app on the protocol

This is the architecture the Snapchain page recommends. It removes the
dependency in §2 items 1 and 2 and replaces it with work Home controls.

### 3.1 Accounts and credentials

| Need | Why | Where to get it |
| --- | --- | --- |
| **An app FID with a custody key Home's service can sign with** | every signer request, gasless or on-chain, carries a `SignedKeyRequest` signed by the requesting app's custody address | create an account in the Farcaster app or via the Bundler; keep the key in the service's secret store, never in the browser |
| **A Neynar developer account and API key** | hosted Snapchain (`snapchain-api.neynar.com`), feeds, search, notifications, mutes, blocks, storage usage: 104 v2 paths cover most of what the private backend's 592 endpoints give the client | neynar.com; plan tiers are reported as a free tier and a paid tier with the hub endpoint, unverifiable from here |
| **A Neynar wallet id** (only if Home sponsors registrations) | `POST /v2/farcaster/user/register/` requires `x-wallet-id` | Neynar dashboard |
| **A domain Home controls** | Sign In With Farcaster binds the signed message to the relying party's domain; Quick Auth and the SIWF relay check it | the same domain as L1 |
| **A place to run a thin service** | holds the Neynar key, proxies `submitMessage`, signs `SignedKeyRequest`s, rate-limits per FID | any serverless host; stateless apart from the signer index |
| **A key-value store for signer records** | which key belongs to which FID and device, its scopes, its expiry | the host's KV, or a small Postgres |

### 3.2 Code that does not exist yet

| Work item | What it replaces or adds | Where it lands |
| --- | --- | --- |
| **Data adapter under `useFeedItems`** | one interface that yields the client's `ApiCastFeedItem` shape from either the private backend or protocol data | a new module beside `homePersonalize.ts`; the kernel is untouched |
| **Reason synthesis** | `includeReason` for protocol-sourced casts: following, channel, reply, recast, mention are derivable; discovery reasons come from Home's own scorer and are labelled as Home's | the adapter plus one new reason group in `reasons/` |
| **Home's own ranking** | the "for you" slice the protocol does not provide; Neynar's v2 spec has no such endpoint | a scorer in the kernel's `rank.ts` lineage, fed by the reader's follow graph and affinity |
| **Signer onboarding** | gasless `KEY_ADD` with explicit scopes (90-day sliding TTL, one request a minute) as the first path; the Farcaster-app deeplink with sponsorship as the fallback | a new flow in the web app plus two service endpoints |
| **Sign In With Farcaster** | replaces the backend's magic link and phone flows | `@farcaster/auth-kit` on the landing page; the service verifies the message against the relay |
| **Write path** | casts, reactions, follows, profile edits signed in the browser and submitted through the service to `/v1/submitMessage`, with read-back confirmation | replaces the `apiClient.createCast` family, one mutation at a time |
| **Storage display** | `storageLimitsByFid` on sign-in; a warning before the 101st cast on a single 2025 unit | a small settings panel |
| **Notifications and search** | Neynar `/v2/farcaster/notifications/`, `/cast/search/`, `/user/search/` | behind the same adapter |
| **Channels** | the Client API (`api.farcaster.xyz`) until V21 ships channels on Snapchain; it needs an approved signer to call | the service, because the app-key token is a signature |

Not every item is needed to be operational at L2. The minimum is the adapter,
reason synthesis for the derivable reasons, SIWF, signer onboarding and the
cast write path. Ranking, notifications, search and channels can arrive one at
a time behind the adapter.

### 3.3 Decisions only the operator can make

- Whether to keep the private backend as a labelled, optional source for the
  ranked feed while Home's ranking matures, or to launch L2 with following,
  channel and reply reasons only.
- Whether Home sponsors signers and storage for new readers, which turns
  Home's app FID into a wallet with a budget.
- Which Neynar plan, once the dashboard can be read.

---

## 4. Mobile

Nothing has run on iOS or Android. The mobile seam is documented
(`useMixedFeedItems.ts`, now line 326 upstream) and the kernel is
platform-neutral, but the integration has not been executed the way the web
one has. Mobile also carries the entire credential list in
[running the client](running-the-client.md) §5–8: Apple Developer team, Google
Play, Expo/EAS, Firebase with App Check, the identity renames, and the
universal-link files above. It is a separate track and should start only after
L1 has real users.

---

## 5. Product completeness against the design

What the design documents promise, against what the patch ships:

| Roadmap milestone | Shipped | Not yet |
| --- | --- | --- |
| M1 Legibility | why-chip on every ranked cast; reason sheet with Less / None / More; preferences provider over `localStorage` | Settings → Your data: `exportPreferences` and `importPreferences` exist in the kernel with no screen |
| M2 Control | pipeline at the seam; reason mutes through the chip; receipts with per-rule undo | keyword, author and channel mute entry (the kernel has the rules, the chip only reaches reasons); the mix dial |
| M3 Composition | FeedSpec and `fetchForSpec` in `home-client-core` | tabs, the feed editor, list, search and blend sources on screen, share links |
| M4 Appearance | the Home palette; `theme/` in the kernel | the seed editor, derived themes, per-feed skins |
| M5 Boundaries | `boundaries/` in the kernel with session accounting | the session provider in the app, budgets, wind-down, catch-up mode |
| M6 Depth | nothing | everything |

"Operational" in the sense of §1 needs none of the unshipped rows. They are
what makes Home worth choosing once it runs.

---

## 6. The tests that need a real network or a device

In priority order. Each is a yes or no.

1. **CORS preflight against `farcaster.xyz/~api`** from Home's origin (§2.2 item 1).
2. **A real sign-in through Home's build**, then the home feed: does the
   authenticated shell render with Home's patch, and does `meta.includeReason`
   arrive for every ranked cast as the audit says it does.
3. **WebSocket from Home's origin** to `wss://ws.farcaster.xyz/stream`.
4. **Gasless signer approval in the Farcaster app.** FIP #266 specifies no
   wallet-app flow; find out whether the app will sign a `KeyAdd` for a
   connected app, or whether only the on-chain deeplink is offered.
5. **Live contract values.** `usdUnitPrice()` on the StorageRegistry and
   `price()` on the IdGateway from any OP Mainnet RPC; the docs' $7 is stale
   and FIP #229's $0.20 has not been read off the chain from here.
6. **Neynar plan limits and the hub endpoint's tier**, from the dashboard.
7. **The iOS Simulator path** on a Mac, following the agent guide.

---

## 7. Costs, as far as they can be stated

| Item | Amount | Source |
| --- | --- | --- |
| Domain and static hosting for L1 | small; free tiers exist | n/a |
| Neynar | reported free tier and a $249/month tier that includes the hub endpoint | search snippets; the pricing page is blocked from this sandbox |
| Home's app FID | registration at the IdGateway's `price()` plus storage at $0.20 per unit per year under FIP #229; about $10 of ETH end to end per the writing guide | Snapchain `writing-messages.mdx`, FIP #229 |
| Own node (L3) | roughly $100/month on AWS; 16 GB RAM, 4 cores, 2 TB | Snapchain `running-a-node.mdx`, `getting-started.mdx` |
| Apple Developer / Google Play (mobile) | $99/year / $25 once | running-the-client §7 |

---

## 8. Keeping this page true

`pnpm audit:claims` pins the client facts; `pnpm audit:protocol` pins the
protocol facts (clone the sources first with `pnpm fetch:protocol-sources`, or
`--latest` to see what has moved). The `protocol-audit` workflow runs both the
pinned and the latest variant weekly. When the latest run fails, the claim it
names is the one to re-read, here and in the Snapchain page.
