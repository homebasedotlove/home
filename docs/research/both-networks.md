# Being a Farcaster client and a Hypersnap client at once

The question was: could Home be both a Farcaster client and a Hypersnap
client, and what would that mean? Written 2026-10-23, eight days after Network
School bought Farcaster and one day after the first Hypersnap nodes stalled on
a validator change. Everything dated here was read this week: the repositories
at the commits in §7, two first-hand research notes that read the casts
concerned straight from a node, and press. Repository facts are pinned by
`scripts/audit-protocol-claims.mjs`; casts and press are web-only and marked.
Neither the production API, the public nodes nor farcaster.xyz are reachable
from this sandbox, so no cast was re-read here and every quotation from one is
attributed to the note that read it.

---

## 0. The short answers

- **Yes, and today it is almost free, because there is still one network.**
  Hypersnap nodes are Snapchain read nodes of Farcaster mainnet; on 2026-10-21
  both sides reported about 914 million messages, and a fid read from
  Farcaster's public node, Hypersnap's public node and a self-run Hypersnap
  node returned the same 4,824 messages. "Being both" today means: read from
  any node of either kind, write to any node of either kind, sign in without
  Farcaster's auth server, and let the reader choose. That is Source B in
  `plan.md` with a provider switch, which is already the design.
- **What it buys is independence from two owners at once.** Farcaster's app,
  protocol repositories and "related products" now belong to Network School;
  Neynar's API continuity is "inference", in Neynar's own words; the Sign In
  With Farcaster endpoint was reported down on 2026-10-14. Hypersnap
  is one person's fork whose validator list fell behind within a week. A client
  that depends on neither side's servers keeps working when either stumbles.
- **What it does not mean**: picking a side. Network School's "social smart
  contract" governs its own app, not the protocol, and Balaji says "the
  Farcaster protocol is already open" and is paying people to build
  self-hosted clients. Cassie Heart opposes the takeover and keeps building,
  but has published no pivot date and no fork code. Home can read from both,
  write to both, and promote neither's token, vote or rules.
- **After a Hypersnap pivot, "both" becomes real work, but of a known shape.**
  Two networks with the same fids and (for unmigrated accounts) the same
  message format. Home would tag every item with its network, dedupe by
  message hash, submit each signed message to both networks itself rather than
  trust the relay, and keep its own app fid unmigrated. Migrated users need
  Falcon-512 signing that no browser wallet has, so Home would serve them read-
  only on Hypersnap at first. None of this is buildable yet because the pivot
  exists only as a specification.
- **Three things not to do**: migrate Home's app fid (permanent, and it breaks
  Ed25519-only posting on Hypersnap), copy Opencaster's AGPL code into an MIT
  tree, or use the names Farcaster, Warpcast, Neynar, Network State or Network
  School for any coin or commercial project (Network School's stated rule; Home
  is called Home).

---

## 1. What changed between 2026-10-12 and 2026-10-23

### 1.1 Farcaster: a new owner, a vote, and a prize

