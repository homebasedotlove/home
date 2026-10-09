# Plugging Home into Farcaster and Snapchain

How a Farcaster client actually connects to the network in late 2026, what the
reference client does instead, what Home should do, and where the hard limits
are. Written 2026-10-05 against the primary sources listed at the end, each
pinned to a commit. Numbers are quoted from code or finalized proposals, not
from marketing pages.

The mechanism underneath this page, from why the registries sit on OP Mainnet
to what happens to a submitted message block by block, is in
[`../research/protocol-mechanics.md`](../research/protocol-mechanics.md).

What could **not** be verified from this sandbox: live values of the on-chain
contracts (the public OP Mainnet RPC is blocked here), the current text of
`docs.farcaster.xyz` and `docs.neynar.com` (both blocked; the docs repository
clone from 2026-04-07 stands in), and anything that needs a phone.

---

## 0. The short version

Farcaster is three systems, and a client plugs into each one differently:

| Layer | Where it lives | How a client talks to it |
| --- | --- | --- |
| Identity, keys, storage rent | OP Mainnet contracts (Tier Registry on Base, config registry on Ethereum L1) | Ethereum JSON-RPC, viem; writes cost gas |
| Social data (casts, reactions, follows, profiles, signers) | **Snapchain**, a permissioned BFT chain with two data shards | HTTP `:3381` or gRPC `:3383` on a node you run or rent; messages are signed protobufs |
| Everything Farcaster added on top (ranked feeds, channels today, moderation, direct casts, notifications, search, spam labels) | Farcaster's own backend | Documented part: `https://api.farcaster.xyz` with an app-key token. Undocumented part: `farcaster.xyz/~api`, which is what the reference client (and therefore Home's fork) calls today |

Home's current build is a client of the third layer only. It never touches
Snapchain. That is the single most important fact in this document: the data
that makes Home's why-chip work (`meta.includeReason`, `meta.score`,
`authorQuality`) is produced by Farcaster's private ranking service and has no
equivalent on the protocol. Plugging into Snapchain "properly" therefore means
adding a protocol-native data path next to the one Home has, not swapping one
for the other, and accepting that discovery ranking becomes Home's own job.

The recommendation (section 4) is: keep the fork's UI, put the data layer behind
an adapter, add a protocol path through Neynar's hosted Snapchain and managed
signers now, run a node later, and write through gasless signers (live on
mainnet since 2026-05-07) wherever the user has a wallet.

---

## 1. What changed since Hubble

The Snapchain repository at `v0.14.2` (2026-08-13) is the reference
implementation and the only one on mainnet. Hubble is retired. Facts a client
author needs, with where each comes from:

**Consensus and trust.** Snapchain is a Malachite BFT chain. The validator set
is hard-coded in `validators.toml` and, as of August 2026, is being moved to an
on-chain `SnapchainConfigRegistry` on Ethereum L1 at
`0x00000000fc51aD6eb74EAE89ba4b01b1776fBA85` (FIP #277, "Review" stage, writes
owner-only from a single EOA for now). The latest set in `validators.toml` has
seven keys. The docs table attributes five to Neynar and one to Uno; the
seventh is not attributed. There is no permissionless validation. A node you
run is a **read node**: it follows blocks and serves queries, it does not vote.

**Who maintains it.** Neynar acquired Farcaster from Merkle on 2026-01-21 and
maintains the protocol, the clients and the Snapchain repo (issue references in
the code read `NEYN-…`). Neynar is also the main hosted-infrastructure vendor.
Plan for that concentration; it is not a reason to avoid the protocol.

**Versions ship every few weeks and are time-gated.** `src/version/version.rs`
holds the mainnet schedule. Features that matter to a client:

