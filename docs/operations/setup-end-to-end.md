# Setting Home up end to end on the Farcaster protocol

The runbook: what to create, what to run, what to change in the code, and how
to prove each step, so that a reader can sign in to Home with a Farcaster
account, read the network, post to it, and be told what happened. Written
2026-10-14 against the pinned sources (see the end). Facts that could be checked
against a file are pinned by `scripts/audit-protocol-claims.mjs`; anything that
needs a real network is marked **untested**.

Read [plugging into Snapchain](plugging-into-snapchain.md) for the limits and
[protocol mechanics](../research/protocol-mechanics.md) for why each step is
shaped the way it is. This page assumes both.

---

## 0. Do we have to run or rent a node?

To read or write the protocol directly, Home needs **access to a Snapchain
node**. There are four ways to get it, and the right answer changes with the
stage Home is at.

| Way in | What you get | Cost | Who runs it | Verified |
| --- | --- | --- | --- | --- |
| **Farcaster's public read nodes** | the full `/v1` HTTP API on `https://snap.farcaster.xyz:3381`, `https://pop.farcaster.xyz:3381` (a read node), `https://snap.uno.fun:3381` (the community validator); testnet on `https://iris.farcaster.xyz:3381`, `juno`, `vega` | free | Merkle, Uno | the hosts are in Snapchain's compiled-in node registry as public API URLs; whether they accept writes without auth, and their rate limits, are **untested**. `crackle` is documented as password-protected for writes |
| **Neynar's hosted node** | the identical `/v1` surface at `https://snapchain-api.neynar.com`, plus the v2 API (feeds, search, notifications, webhooks, signers) and `POST /v2/farcaster/message/`, which publishes a message you signed yourself | credits; a free tier of 10M credits a month is reported to include the hub endpoint, and `/v1/events` is reported to cost 2,000 credits a call | Neynar | plan numbers are search excerpts; the pricing page is blocked here |
| **Your own read node** | everything above on hardware you control, with no API key in the path; writes work because a read node gossips them to the validators | about $100 a month on AWS; 16 GB RAM, 4 cores, 1.5 to 2 TB, public IP, ports 3381 to 3383; two hours to sync from a snapshot | you | the compose template and bootstrap script are read from the repo |
| **A local devnet** | four nodes on your laptop with synthetic accounts, for development and tests only | nothing | you | the `make dev` compose and `fc devnet bootstrap` are read from the repo |

So the answer is: **rent first, run later, and never for development.** Develop
against the local devnet, test against the public testnet, launch reads
against Neynar's hosted node (and Farcaster's public read nodes where their
policy allows), and run a read node of Home's own when the event stream and
read volume make the credits cost more than a server. Home does not need to be
a validator for anything; validators are a permissioned set and a read node
can write.

The one thing none of these replaces is Farcaster's **ranked feed**. Snapchain
and Neynar give Home lists; the "for you" ordering and the `includeReason` the
why-chip reads today exist only in Farcaster's private backend. The plan below
synthesises the derivable reasons and leaves discovery ranking to Home.

---

## 1. Target architecture

```
browser (Home web app)
  ├─ reads ────────► Snapchain node (/v1, CORS *)            own node, Neynar hosted, or public
  ├─ reads ────────► Home service ─► Neynar v2 (feeds, search, notifications)
  ├─ signs ──┐
  └─ session ┴─────► Home service
                       ├─ verifies Sign In With Farcaster (relay + OP Mainnet RPC)
                       ├─ signs SignedKeyRequests with Home's app custody key
                       ├─ submits signed messages to the node, confirms by events
                       ├─ receives Neynar webhooks (cast, reaction, follow, user)
                       ├─ stores signer records and preferences (KV / Postgres)
                       └─ issues media upload URLs (object storage)
OP Mainnet: read-only unless Home registers accounts or buys storage
```

Where keys live, which is the decision that shapes everything else:

| Key | Lives in | Why |
| --- | --- | --- |
| The reader's **custody** key | their wallet or the Farcaster app; never Home | Home is a connected app |
| The reader's **Home signer** (Ed25519) | generated and kept **in the browser**, one per device; authorised by gasless `KEY_ADD` or the Farcaster-app deeplink | the key never leaves the device, so Home's service holds no posting authority; gasless keys make a key per device cheap. Store it in IndexedDB; use WebCrypto Ed25519 where the browser has it (non-extractable), `@noble/ed25519` via `@farcaster/core` otherwise. Browser support for WebCrypto Ed25519 could not be checked from this sandbox |
| **Home's app custody key** | the service's secret store (or a KMS) | it signs every `SignedKeyRequest`; compromise lets an attacker attribute keys to Home, not post for users |
| Home's **Neynar API key**, node auth | the service | never in a bundle |
| The reader's **session** | a short-lived JWT from the service after SIWF | replaces the backend bearer token the fork uses today |

Everything else is stateless. The service is small by design: it exists for
the three secrets above, for CORS-free access to vendor APIs, and for webhooks.

---

## 2. Accounts and credentials to create

| # | Create | Used for | Notes |
| --- | --- | --- | --- |
| 1 | **A Farcaster account for Home itself** (the app fid) | `requestFid` in every `SignedKeyRequest`; the "Home" entry users see when they review connected apps | create it in the Farcaster app or with the Bundler; export or generate its custody key into the service's secret store. Keep the recovery address set |
| 2 | **A domain** Home controls | SIWF binds the signed message to it; the Client API and Quick Auth check it; the web app is served from it | the same domain for app and service avoids CORS entirely |
| 3 | **A Neynar developer account and API key** | hosted Snapchain, v2 feeds, search, notifications, webhooks, signers | optional **wallet id** only if Home sponsors account registration |
| 4 | **An OP Mainnet RPC URL** | SIWF verification reads `idOf` on the IdRegistry and `keyDataOf` on the KeyRegistry; optional direct reads of custody, keys and storage | `@farcaster/auth-client` falls back to a public endpoint with a warning; use a provider key in production |
| 5 | **Static hosting** for `build/` and **a serverless or small server host** for the service | | any host with an SPA fallback; the service is Node 20 |
| 6 | **Object storage** for media (images now, video later) | `generate-image-upload-url` and the video upload family have to be replaced | the reference client uses Cloudflare Images and a TUS video upload |
| 7 | **A key-value store or Postgres** | signer records (device, fid, public key, scopes, expiry), preferences sync, webhook cursors | |
| 8 | Optional: **a Linux host for a read node** | when stage 4 is reached | the AWS guide: m5.xlarge, 2 TB gp3 |

Nothing here needs Apple, Google, Expo or Firebase. Those belong to the mobile
track in [running the client](running-the-client.md).

---

## 3. Stage 1: develop against a local devnet

A devnet is the only place Home can exercise the whole write path with no real
accounts and no cost.

1. Clone `farcasterxyz/snapchain` and run `make dev`. The compose file builds
   the image from source and starts four nodes; `node1` publishes HTTP on
   `3381` and gRPC on `3383`. The image bakes in `admin_rpc_auth = dev:dev`
   and ships the `fc` CLI.
2. Register synthetic accounts: `fc devnet bootstrap --grpc-node
   http://127.0.0.1:3383 --auth dev:dev --fid 200001 --count 60`. It submits
   the three on-chain events a usable fid needs (storage rent, id-register, a
   signer) straight to the admin service and prints each fid's signer secret.
   Give the node a few blocks before writing.
3. Point Home at it: node URL `http://127.0.0.1:3381`, network `devnet`. The
   devnet accepts messages tagged with any network, but tag them `DEVNET`.
4. Prove the loop with the CLI before touching Home: `fc cast-add --node
   http://127.0.0.1:3381 --network devnet --fid 200001 --text "hello"` with
   `SIGNER_SECRET` set, then `fc subscribe --shard 1 --grpc-node
   http://127.0.0.1:3383` and watch the `MERGE_MESSAGE` arrive.

What a devnet cannot do: gasless `KEY_ADD` for a bootstrapped fid, because the
bootstrap invents a custody address with no key. To test `KEY_ADD`, submit your
own `ID_REGISTER` event through the admin service with a custody address whose
key you hold, then run `fc key-add`. Contract-wallet verifications also need a
chain RPC the devnet does not have.