| Date (UTC) | Fact | Source and grade |
| --- | --- | --- |
| 2026-10-15 17:47 | Neynar's CEO: "Network School is acquiring Farcaster. We're transferring the Farcaster app, the protocol repositories, and related products to Network School." "Most of the Neynar team will be joining Network School." He and Manan "will be moving on to something new." Terms not disclosed. | cast `0x5d4797540c` as read from the node by [ZAOOS doc 2680]; press agrees |
| 2026-10-15 20:10 | Asked whether third-party clients could lose Neynar's APIs: "I doubt it though given they are pro open source clients and developers building their own clients." | cast `0xc433d9db` (ZAOOS); an opinion, not a policy |
| 2026-10-15 22:15 | Neynar's account: "the neynar apis/backend also seem likely to stay, but neither is explicitly confirmed in the public post rn ... that last part is still inference". | cast `0x61aa81d23e` (ZAOOS doc 2666) |
| 2026-10-15 22:38 | Balaji (fid 37): four steps, "institute law-and-order, create a decentralized democracy, publish a written social smart contract, and then hold an ongoing series of meetups"; repeat offenders "moderated out" by "both humans and AI" with appeals; a vote at `farcaster.xyz/~/vote` with an on-chain ballot on Base; a naming rule: you "can't use Farcaster, Warpcast, Neynar, Network State, or Network School-related names to launch any coin, token, or commercial project"; "the Farcaster protocol is already open", pointing at `github.com/farcasterxyz/client`. | cast `0x83c734e198` (ZAOOS docs 2666 and 2680; fatline cites the same hash) |
| 2026-10-17 14:47 | Balaji's prize: $2,048 (plus $512 and $128) for a three-command tutorial, "provision compute, set up a Snapchain read node, and create a client that reads from that node, with no API keys from anyone", MIT code, one other human must complete it, entries within seven days. | cast `0x50184b62b4` (fatline, fiddy issue #1, ZAOOS) |
| 2026-10-17 18:14 | Balaji's clarification: read nodes do accept message submissions and relay them to validators; gasless app keys exist; seed-phrase import is a developer exercise. | cast `0x0a05d5c832` (fatline research note); matches the code pinned in `plugging-into-snapchain.md` |
| 2026-10-21 17:03 | Balaji: "26,000+ onchain votes... representing ~95% of all accounts that voted"; "prior to the election on October 17, we moderated out only 271 abusive accounts... we received 85 appeals and have accepted ~67% of them"; "another ~4% who chose to opt out." | cast `0xcd34bb74` (ZAOOS doc 2680); his figures |
| 2026-10-20 04:28 | Independent count: the ballot is an ERC-721 on Base at `0x4ecfed276c566aeb49da1f3a888e8dbb7263028d`, `tokenId` = fid, 24,578 holders at Base block 52,840,567; at least 481 accounts opted out and 263 were `moderated_out` (read from the client API's `optInStatus`, which stopped returning opt-outs on 2026-10-19); turnout about 1.7% of the fids above 300,000 that hold a farcaster.xyz key. | [guy-do-or-die/farcaster-census] `data/final-numbers.json`, pinned; ZAOOS read `name()` "Network School Farcaster client", symbol `VOTE`, `totalSupply` 26,720 on 10-21, transfers revert with `TransferDisabled()` |
| press, 10-15 to 10-22 | Rebrand to "Network State Protocol"; a "Network Code" with felony, misdemeanour and infraction tiers applied to past posts; decliners read-only in the main app but keeping keys, funds, followers and history for other clients. | The Block, Cryptobriefing, Cointelegraph, The Defiant; the rename appears in no primary post read by either note |
| 2026-10-19 | The Farcaster docs gain "Recover an account with your own recovery address": one OP Mainnet transaction moves a fid to a new seed phrase; "the username, casts, followers and everything else tied to the FID stay as they are." | `farcasterxyz/docs` `da99c90`, by a Neynar contributor; the docs repository contains no mention of Network School |
| 2026-10-15 to 10-23 | Protocol work continues under the same engineers: Snapchain 0.14.3 with the v18 validator sets, FIP #278 "Cast Format and Chained Casts" (10-21), `fc cast-add --chain --format_version` (10-23). `farcasterxyz/client` is unchanged at `0c289ed`. | pinned `snapchain-latest`; GitHub |

Two first-hand notes read the casts above from a node rather than from the
app: [ZAOOS docs 2666 and 2680](https://github.com/bettercallzaal/ZAOOS)
(a community's research log, which saved raw responses and had each quote
re-checked) and [fatline's state-of-Farcaster note](https://github.com/jpfraneto/fatline).
They are secondary sources with primary method; the hashes let anyone with a
node re-read them.

### 1.2 Hypersnap: a thread, a package, a stall

| Date (UTC) | Fact | Source and grade |
| --- | --- | --- |
| 2026-10-11 | Cassie: "since our initial discussions, neynar hasn't talked with us about our proposal. our read: that likely means a different buyer is being chosen, one they don't expect to be community aligned. we can't wait to find out, so we're moving forward with the hard fork." | cast (ZAOOS doc 2666 §9) |
| 2026-10-12 02:41 | FIP #19 body edited: sections 16 (post-quantum keys, migration, dual-signed messages, spend keys, shielded pool), 17 (the pivot: `PIVOT_HEIGHT` and `GENESIS_VALIDATORS_HASH` "fixed in the release", no values) and Appendix A (the relay). | discussion metadata; the body read here in two passes |
| 2026-10-12 02:53 | Cassie's eleven-cast thread announcing the hard fork; "you won't lose your audience"; `$SNAP` "privacy-preserving"; retro claims close 31 October (cast `0x0ea95ebb29`). | ZAOOS doc 2666, read from the node |
| 2026-10-14 03:23 | Cassie reports "the SIWF endpoint is down". | cast (ZAOOS doc 2666 A6); her report |
| 2026-10-14 09:15 | She publishes `@farcasterorg/quick-auth` 0.2.0 and `@farcasterorg/miniapp-sdk` 0.4.0 (npm maintainer `cassie_q`, MIT, copyright Merkle Manufactory retained): "Quick Auth without an auth server: wallet-signed tokens verified against Farcaster protocol state." In her words: "a drop-in replacement. verifyJwt also accepts the new protocol tokens, checked against a hypersnap node, of your choosing, with no auth server ... sdk.quickAuth JWTs still work." | npm registry (checked here, `--network`); `farcasterorg/miniapps` `1cef64e`, pinned; quotation via ZAOOS |
| 2026-10-16 11:27 | Cassie: "Anyone applauding the Balaji takeover is a coward." On 10-17 she calls the post-deal DAU spike "literally all airdrop farmers". | casts `0xaf627f1f41`, `0x55c9ebb3c5` (ZAOOS A3); her claims |
| 2026-10-17 03:43 | Hypersnap `main` moves to `2e8733d`: "v20 support", feed, stats and reply-count fixes. No `PIVOT_HEIGHT`, `falcon`, relay or custody-migration code on `main` or the `pow` branch; the `pow`, `hyper-v1` and `retro-proposal` branches have not moved since July. | pinned `hypersnap`; branch list read here |
| 2026-10-22 04:00 | **The stall predicted in `hypersnap.md` §2.3 happens.** Issue #41: Hypersnap read nodes halt with "Block contained signatures from unexpected signers" at 48,632,005 (shard 0), 49,147,015 (shard 2) and 49,311,004 (shard 1). A second operator: adding upstream's three `validators.toml` entries "resumed their node within a minute." No maintainer reply as of 10-23; `main` is still `2e8733d` without the entries. | [farcasterorg/hypersnap#41]; fatline README, pinned: "stood still 13:00–18:37 UTC because the validator list in Hypersnap's repository misses Farcaster's 2026-10-22 validator change" |
| 2026-10-22 | The public node `haatz` still runs 0.13.5 and still follows Snapchain. | ZAOOS `/v1/info` read 10-17; fatline reads 10-22 |

Cassie Heart's recent guidance, then, is in three places, none of them a
document addressed to client developers: the FIP text (what the fork will be),
the thread (why now), and the two npm packages (how to log in without
Farcaster). The clearest sentence for a builder is the package description:
verify against "a hypersnap node, of your choosing, with no auth server". The
packages work against any Snapchain node too: the README lists the four `/v1`
hub endpoints they call, and both node types serve them.

### 1.3 Who is already "both"

| Client | Licence | Networks | How | Status |
| --- | --- | --- | --- | --- |
| [fatline](https://github.com/jpfraneto/fatline) | MIT | both | runs a Snapchain node and a Hypersnap node ("side by side need two servers"); Settings lists every node of each network with its health, "every read and post goes only through it; if it is down, you get an error naming it, never a quiet switch"; the archive makes "a message on both networks ... one item with two statuses"; traces each cast's signing key to the app that asked for it, shown as "via @app" | nodes live since 10-22; client writes "not yet run on the real network"; a prize entry |
| [Quilcast](https://github.com/backmeupplz/quilcast) | MIT | any node, Hypersnap by default | reads from a node URL the user can change; writes protobuf to `/v1/submitMessage`; registers new fids on OP and adds a gasless signer; direct casts through a farcaster.xyz token; notes that gasless signers are not in the KeyRegistry, so mini-app notifications need one on-chain key | live at quilcast.com |
| [Opencaster](https://github.com/arcacomputer/opencaster) | AGPL-3.0 | Hypersnap only | one fixed gateway, `haatz`, "no failover or independent indexer"; "No Farcaster-operated authentication or API service was added" | beta; moved to the Arca Computer organisation 10-22 |
| ZAOOS | MIT | Neynar plus `haatz` as read fallback | keeps Neynar for thirty days, keeps the hub fallback warm, treats "a self-run Snapchain read node" as the neutral hedge because "Neynar moves to Network School ... and haatz is run by Quilibrium, Cassie's side"; does not migrate its app fid | decisions, not code |
| the prize entries | MIT | Snapchain | fiddy, farcaster-in-3, homestead, townhall, create-fc, outpost: read node plus client in three commands | a week old |

Nobody has shipped dual-network writes against a real account yet. The design
that exists (fatline's) is the one §4 adopts.

---

## 2. "Both" today: one network, several doors

Today a Farcaster client and a Hypersnap client differ only in which doors they
use. The table is the set of doors; "both" means Home can open any of them,
and the reader can see which one is open.

| Door | Farcaster side | Hypersnap side | Same data? |
| --- | --- | --- | --- |
| Raw protocol reads | any Snapchain node, `/v1/*` (public: `snap`, `crackle`, `pop`) | any Hypersnap node, the same `/v1/*` (public: `haatz`) | yes, byte for byte |
| Shaped reads | Neynar `/v2/farcaster/*` (key, credits; fatline reports the hosted node API now charges 0.01 USDC a request over x402) | Hypersnap `/v2/farcaster/*` (no key; 103 of Neynar's 104 paths by name) | yes, minus ranking |
| Ranked reads with reasons | Farcaster's production API only (Network School's now) | none | no |
| Writes | `POST /v1/submitMessage` on any node; read nodes accept and relay (code, Balaji's clarification, fiddy's test) | the same route on any Hypersnap node | the same message |
| Identity | fid on OP Mainnet `IdRegistry`; custody wallet | the same registry; Hypersnap "reads identity state from the on-chain IdRegistry" | yes |
| Signers | gasless `KEY_ADD` with scopes and a sliding ttl of at most 90 days (V16, both codebases pinned) | the same | yes |
| Login | Farcaster's SIWF relay and Quick Auth server (`auth.farcaster.xyz`, moving to Network School, reported down on 10-14) | `@farcasterorg/quick-auth` protocol tokens verified against any node; or Home verifying SIWF itself | yes, if Home does the verifying |
| Usernames | the fname server (Farcaster's) and ENS | the same; the FIP keeps "the fname server" as a dependency after the pivot | yes |
| Storage | rent on OP Mainnet `StorageRegistry` | the same contract; Hypersnap keeps using it after a pivot | yes |
| Social-contract status | the `VOTE` ERC-721 on Base (public) and `optInStatus` on the client API (private, no login, opt-outs no longer returned) | nothing; Hypersnap has no notion of it | n/a |
| Moderation | Network School's rules in its app; "moderated_out" on the client API; the protocol unchanged | none | n/a |
| Who can stop it | Network School's API terms for the production API; validators decide block inclusion (seven keys, five of them run by Neynar, whose team has moved to Network School) | the `haatz` operator's goodwill; Hypersnap's own validators once it has any | |

What follows for Home:

1. **Reads and writes are already "both" if the adapter is node-agnostic.**
   The fifteen private endpoints in `setup-end-to-end.md` §5 map onto `/v1`
   and `/v2` routes that both node kinds serve. The only Farcaster-exclusive
   data is the ranked feed and its reasons, which `plan.md` keeps as Source A
   while permitted and synthesises otherwise.
2. **Login is the one place a "Farcaster client" still depends on Farcaster.**
   `plan.md` §2.3 has Home verifying SIWF with `@farcaster/auth-client` over
   an OP RPC, which already avoids the relay for verification but uses
   Farcaster's relay for the QR handshake. Cassie's protocol tokens remove the
   server entirely: an EIP-4361 message naming the fid, signed by the custody
   address, an auth address or a verified address, checked against a node.
   Adopting that (MIT, with the Merkle copyright line) or a self-hosted
   `auth-monorepo` relay makes Home's login work when `auth.farcaster.xyz`
   does not. The 10-14 outage report is one person's; `auth.farcaster.xyz`
   answered on 10-17 (ZAOOS checked its JWKS).
3. **The social contract is information, not a gate, for a client that is
   not Network School's app.** Home can show whether an account holds a
   `VOTE` token the way it shows a verification: a chip, off by default,
   that the reader can turn into a filter. It cannot show who declined (the
   API stopped returning that) and should not infer "declined" from "did not
   vote", which the census notes is unverified. Home must not require the
   token, and nothing in the protocol lets anyone require it.
4. **The reader chooses the node and sees it.** Fatline's rule, "never a
   quiet switch", is the right default for a client whose selling point is
   legibility: a settings panel listing nodes by network with health, a status
   line naming the node that answered, and errors that name the node.
5. **Cost does not change.** Public nodes on both sides are free with no
   terms; Neynar's free tier remains; a Hypersnap node costs a read node's
   machine, and its validator list is now a known chore.

---

## 3. "Both" after the pivot: two networks

If epoch 1 ships as the FIP describes, Hypersnap "makes its own blocks" and
"a Hypersnap node does not connect to snapchain peers"; a relay worker is the
only link. Nothing of this is in code at `2e8733d`, there is no date, and the
`PIVOT_HEIGHT` is "fixed in the release". The following is therefore design
readiness, not a build item.

| Concern | What the FIP says (sections) | What Home would do |
| --- | --- | --- |
| Same fids, two custodies | after a `CUSTODY_MIGRATION` (permanent) Hypersnap ignores the fid's OP `IdRegistry` transfers and `KeyRegistry` changes but keeps `StorageRegistry` (16.9, 16.14) | treat identity as (fid, network); show a badge when a fid's custody differs between networks |
| Messages | unmigrated fids: Ed25519-only accepted on both networks; migrated fids: Hypersnap rejects Ed25519-only and requires dual Ed25519+Falcon-512 or Falcon-only (16.8); the relay strips the Falcon part when forwarding to Snapchain, "the data and hash do not change" (A) | dedupe by message hash; tag every item with the network it was read from; for unmigrated readers submit the same signed message to a node on each network rather than rely on the relay |
| Fees | relayed and native messages pay Hypersnap's fee, `base × max(0, 1 − max(trust, uniqueness))`, 60% burned, 40% to the proposer; "rejected if the FID has no fee balance" (9, A.6) | show "not on Hypersnap: no fee balance" as a status, never silently drop; no token handling in Home |
| What never crosses | hyper-native fids (≥ 2^63), Falcon-only messages, hyper-only types stay on Hypersnap; a migrated fid's Ed25519-only posts to Snapchain never appear on Hypersnap (A.4, A.6) | the network tag again; a "Hypersnap only" or "Farcaster only" marker on items |
| Signers for migrated users | Falcon-512 custody and signer keys; "Users without the classical custody key can add only Falcon-512 signers" (16.10) | no browser wallet signs Falcon-512 today; Home serves migrated users read-only on Hypersnap until a signing path exists |
| Home's own app fid | Ed25519 signers of a migrated fid stop working on Hypersnap (16.8) | never migrate it; ZAOOS reached the same decision for its app fid |
| Who runs the relay | "anyone can run one"; "Snapchain nodes can limit the rate of the relay worker or block it" (A) | run Home's own dual submission; do not depend on a relay Home does not run |
| Usernames and events | the fname server stays a dependency; the relay "does not carry on-chain events or fname proofs" (17.6) | nothing new; both networks read the same sources |
| Validators | genesis validator file "fixed in the release"; "who is on that file is not public" | a trust question for the reader to see, not for Home to answer |
| Timeline | none published; retro claims close 10-31 per Cassie's cast; the `pow` branch is three months idle | a watch list (§5), not a sprint |

The parity model is fatline's: one item, two statuses. For a reader who has
not migrated, Home can make the two networks agree by writing to both itself.
For a reader who has migrated, the networks will disagree by design, and the
honest client shows the disagreement.

---

## 4. What "being both" means in Home's code

All of this is Source B work. Items 1 to 5 extend `plan.md` §2 rather than
replace it; 6 to 8 are new.

| # | Change | Where | Depends on |
| --- | --- | --- | --- |
| 1 | **Provider and network as configuration.** `HomeDataClient` takes a list of providers, each `{ kind: 'productionApi' \| 'neynar' \| 'hypersnap' \| 'snapchain', baseUrl, network: 'farcaster' \| 'hypersnap' }`, and the fifteen endpoint implementations read from whichever is selected | the adapter (`plan.md` §2.1) | `hypersnap.md` §6.2 check c |
| 2 | **Provenance on every item.** The adapter stamps `network` and `node` on each normalised cast, user and notification; the kernel ignores them; the UI shows them on request | adapter types, a chip | 1 |
| 3 | **Writes to a list of nodes.** `submit(message, nodes[])` posts the same bytes to each node and records per-node status: accepted, seen on the event stream, missing. "Posted" is shown only when the selected node returns it | the write path (`plan.md` §2.5) | 1 |
| 4 | **Login without Farcaster's server.** Verify SIWF with `@farcaster/auth-client` (already planned) and accept protocol tokens via `@farcasterorg/quick-auth` against Home's selected node; keep `auth.farcaster.xyz` as an option, never as the only path | the Home service (`plan.md` §2.3) | an MIT notice for Merkle's copyright |
| 5 | **Node selector and status line.** Settings lists nodes by network with health from `/v1/info` (height, delay); the chosen node is named on screen; "Automatic" says which node it picked and when it changes | settings, `HomePreferencesProvider` | 1 |
| 6 | **Social-contract chip.** Read `balanceOf(fid)` on the `VOTE` contract (Base, `0x4ecfed276c566aeb49da1f3a888e8dbb7263028d`) through the service with a cache; show "signed Network School's contract" as an optional chip and filter, default off; never infer "declined" | service route, kernel preference | a Base RPC |
| 7 | **"via @app" attribution.** Trace each cast's signer to the app fid in its key's on-chain metadata (fatline reads the key's on-chain record; both node kinds serve it at `/v1/onChainSignersByFid`); show it in the why-chip; let the reader hide or isolate apps | adapter, kernel reason groups | the signer event has a `requestFid` |
| 8 | **Parity probe and validator check.** A scheduled test that posts on the devnet or testnet and reads back through each configured node; for Home's own Hypersnap node, a check that its `validators.toml` contains upstream's current sets (the v18 heights are pinned) | CI, the weekly audit | nodes |

Nothing here touches the kernel's ranking or the why-chip's contract, which is
the point: the personalisation layer is network-agnostic because it works on
normalised items, and "both" is a property of the adapter and the settings.

---

## 5. Recommendation, and what to watch

**Recommendation.** Be one client with many doors. Build Source B exactly as
planned, with items 1 to 5 above folded into the adapter, login and write-path
work, and 6 to 8 as small additions. Keep Source A for the ranked feed while
Network School permits it, and expect that permission to be the thing that
changes. Do not fork to Hypersnap-the-network before it exists, do not migrate
Home's app fid, do not import AGPL code, and do not take a position on the
vote, the token or the moderation rules in the product; show them as facts the
reader can filter on.

**Watch list, with dates.**

| When | What | Why it matters |
| --- | --- | --- |
| 2026-10-24 14:47 UTC | the client prize closes; read the winning three-command tutorial | the cheapest route to Home's own read node, funded by Network School |
| 2026-10-31 | Hypersnap retro claims close (Cassie's cast) | not Home's business; it marks the end of epoch 0's distribution talk |
| any day | `farcasterorg/hypersnap` `main` gains the v18 validator sets, or an operator-config pull | until then a Hypersnap node is a manual chore (issue #41) |
| any day | a Hypersnap release that fixes `PIVOT_HEIGHT` and ships a genesis validator file | the pivot becomes a build item; §3 applies |
| weekly | `auth.farcaster.xyz/.well-known/jwks.json` answers; Neynar's free tier and `/v2/farcaster/*` shapes unchanged; `farcasterxyz/client` README still says forks may point at the production API | the three Farcaster-side dependencies Home still has |
| weekly | the production API's terms: does Network School gate `farcaster.xyz/~api` by social-contract status? | Source A's permission test (`plan.md` §1.3a) |
| the weekly audit | upstream `validators.toml` and engine schedule versus any node Home runs | the stall of 10-22, generalised |

---

## 6. What was not verified

- No cast was read here. Every quotation from a cast comes from ZAOOS doc 2666
  or 2680 or fatline's note, which read them from `haatz` and cite hashes.
- The rename to "Network State Protocol", the Network Code's tiers and the
  read-only treatment of decliners are press-only; neither note found them in
  a primary post.
- Whether the production API or its websocket now behaves differently for
  accounts without a `VOTE` token is untested by anyone read here.
- Hypersnap's public node could not be probed; its version (0.13.5) and
  network (Snapchain) are as read by others on 10-17 and 10-22.
- The "$600k" figure attached to Cassie's proposal is Neynar's CEO
  paraphrasing a critic, not a number from her.

---

## 7. Evidence

| Source | Read | Used for |
| --- | --- | --- |
| [farcasterxyz/snapchain](https://github.com/farcasterxyz/snapchain) `961d12b`, 2026-10-23 (pinned as `snapchain-latest`) | here | 0.14.3, the v18 validator sets and heights, the onchain-config pull, the validator docs page (seven keys, five Neynar), the `fc cast-add` flags |
| [farcasterorg/hypersnap](https://github.com/farcasterorg/hypersnap) `2e8733d`, 2026-10-16 (pinned) | here | no fork code, validator list without v18, branch dates |
| [farcasterorg/miniapps](https://github.com/farcasterorg/miniapps) `1cef64e`, 2026-10-14 (pinned as `farcasterorg-miniapps`) | here | the quick-auth and SDK packages: licence, versions, token format, hub endpoints, "no auth server" |
| [jpfraneto/fatline](https://github.com/jpfraneto/fatline) `148e728`, 2026-10-22 (pinned as `fatline`) | here | the stall, the two-network comparison, the node-selector rule, the prize text and clarification, the x402 note |
| [guy-do-or-die/farcaster-census](https://github.com/guy-do-or-die/farcaster-census) `252b421`, 2026-10-21 (pinned as `farcaster-census`) | here | the `VOTE` contract, holder count, opt-out and moderated counts, the `optInStatus` endpoint |
| [bettercallzaal/ZAOOS](https://github.com/bettercallzaal/ZAOOS) research docs 2666 and 2680 | here, sparse clone | cast quotations with hashes; the ballot's name, symbol, supply and `TransferDisabled()`; Neynar's statements |
| [farcasterorg/hypersnap#41](https://github.com/farcasterorg/hypersnap/issues/41) | web | the stall heights and the operator fix |
| [farcasterorg discussion #19](https://github.com/orgs/farcasterorg/discussions/19) | web, two passes | epochs, 16.8, Appendix A, section 17 |
| [farcasterxyz/protocol discussions #272, #273, #278](https://github.com/farcasterxyz/protocol/discussions) | web | validator onboarding tiers and Cassie's critique; her Pro-ungating FIP; chained casts |
| npm `@farcasterorg/quick-auth`, `@farcasterorg/miniapp-sdk` | here, `--network` | versions, dates, maintainer |
| Press: The Block, Cryptobriefing, Cointelegraph, The Defiant, Bankless, crypto.news | search excerpts | the rename, the Network Code, bans and appeals |