| Engine version | Active on mainnet | What it enabled |
| --- | --- | --- |
| V5 | 2025-06-16 | Farcaster Pro tier, Basenames, primary addresses |
| V11 | 2025-10-08 | Storage lending (`LEND_STORAGE`, type 15) |
| V14 | 2025-10-29 | Revoking a signer no longer deletes its past messages (FIP #238) |
| V16 | 2026-05-07 | **Gasless signers** (`KEY_ADD` 16 / `KEY_REMOVE` 17, FIP #266) |
| V17 | 2026-06-04 | `USER_DATA_TYPE_LIVE_AT` (14), live activity (FIP #269) |
| V18 | 2026-06-22 | One more free year on every already-rented storage unit |
| V19 | 2026-07-27 | Block links (FIP #263) |
| V20 | 2026-08-13 | Four embeds per cast for everyone (was two, four for Pro) |
| V21 | **not scheduled** | On-protocol channels (FIP #276, draft). Code is in `0.14.1`, gated, "blocked on the mainnet registrar deployment" |

The protocol specification repository (2026-06-18) still documents neither
`KEY_ADD` nor channels. Read the Snapchain repo, not the spec, for current
behaviour, and poll `GET /v1/info` for the next engine version timestamp.

**Message rules a composer must respect** (`src/core/validations`):

| Rule | Value |
| --- | --- |
| Plain cast text | 320 bytes; `LONG_CAST` up to 1024; `TEN_K_CAST` Pro only |
| Embeds per cast | 4 since V20 |
| Timestamp | Farcaster epoch seconds (from 2021-01-01); at most 10 minutes in the future (`ALLOWED_CLOCK_SKEW_SECONDS`; the docs page still says 15) |
| Encoding on submit | `Message` protobuf as `application/octet-stream`, **`dataBytes` set and `data` unset** |
| Delivery | `submitMessage` is best-effort; a 200 means "in the mempool", not "in a block" |

**Storage is per FID, per unit, per message type**, and older units are more
generous (`src/storage/store/stores.rs`):

| Unit cohort | Casts | Reactions | Links | Profile fields | Verifications | Name proofs | Valid for (after V18) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Legacy (rented before 2024-08-24) | 5000 | 2500 | 2500 | 50 | 25 | 5 | 4 years |
| 2024 (before 2025-07-16) | 2000 | 1000 | 1000 | 50 | 25 | 5 | 3 years |
| 2025 (rented since) | **100** | **200** | **200** | 25 | 5 | 2 | 1 year (2 for the pre-cutoff cohort) |

When a store is full the oldest message is pruned, not the newest rejected.
When all units expire there is a 30-day grace period before everything is
pruned. FIP #229 (finalized 2025-04-18) set the 2025 unit price at **$0.20 per
year**; the docs repository still says "$7 today" on its messages page, which
is stale text from the old denomination. The live `usdUnitPrice()` could not be
read from here.

**Rate limits** (`src/mempool/mempool.rs`): when a node enables them, a FID may
submit `max(100, total storage allowance ÷ 10)` messages per hour. `KEY_ADD` is
always capped at one per minute per FID; `KEY_REMOVE` is never limited.
`LIVE_AT` heartbeats get 5000 per unit per hour on their own budget. Blocks
carry at most 1000 messages (`max_messages_per_block`).

---

## 2. How to plug in, layer by layer

### 2.1 Reading protocol data

Three options, in increasing order of independence:

1. **Neynar's hosted Snapchain** at `https://snapchain-api.neynar.com`, the
   same `/v1/*` HTTP surface as a node (casts, reactions, links, user data,
   signers, storage limits, on-chain events, `submitMessage`,
   `validateMessage`, `events`), authenticated with an `x-api-key` header. An
   API key cannot ship in a browser bundle, so this needs a thin server.
2. **Neynar's v2 API** at `api.neynar.com` for things a node does not compute:
   feeds filtered by following, FIDs, channel, parent URL or embed; user
   search; cast search; conversations; metrics. The 2026-08-07 OpenAPI spec has
   **no "for you" endpoint**: nothing in the public vendor surface returns a
   ranking reason for a cast.
3. **Your own node.** `getting-started.mdx` asks for 16 GB RAM, 4 cores, 2 TB
   of disk and a public IP with 3381–3383 open; the snapshot is about 200 GB
   and takes hours to sync; the AWS walk-through budgets roughly $100 a month.
   The node's HTTP server sends `Access-Control-Allow-Origin: *` by default, so
   a browser can read it directly. Anything that needs an index the node lacks
   (a reverse-chronological "following" timeline is the first one) is built by
   mirroring into Postgres with `@farcaster/shuttle` (1.0.3, 2026-07-29).

Snapchain serves lists keyed by FID, by parent, by target and by mention. It
has no feed, no search, no notifications and no ranking. A client built only on
Snapchain shows a chronological timeline of the accounts you follow and must
fan out one `linksByFid` plus N `castsByFid` calls to build it, or mirror.

### 2.2 Writing

Build the message with `@farcaster/core` 0.20.0 / `@farcaster/hub-nodejs`
0.17.0 (both 2026-07-29; the builders set `dataBytes`), sign it with the user's
Ed25519 signer, and POST it to `/v1/submitMessage` on a node you can reach.
Then confirm it by reading it back or by following `/v1/events`, because
inclusion is best-effort. The gRPC-web package `@farcaster/hub-web` is
"not fully supported" per the migration guide; use HTTP from browsers.

A node without `--rpc-auth` accepts submissions from anyone who can reach port
3381. If Home runs a node, the write port sits behind Home's own service.

### 2.3 Getting a signer for the user

This is the step that decides Home's onboarding. Four paths exist today:

| Path | Who signs what | Gas | User experience | Status |
| --- | --- | --- | --- | --- |
| **Gasless `KEY_ADD`** | Home's app FID signs a `SignedKeyRequest` on the off-chain domain; the user's **custody address** signs an EIP-712 `KeyAdd` over key, scopes, TTL and nonce; the new key signs the envelope | none | "Sign with your wallet". Instant. | Mainnet since V16 (2026-05-07); FIP #266 finalized 2026-05-12 |
| **Signed key request via the Farcaster app** | Home's app FID signs the on-chain-domain `SignedKeyRequest`; `POST https://api.farcaster.xyz/v2/signed-key-requests` returns a deeplink and token; the user approves in the Farcaster app, which submits `KeyGateway.add` | paid by the user, or by Home as sponsor (`sponsor` signature) | QR on web, deeplink on mobile; poll `GET /v2/signed-key-request?token=` until `completed` | Documented, long-standing |
| **Neynar managed or sponsored signer** | Neynar holds or registers the key; `POST /v2/farcaster/signer/signed_key` takes `app_fid`, `deadline`, `signature`, optional `sponsor`; approval still happens in the Farcaster app via the returned URL | Neynar can sponsor | Same as above, with Neynar operating the key | Current; Neynar's "Sign In With Neynar" is deprecated in favour of it |
| **Reference-client path** | The fork's backend mints a signer for a signed-in user and **pays the gas** for `KeyGateway.add` (`useCreateExternalUserSigner.ts`); approval of third-party requests goes through `/v2/approve-signed-key-requests` | backend | Invisible to the user | Private backend only; a fork cannot run it |

Gasless keys have properties the on-chain ones do not: every key must list the
message types it may sign (no "full authority" shortcut), carries a sliding TTL
of at most 90 days refreshed on use, consumes a per-FID nonce, and a FID may
hold at most 1000 active keys. A key can always revoke itself. On-chain keys
are grandfathered scope-free. For Home this means asking for exactly the scopes
the feature needs (casts, reactions, links, profile) and re-asking when the key
expires.

What is **not** established: whether the Farcaster app approves gasless
`KEY_ADD` requests on a user's behalf. FIP #266 specifies no wallet-app flow,
and the docs' signer-request guide still describes the on-chain transaction.
Until that is confirmed on a device, gasless signers are for users who control
their custody key in a wallet Home can prompt, and Farcaster-app users go
through the signed-key-request deeplink.

Auth addresses (FIP #225, finalized) are the other half: a KeyRegistry key of
type 2 that may **sign in** but never post, so smart-wallet users can log into
many clients without exposing custody. New clients are expected to request the
auth address and the signer in one transaction.

### 2.4 Authenticating the user

| Need | Mechanism | Library |
| --- | --- | --- |
| Prove who the visitor is | Sign In With Farcaster through `https://relay.farcaster.xyz`; the user scans or taps and the Farcaster app (or an auth address wallet) signs | `@farcaster/auth-client` 0.7.1, `@farcaster/auth-kit` 0.8.2 (2026-02-05) |
| Inside a mini app | Quick Auth against `https://auth.farcaster.xyz`, returns a JWT | `@farcaster/miniapp-sdk` 0.3.0 |
| Call the Farcaster Client API | Self-signed bearer: base64url header `{fid, type:'app_key', key}`, payload `{exp}`, Ed25519 signature by a signer the FID has approved | any Ed25519 signer |

Note the dependency: most authenticated Client API endpoints need an app key,
which is a signer. Home cannot call them for a user who has not yet approved a
Home signer.

### 2.5 Creating an account

Only wallet apps create accounts, and the official client only does so on
mobile. If Home signs people up it becomes a wallet app:

1. `IdGateway.register(recovery)` on OP Mainnet at the current `price()`, or
   the `Bundler` to register, rent storage and add keys in one transaction. The
   writing-messages guide budgets about $10 of ETH on OP Mainnet for the whole
   flow.
2. Rent at least one 2025 unit (100 casts, 200 reactions, 200 links). Or lend
   one: since V11 an FID with spare units can `LEND_STORAGE` to another FID, a
   clean sponsorship primitive.
3. Register an fname off-chain at `https://fnames.farcaster.xyz/transfers`
   with an EIP-712 `UserNameProof` from the custody address, then set it with a
   `USER_DATA_ADD` of type username.
4. Add a signer (section 2.3) and the profile fields.

Neynar wraps steps 1–2 in `POST /v2/farcaster/user/register/`, which requires an
`x-wallet-id` header naming the Neynar-side wallet that funds the transaction,
with `GET /v2/farcaster/user/fid/` to reserve a fresh FID.

### 2.6 What still lives only in Farcaster's backend

| Surface | Today | On the horizon |
| --- | --- | --- |
| Ranked home feed with reasons and scores | private `~api`; nothing public | nothing proposed |
| Channels: metadata, members, follows, pins, moderation | `api.farcaster.xyz` Client API (documented, app-key auth) | FIP #276 draft; `ChannelUpdate` 18, `ChannelMember` 19, `ChannelPin` 20, `ChannelModerate` 21 are in the proto and gated to V21; registrations through a stock Basenames registrar, Base by default with Ethereum L1 still under consideration |
| Direct casts | off-protocol, API keys on request | FIP #226 draft since 2025-03 |
| Blocks, verifications of connected accounts, primary addresses, starter packs | Client API | partly on protocol already (primary addresses since V5) |
| Notifications, search, spam labels, quality scores, Pro | backend | nothing public |

---

## 3. What the reference client does, and therefore what Home does today

Read at snapshot `b6922e2` of `farcasterxyz/client`:

- Web calls `farcaster.xyz/~api`, mobile calls `client.farcaster.xyz`, both
  with a per-user bearer token from the client's own sign-in. Neither host is
  the documented Client API.
- Casts are created with `apiClient.createCast(...)`; the backend signs and
  submits. The client repository has **no** import of `@farcaster/core`,
  `hub-nodejs` or `hub-web`, and no code that speaks to port 3381 or 3383.
- The feed arrives pre-ranked with `meta.includeReason` (ten values),
  `meta.score` and `authorQuality`. Home's kernel sifts and groups on exactly
  these fields.
- Signer management is a backend concern: `/v2/signed-key-requests`,
  `/v2/approve-signed-key-requests`, `/v2/warpcast-signed-key-request`, and
  gas paid server-side.

So the fork is fully functional as a *client of Farcaster's service* and not at
all as a *protocol client*. That is fine for the UX work done so far. It is not
a position Home can stay in: the `~api` surface is undocumented, the terms of
calling it from a fork are the operator's, and every feature Home adds on top
of it inherits that dependency.

---

## 4. The integration Home should build

Three postures were weighed. The first is where Home is; the third is where it
can end up; the second is the recommendation for now.

| Posture | Reads | Writes | Reasons for the why-chip | Cost | Dependency |
| --- | --- | --- | --- | --- | --- |
| A. Client of Farcaster's backend (today) | `~api` | `~api` | server-provided, all ten | zero | total, undocumented |
| **B. Connected app on protocol data** | Neynar hosted Snapchain + v2 feeds, behind a thin Home service | user's signer via gasless `KEY_ADD` or Farcaster-app approval; `submitMessage` through the service | following, channel, reply, recast, mention, keyword and author rules are **derivable from protocol data**; discovery reasons come from Home's own ranking | Neynar plan + a small server | vendor, swappable for a node |
| C. Own node | own Snapchain read node + shuttle/Postgres | own node | same as B | ~$100+/month, 2 TB, ops | none beyond the validator set |

Concretely:

1. **Put the data layer behind an adapter.** `useFeedItems` already funnels
   through `personalizeFeedItems`; the adapter sits one level below it and
   yields the same `ApiCastFeedItem` shape from either source, with
   `meta.includeReason` synthesised when the source is protocol data. The
   kernel does not change.
2. **Synthesise reasons honestly.** From protocol data Home can label
   `following`, channel membership, replies, recasts and mentions with
   certainty. It cannot label "high quality unfollowed" or "evergreen author"
   without a ranking model; those chips read "Home's pick" and are driven by
   Home's own scorer, and the receipts ledger says so.
3. **Request scoped gasless signers first**, with the Farcaster-app deeplink as
   the fallback. Ask for the scopes a feature needs, store the key per device,
   handle the 90-day sliding expiry as a re-consent, and honour the one
   `KEY_ADD` per minute limit in the UI.
4. **Keep the service thin and stateless**: hold the Neynar key, proxy
   `submitMessage` and the few authenticated Client API calls (channel follows,
   blocks), rate-limit per FID in line with the mempool formula, and nothing
   else. Everything that can be a browser call to a node stays one, so posture
   C is a configuration change.
5. **Surface storage.** Read `storageLimitsByFid` on sign-in and show the cast
   budget before the user hits the 101st cast on a single 2025 unit. Offer to
   lend a unit from Home's FID as the sponsorship path.
6. **Treat the private backend as optional.** Keep posture A as the source for
   the ranked feed only while Home's own ranking is immature, clearly labelled,
   so that switching it off removes a feature rather than breaking the client.

---

## 5. Limitations, with numbers

1. **No ranked feed on the protocol.** Snapchain returns lists; neither it nor
   Neynar's public API returns a reason or score per cast. Discovery is Home's
   own problem or a vendor contract.
2. **Writing needs consent Home cannot grant itself.** Either a custody-wallet
   signature (gasless) or an approval in the Farcaster app (on-chain, gas paid
   by someone). Whether the Farcaster app approves gasless requests is
   unverified.
3. **Sign-up costs money and needs a wallet.** Registration at `price()` plus
   storage; about $10 of ETH on OP Mainnet end to end; only wallet apps do it.
   A new 2025 unit holds 100 casts, 200 reactions, 200 links, 25 profile
   fields, 5 verifications and 2 name proofs, then prunes the oldest.
4. **Throughput caps.** Per FID, `max(100, allowance ÷ 10)` messages per hour
   where a node enforces limits; one `KEY_ADD` per minute; 320-byte casts
   (1024 as long casts, 10 KB for Pro); 4 embeds; 1000 messages per block.
5. **Delivery is best-effort.** A successful `submitMessage` can still miss a
   block; `dataBytes` is mandatory; confirmation means reading back.
6. **Half the product is off-protocol** (section 2.6): channels until V21
   ships on mainnet, moderation, direct casts, notifications, search, labels,
   Pro. The documented way in is `api.farcaster.xyz`, which needs an approved
   signer to call.
7. **The chain is permissioned and concentrated.** Seven validator keys, most
   attributed to Neynar; the config registry is owner-only; the main hosted
   provider is the same company. Running a node buys read independence, not a
   vote.
8. **Running a node is real ops.** 16 GB RAM, 4 cores, 2 TB, public IP,
   ~200 GB snapshot, hours to sync, ~$100/month on AWS; Postgres, Redis and
   Node 21 for shuttle.
9. **The target moves every few weeks.** Five engine versions between May and
   August 2026; the spec repository lags the code; libraries must track
   `GetInfo`'s next-version timestamp.
10. **This sandbox could not confirm live prices or vendor terms.** Storage
    price, registration price, Neynar plan limits (reported: a free tier with
    10M credits and a $249 tier with 60M credits that includes the hub
    endpoint) and mobile approval flows all need a real network and a device.

---

## Sources

Repositories were shallow-cloned; the commit date is the state read.

| Source | State read | Used for |
| --- | --- | --- |
| [farcasterxyz/snapchain](https://github.com/farcasterxyz/snapchain) | `8f82bcc`, 2026-08-13, v0.14.2 | version schedule, limits, rate limits, protos, HTTP API, node guide, writing guide, validators |
| [farcasterxyz/protocol](https://github.com/farcasterxyz/protocol) | `aa6bdfb`, 2026-06-18 | specification, FIP discussions [#225](https://github.com/farcasterxyz/protocol/discussions/225), [#226](https://github.com/farcasterxyz/protocol/discussions/226), [#229](https://github.com/farcasterxyz/protocol/discussions/229), [#238](https://github.com/farcasterxyz/protocol/discussions/238), [#262](https://github.com/farcasterxyz/protocol/discussions/262), [#263](https://github.com/farcasterxyz/protocol/discussions/263), [#266](https://github.com/farcasterxyz/protocol/discussions/266), [#269](https://github.com/farcasterxyz/protocol/discussions/269), [#272](https://github.com/farcasterxyz/protocol/discussions/272), [#276](https://github.com/farcasterxyz/protocol/discussions/276), [#277](https://github.com/farcasterxyz/protocol/discussions/277) |
| [farcasterxyz/docs](https://github.com/farcasterxyz/docs) | `3a02c82`, 2026-04-07 | Client API reference, signer requests, apps, contracts, direct casts |
| [farcasterxyz/contracts](https://github.com/farcasterxyz/contracts) | `58d6b28`, 2026-08-13 | StorageRegistry, SnapchainConfigRegistry, TierRegistry |
| [farcasterxyz/auth-monorepo](https://github.com/farcasterxyz/auth-monorepo) | `ae3dffd`, 2026-03-30 | SIWF relay |
| [farcasterxyz/miniapps](https://github.com/farcasterxyz/miniapps) | `8a052e4`, 2026-08-04 | Quick Auth |
| [neynarxyz/OAS](https://github.com/neynarxyz/OAS) | `6c6307d`, 2026-08-07 | v2 API and hosted Snapchain API specs |
| [farcasterxyz/client](https://github.com/farcasterxyz/client) | `b6922e2` | what the reference client calls |
| npm registry | read 2026-10-05 | `@farcaster/core` 0.20.0, `hub-nodejs` 0.17.0, `hub-web` 0.13.0, `shuttle` 1.0.3, `auth-client` 0.7.1, `auth-kit` 0.8.2, `miniapp-sdk` 0.3.0 |
| [Neynar: "Neynar is acquiring Farcaster"](https://neynar.com/blog/neynar-is-acquiring-farcaster), [The Block](https://www.theblock.co/amp/post/386549/haun-backed-neynar-acquires-farcaster-after-founders-pivot-to-wallet-app) | 2026-01-21 | stewardship |
| [Farcaster blog: "Snapchain is now live"](https://farcaster.blog/snapchain-is-now-live) | 2025-04 | mainnet cut-over |
| [Neynar developer pricing](https://dev.neynar.com/pricing) (via search snippets; page blocked here) | 2026 | plan tiers |