---

## 4. Stage 2: test against the public testnet

Snapchain runs a public testnet with validators at `iris`, `juno` and
`vega.farcaster.xyz` (HTTP `3381`, gRPC `3383`); `fc` points at `iris` by
default. Its on-chain connector is hard-wired to OP Mainnet with the network
tag changed, so **mainnet accounts and their signers should be valid on
testnet**, which would make it a free rehearsal of real flows. That inference
is **untested**: the first test is to post a cast from a real account to `iris`
and read it back. Testnet messages are tagged `TESTNET`; a mainnet node rejects
them, so nothing leaks.

---

## 5. Stage 3: the Home service

One deployable, Node 20, TypeScript, stateless apart from the stores in §2.

### 5.1 Endpoints

| Route | Does | Talks to |
| --- | --- | --- |
| `POST /auth/siwf/nonce`, `POST /auth/siwf/verify` | issues a nonce; verifies the SIWF message with `@farcaster/auth-client` (`verifySignInMessage`, which checks `idOf` and auth addresses over the OP RPC); returns a session JWT carrying the fid | relay, OP RPC |
| `POST /signers/request` | for a browser-generated public key: signs the `SignedKeyRequest` with Home's app custody key. Gasless mode returns the typed data the user's custody wallet must sign; deeplink mode calls `api.farcaster.xyz/v2/signed-key-requests` and returns the deeplink and token (with Home's sponsor signature if Home pays) | Client API |
| `POST /signers/complete` | gasless: assembles `KEY_ADD` from the custody signature and submits it; deeplink: polls `/v2/signed-key-request?token=` until `completed`; records the signer | node, Client API |
| `POST /messages` | accepts an encoded, already-signed `Message`; pre-flight checks (session fid equals message fid, signer is one Home recorded, scope admits the type, size); submits to the node; returns the hash | node |
| `GET /messages/:hash/status` | reads the cast back or consults the event cursor; `merged`, `failed`, or `pending` | node |
| `GET /feed/following`, `GET /notifications`, `GET /search` | thin proxies to Neynar v2 with the API key, response shaped to the client's types by the adapter | Neynar |
| `POST /webhooks/neynar` | receives `cast.created`, `reaction.created`, `follow.created`, `user.created`, `user.updated`; updates notification cursors | Neynar |
| `POST /media/upload-url` | returns a signed direct-upload URL to Home's bucket | object storage |
| `GET /storage/:fid` | `storageLimitsByFid` plus a plain-language headroom summary | node |
| `GET /client-api/*` (allow-list) | channel follows, blocks: signs the app-key bearer with a Home-recorded signer the user approved for that purpose | Client API |

### 5.2 Environment

| Variable | Meaning |
| --- | --- |
| `SNAPCHAIN_HTTP_URL` | `http://127.0.0.1:3381` on devnet, `https://iris.farcaster.xyz:3381` on testnet, `https://snapchain-api.neynar.com` or Home's node on mainnet |
| `SNAPCHAIN_GRPC_URL` | the `3383` endpoint, for `Subscribe` |
| `SNAPCHAIN_RPC_AUTH` | `user:pass` when the node runs with `--rpc-auth` |
| `FARCASTER_NETWORK` | `devnet`, `testnet`, `mainnet`; stamped into every message |
| `NEYNAR_API_KEY` | sent as `x-api-key` |
| `HOME_APP_FID`, `HOME_APP_CUSTODY_KEY` (or a KMS reference) | signs `SignedKeyRequest`s |
| `OP_RPC_URL` | SIWF verification, optional registry reads |
| `SIWF_DOMAIN`, `SIWF_URI` | the relying-party domain and login URI |
| `SESSION_SECRET` | JWT signing |
| `MEDIA_BUCKET`, credentials | upload URLs |
| `DATABASE_URL` or KV binding | signer records, preferences, cursors |

### 5.3 Rules the service enforces

- Never accept a message whose fid is not the session's fid.
- Never submit with a signer Home did not record for that fid and device.
- Mirror the node's limits before submitting: 2,048 bytes of data, timestamp
  within 600 seconds, cast text and embed caps, the per-fid hourly budget.
- Treat a `200` from `submitMessage` as "accepted", and report "posted" only
  after the merge event or a successful read-back.
- Rate-limit per fid and per IP in front of the node.

---

## 6. Stage 3, continued: the client changes

The fork keeps its UI. Five seams change, all of them already identified in
the earlier passes.

| Seam in the fork | Today | Becomes |
| --- | --- | --- |
| `WebFarcasterApiClientProvider.tsx`, which constructs `new FarcasterApiClient()` | every call goes to `farcaster.xyz/~api` with a backend bearer | a `HomeDataClient` implementing the subset the screens use, backed by the node, the service and Neynar; the session JWT replaces the bearer |
| `AuthProvider.tsx` and the landing page's email and phone flows | magic link and phone against the backend | `@farcaster/auth-kit`'s `SignInButton` (QR on desktop, deeplink on phones); the callback posts the message to `/auth/siwf/verify` |
| `useCreateCast` and the other mutations (`apiClient.createCast`, reactions, follows, profile) | the backend signs and submits | `makeCastAdd` and friends from `@farcaster/core`, signed with the device key, `Message.encode`, `POST /messages`, then a status poll |
| `useFeedItems`, which already funnels through `personalizeFeedItems` | pre-ranked items with `meta.includeReason` | the adapter yields the same `ApiCastFeedItem` shape from protocol data and synthesises `includeReason` for following, channel, reply, recast and mention; discovery items come from Home's own scorer and say so |
| `WebSocketsProvider.tsx` | `wss://ws.farcaster.xyz/stream` for unseen counts and direct-cast refreshes | polling or server-sent events from the service for unseen notifications; direct casts are off-protocol and are dropped |

The fifteen private endpoints the core screens use, and where each goes:

| Private endpoint | Replacement |
| --- | --- |
| `/v2/feed-items` | Neynar `feed/following` or, with an own node, `linksByFid` plus `castsByFid` merged; reasons synthesised |
| `/v2/casts`, `/v2/thread-casts` | node `castsByFid`, `castsByParent`; Neynar `cast/conversation` for a ready-made thread |
| `/v2/user`, `/v2/user-by-username`, `/v2/me` | node `userDataByFid`, `userNameProofByName`; the session for `me` |
| `/v2/followers`, `/v2/following` | node `linksByTargetFid`, `linksByFid`; Neynar `followers`, `following` with profiles attached |
| `/v2/cast-likes`, `/v2/cast-recasters`, `/v2/recasts` | node `reactionsByCast`; Neynar `reactions/cast` |
| `/v2/all-channels`, `/v2/channel` | Client API `fc/channels` family (needs an approved signer) until V21 lands on mainnet, then node `channelMetadata` |
| `/v2/signed-key-request` | the service's signer routes |
| `/v2/onboarding` | gone; onboarding is SIWF plus a signer |
| `/v1/generate-image-upload-url`, `/v1/prepare-video-upload`, `/v1/upload-video-with-tus`, `/v1/uploaded-video` | `/media/upload-url`; video is a later milestone |

Media deserves its own line: casts carry URLs, not bytes, so a post with an
image is an upload to Home's bucket first and a cast with that URL second. The
reference client's image proxy hosts (`imagedelivery.net`, `wrpcd.net`) keep
working for existing casts because they are just URLs in embeds.

---

## 7. The flows, step by step

**Sign in.** The landing page renders the auth-kit button with a nonce from
the service. The reader scans or taps; the Farcaster app (or an auth-address
wallet) signs a SIWE message bound to Home's domain; the relay returns it; the
service verifies the signature and, through the OP RPC, that the signing
address is the custody or an auth address of the claimed fid; the browser gets
a session. No Farcaster account is created or changed.

**Authorise Home to post.** The browser generates an Ed25519 key and asks the
service for a signer request. Two paths, chosen by what the reader has:

| Reader has | Path | What they see |
| --- | --- | --- |
| a custody key in a wallet they can sign with | **gasless `KEY_ADD`**: the wallet signs an EIP-712 `KeyAdd` over the key, Home's scopes (`CAST_ADD`, `CAST_REMOVE`, `REACTION_ADD`, `REACTION_REMOVE`, `LINK_ADD`, `LINK_REMOVE`, `USER_DATA_ADD` to start), a TTL of up to 90 days and the next nonce from `signersByFid`; the service submits it; usable in a block | one wallet signature; nothing on-chain; expires if unused for the TTL, which Home treats as a quiet re-consent |
| only the Farcaster app | **signed key request**: the service posts the request to `api.farcaster.xyz/v2/signed-key-requests`, optionally with Home's sponsor signature so the reader pays no gas; the reader approves in the app, which adds the key on-chain; the service polls to `completed` | a QR or deeplink and one approval; the key is on-chain, scope-free and permanent |

Whether the Farcaster app will sign a gasless `KeyAdd` for a connected app is
**untested**; until it is, Farcaster-app users take the second path.

**Read the home feed.** Following timeline from Neynar's `feed/following`
(or, with an own node and a mirror, from the follow graph), channels the reader
follows through the Client API, replies and mentions from the node. The adapter
labels each item with a derivable reason; the why-chip, ledger and undo run
unchanged on top. Discovery is a separate, labelled slice from Home's scorer,
or absent.

**Post.** Compose, upload media to Home's bucket, build `CastAddBody` (text ≤
320 bytes as a plain cast, up to 1,024 as a long cast, ≤ 4 embeds, ≤ 10
mentions with byte positions), `makeCastAdd` with the device key and
`FARCASTER_NETWORK`, encode, `POST /messages`, show "posting", then "posted" on
the merge event. Reactions, follows and profile edits are the same four steps
with a different builder.

