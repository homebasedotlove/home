# How Farcaster clients are actually built, and what "free" buys

Four questions, answered from what could be read: how a typical third-party
client is put together, what the repository Home is built from really is, how
much of the ecosystem runs on Neynar, and whether a client can run at no cost
without a node or a paid vendor. Written 2026-10-14. Repository facts are
pinned by `scripts/audit-protocol-claims.mjs`; vendor prices and the sampled
clients' manifests are cited to the date they were read, because the vendor's
pages are blocked from this sandbox and the manifests are not pinned sources.

---

## 0. The short answers

- **The average third-party client is a web or mobile app that calls Neynar
  for reads, uses Neynar-managed or app-held signers approved in the Farcaster
  app for writes, Sign In With Farcaster for identity, and a hosted database
  for its own state.** Of six open-source or documented clients sampled, five
  depend on Neynar; the sixth runs its own indexer against a node.
- **The repository Home is built from is Farcaster's own client, published by
  Neynar as a one-commit snapshot under MIT, explicitly for forking, and its
  README says both apps "run locally, pointing to the current production API
  by Farcaster."** It ships no backend. Pointing a fork at that API is what the
  README tells you to do; whether that extends to a deployed product on another
  domain is not stated anywhere.
- **Yes, most people use Neynar.** It is the only service the Farcaster docs
  list, the one the Snapchain docs recommend over running a node, the vendor
  the sampled clients depend on, and since 2026-01-21 the owner of the protocol
  and the official client. There is no published market-share number; the
  claim rests on that evidence.
- **A zero-cost client is realistic for a prototype and a small circle, not for
  a public launch.** Neynar has a free tier (10M credits a month, hub endpoint
  included), Farcaster runs public read nodes, hosting has free tiers, and
  gasless signers cost nothing. What free cannot buy is headroom: a hub list
  call costs 200 credits, so the free tier is tens of daily readers if Home
  reads raw node data through it, and public nodes publish no policy. The
  first paid dollar that matters is a read node at roughly $100 a month.

---

## 1. How the average client works

### 1.1 The pattern

Every third-party client has to solve the same five problems, and almost all
of them solve them the same way:

| Problem | The usual answer | Why |
| --- | --- | --- |
| Reading casts, profiles, follows, channels, search | Neynar's v2 REST API, sometimes with a hub URL (Neynar's or their own) for raw lookups | one API key replaces a node, an indexer and a search engine |
| Writing on the user's behalf | a signer the user approves in the Farcaster app: Neynar-managed (Neynar holds the key, the app calls `/cast` with a `signer_uuid`) or developer-managed (the app holds the key and signs with `@farcaster/core`) | the Farcaster app is where users already have custody; Neynar sponsors the on-chain registration |
| Knowing who the user is | Sign In With Farcaster (`@farcaster/auth-kit`) or, until it was retired in August 2026, Sign In With Neynar | the relay and the Farcaster app do the cryptography |
| The app's own state (preferences, drafts, scheduled posts) | a hosted Postgres, almost always Supabase | nothing on the protocol stores app state |
| Wallet features | Privy or wagmi, with an Alchemy key | optional, and orthogonal to the protocol |

The feed is the tell. None of the sampled clients compute a ranked "for you"
feed from scratch; they show following timelines, channels and Neynar's
trending or filtered feeds. Ranking is the one thing the official client has
that the pattern above does not provide, which is the gap Home's design is
built around.

### 1.2 The sample

Read from each project's manifest and README on 2026-10-14.

