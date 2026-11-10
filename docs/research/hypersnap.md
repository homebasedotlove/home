# Running a Farcaster client versus a Hypersnap client

The question was: what are the main differences between running a Farcaster
client and running a Hypersnap client? "Hypersnap client" means two things in
practice, and this page answers both: a client whose data source is a
Hypersnap node rather than Farcaster's production API or Neynar, and
Opencaster, the browser client Arca Computer runs on Hypersnap. Written
2026-10-23 from the code of the four Hypersnap repositories at the commits
named in §7, the pinned Snapchain and Neynar sources the other pages use, and
web coverage read the same week. Repository facts are pinned by
`scripts/audit-protocol-claims.mjs`; governance, roadmap and press facts are
web-only and marked as such. hypersnap.org, the public node and the news sites
are blocked from this sandbox, so what they say is taken from the repositories
that generate them and from search excerpts.

> **Since this page was written.** The validator-list stall it predicted
> happened on 2026-10-22, and on 2026-11-09 Hypersnap scheduled its own
> validator set at fixed block heights, projected for 2026-11-12, with a relay,
> free accounts and no storage rent. After that it is no longer a read node of
> Farcaster's network. This page is kept as it was read on 2026-10-23 and its
> claims are pinned at those commits. The current state and what it means for
> Home are in [`optimal-design.md`](optimal-design.md).

---

## 0. The short answers

- **Hypersnap is a fork of Snapchain, not a different network, as of
  2026-10-16.** Its mainnet compose file joins Farcaster's Snapchain mainnet as
  a read node (`fc_network="Mainnet"`, `read_node = true`), using eight of
  upstream's nine bootstrap peers and a copy of upstream's validator list. It
  stores the same casts, trusts the same seven validators, reads identity from
  the same OP Mainnet contracts, and applies the same storage and engine rules
  through V20. The fork's own contribution is a 30,845-line API layer bolted
  onto the node.
- **The API layer is the whole difference for a reader.** A Hypersnap node
  answers 140 distinct `/v2/farcaster/*` paths, and 103 of the 104 paths in
  Neynar's OpenAPI spec exist by name. Reads need no key and have no built-in
  per-IP rate limit. Webhooks and mini-app notification plumbing are included.
  An adapter written for Neynar's shapes points at a Hypersnap node with a base
  URL change, subject to the shape checks in §6.
- **Writes, signers and login are not the API's business on either stack.**
  Every mutating `/v2/farcaster/*` route on Hypersnap returns 501 with the
  text "Write operations require submitting signed Farcaster messages via the
  gRPC SubmitMessage endpoint"; the managed Neynar routes (login nonce,
  developer-managed signers, frames catalogue) return 501 with "requires
  managed infrastructure not available on a self-hosted node". So a Hypersnap
  client does exactly what `plan.md` §2 already has Home doing for Source B:
  hold an Ed25519 key, get it approved by the custody wallet with EIP-712,
  submit a gasless `KEY_ADD`, and post signed protobuf messages to
  `/v1/submitMessage` or gRPC. Opencaster is a working example of that path.
- **What a Hypersnap node does not give you**: Farcaster's ranked feed and the
  per-cast reasons Home's why-chip reads (Hypersnap's "for you" feed is an
  alias of its trending feed), Sign In With Farcaster relayed by Farcaster,
  managed or sponsored signers, media hosting, push, direct messages, account
  creation, fnames, or a mini-app host. Neither does a plain Snapchain node; the
  production API gives the first three.
- **The real differences are about trust, maturity and direction, not data.**
  Hypersnap is eight months old, has one principal author, lags upstream's
  release train (Cargo says 0.13.5 and its changelog stops at 0.13.2 while
  Snapchain is at 0.14.3), and its validator list is missing the v18 validator
  swap upstream added on 2026-10-15, which a read node must know about or it
  will drop blocks, and did on 2026-10-22 (§2.3). Its stated roadmap is to become its own chain with
  its own token. Farcaster, for its part, changed owners twice in 2026, the
  second time on 2026-10-15 to Network School, with a paid-access model
  announced for the main app. Both sides are moving.