**Delete and undo.** `makeCastRemove` with the cast's hash; `makeReactionRemove`;
`makeLinkRemove`. All are messages with a later timestamp.

**Notifications.** Neynar webhooks for `reaction.created`, `follow.created` and
`cast.created` filtered to mentions and replies to the reader's casts, written
to a per-fid notification log the client polls; or, with an own node,
`Subscribe` on both shards and the same filtering. Unseen counts replace the
reference client's websocket.

**Storage.** On sign-in, `storageLimitsByFid`; show the cast budget before the
reader hits the 101st cast of a single 2025 unit; offer `StorageRegistry.rent`
through the reader's wallet, Neynar's `storage/buy`, or a lent unit from Home's
own fid (`LEND_STORAGE`).

**Sign out and revoke.** Clear the session; offer to revoke the device key:
gasless keys self-revoke with a `KEY_REMOVE` signed by the key itself, on-chain
keys need the reader to remove them in the Farcaster app or via `KeyGateway`.

**Account creation**, if Home decides to be a wallet app: `Bundler.register`
with a storage unit and the first key, paid by the reader's wallet or sponsored
by Home, or Neynar's `user/register` with a Neynar-held wallet; then an fname
through `fnames.farcaster.xyz/transfers` and a `USER_DATA_ADD` username. This
is deliberately after everything else.