| Client | What it is | Reads | Writes and auth | Own state | Node? |
| --- | --- | --- | --- | --- | --- |
| **herocast** (`hellno/herocast`) | open-source web and desktop client | `@neynar/nodejs-sdk`, `@farcaster/hub-web`, a `NEXT_PUBLIC_HUB_HTTP_URL`, `@standard-crypto/farcaster-js-hub-rest` | `@farcaster/auth-kit`, `@farcaster/core` | Supabase; Alchemy for wallets | optional hub URL, Neynar by default |
| **nounspace** (`Nounspace/nounspace.ts`) | open-source customizable client | `@neynar/nodejs-sdk`, `@farcaster/hub-nodejs`, `@farcaster/hub-web` | `@farcaster/quick-auth`, `@farcaster/core`, Privy | Supabase | Neynar plus hub libraries |
| **Litecast** (`dylsteck/litecast`) | open-source mobile client, Expo | Neynar | Neynar | none visible | no; "add your `NEYNAR_API_KEY`" |
| **tofui** (`treethought/tofui`) | open-source terminal client | Neynar | Neynar | none | no; "requires your own Neynar application" |
| **Supercast** | closed, the largest alt client | not published | Neynar managed signers for scheduled casts (Neynar's own case study); "20% of the network's traffic" in early 2024 | not published | not published |
| **Opencast** (`stephancill/opencast`) | open-source, "fully standalone" | its own `lazy-indexer` streaming a hub into Postgres and Redis, indexing only target fids | its own app fid and custody mnemonic; WalletConnect | Postgres | **yes**, a hub connection is the dependency |

Five of six lean on Neynar. The one that does not had to write an indexer and
run a hub, which is the same conclusion the Snapchain documentation draws when
it says "consider a managed service like Neynar instead of running your own
node." Neynar also publishes a "create a Farcaster client" tutorial and React
components, and its examples repository is a catalogue of this pattern:
managed signers, Sign In With Neynar, bots that cast through the API.

### 1.3 The official client is the exception

Farcaster's own app is the one client built the other way: a private backend
that runs its own ranking, channels, moderation, direct casts, notifications
and search over its own node infrastructure, serving a thin client. That is
what makes the repository Home started from different from every project in
the table above, and why its data path does not transfer.

---

## 2. The repository Home is built from

`farcasterxyz/client` is "a snapshot of the Farcaster client monorepo codebase
without the Farcaster Wallet implementation." Everything a fork needs to know is
in its README and licence:

| Fact | Where | What it means for Home |
| --- | --- | --- |
| "This is designed to be a reference for building a social client on top of the Farcaster protocol." | README | the intended use is exactly what Home is doing |
| "Both mobile and web clients run locally, pointing to the current production API by Farcaster." | README | the production API is the expected data source for a local build; the web dev server runs on `localhost`, so this only works if that API answers cross-origin requests from at least `localhost`, which is the strongest hint yet that the CORS question in [path to operational](../operations/path-to-operational.md) may already be settled |
| "Fork it and build on it — that's what it's here for." | README | forking is invited |
| "This repository is a one-way, automatically generated snapshot… Each update replaces `main` with a single fresh commit, so pull requests and issues opened here can't be merged or tracked." | README | no upstream collaboration; Home's patch has to be re-applied on each snapshot, which the protocol audit already measures |
| MIT, "Copyright (c) 2026 Neynar, Inc." | `LICENSE` | permissive; Neynar is the publisher |
| no backend: the `Makefile` syncs API types from a private `../backend` | `Makefile` | the server side is not and will not be published here |
| 112 stars, 59 forks, 1 commit, two empty issues and one unrelated pull request | GitHub, 2026-10-14 | a young, low-traffic mirror; there is no community of forks to learn from yet |
| `AGENT_GUIDE.md` points to Dan Romero's community guide | repo root | the Simulator runbook Home's operations page already follows; that guide is "a community guide, not an official Farcaster or Neynar repository", 20 stars, last verified against the 2026-08-26 snapshot |

What the README does **not** say: whether a fork may ship to users on its own
domain against that API, what rate limits apply, or whether the API's CORS
policy covers domains other than `localhost`. Those remain the operator's
questions, now narrowed to "deployed" rather than "any".

---

## 3. Does most of the ecosystem use Neynar?

Evidence, strongest first:

1. **Ownership.** Neynar acquired Farcaster on 2026-01-21 and now maintains the
   protocol, the Snapchain reference implementation, and the official client.
   Five of the seven validator keys in the current set are attributed to
   Neynar.
2. **Documentation.** The Farcaster docs list exactly one third-party service,
   Neynar. The Snapchain getting-started page and node guide both open with
   "consider a managed service like Neynar."
3. **The sample above.** Five of six clients; the sixth runs its own indexer.
4. **Case studies and press.** Neynar's own Supercast spotlight; coverage of
   the acquisition describing Neynar as serving more than 1,000 customers and
   "virtually every major application."
5. **The ecosystem lists.** The a16z awesome-farcaster list names Neynar and
   Airstack as the data services; Airstack's Farcaster kit entry was archived
   in May 2026.

There is no published percentage, and closed clients (Yup, Recaster, Firefly,
Supercast's reads) do not disclose their stack. The honest statement is:
Neynar is the default, the alternatives are self-hosting or the official
client's private backend, and the second of those is not available to anyone
else.

---

## 4. Can Home run for free, with no node and no Neynar subscription?

"Free" has to be taken component by component.

### 4.1 What costs nothing

| Component | Free option | Catch |
| --- | --- | --- |
| **Reading raw protocol data** | Farcaster's public read nodes (`snap`, `pop`, `snap.uno.fun`) from Snapchain's own node registry; community nodes such as `haatz.quilibrium.com` listed on hub directories | no published policy or rate limit; none of them is reachable from this sandbox, so they are **untested**. The browser can call them directly (the node allows any origin) |
| **Reading through Neynar** | the Free plan: 10M credits a month, 10 webhooks, 5 apps, a 600 per-endpoint rate limit, hub endpoint and read and write APIs included (Neynar docs, June 2026, via search) | an account, not a subscription; credits are the limit (§4.2) |
| **Writing** | `submitMessage` on a public node, if it accepts writes; Neynar's `publish-message` on the free plan at a reported 150 credits a message | the first is untested; the second is metered |
| **Signers** | gasless `KEY_ADD`: no gas, no vendor. The Farcaster-app deeplink: the Client API is free, but someone pays the on-chain add; 2023 accounts had Warpcast charging users about $1 or Warps, and the docs offer app sponsorship | whether the Farcaster app today charges the user for an unsponsored add is **unverified** |
| **Identity** | Sign In With Farcaster through the public relay; `@farcaster/auth-client` falls back to a public OP RPC with a warning | use a free-tier RPC key in production |
| **Hosting** | static hosting and a small serverless service on free tiers | free tiers are for non-commercial or low-volume use by their terms |
| **Media** | object storage free tiers | egress is where it stops being free |
| **Channels, blocks, verifications** | the Client API at `api.farcaster.xyz`, app-key authenticated, documented rate limits of 100 calls per caller per channel per hour | needs an approved signer to call |
| **The fork's current data path** | `farcaster.xyz/~api`, which the template README itself points local builds at | the deployed-domain policy question above |

Two things are never free: a domain (about $10 a year) and Home's own app fid
with one storage unit (registration price plus storage; the docs still say $7
a year for storage while FIP-229 set the current unit at $0.20; the live price
could not be read from here).

### 4.2 Where the free tier runs out

Credit costs reported for Neynar's metering, read on 2026-10-14 via search
because the pricing pages are blocked here:

| Call | Credits |
| --- | --- |
| hub single lookup (`castById`, `reactionById`) | 1 |
| hub list (`castsByFid`) | 200 |
| hub `reactionsByCast` | 150 |
| hub `submitMessage` | 150 |
| hub `/v1/events` | 2,000 |
| `user/bulk` | 1 per fid |
| `user/search` | 10 |
| channel lookup | 2 |
| feed, conversation, notifications, signer calls | not visible in the excerpts |

Two worked numbers. A reader whose home feed is built from raw node calls
through Neynar's hub endpoint (say twenty `castsByFid` pages, thirty single
lookups and a `user/bulk` of forty fids) spends about 4,100 credits a session;
10M credits is roughly 2,400 such sessions a month, about **80 a day**.
Polling `/v1/events` once a minute costs 86M credits a month, nine times the
free tier, so notifications on the free plan have to come from webhooks (ten
are included) or from Neynar's own feed endpoints whose costs are not visible
here. If those endpoints are priced like the single lookups, the free tier
stretches to a few hundred daily readers; if like the list calls, it does not.
The exact figure needs the compute-units page.

### 4.3 The honest answer

| Stage | Free? | How |
| --- | --- | --- |
| Development | **yes** | the local devnet in [the runbook](../operations/setup-end-to-end.md) costs nothing and needs no account |
| A private build for a few people | **yes** | Neynar free plan for feeds and signers, public read nodes for raw reads, gasless signers where readers have a wallet, free hosting, one domain |
| The fork as it stands, on Home's domain | **unknown** | depends on the deployed-domain policy of the production API; free if allowed |
| A public client with reliability | **no** | either a read node (about $100 a month; or hardware you already own with a public IP and 2 TB) for unmetered reads and events, or Neynar's Scale plan at $249 a month for 60M credits. Both still leave ranking to Home |

The cheapest *reliable* step up from free is the read node, and it is the one
that removes the vendor from the read path entirely. That is also why the
runbook sequences it last: everything before it can be done for nothing.

---

## 5. What this means for Home

- Build the data adapter so the source is configuration: production API,
  Neynar, public node, own node. The free-tier question then stops being a
  design decision and becomes a dial.
- Treat Neynar's free plan as the default development and private-beta source,
  and measure credits per session from day one; the number decides when the
  read node is cheaper.
- Prefer gasless `KEY_ADD` wherever a reader can sign with a wallet; it is the
  only signer path with no cost to anyone.
- Ask the two operator questions the template leaves open before inviting
  strangers: the production API's policy for a deployed fork, and the public
  nodes' write policy.

---

## Sources

| Source | Read | Used for |
| --- | --- | --- |
| [farcasterxyz/client](https://github.com/farcasterxyz/client) `README.md`, `LICENSE`, `Makefile`, `AGENT_GUIDE.md` | `0c289ed`, 2026-09-30; repository page 2026-10-14 | what the template is and sanctions |
| [danromero/farcaster-client-agent-guide](https://github.com/danromero/farcaster-client-agent-guide) | 2026-10-14 | the community guide's scope |
| [hellno/herocast](https://github.com/hellno/herocast), [Nounspace/nounspace.ts](https://github.com/Nounspace/nounspace.ts), [dylsteck/litecast](https://github.com/dylsteck/litecast), [treethought/tofui](https://github.com/treethought/tofui), [stephancill/opencast](https://github.com/stephancill/opencast), [stephancill/lazy-indexer](https://github.com/stephancill/lazy-indexer) | manifests and READMEs, 2026-10-14 | the client sample |
| [a16z/awesome-farcaster](https://github.com/a16z/awesome-farcaster), [neynarxyz/farcaster-examples](https://github.com/neynarxyz/farcaster-examples) | 2026-10-14 | ecosystem lists |
| [Neynar: Supercast spotlight](https://neynar.com/blog/spotlight-supercast), [Neynar rate limits and plans](https://docs.neynar.com/reference/what-are-the-rate-limits-on-neynar-apis), [Neynar compute units](https://docs.neynar.com/reference/compute-units), [Neynar signer guide](https://docs.neynar.com/docs/which-signer-should-you-use-and-why) | search excerpts only; the hosts are blocked here | plans, credits, signer model |
| [Snapchain getting started](https://github.com/farcasterxyz/snapchain/blob/main/site/docs/pages/getting-started.mdx), `src/network/mesh/nodes.rs` | `8f82bcc`, 2026-08-13 | the Neynar recommendation, public node list |
| [Farcaster docs apps page](https://github.com/farcasterxyz/docs) | `3a02c82`, 2026-04-07 | the services list |
| [vrypan, "All about Farcaster signers"](https://blog.vrypan.net/2023/11/25/all-about-farcaster-signers/) | 2023 | who paid for signer adds then |
| [CoinDesk on the acquisition](https://www.coindesk.com/business/2026/01/21/farcaster-founders-step-back-as-neynar-acquires-struggling-crypto-social-app) | 2026-01-21 | ownership |