- **For Home**: nothing here changes the plan. Hypersnap is a third provider
  for Source B's reads (after Neynar's free tier and Farcaster's public nodes),
  worth adopting because it costs nothing per request and insures the adapter
  against Neynar's uncertain future; it is not a reason to build on a
  not-yet-existing second network, and Opencaster's AGPL code must not be
  copied into Home's MIT tree. §6 has the checks to run before pointing the
  adapter at a Hypersnap node.

---

## 1. What Hypersnap is, from the code

| Fact | Value | Read from |
| --- | --- | --- |
| Repository | [farcasterorg/hypersnap](https://github.com/farcasterorg/hypersnap), GPL-3.0, 119 commits, latest `2e8733d` 2026-10-16 by Cassandra Heart; organisation created 2026-02-15 | `LICENSE`, `git log`, hypersnap.org source snapshot |
| Package | Cargo package `snapchain` 0.13.5 with the binary renamed `hypersnap`; `CHANGELOG.md` stops at 0.13.2 (2026-06-24); upstream Snapchain is at 0.14.3 (2026-10-15) | `Cargo.toml`, `CHANGELOG.md`, upstream `CHANGELOG.md` |
| Network | `docker-compose.mainnet.yml` writes `fc_network="Mainnet"`, `read_node = true`, `shard_ids = [1,2]`; eight of upstream's nine bootstrap peers; `validators.toml` is upstream's `8f82bcc` file with only the title changed | compose files, `validators.toml` |
| Engine | the mainnet schedule and feature gates match upstream through V20 (embeds, 2026-08-13); the V21 channel gates upstream already carries (unscheduled on mainnet) are absent; gasless keys carry `scopes` and a sliding `ttl` capped at 90 days, as upstream | `src/version/version.rs`, `proto/definitions/message.proto`, `src/core/validations/key.rs` |
| API | `src/api/` 30,845 lines in 43 files, `http.rs` 5,723; 140 distinct `/v2/farcaster/*` route literals; served on the node's HTTP port 3381 beside Snapchain's `/v1/*` routes; `/v1/submitMessage` and gRPC `SubmitMessage` retained | `src/api/http.rs`, `src/network/http_server.rs` |
| Feeds | following (by timestamp) and trending (engagement score over a window, default 24 h, weights for like/recast/reply configurable, top 1,000 kept); "for you" is an alias of trending | `src/api/feeds.rs`, `src/api/http.rs`, `src/api/config.rs` |
| Search | Tantivy embedded by default, or Meilisearch | `src/api/config.rs` |
| Webhooks and mini apps | webhook registration signed with EIP-712 (domain `Hypersnap`/`1`/chain 10), default 1,000 events per 60 s per webhook, 25 webhooks and 25 mini apps per fid; mini-app notification sending and token webhooks per the Farcaster spec | `src/api/webhooks/handler.rs`, `src/api/notifications/*`, docs |
| Writes | all mutating v2 routes answer 501 and point at `SubmitMessage`; login, developer-managed signers, frames catalogue, fungibles and NFT routes answer 501 "requires managed infrastructure" | `src/api/http.rs` |
| "Hyper mode" | `[hyper] enabled = true` in the compose; `src/hyper/` (796 lines: backfill, reconcile) and a `CAPABILITY_HYPER` gossip capability exist; `src/bin/hyper.rs` is a stub; `docs/hyper.md` is the design (a second, non-pruning state context beside the canonical one) | the files named |
| Public node | `https://haatz.quilibrium.com`, named by the docs, the site and the smoke test, and the only upstream of Opencaster | `scripts/test-v2-api.sh`, docs, site, Opencaster worker |
| Requirements | 16 GB RAM, 4 cores, 1.5 TB, ports 3381–3383: Snapchain's | `README.md`, identical lines upstream |
| Token | the launcher warns "The network has not yet released a token. Running a node at this time will not earn tokens." | `scripts/hypersnap.sh` |
| Build | the README pins a fork of `eth-signature-verifier` by the maintainer | `README.md` |

Two things follow. A Hypersnap node is a Snapchain read node first: it needs
the same machine, syncs the same snapshots, and is subject to the same storage
rent and rate limits as any node (`plugging-into-snapchain.md` §3). And the
Hypersnap-specific code is almost entirely the API: 140 routes, indexes for the
social graph, metrics, search and daily stats, feed generation, conversations,
optional AI summaries (provider and model configurable, key from an environment
variable), webhooks and the mini-app notification host.

### 1.1 The docs' own framing

The documentation repository (`farcasterorg/hypersnap-docs-web`, `85fb17b`,
2026-04-13) says: "Hypersnap is a Rust implementation of a Farcaster node.
Alongside the core consensus + gossip layer, it exposes an HTTP API at
`/v2/farcaster/*` that mirrors the shape of the broader Farcaster v2 API
ecosystem so existing client SDKs and patterns work unchanged." It lists four
endpoint families (public reads, EIP-712-signed webhook management, mini-app
management, batch reads) and three negatives: not a gRPC endpoint for message
submission, "not an identity system. Hypersnap reads identity state from the
on-chain IdRegistry contract", and "not a walled garden. Every public read
endpoint is unauthenticated". On limits: "Hypersnap is designed to be run by
node operators for their own apps, not as a centralized API vendor", and
"There is no built-in per-IP rate limit on the public read endpoints". The
build-a-client guide: "Every one of these is a single unauthenticated GET
against a Hypersnap node" and "You don't submit casts through this API."

---

## 2. Same network today, a different one on the roadmap

### 2.1 Why it was forked (web-only)

The fork meeting of 2026-02-15 ([farcasterorg/protocol discussion #4]) gives
the reasons: the protocol had "fallen into the hands of a singular entity", the
validator set had converged on one corporation, and "soft → hard fork... we
might already be there". This followed Neynar's acquisition of Farcaster on
2026-01-21 (`client-landscape.md` §5). Press reports the fork is hosted on
Quilibrium infrastructure and that the Farcaster team welcomed it; neither is
checkable here.

### 2.2 Where it says it is going (web-only)

- **Open consensus** (discussion #13): a dynamic validator set and a "hyper
  shard" anchored to Snapchain, with the initial Hypersnap nodes as bootstrap
  validators.
- **Another chain** (discussion #5): configurable fid and name resolvers,
  namespaced fids, and a rationale for leaving Optimism and Base.
- **Proof-of-work tokenization** (discussion #19): a token minted for data
  availability, growth and application work; epoch 0 is "run Snapchain read
  nodes" (where the code is today); epoch 1, the "pivot", produces its own
  blocks for shards 0–2 with a token ledger, a bridge, and a relay worker as
  "the only connection between the two networks"; 12-second blocks, 36,000-block
  epochs of about five days, fees 60% burned and 40% to the proposer.
- Farcaster's April 2026 statement that it will issue no token and that the
  "token discussion" concerns the Hypersnap fork; third-party notes claim a
  hard-fork announcement on 2026-10-12 and that the quantum-key, relay and
  pivot pieces are "spec, not built". The code agrees with the second claim:
  at `2e8733d` there is no block production of its own, no ledger, no bridge
  and no relay; `validators.toml` is Snapchain's.

### 2.3 The one operational consequence already visible in the code

A Snapchain read node verifies every decided block's commit signatures against
the validator set it expects at that height and drops the block otherwise
(`read_validator.rs`: `verify_signatures(commits, &self.validator_sets)`;
`core/util.rs`: "Block contained signatures from unexpected signers"). On
2026-10-15 upstream added the registry v18 validator sets to `validators.toml`
(commit `21b4a8b`, PR #1038): `moria` and `isengard` replace `uno` and `degen`
on shard 0 at height 48,632,000, shard 2 at 49,147,000 and shard 1 at
49,311,000. Hypersnap's `validators.toml` at `2e8733d` (one day later) does
not have them, and Hypersnap's compose does not run upstream's
`apply-onchain-config.sh`, which pulls validator sets from the on-chain
`SnapchainConfigRegistry` at boot and watches it afterwards (the script is in
the pinned upstream `8f82bcc`). At one block per second per shard those heights
are weeks, not months, from the commit dates. Whether they have passed cannot
be checked from this sandbox; the check is in §6.2. Until Hypersnap merges the
file or an operator edits it, a Hypersnap read node will stop at those heights
with "Dropping decided block because its signatures are invalid". This is the
concrete form of "young fork, one maintainer": the data is Farcaster's, but
staying in sync with Farcaster's validator changes is manual work the fork has
not yet automated.

**Update 2026-10-23.** It happened. On 2026-10-22 Hypersnap read nodes
halted with that exact log line at heights 48,632,005 (shard 0), 49,147,015
(shard 2) and 49,311,004 (shard 1), reported as
[farcasterorg/hypersnap#41](https://github.com/farcasterorg/hypersnap/issues/41);
an operator who copied upstream's three entries into `validators.toml` saw the
node resume "within a minute", and another documents the stall and the fix in
its README (pinned: `fatline`). As of 2026-10-23 `main` is still `2e8733d`
without the entries and the issue has no maintainer reply. The week's other
changes on both sides, and what they mean for a client that wants to be both,
are in [`both-networks.md`](both-networks.md).

### 2.4 What a pivot would mean for a client

If epoch 1 happens as written, there would be two networks with the same fids
(if the fid resolver stays the IdRegistry) and a one-way relay between them.
A client would then have to choose which network's view of a user's casts is
canonical, pay storage on whichever side it writes to, and expect the two
feeds to diverge. Opencaster would follow Hypersnap. A client built on the
protocol path with a data-source adapter, which is what `plan.md` describes,
can point at either network; a client built on one vendor's managed API cannot.
Nothing in Home needs to be decided about this before the pivot is code.

---

## 3. Reading the same data four ways

The columns are the four places a 2026 client can get Farcaster data. The
first is what the reference client Home is built from uses; the second is
what most third-party clients use (`client-landscape.md` §3); the third is
Hypersnap; the fourth is a plain Snapchain node, included because Hypersnap is
one with extras.

| | Farcaster production API | Neynar | Hypersnap node (own or haatz) | Plain Snapchain read node |
| --- | --- | --- | --- | --- |
| Who runs it | Farcaster (Network School since 2026-10-15) | Neynar | you, or Quilibrium's `haatz` | you, or Farcaster's public nodes |
| Access | private; a bearer token from Farcaster's own login; forks "point at the current production API" by the template's README | API key; free tier 10M credits a month, Scale $249 for 60M (web, unverified here) | none for reads; EIP-712 signature by the fid's custody key for webhooks and mini-app management | none; optional `admin_rpc_auth` for admin routes |
| Rate limits | undocumented | 600 per endpoint per minute and per-call credit costs (web) | none built in for reads ("your operator may run a reverse proxy"); 1,000 events per 60 s per webhook | per-fid write allowance `max(100, units/10)` an hour; reads unlimited by the node |
| Ranked feed and reasons | yes: `includeReason` and `score` on every feed item, ten reason kinds | "for you" feed as a product; no reasons | trending by engagement score; "for you" is trending; no reasons | none; the client ranks |
| Following feed, threads, profiles, channels | yes | yes | yes, computed from local indexes | raw messages; the client joins them |
| Search | yes | yes | Tantivy or Meilisearch index on the node | none |
| Notifications | yes, plus unseen counts over a websocket | yes, with webhooks | yes, from the node's events; webhooks | `/v1/events` stream, three-day retention |
| Writes | the API posts for you after Farcaster's login | `/v2/farcaster/message` with a Neynar-managed or developer-managed signer | 501; sign locally, submit to `/v1/submitMessage` or gRPC on the same node | `/v1/submitMessage` or gRPC |
| Signer onboarding | Farcaster's onboarding and `/v2/signed-key-request` | sponsored or managed signers; SIWN (retired Aug 2026) | 501; gasless `KEY_ADD` signed by the custody wallet (Opencaster shows the flow) | gasless `KEY_ADD` or an on-chain `KeyGateway` add |
| Login | Farcaster's own | Neynar's SIWN/SIWF relay | 501; the client verifies custody signatures itself | the client verifies custody signatures itself |
| Media, push, mini-app host, DMs | yes | media and notifications products | no, no, notification plumbing only, no | no |
| Server licence and terms | closed; Farcaster's terms | closed; Neynar's terms | GPL-3.0; whatever `haatz`'s operator allows (no posted policy found) | GPL-3.0 |
| Age and maintenance | years; owner changed 2026-01 and 2026-10 | years; staff largely moved to Network School 2026-10 (web) | eight months; 119 commits; principal author one person; validator list already stale (§2.3) | the canonical implementation, 0.14.3 |
| Cost to run | nothing, if permitted | nothing to $249 a month | a read node's machine plus index memory and disk; `haatz` is free with no SLA | a read node's machine, about $100 a month |

The row that matters most for Home is "Ranked feed and reasons": only the
production API carries the field the why-chip reads, which is why `plan.md`
keeps Source A for the ranked feed and has Source B synthesise reasons locally.
Hypersnap changes nothing there. The row that matters most for independence is
"Access": Hypersnap is the only column where a client needs no one's permission
and pays no one per request, and the only one whose server a client can run
unmodified under an open licence (GPL-3.0 obliges you to publish changes you
distribute; running a modified node as a service does not trigger it, and Home
has no reason to modify it).

---

## 4. Opencaster versus the Farcaster reference client

Opencaster (`arcabotai/hypersnap-web`, `ef608f8`, 2026-10-22, "An open source
client for everyone. Powered by Arca Computer. Runs on Hypersnap.") is the
client that exists on the Hypersnap side. It is not Opencast
(`stephancill/opencast`, `client-landscape.md` §2), which is a different
project. The reference client is `farcasterxyz/client` (`0c289ed`), the
snapshot Home is built from.

| | Farcaster reference client | Opencaster |
| --- | --- | --- |
| Origin and licence | Farcaster's own web and mobile client, snapshot without the wallet; MIT, copyright Neynar | forked from Quorum Desktop, Quilibrium's messenger; AGPL-3.0; the Farcaster snapshot "informed familiar sharing, profile, and conversation UX" but no code was imported |
| Data source | one `FarcasterApiClient` on `farcaster.xyz/~api`; fifteen private endpoints Home's runbook maps | one fixed gateway, `https://haatz.quilibrium.com`, behind a Cloudflare Worker with a route and query allowlist; "no failover or independent indexer" |
| Login | Farcaster's onboarding and bearer token | none from Farcaster: "No Farcaster-operated login service is involved"; the user connects the custody wallet (EIP-1193/6963 extension or WalletConnect) |
| Signer | created server-side through `/v2/signed-key-request` and the backend's gas | a random Ed25519 key generated in the browser, approved by the custody wallet with `eth_signTypedData_v4`, then a gasless `KEY_ADD`; scopes `[1, 3, 4]` by default (casts, reactions), `[1, 3, 4, 5, 6, 11]` for follows and profile edits, `2` added for deletes; a seven-day sliding inactivity `ttl`; optional passkey-PRF or password-encrypted IndexedDB vault |
| Write path | `apiClient.createCast(...)` and friends; the backend signs and submits | the browser builds and signs the protobuf; the Worker forwards binary `POST /v1/submitMessage` up to 64 KiB to the node |
| Features | everything Farcaster's app does, including wallet, DMs, mini apps, notifications, media | trending and following feeds, threads, profiles, channels, notifications, search, bookmarks, local mutes, image uploads to R2 (5 MiB, two embeds) |
| Excluded | nothing by design; the snapshot omits the wallet | "creating Farcaster accounts, paid storage/on-chain registration, seed recovery, wallet transfers, DM transport, push notifications, video uploads, end-user media deletion, and mini-app execution" |
| Hosting | Farcaster's infrastructure | Cloudflare Worker, R2 bucket and a SQLite Durable Object for upload quotas; `opencaster.org` |
| Maturity | production for years | "This is a beta, and no independent security audit is claimed"; follow and profile writes "have not been exercised against a real production account" |

What Home should take from Opencaster is the signer and write path, which is
the same design `setup-end-to-end.md` §6 and `plan.md` §2.4–2.5 specify for
Source B, demonstrated end to end in a browser: key in the browser, custody
approval by EIP-712, gasless `KEY_ADD` with scopes and a ttl, binary submission
through a thin proxy that forwards nothing else. The scopes list is worth
copying as a product decision: ask for the minimum (casts and reactions) and
escalate with a second, explicit approval. What Home must not take is the code:
AGPL-3.0 in an MIT repository would relicense Home.

---

## 5. Running one versus the other, as an operator

- **Machine and sync.** Identical to a Snapchain read node (16 GB, 4 cores,
  1.5 TB, snapshot catch-up of up to two hours), plus whatever the enabled
  indexes need: the search index has a memory budget setting, the social graph
  and metrics indexes backfill on start. The site's cost figure for a node is
  Snapchain's. Expect a read node's price, about $100 a month in `plan.md` §3,
  and more RAM if search is on; the exact overhead is unmeasured here.
- **Release train.** Snapchain ships `0.14.x` and pulls validator config from
  the chain; Hypersnap ports engine versions by hand ("v20 support" landed on
  2026-10-16, two months after upstream activated V20), carries a stale
  changelog, and has a `nightly` channel. A Hypersnap operator must watch
  upstream's `validators.toml` and engine schedule themselves until the fork
  automates it (§2.3).
- **Trust.** Running `hypersnap` means running Snapchain code plus 31,000 lines
  of API code from an eight-month-old project with one principal author and a
  build that pins the maintainer's fork of a signature library. Using `haatz`
  means trusting one operator's node with no posted terms, which is also
  Opencaster's position ("the upstream node remains a network availability
  dependency").
- **Licence.** GPL-3.0 for the node and for Snapchain itself, AGPL-3.0 for
  Opencaster, MIT for the reference client. (This page first said Snapchain was
  MIT; it is not, and the audit now pins both licences.) Running GPL software is
  unrestricted; Home's own code stays MIT as long as it links to neither.
- **Governance, both sides.** Farcaster: Neynar bought it on 2026-01-21;
  Network School bought the app, the protocol repositories and related products
  from Neynar on 2026-10-15, announced a rebrand to "Network State Protocol"
  with a paid access NFT, and said users who decline keep their keys, funds,
  followers and history "for use in other clients" but become read-only in the
  main app (press, 2026-10-15 to 2026-10-22, unverified beyond those reports;
  `farcasterxyz/client` and `farcasterxyz/snapchain` are unchanged at
  `0c289ed` and `0.14.3`). Hypersnap: a stated plan to leave the network and
  issue a token, not yet in code. Each makes the other side's clients more
  important: a third-party client is what a read-only Farcaster user is being
  told to use, and a self-hosted data source is what a Farcaster fork is
  offering.

---

## 6. What this means for Home

### 6.1 The decision

Keep `plan.md` as written: one UI, two data sources behind the adapter, Source
B built now on the devnet. Add Hypersnap as the third provider behind Source B's
read side, in this order of preference once the network tests in `plan.md`
§1.3 have run:

1. **Neynar's free tier** while it exists and while its shapes are the ones the
   adapter is written against.
2. **A Hypersnap node** (`haatz` for development, Home's own when there are
   readers) for the same shapes with no key, no credits and webhooks for
   notifications. This is the hedge against Neynar's post-acquisition future,
   which no source read here describes.
3. **Farcaster's public nodes or Home's own Snapchain read node** for the raw
   protocol path the runbook already specifies, which is what the adapter's
   write side uses regardless of the read provider.

Do not build on Hypersnap as a network (there is none yet), do not import
Opencaster code, and do not let the why-chip's reasons depend on any of the
three: Source B synthesises them locally, as planned.

### 6.2 Checks before pointing the adapter at a Hypersnap node

| # | Check | Command or method | Pass means |
| --- | --- | --- | --- |
| a | the node is in sync with Farcaster's chain | `curl -s https://haatz.quilibrium.com/v1/info` and the same on a Farcaster public node; compare `maxHeight` per shard and `blockDelay` | heights within seconds of each other; a Hypersnap node stuck at 48,632,005 on shard 0, 49,147,015 on shard 2 or 49,311,004 on shard 1 has hit §2.3, as the public reports of 2026-10-22 did |
| b | the validator list is current | `validators.toml` in the Hypersnap commit the node runs contains the v18 sets (key `bd465c94…`) | present; otherwise run your own node with upstream's file |
| c | the twelve read shapes the adapter uses match Neynar's | for each of `feed/following`, `feed/trending`, `notifications`, `cast/conversation`, `user/bulk`, `user/search`, `cast/search`, `channel/search`, `reactions/cast`, `followers`, `following`, `channel` compare a response to the pinned OpenAPI schema with the adapter's existing contract tests | the adapter's type guards accept the responses unchanged, or the differences are enumerated |
| d | writes go round the API | `POST /v2/farcaster/message` returns 501; `POST /v1/submitMessage` with a devnet-signed message is accepted | both as described |
| e | webhooks replace polling for notifications | register one with an EIP-712 signature from Home's app custody key (domain `Hypersnap`, `1`, chain 10); trigger a reaction on the devnet account | delivery within seconds, HMAC verified |
| f | the gateway's terms | ask the `haatz` operator (Quilibrium) in the farcasterorg discussions whether a client may read from it and at what rate | a written answer; otherwise treat `haatz` as development-only |

### 6.3 What changes in the repository

Nothing yet. When check c passes, the adapter gains a base-URL and auth-header
switch per provider and a provider column in its contract tests. When Home runs
its own node, the runbook's "own read node" stage in `setup-end-to-end.md` §8
gains a Hypersnap variant: same machine, the Hypersnap compose, and the
validator-list check above added to the weekly audit.

---

## 7. Evidence

| Source | Read | Used for |
| --- | --- | --- |
| [farcasterorg/hypersnap](https://github.com/farcasterorg/hypersnap) | `2e8733d`, 2026-10-16 | §1, §2.3, §3: licence, Cargo, compose, validators, engine, API routes, 501 texts, feeds, search, hyper mode, scripts |
| [farcasterorg/hypersnap-docs-web](https://github.com/farcasterorg/hypersnap-docs-web) | `85fb17b`, 2026-04-13 | §1.1, §3: the API's self-description, rate limits, EIP-712 domain, build-a-client guide |
| [arcacomputer/hypersnapweb](https://github.com/arcacomputer/hypersnapweb) | `02ef0f0`, 2026-09-02 | hypersnap.org's curated facts: organisation date, public node, requirements, token notice |
| [arcabotai/hypersnap-web](https://github.com/arcabotai/hypersnap-web) (Opencaster) | `ef608f8`, 2026-10-22 | §4: licence, gateway, Worker, signing model, scopes, exclusions, beta status |
| [farcasterxyz/snapchain](https://github.com/farcasterxyz/snapchain) | `8f82bcc` pinned; `85c49b0` 2026-10-22 for the v18 sets and 0.14.3 | §2.3, §3: read-node signature verification, onchain-config scripts, validator history |
| [neynarxyz/OAS](https://github.com/neynarxyz/OAS) | `6c6307d`, 2026-08-07 when read; the audit now compares against the current spec and asserts "all but one path" | §0, §3: the 104 `/v2/farcaster/*` paths Hypersnap is compared against |
| farcasterorg/protocol discussions [#4](https://github.com/farcasterorg/protocol/discussions/4), [#5](https://github.com/farcasterorg/protocol/discussions/5), [#13](https://github.com/farcasterorg/protocol/discussions/13), [#19](https://github.com/farcasterorg/protocol/discussions/19) | web, 2026-10-22 | §2.1–2.2 |
| Press on the Network School acquisition and on the fork's token discussion | web excerpts, 2026-10-22 | §2.2, §5; **unverified** beyond the excerpts |

Pinned by `scripts/audit-protocol-claims.mjs`: every row of the table in §1,
the 501 texts, the "for you" alias, the route count and the Neynar overlap, the
validator-list comparison and the signature-verification strings, the docs
quotations in §1.1, the site's curated facts, and the Opencaster statements in
§4. Not checkable offline: the discussions, the press, hypersnap.org as served,
and the state of `haatz`.