---

## 8. Stage 4: mainnet, then an own node

1. Switch `FARCASTER_NETWORK` to `mainnet`, `SNAPCHAIN_HTTP_URL` to Neynar's
   hosted node, and run the §9 checklist with one real account.
2. Watch two numbers: Neynar credits per day, and the share of reads that are
   plain `/v1` lookups. When `/v1/events` polling or the read volume costs
   more than a server, run a read node:
   `curl -sSL https://raw.githubusercontent.com/farcasterxyz/snapchain/refs/heads/main/scripts/snapchain-bootstrap.sh | bash`
   on the host from §2. The script installs Docker, writes a `config.toml`
   with `read_node = true`, `fc_network = "Mainnet"`, the gossip bootstrap
   peers and the snapshot bucket, appends `validators.toml`, and adds a weekly
   auto-upgrade cron. A read node needs **no OP, Base or L1 RPC**: it learns
   on-chain state from blocks; the connectors start only when an RPC URL is
   configured.
3. Put the node's `3381` behind Home's service for writes (set `--rpc-auth`),
   leave reads open to the browser if you want to skip the service for them
   (the node sends `Access-Control-Allow-Origin: *`), and keep `3382/udp` open
   to the world for gossip.
4. Add `@farcaster/shuttle` into Postgres when Home wants its own timelines,
   search or notification index instead of Neynar's; it needs Postgres, Redis
   and Node 21, and backfills by fid.
5. Keep the node current: `/v1/info` shows `blockDelay` and
   `nextEngineVersionTimestamp`; the auto-upgrade cron tracks releases; a node
   that falls behind an engine version halts by design.

---

## 9. Verification checklist, in order

Each line is a yes or no. Stop at the first no.

| # | Stage | Check | How |
| --- | --- | --- | --- |
| 1 | devnet | node is up and producing blocks | `curl localhost:3381/v1/info` shows `numShards: 2` and advancing heights |
| 2 | devnet | a bootstrapped fid can post | `fc cast-add`, then `castsByFid?fid=200001` returns it |
| 3 | devnet | Home's write path works | sign in is stubbed; the compose box posts through `/messages`; status reaches `merged` |
| 4 | devnet | the ledger and chip run on protocol data | the home feed renders bootstrapped casts with synthesised reasons; mute and undo behave as before |
| 5 | testnet | a real account posts to `iris` and reads it back | this settles whether mainnet signers are valid on testnet |
| 6 | testnet | gasless `KEY_ADD` from a wallet-held custody key | `signersByFid` shows the new key with scopes and expiry |
| 7 | mainnet | SIWF against Home's domain | `/auth/siwf/verify` accepts a real sign-in; the fid matches |
| 8 | mainnet | signed-key-request approval in the Farcaster app | state `completed`; the key appears in `onChainSignersByFid` |
| 9 | mainnet | a cast from Home appears in the Farcaster app | within a few seconds |
| 10 | mainnet | notifications arrive | a like from another account reaches the webhook and the client |
| 11 | mainnet | storage headroom is shown and correct | compare with `storageLimitsByFid` |
| 12 | mainnet | the Farcaster app will sign a gasless `KeyAdd` | the one open protocol question for onboarding |

---

## 10. What is still not known

- Whether Farcaster's public read nodes accept writes or have rate limits
  Home would hit.
- Neynar's current plan limits and the credit cost of hub endpoints beyond the
  reported figures.
- Whether mainnet accounts are valid on testnet, as the code suggests.
- Whether the Farcaster app approves gasless signer requests.
- WebCrypto Ed25519 support per browser, for non-extractable device keys.
- The policy question from the first pass still stands for the fork's current
  data path, and is the reason this page exists.

---

## Sources

| Source | State read | Used for |
| --- | --- | --- |
| [farcasterxyz/snapchain](https://github.com/farcasterxyz/snapchain) `README.md`, `docker-compose*.yml`, `Dockerfile`, `cli/README.md`, `cli/src/main.rs`, `src/main.rs`, `src/network/mesh/nodes.rs`, `src/bin/setup_local_testnet.rs`, `site/docs` | `8f82bcc`, 2026-08-13, v0.14.2 | node runbook, read-node template, devnet, `fc`, public node registry, connector start conditions |
| [neynarxyz/OAS](https://github.com/neynarxyz/OAS) | `6c6307d`, 2026-08-07 | hosted node, publish-message, webhooks, signers, storage |
| [farcasterxyz/auth-monorepo](https://github.com/farcasterxyz/auth-monorepo) | `ae3dffd`, 2026-03-30 | SIWF verification path and relay |
| [farcasterxyz/docs](https://github.com/farcasterxyz/docs) | `3a02c82`, 2026-04-07 | signer requests, feed guide, account guides |
| [farcasterxyz/client](https://github.com/farcasterxyz/client) | `0c289ed`, 2026-09-30 | the seams and endpoints the fork uses |
| `@farcaster/core` 0.20.0, `@farcaster/hub-nodejs` 0.17.0, `@farcaster/auth-kit` 0.8.2 | npm | builders, clients, sign-in |
| Neynar pricing and compute-unit pages | search excerpts only; blocked here | plan and credit figures |
