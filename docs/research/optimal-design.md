# The design that fits November 2026

The question was: given everything that has changed, what is the best design
for Home, and what is the evidence for it? Written 2026-11-10, twenty-six days
after Network School bought Farcaster and two days before Hypersnap's
scheduled validator fork. Every repository this project cites was re-read at
its current head, Home's own checks were re-run against the new reference
client, and one part of the design was tested by execution.

How to read the evidence. **pinned** means a claim is checked by
`scripts/audit-protocol-claims.mjs` against a named commit. **run** means it was
executed in this session and the command is in §7. **web** means it was read on
a public page on 2026-11-10 through a tool that extracts text, so quotations
are as extracted. **unverified** means one secondary source. The production
API, the public nodes, farcaster.xyz and x.com cannot be reached from this
sandbox, so nothing here was tested against a live network.

**Updated 2026-11-25.** The fork activated on the evening of 12 November
([§10](#10-after-the-fork-re-read-2026-11-13)), and thirteen days later
the validator set was due, by its configured schedule, to have rotated to eleven keys
(the heights were not observed), channels had moved to
Snapchain's version 25, and XMTP had stopped being a shared network
([§11](#11-re-read-2026-11-25)). Sections 0 to 9 are as written
on 10 November, with the schedule, version and relay facts brought up to
the commit now pinned.

---

## 0. The short answers

- **The design.** One interface. Behind it, a registry of data providers that
  spans both networks. Home builds its own candidate set, ranks it and
  explains each item, using the kernel that already exists. Posting keys are
  made on the reader's device and authorised by their wallet. A small
  stateless gateway forwards reads and signed messages and holds no user
  secrets. Every item, and every write, says which network and which node it
  came from or went to.
- **Three facts changed the plan of 2026-10-14.** Farcaster's production API
  now refuses casts from accounts that have not accepted Network School's
  social contract (§1.1). Hypersnap stops following Farcaster's validators at
  fixed block heights, reached on the evening of 2026-11-12, with its own validators (eight keys at the fork, eleven from the rotation of about 21 November),
  a relay, free accounts and no storage rent (§1.2). And Farcaster's own
  network activated three engine versions in a week, one of them a day after
  its release (§1.1). A client that depends on one party's servers, or
  on one network's rules, now has a visible expiry date.
- **What that does to the old plan.** "Source A", the production API, was to
  carry the first readers because only it has the ranked feed and the reason
  on each cast. It is demoted to an optional enrichment that nothing depends
  on. "Source B", the protocol path, becomes the product. The why-chip no
  longer waits on a field Farcaster controls: Home computes the reason, and
  can show the facts behind it, which the upstream field never could (§4.2).
- **What does not change.** The kernel, the fork patch, the adapter seam and
  most of the build order. The patch applies cleanly to the new client
  snapshot and all 259 tests pass against it (§7).
- **What to do this week.** Nothing that depends on either network being
  stable. Watch the fork with the four checks in §6.2, then build in the order
  of §6.1 on the local devnet.
- **What is not known.** Whether the fork activates on schedule (it has
  already been postponed once), whether the relay keeps the networks in step,
  whether Farcaster's validators tolerate it, and whether the production API
  still serves reads to a third-party origin. §8 lists what would change the
  design.

---

## 1. What changed between 2026-10-23 and 2026-11-10

### 1.1 Farcaster

| Date | Fact | Evidence |
| --- | --- | --- |
| 10-15 | The production API refuses writes without opt-in. Reference-client issue #6: "Login still works, but every attempt to submit a cast is rejected by the centralized `api.farcaster.xyz` backend unless the user has accepted the new terms", with the error "400 - Opt in required". A second developer, in a fork of the reference client the next day: "The hosted API (`client.farcaster.xyz`) now rejects writes with `opt_in_required` unless the account signs Network School's Social Smart Contract". No maintainer has replied. | **web**: [farcasterxyz/client#6], [SmashThunderStone/client#3] |
| 10-21 | Cassie Heart on that issue: "I recommend using Hypersnap for backend replacement" and "They're not going to fix this – it's by design." | **web**: the same issue |
| 10-23 | Snapchain 0.15.0 activates V21 and V22 on mainnet at 12:00 UTC: 10,000-byte casts and profile banners for every fid, not just Pro subscribers, and chained casts with a format version. | **pinned**: changelog, schedule, gates |
| 10-24 | Neynar's hosted node endpoints answer 402, "X-PAYMENT header or API key required". Neynar's API spec was still being published on 11-02 (v3.188.0). | **web**: [ivcained/fiddy#67]; git log of `neynarxyz/OAS` |
| 10-25 | `@farcaster/core` 0.21.0 ships the gasless key builders (`makeKeyAddBody`, `makeKeyAdd`). A fork of the reference client that pinned 0.18.11 had written them by hand nine days earlier. | **run**: §7; **pinned**: `smashcast` |
| 10-28 | Snapchain 0.16.0: three consensus fixes and V23, which "changes the shard and block header hash". It was scheduled for mainnet at 07:00 UTC the next day: "Every validator and read node must run this build before its network activates"; "A node still on an older build stops following the chain at activation." | **pinned**: changelog and schedule; **web**: PRs #1092, #1094 |
| 10-28 | On-protocol channels move to V24, unscheduled "behind its registrar precondition". On 11-13 they move again, to V25 (§11). | **pinned**: gates; **web**: PR #1092 |
| 10-30 | A new reference-client snapshot, `73a39bd`: dependency and code-scanning fixes, ticketed `NS-2162`. The README still says both clients run "pointing to the current production API by Farcaster" and "Fork it and build on it". | **pinned** (client checks); **run**: Home's gates against it |
| — | The outcome of the $2,048 client prize was not found. | — |

Protocol work has not slowed under the new owner: the same engineers are
committing, and ticket numbers changed prefix from `NEYN-` to `NS-` during
October. That is good for the protocol
and a cost for anyone running a node, which now has to follow release notes
within a day.

### 1.2 Hypersnap

| Date | Fact | Evidence |
| --- | --- | --- |
| 10-20 to 10-28 | Hypersnap ports Snapchain's changes by hand: "bring in latest snapchain changes to test protocol drift theory", "0.15.0 compat", "0.16.0 emergency update compatibility". Its engine schedule matches Farcaster's through V23. | commit titles read 2026-11-10; **pinned**: schedule |
| 10-24 | The public node's shards 1 and 2 stand still for hours (block delay about 8.9 and 4.5 hours in one operator's samples), two days after the validator-list stall of 10-22. | **web**: [ivcained/fiddy#75] |
| 11-03 | Issue #51, "Initial Validators": operators submit keys for "the initial fork set". | **web** |
| 11-04 | Cassie Heart, asked what apps that read from or submit to a public Hypersnap endpoint should expect at the fork: "Nothing different, other than messages between forks will be relayed." Then: Snapchain "will make breaking changes with no real warning, and inevitably, the two forks will drift", the choice of node "will likely become a point of contention for clients", and the team intends "free signups on network, channels (that don't require an L1 payment to NS), and miniapp indexing, rather soon." | **web**: issue #51 |
| 11-08, 11-09 | Three changes merge: the validator set, "shuttle relay service + gossip cutover", and "free onboarding". | **web** for the merges; **pinned** for what they contain |
| 11-09 | The fork block is moved: "Postponed by three days so peers can prepare after consensus was lost." Projected activation 2026-11-12 09:25:20 UTC, "an estimate; consensus activates at the exact heights". Two commits titled as consensus fixes land the same day. What "consensus was lost" refers to is not explained anywhere read. | **pinned**: `validators.toml` |

What the fork is, from the code at `3fab17d` (all **pinned**; the heights
are the second schedule, see §10):

- **A validator swap, at heights.** Shard 0 at block 50,477,529, shard 2 at
  50,996,940, shard 1 at 51,161,786. From those blocks a Hypersnap node
  accepts blocks signed by community validators (eight keys at the fork, eleven from the rotation, §11), none of whose keys is
  in any Farcaster validator set. Gossip moves to `hypersnap/*` topics at the
  same heights. "Existing Snapchain validators will not relay the new topics."
- **A relay in both directions.** The `shuttle` "relays compatible signed user
  messages from each network's committed blocks to the opposite mempool". It
  carries message types 1 to 8 and 11 to 17 by default, byte for byte,
  including gasless key adds; channel types 18 to 21 only where an operator
  lists them. It "does not relay consensus, block certificates, on-chain events,
  Fname system transfers, or Hyper envelopes", and it "cannot transfer"
  prerequisites such as registration, signers and storage. "A successful
  publish means gossipsub queued the message to subscribed peers, not that
  consensus included it."
- **Free accounts.** "Native" registration needs a custody signature and proof
  of work, no Optimism transaction. Native fids begin at 2^32 and are emitted
  as decimal strings in JSON. They exist on Hypersnap only: "Neither native
  registrations nor messages authored by native FIDs are relayed to
  Snapchain."
- **No storage rent.** "Storage slots stop affecting admission, storage-derived
  message rate limits, verification quotas, and quota pruning at each shard's
  configured fork height", for every account.
- **Not the token fork.** "The port includes no token, staking, reward,
  fee-market, Falcon, or validator-election changes." The pivot described in
  `both-networks.md` §3 is still a specification; what is scheduled is
  smaller and sooner.

Around it: a SNAP token is listed on Ethereum and hypersnap.org's own source
says "A listing is not evidence of issuer authority or adopted protocol
economics". The same file records that a maintainer "intends
app-FID-usage-attributed coverage for full-client developers ... not a
payable entitlement" (**pinned**; the comment itself could not be loaded).

### 1.3 Other clients, as evidence of what works

| Client | What it shows | Evidence |
| --- | --- | --- |
| SmashCast, a fork of the reference client | The reference client's interface can run on the protocol: wallet sign-in, device-signed casts, hub notifications, replies and reaction counts, added over two days (by its commit log) as a package beside the existing code. Its notes record what its author measured on 2026-10-16: the public Hypersnap node sends `Access-Control-Allow-Origin: *` and answers the preflight for `submitMessage`, "so the browser can submit without a proxy"; Farcaster's `snap.farcaster.xyz:3381` answers that preflight with 404, "so a browser preflight fails". Its feed is the reader's own casts plus four casts from each of 24 follows, newest first. | **pinned**: `smashcast` |
| Quilcast | A live MIT client on web, iPhone and Android that reads a node directly, signs in the browser and posts to `/v1/submitMessage`. It "depends on the Hypersnap node it reads from (`haatz.quilibrium.com` by default, changeable in Settings)". | **pinned**: `quilcast` |
| Opencaster | Its 10-22 version said "no failover or independent indexer"; by 11-09 it had added (its backup is also Haatz, so it is one network's gateway): "Eligible reads make at most one backup attempt after transport failure, timeout or HTTP 5xx, within one 20-second deadline", while "Signed submissions are never replayed automatically". | **pinned**: `opencaster-now` |
| fiddy, fatline, forkcaster | A network picker in settings; one item with a status per network; several nodes raced for a read; the social-contract token used to decide whether to offer "open in Farcaster". | **web**; `both-networks.md` |

Nobody has shipped Home's combination: both networks, visible provenance, and
a feed the reader can inspect and tune.

---

## 2. The two networks after the fork

| | Farcaster (Snapchain) | Hypersnap |
| --- | --- | --- |
| Validators | seven keys, five needed to commit; five listed as Neynar's, whose team joined Network School (**web**); the other two, `moria` and `isengard`, replaced Uno and Degen in registry version 18 and the file does not say who runs them | eight keys at the fork, then eleven held by nine operators, named in `validators.toml` |
| Software and licence | Snapchain 0.17.0, GPL-3.0 | Hypersnap 0.17.21, a fork, GPL-3.0 |
| Engine rules | V24 since 2026-11-24, which bounds prune sweeps and carries no channels | its mainnet schedule ends at V23, ported by hand, with no V24 date. Version numbers do not compare across the two: on Hypersnap V24 gates channels, on Farcaster V24 bounds prune sweeps and channels are V25 |
| Identity | fids on OP Mainnet | the same legacy fids up to the fork; whether an Optimism registration made after it reaches Hypersnap depends on each validator's own configuration (§10.3); plus native fids from 2^32 |
| New account | an OP Mainnet transaction and storage rent | free: custody signature and proof of work |
| Storage | rented units; messages beyond them are pruned | unlimited after the fork; nothing pruned by quota |
| Rate limits | per fid, from storage, on by default since 11-11; key adds once a minute | a fixed 1,008 an hour per fid on each node, scheduled from about 11-18; key adds once a minute; storage-derived limits off |
| Channels | off-protocol in Farcaster's Client API; V25 unscheduled | a V24 gate in its code that its mainnet schedule has not reached; "rather soon" without a payment, by its maintainer. Farcaster's code puts the future registrar on Ethereum L1 under `farcasterchannels.eth` |
| Messages cross by | the relay, if an instance is running (none was observed) and the destination accepts the message | the same relay; native accounts never cross |
| Shaped API on the node | none; Neynar sells one | 140 `/v2/farcaster/*` route strings, 102 of the 103 paths in Neynar's current spec by name; 42 of those 103 answer 501 for at least one method, so presence is not coverage |
| Public nodes | `snap` and `pop` (`crackle` is "password protected to prevent abuse" per the node's own guide); Neynar's now need a key or payment | `haatz`; the validators list their hosts in issue #51, and six public gRPC endpoints (port 3383) answered on 11-14 |
| Who can keep a message out | its validators | its validators |
| Who can keep a person out of an app | Network School, in its own app and API | not by protocol: each app decides, and no Hypersnap app gating accounts was found (Quilibrium's own Quorum app also reads Farcaster) |

Three consequences for a client:

1. **The two sets of messages will differ, by design.** Hypersnap will hold
   what Farcaster prunes or never admits (accounts without storage, native
   accounts) and Farcaster may hold what the relay drops. Neither is a
   superset that can be trusted to stay one.
2. **A reader cannot tell which network a node is on from `/v1/info`**, which
   has no network field. A route only Hypersnap software serves,
   `GET /v1/nativeRegistration`, identifies the software, not the network:
   Hypersnap software run on Farcaster's validator list serves it too, with
   `active` false. The test for the network is whether the node's blocks match
   the other network's at the fork heights (§6.2, checks 1 and 3).
3. **fids are no longer safe as JavaScript numbers at the type level.** Native
   fids arrive as strings. The SDK builds and round-trips a cast for a fid
   above 2^32 (**run**), but every `number` typed fid in the client's API
   types is now an assumption.

---

## 3. The options, compared

Five ways to build the client, against the eight things that matter. "Yes",
"partly" and "no" are judgements; the evidence for each is where the cell
points.

| | A. Reference client on the production API | B. Neynar-backed app | C. Hypersnap only | D. Snapchain only, own node | **E. Both networks, own ranking** |
| --- | --- | --- | --- | --- | --- |
| Works without anyone's permission | no: writes need the social contract (§1.1) | partly: a key, credits, terms unconfirmed since the sale | yes | yes | **yes** |
| Keeps the legible feed | yes while the field is served | no reasons in the data | no reasons; "for you" is trending | no shaped feed at all | **yes: Home computes them (§4.2)** |
| Every Farcaster user can use it | no: decliners and restricted accounts cannot post | yes | yes | yes | **yes** |
| Reaches accounts on both networks | no | no | partly: relies on the relay | no | **yes** |
| Survives an outage on one side | no | no | no: one public node stalled twice in October | no: a day's notice for V23 | **yes: degrade to the other** |
| Cost before there are readers | none | none on the free tier | none | a server, about $75 a month | **none** |
| Work from today's repository | least | moderate | moderate | most | **moderate: one adapter, more cases** |
| Licence clean for an MIT tree | yes | yes | yes, if no AGPL code is copied | yes | **yes** |

Option A was the first step of the old plan and is the only one that lost
ground: it fails the first and third rows on evidence that did not exist on
2026-10-14. Options B, C and D are each a special case of E with one provider
configured, so choosing E costs the adapter's generality and nothing else,
and each of them can be reached from E by deleting configuration. The reverse
is not true.

---

## 4. The design, decision by decision

Each decision has the evidence for it and the observation that would overturn
it.

### 4.1 Providers and networks are configuration, and visible

**Decision.** The adapter holds a list of providers, each
`{ id, network: 'farcaster' | 'hypersnap', kind, baseUrl, auth }`, where
`kind` is `hub` (the `/v1` routes every node serves), `shaped` (the
`/v2/farcaster/*` routes of Neynar or a Hypersnap node) or `productionApi`.
Each normalised item carries the network and node it was read from. Settings
list the providers with their health from `/v1/info` (height and block
delay). "Automatic" picks the healthiest per capability and says which it
picked. Reads may fall back once to another provider; the interface names the
node that answered.

**Evidence.** Both node kinds serve the same `/v1` routes and a Hypersnap node
has a route for 102 of the 103 shaped paths in Neynar's current spec (**pinned**; it
was 103 of 104 on 2026-10-23, before Neynar dropped a path), and 42 of the 103 answer 501 for at least one method (writes, login, signers, frames, fungibles, NFTs), so the reads
Home needs are checked one by one in §6.2, not assumed.
Public nodes do fail: 10-22, 10-24 and whatever "consensus was lost" was. The
client that had "no failover" added exactly this policy (**pinned**). The
kernel already takes a fetcher per leaf source, composes blends, and surfaces
a blend part that failed to the reader rather than hiding it (**pinned**:
`LeafFetcher`, `SourceError`, `AllSourcesFailedError`).

**Overturned if** the shaped routes drift apart in response shape so far that
one adapter cannot serve both (check c in `hypersnap.md` §6.2, still unrun).

### 4.2 Home ranks and explains; upstream reasons are optional input

**Decision.** The default feed is built by Home: candidates from the
following feed, from engagement rankings and from the reader's channels;
ranked by the kernel under the reader's weights; each item given a reason
Home can justify with data it holds. Where the production API is enabled and
returns its own reason, that is shown as Farcaster's, beside Home's.

| Reason (the kernel's ten) | From protocol data | How |
| --- | --- | --- |
| following-author | yes | the author is in the reader's follows |
| evergreen-following-author | yes | the same, plus age and engagement from `cast/metrics` |
| recasted-by-following | yes | the following feed with `with_recasts=true` |
| has-reply-by-followed | yes, at more cost | replies by followed accounts (`feed/user/replies_and_recasts`, `cast/conversation`) |
| follow-of-follow | yes | `following/suggested`, `followers/relevant` |
| popular-in-channel | partly | the channel feed is newest first, one channel per request, and the trending options take no channel; ordering by engagement would be Home's own work on the returned counts |
| popular | yes | `feed/trending`, labelled with whose ranking it is |
| pinned-in-channel | partly | Farcaster's Client API only, until channels are on a network |
| high-quality-unfollowed | no | rests on Farcaster's private score; Home's analogue is "people you follow engage with them", labelled as Home's |
| snap-promoted | no | Farcaster's promotion; Home has none to show |

**Evidence.** Each read in that table has a handler on a Hypersnap node, not a
stub, and the same paths exist in Neynar's spec (**pinned**). The production
API's reasons are now behind a login whose write half is gated (§1.1). Home's
reason can carry its facts ("recast by two people you follow") because Home
computed it; the upstream field is a category with no evidence attached. A
Hypersnap node's trending feed can already be filtered by the app that
registered each signing key (**pinned**), which is the "via app" control
`both-networks.md` §4 asked for.

**Overturned if** building candidates from shaped reads costs more requests
than a public node tolerates, in which case the following-only feed is the
floor: it needs one request and is spam-resistant by construction.

### 4.3 Keys on the device, authorised by the wallet, requested by Home's app fid

**Decision.** The posting key is generated in the browser. The reader's
custody wallet signs a gasless `KEY_ADD` that scopes it to casts and reactions
and expires it after a period of disuse; follows and profile edits need a
second, explicit approval. Home's app fid signs the request, so every message
is attributable to Home on both networks. No Home server ever holds a key
that can post.

**Which account can be the app account.** The node checks that the app
account named in a key request is registered and that the request was signed
by its custody address. Farcaster's node needs an on-chain registration event
for it (**pinned**). Hypersnap looks the custody up in its native registry for
high ids and in the on-chain registry for legacy ids (**pinned**). So only an
account registered before the fork on 2026-11-12 is certain to be accepted on
both networks; a newer Optimism account depends on the open question in §11,
and a native account is never accepted by Farcaster. This was not in the
earlier version of this decision.

**Evidence.** Built and validated with the published SDK (**run**, 13 checks):
the key body carries the scopes, the ttl and both signatures; the SDK refuses
a key scoped to add keys and a lifetime over ninety days; a cast altered after
signing fails validation. The signing domain in another client's code matches
Snapchain's (**pinned**). Two live clients work this way (**pinned**:
`quilcast`, `opencaster-now`).
Attribution by app fid is what both the trending filter and the stated
intent to credit full-client developers key on.

**Overturned if** wallets in common use cannot produce the typed-data
signature, which is the on-device test in `plan.md` §2.4.

### 4.4 A thin, stateless gateway, not a backend and not nothing

**Decision.** One small service with three duties: forward allow-listed reads
to providers with one bounded fallback, forward signed binary messages to
nodes, and hold the things a browser cannot (a Neynar key if one is used, a
webhook endpoint). It stores no session that can act for a user.

A fourth duty follows from §4.3 and was missing here: the service
countersigns key requests as Home's app, so it holds Home's app custody key
in a secret store. That key can attribute a key to Home. It cannot post for
anyone. Added 2026-11-10 while writing
[the experience walkthrough](../design/experience-walkthrough.md), which
describes each surface a reader meets under this design.

**Evidence.** A browser cannot post to Farcaster's public node: its preflight
is refused (**pinned**: measured by another developer on 2026-10-16). It can
post to the public Hypersnap node directly, which is why the two clients that
post from the browser default to that node. So a browser-only client is a
Hypersnap-only client, and writing to both networks needs a forwarder.
Opencaster already runs one, with an allowlist and a bounded fallback.

**Overturned if** Farcaster's public nodes start answering the preflight,
which would make the gateway optional for writes.

### 4.5 Write once, submit to both, show both results

**Decision.** A message is built and signed once. The same bytes go to a node
on each network. The interface shows a status per network: accepted, seen in
the feed, or refused with the node's reason.

**Evidence.** The encoded message is one artefact with a stable hash
(**run**); a message delivered twice is de-duplicated by its hash
(**pinned**), and the second delivery is answered with `bad_request.duplicate`, which the per-network status must show as "already there", not as a failure. The relay would carry it anyway, but its own documentation says
a publish is not inclusion and that prerequisites do not cross (**pinned**),
and Farcaster's code has no mention of Hypersnap at all (**pinned**), so the
relay runs on tolerance. A reader
without storage will be accepted on one side and refused on the other; saying
so is the honest interface.

**Overturned if** the two networks' message formats diverge, which the
relay's own type list will show first.

### 4.6 Sign-in that needs no one's server

**Decision.** Sign-in is a wallet signature over a short-lived message naming
the fid, verified against a node. Farcaster's own sign-in stays as a
convenience, never as the only path.

**Evidence.** Unchanged from `both-networks.md` §2: the token format and
verifier exist under an MIT licence and call four `/v1` routes that both node
kinds serve (**pinned**).

### 4.7 Network, app and social-contract status are preferences

**Decision.** The reader can restrict a feed to one network, hide or isolate
the app that signed a cast, show whether an account holds Network School's
ballot token, and choose whether accounts that exist only on Hypersnap appear
in discovery (off by default until their volume is known). None of these is
ever a gate Home applies on its own.

**Evidence.** The six axes in `docs/design/the-six-axes.md` already make
source and sifting the reader's: network is one more value on the Source
axis, and app, social-contract status and native accounts are rules on the
Sift axis. Free accounts with no storage rent remove the cost that limited spam
(**pinned**), so discovery from native accounts needs a switch the reader
controls and a following feed that does not depend on it.

### 4.8 fids are strings at the boundary

**Decision.** The adapter treats a fid as a decimal string wherever it
crosses the network, and converts at the edge of the reference client's
`number`-typed code.

**Evidence.** §2, consequence 3 (**pinned**, **run**).

### 4.9 The production API is optional enrichment

**Decision.** Keep the adapter able to read the production API's ranked feed
for a reader who signs in to Farcaster and wants it, labelled as Farcaster's
ranking. Nothing else depends on it, and it is off until the origin test in
`plan.md` §1.3 passes and the owner has a written answer on terms.

**Evidence.** §1.1. The reference client's README still invites forks to
point at that API, and its owner has also made the API enforce a contract.
Both are true, and neither is Home's to decide.

### 4.10 No node yet; two when there are readers

**Decision.** Use public nodes on both networks behind the gateway until
there are readers. Then run one Snapchain read node and one Hypersnap node.

**Evidence.** Each needs 16 GB of memory, four cores and 1.5 to 2 TB. One
operator measured about $2.50 a day per server, a snapshot of about 400 GB
compressed and 600 GB unpacked, and under six hours to sync on 2026-10-22,
and found that the two "side by side need two servers" (**pinned**:
`fatline`). A node now has to track
releases within a day (§1.1) and, on the Hypersnap side, a validator list
that has been wrong once and postponed twice.

#### Can one Hypersnap node be Home's way of reading Farcaster?

Asked on 2026-11-10, about a day and a half before the projected fork. Yes,
in two different senses, and the difference is one file.

The fork is configuration. No Rust source in Hypersnap names its heights
(**pinned**). The new validator sets, the gossip switch and native
registration all come from `validators.toml`, which the stock install fetches
from the repository and mounts into the node (**pinned**). Without that
schedule, a Hypersnap binary on mainnet keeps Farcaster's gossip topics and
keeps storage limits on (**pinned**).

| How the node is run | What it follows | Farcaster content it holds | Feeds, search and webhooks built in | What can go wrong |
| --- | --- | --- | --- | --- |
| Stock Snapchain | Farcaster's validators | all of it, exactly | no | releases must be installed within a day |
| Hypersnap as installed | Farcaster's validators until each shard's fork height, then the community validators | everything up to the fork; after it, identity from OP Mainnet only if the operator has configured an on-chain subscriber (the stock install has none, and the relay carries no on-chain events), plus the messages the relay carries | yes | the relay is a courtesy, not consensus (§1.2); a node started after the fork is given only Farcaster's nine bootstrap peers, and the relay's notes say Farcaster's validators "will not relay the new topics", so it may need Hypersnap peers added by hand (an inference from the files; one witness later saw a stock read node stop one block short on every shard on 11-12 and cross once Hypersnap's validators were added as peers, §10) |
| Hypersnap software with Farcaster's validator list | Farcaster's validators | all of it, exactly | yes | unsupported. A read node re-executes every block and stops on a root mismatch (**pinned**), so it halts at the first consensus change Hypersnap does not port. One operator switched to exactly this on 2026-10-22 (**pinned**: `fatline`) |

So a Hypersnap node is possible as Home's reader of Farcaster, and after
2026-11-12 it is a mirror rather than a copy: complete for history, complete for identity only where the operator's node follows Optimism, and as complete for new messages as the relay is on the day.

Whether it makes sense:

- **It is the most useful single node Home could run.** It is the only one of
  the three with the feed, search, notification and webhook routes that
  §4.2 builds on, and it needs no key. A Snapchain node gives lists and
  nothing else.
- **It cannot be the only thing Home reads Farcaster through.** Keep a
  Farcaster-side provider behind the gateway for the two things a mirror
  cannot vouch for: whether an item is on Farcaster, and whether the reader's
  own write arrived there. The public node is enough for that at first.
- **The third row is a workaround, not a plan.** It depends on a maintainer
  porting another network's consensus changes after she has said the two
  "will drift".
- **Not this week, and not before there are readers.** The fork was
  postponed twice before it activated; the software went from 0.13.5 to
  0.17.7 in under five weeks; one operator's node outgrew a 685 GB disk (**pinned**). The
  devnet costs nothing and is where the next four build items run.

When the time comes: a Hypersnap node as installed, as the primary read
provider. A Snapchain node second, when volume or the relay's record calls
for it; with both, Home can run its own relay, which the shuttle's example
configures against the nodes' gRPC endpoints on both sides (**pinned**; no running instance was observed on mainnet) and which improves the mirror for everyone.

### 4.11 What Home will not build

A validator. Anything that holds, moves or displays a token. Its own account
registry. Direct messages. A second interface per network. A stance on the
social contract, expressed in the product.

**Revised 2026-11-10.** Two items on that list were reopened at the owner's
request and are answered in
[messages and wallet](messages-and-wallet.md). Direct messages become an
opt-in provider, Quorum first, after two checks. A Wallet surface may
connect the reader's own wallet, show balances and send, and Home still
never holds a key that moves money. The rest of the list stands.

**Examined 2026-11-11.** Whether to fork a network onto Base is answered in
[the Base feasibility page](base-fork-feasibility.md). "A validator" stays
on this list. An account registry on Base is proposed there only as
something Hypersnap would honour, not as a network of Home's own.

---

## 5. Where it lands in the code

| Package | Today | Change |
| --- | --- | --- |
| `home-personalization` (the kernel) | reason taxonomy, preferences, feed specs, blend and de-duplication, 197 tests | add `network` and `signerApp` as facets a preference can weigh or mute; reasons gain an optional `evidence` list; no change to ranking |
| `home-client-core` | resolves a feed spec to leaf sources and composes them through a `LeafFetcher` | a provider registry behind the fetcher; health and fallback; a leaf source may name a network |
| `farcaster-adapter` | maps the production API's feed item to the kernel's shape | two more mappers (hub `/v1`, shaped `/v2`), provenance on every item, fids as strings at the boundary, reason synthesis |
| the fork patch | seam in `useFeedItems`, the why-chip, the hidden row | unchanged; the chip renders the evidence list when present |
| new: `home-protocol` | — | message building and signing with `@farcaster/core`, the key vault, dual submission |
| new: the gateway | — | allow-listed reads, signed-message forwarding, one fallback, no user secrets |

---

## 6. What to do

### 6.1 Build order, revised

| # | Build | Was | Done when |
| --- | --- | --- | --- |
| 1 | Provider registry and the two protocol mappers, with provenance | plan §2.1 | the fifteen core-screen endpoints answer from the devnet through the same adapter interface |
| 2 | Candidate building and reason synthesis | plan §2.2, now the default feed | a devnet feed renders with a computed reason and its evidence on every item |
| 3 | Sign-in by wallet signature, verified against a node | plan §2.3 | a devnet account signs in with no Farcaster server reachable |
| 4 | Key onboarding and the write path, to a list of nodes | plan §2.4, §2.5 | a cast signed in the browser appears on the devnet and the interface shows the node's answer |
| 5 | The gateway | part of plan §2 | the same flows pass with the browser talking only to the gateway |
| 6 | Notifications from node events or webhooks | plan §2.6 | a reaction on the devnet reaches the client |
| 7 | Node and network settings, the status line, the three preference facets | new | switching provider changes the named node and nothing else |
| 8 | Storage headroom on Farcaster; "unlimited" on Hypersnap | plan §2.7 | the panel reads each network's own limits |

Items 1 to 4 are the old plan in the old order. What moved is item 2, from
"label what we can" to "this is the feed", and the production API, from step
one to an option.

### 6.2 Fork week: four checks, from a machine that can reach the nodes

```sh
# 1. Is each node following a chain? Heights rise and blockDelay stays small.
curl -s https://haatz.quilibrium.com/v1/info    | jq '.shardInfos[] | {shardId, maxHeight, blockDelay}'
curl -s https://snap.farcaster.xyz:3381/v1/info | jq '.shardInfos[] | {shardId, maxHeight, blockDelay}'

# 2. Which network is a node on? Only Hypersnap serves this route.
curl -s -o /dev/null -w '%{http_code}\n' https://haatz.quilibrium.com/v1/nativeRegistration
curl -s -o /dev/null -w '%{http_code}\n' https://snap.farcaster.xyz:3381/v1/nativeRegistration

# 3. Has the fork activated? Shard 0 passes 50,477,529 and the route above
#    reports that the next block admits registration.
curl -s https://haatz.quilibrium.com/v1/nativeRegistration | jq .

# 4. Does the relay work? Take a cast made after the fork and ask both sides.
curl -s "https://haatz.quilibrium.com/v1/castById?fid=<fid>&hash=<0xhash>"    | jq .hash
curl -s "https://snap.farcaster.xyz:3381/v1/castById?fid=<fid>&hash=<0xhash>" | jq .hash
```

Record the answers with their times in `validation.md`. A node whose height
stops near a fork height has the wrong validator list for its side. The same
is true at the rotation heights (50,971,518 on shard 0, 51,481,322 on shard 2,
51,639,354 on shard 1): a node on the eight-key file halts there.

### 6.3 Standing items

The four actions of `plan.md` §1 stand, with two edits: the re-pin target is
now `73a39bd`, and the question to Neynar is now also a question to Network
School, about third-party reads of the production API.

---

## 7. What was validated in this session

| Claim | How | Result |
| --- | --- | --- |
| Home still builds and passes against the current reference client | `SNAPSHOT=<client at 73a39bd> pnpm check:all` | 259 tests pass; types compatible; every drift scenario caught; 33 of 34 client claims, the exception being the mobile seam line known since 2026-10-14 |
| The fork patch still applies | `git apply --check` on `73a39bd` | clean; 34 files; the only patched files upstream touched are two `package.json` |
| The patched fork still works | the fork gate of the reference patch README on `73a39bd`: install, build the packages, the three client-side suites, `tsc` | 14 of 14 assertions pass and the web app typechecks; the production bundle was not rebuilt |
| Every protocol claim in the repository | `pnpm audit:protocol` at the pinned commits | 230 of 230, across 20 sources |
| Which earlier claims upstream had moved | the same audit at upstream heads, before re-pinning | 171 of 193 held; 6 were Snapchain facts, now re-pinned and corrected in the pages that state them; 16 were in dated witnesses of what a third party said on a day, now frozen at that day |
| The write path's device half | `node scripts/validate-write-path.mjs` with `@farcaster/core` 0.21.0 | 13 of 13: scoped, expiring key add with an app requester; cast, reaction and follow signed and valid; stable bytes; refusals; a fid above 2^32 |
| The audit names what moved instead of crashing | run at upstream heads after a repository restructured | fixed: a missing file now fails its claims and is listed |

Not validated, because nothing here can reach a network: any request to the
production API, any node's health, the relay, a real custody signature
accepted by a node. `plan.md` §1.3 and §6.2 above are those tests.

---

## 8. What would change the design

| Observation | Effect |
| --- | --- |
| The fork does not activate, or is abandoned | E reduces to its Farcaster configuration; nothing is thrown away |
| Farcaster's validators refuse relayed messages | dual submission through the gateway becomes necessary rather than prudent; already in the design |
| The production API serves ranked reads to third-party origins under stated terms | turn on §4.9 for readers who want Farcaster's ranking beside Home's |
| The production API closes to third parties entirely | nothing changes; that is the point of §4.2 |
| Shaped responses on Hypersnap and Neynar diverge | a second shaped mapper; cost, not redesign |
| Native accounts flood discovery | the default in §4.7 stays off and following-first remains the floor |
| Hypersnap ships the token pivot with Falcon keys | `both-networks.md` §3 applies: migrated readers are read-only on that side until a signing path exists |
| A wallet-signature step proves too hard for readers | Farcaster's own sign-in and the deeplink flow remain as fallbacks for the Farcaster side |

---

## 9. Evidence

| Source | Read | Used for |
| --- | --- | --- |
| [farcasterxyz/snapchain](https://github.com/farcasterxyz/snapchain) `3839f06`, 2026-11-23 (pinned as `snapchain`, re-pinned 2026-11-25 from `43ca24d`, earlier `1405794`; `8f82bcc` kept as `snapchain-8f82bcc`) | here | 0.15.0, 0.16.0, V21 to V23, channels at V24, GPL-3.0, no mention of Hypersnap |
| [neynarxyz/OAS](https://github.com/neynarxyz/OAS) `0c4d078`, 2026-11-02 (re-pinned) | here | the 103 shaped paths a Hypersnap node is compared against |
| [farcasterorg/hypersnap](https://github.com/farcasterorg/hypersnap) `3fab17d`, 2026-11-24 (pinned as `hypersnap-fork`, re-pinned 2026-11-25 from `a85fd22`; `ce9d003` is kept as `hypersnap-ce9d003` for the first schedule) | here | the fork schedule and validators, relay, native registration, storage, API routes, node roles |
| [farcasterxyz/client](https://github.com/farcasterxyz/client) `73a39bd`, 2026-10-30 | here | the gates and the patch; README statements |
| [SmashThunderStone/client](https://github.com/SmashThunderStone/client) `152a46b`, 2026-10-17 (pinned as `smashcast`) | here | a reference-client fork on the protocol; the preflight measurements; the key domain |
| [backmeupplz/quilcast](https://github.com/backmeupplz/quilcast) `f2eedb9`, 2026-11-10 (pinned) | here | a live direct-to-node client |
| [arcacomputer/opencaster](https://github.com/arcacomputer/opencaster) `a3a3685`, 2026-11-09 (pinned as `opencaster-now`) | here | the gateway's fallback policy |
| [arcacomputer/hypersnapweb](https://github.com/arcacomputer/hypersnapweb) `0024d58`, 2026-11-07 (pinned as `hypersnapweb-now`) | here | the token listing and the note on client developers |
| npm `@farcaster/core` 0.21.0 | here, executed | §4.3, §4.5, §7 |
| [farcasterxyz/client#6](https://github.com/farcasterxyz/client/issues/6), [SmashThunderStone/client#3](https://github.com/SmashThunderStone/client/pull/3) | web | the opt-in refusal |
| [farcasterorg/hypersnap#51](https://github.com/farcasterorg/hypersnap/issues/51), [#41](https://github.com/farcasterorg/hypersnap/issues/41), PRs #61 to #63 | web | the validator call, Cassie Heart's guidance of 11-04, the merges |
| [farcasterxyz/snapchain](https://github.com/farcasterxyz/snapchain) PRs #1054, #1083, #1089 to #1094 | web | what V21 to V23 are and how they were announced |
| [ivcained/fiddy#67](https://github.com/ivcained/fiddy/pull/67), [#75](https://github.com/ivcained/fiddy/pull/75) | web | Neynar's hosted nodes answering 402; the public Hypersnap node's stall on 10-24 |

[farcasterxyz/client#6]: https://github.com/farcasterxyz/client/issues/6
[SmashThunderStone/client#3]: https://github.com/SmashThunderStone/client/pull/3
[ivcained/fiddy#67]: https://github.com/ivcained/fiddy/pull/67
[ivcained/fiddy#75]: https://github.com/ivcained/fiddy/pull/75

---

## 10. After the fork: re-read 2026-11-13

Asked on 2026-11-10: re-read the repositories after the fork and say whether
it held. Re-read on 2026-11-13 at 09:31 UTC.

**Not verified.** No node on either network can be reached from this
sandbox, so no height was read here. The outcome below rests on Hypersnap's
own commits and on three other projects' records, each pinned as a dated
witness. The last of those readings is from 01:38 UTC on 13 November.
Whether blocks are still being produced at this hour was not measured.

### 10.1 What happened

| When, UTC | What | Evidence |
| --- | --- | --- |
| 11-12, about 08:33 | Farcaster's chain passes the first schedule's shard-0 height, 50,433,538, about fifty minutes earlier than projected | **pinned**: the height sampled at 08:52:44 was 50,434,679 |
| 11-12 08:56 | The schedule is moved twelve hours: shard 0 at 50,477,529, shard 2 at 50,996,940, shard 1 at 51,161,786, projected 20:52:39 | **pinned** |
| 11-12 09:36 | Version 0.17.5 is published as an image | one operator's notes, **pinned** as a witness |
| 11-12 evening | **The fork activates.** Two reference nodes are about 1,070 blocks past the cutover by 21:22 | **pinned** witness: an operator of a read node |
| 11-12 evening | A read node on the stock configuration stops one block short on every shard, and crosses once Hypersnap's validators are added as peers | the same witness |
| 11-12 23:36 | Every monitored Hypersnap node stops at one height for 85 seconds, then continues | **pinned** witness: a monitor of both networks |
| 11-13 01:30 | Quilcast ships free signup through Hypersnap's own registration | **pinned** witness |
| 11-13 01:35 | Hypersnap ships peer discovery and "stalled-vote recovery" | **pinned** |
| 11-13 08:36 | Hypersnap is at version 0.17.7 | **pinned** |

So: it was postponed a second time, by twelve hours, on the morning it was
due. It then activated at the new heights. Two reference nodes were about
1,070 blocks past the cutover by 21:22, and the only stop a monitor
recorded that night was 85 seconds, at 23:36, after which the nodes
continued. Nothing I read reports a longer stop. What happened on shard 0
in the minutes after the first height passed is recorded nowhere that could
be read.

Nobody announced it. Issue 51 has no comment after 10 November, the
releases page still lists a version from May, and a web search finds no
statement from Hypersnap's lead developer, Network School or Neynar.

### 10.2 What this page predicted, and what happened

- §4.10 said a stock Hypersnap install lists only Farcaster's nine peers.
  A real read node stopped one block short for exactly that reason. The
  shipped `validators.toml` now carries six Hypersnap discovery seeds.
- §2 said prerequisites do not cross the relay. They do not, and the gap
  is wider than this page assumed. See the third point below.

### 10.3 What changes for the design

1. **There are two networks now.** The network tag on every item and every
   write is live, not a precaution.
2. **Hypersnap-only accounts exist, and they have no username.** Usernames
   come from a server that knows only Optimism accounts. Home shows a
   display name and the id for them. They stay out of discovery until the
   reader turns them on, as §4.7 decided.
3. **Whether new accounts cross is an open question, and it matters.**
   What is certain (**pinned**): the relay carries no on-chain events;
   accounts that exist only on Hypersnap never reach Farcaster; and neither
   stock install configures an on-chain subscriber for a read node, so a
   network learns of a new Optimism registration only if its validators'
   operators set an Optimism endpoint, which no document tells them to do.
   Hypersnap's own text says "Legacy registrations and signers continue to
   work through the existing contract-backed path", so the intent is that
   they keep arriving. Quilcast's code assumes an account registered on
   Optimism after the fork "never reaches Hypersnap" (witness, not measured
   here). Which is true on mainnet depends on validators' private
   configuration and could not be read. If the assumption holds, a new
   Farcaster account is refused by Hypersnap, as a Hypersnap account is by
   Farcaster. Gasless keys cross through the relay. Keys added on-chain
   cross only if both networks ingest Optimism.
4. **The relay carries less by default.** Types 1 to 8 and 11 to 17.
   Channel messages cross only where an operator lists them.
5. **Hypersnap needs two thirds of its validator keys online:** six of
   eight at the fork, eight of eleven since the rotation (§11). One pause was
   seen in the first three hours.
6. **Farcaster tightened its side the day before.** Snapchain now checks
   the signer of every gossiped message and turns rate limits on by
   default. Its code still does not mention Hypersnap, so the relay still
   runs on tolerance.

### 10.4 What does not change

The build order in §6.1. No node until there are readers. The provider
registry. Write once, submit to both, show both results: the third point
above is exactly what that status line is for.

The checks in §6.2 are still unrun, and are now the first thing to do from
a machine that can reach the nodes.

---

## 11. Re-read 2026-11-25

Asked on 2026-11-25: research everything covered in this chat again for the
most current information. Twelve days after the re-read in §10.

**Not verified.** No node and no Farcaster endpoint can be reached from this
sandbox: the two public nodes, the production API and the client API all
refuse the connection, as before. So no block height was read here. What
follows rests on repository commits, GitHub pages, package registries and
news summaries, read on 2026-11-25. Coinbase's and XMTP's documentation
sites are blocked; XMTP's documentation was read from its repository.

### 11.1 What moved, and what did not

| Source | 11-13 | 11-25 |
| --- | --- | --- |
| Hypersnap | 0.17.7 | 0.17.21, `3fab17d`, 11-24 |
| Snapchain | v0.16.0 plus commits | v0.17.0 (11-16), `3839f06`, 11-23 |
| Reference client | `73a39bd` | unchanged; no commit since 10-30 |
| Neynar's API specification | `0c4d078` | unchanged |
| Coinbase SDK `@base-org/account` | 2.6.0 | unchanged, 2.6.0 |
| Coinbase smart wallet contract | 07-17 | unchanged |
| wagmi connectors | 8.2.4 | 8.2.4 |
| XMTP browser SDK | 7.1.0 | 7.1.0 on npm; 8.0.0-rc5 as a prerelease since 11-16 |
| Quorum, three repositories | no changes since August and October | one documentation rename on 11-22 |
| Quilcast | 0.79.0 | 0.112.0 |

### 11.2 Hypersnap after the first week

**The validator set was rotated.** From eight keys to eleven, held by nine
operators (**pinned**). ivy left; schmidtiest and feli joined; wake now
holds three keys. The heights are shard 0 at 50,971,518, shard 2 at
51,481,322 and shard 1 at 51,639,354. At the block rate the maintainers
measured, about 0.636 a second, those heights fall between 19:00 and 22:10
UTC on 21 November, if the chain did not stall. I could not confirm they
were reached. Quorum needs more than two thirds of the keys: eight of
eleven. Wake's three keys are 27 percent. If wake goes offline the chain
keeps going with exactly the eight it needs, and one more validator offline
stops it. The peer-discovery document still says "eight equal validators,
six must remain online"; it was not updated.

**The block rate is not one a second.** The maintainers' own samples show
3,600 blocks in about 5,660 seconds on all three shards, 0.636 a second
(**pinned**). Snapchain's rate is about one.

**Consensus fixes kept coming.** Commit subjects, read from the history
and not pinned by the audit: "restarting round from previous block causes
halt" (11-14), "set explicit block deadline for native fids to submit
messages to avoid consensus fork" (11-14), "shard 0 event catch-up should
not permanently stall the network" (11-21), "wait 90 seconds for a certified
chunk's shard-zero dependency" (11-22), and "various consensus halt sources"
(11-22), whose description lists a startup check ending "Any other
mismatch: the shard halts and asks for a snapshot restore". No page I could
read reports a mainnet-wide halt, its length or its end. Two further fixes
were open on 11-22 and are not in the commits to 11-24: a deadlock that
wedges a node, and event-id exhaustion after 16,384 merges.

**Read nodes could not sync after the fork.** Issue 71, opened 11-13 and
still open, has a maintainer saying newer nodes were pulling Snapchain
backups and that 0.17.9 would use a new snapshot source. Snapshots became
streamed, and "older binaries cannot restore the new format" (**pinned**).

**New accounts could register and not post.** Hypersnap's own document of
the repair records that a fresh native account "registered successfully on
Haatz and received a gasless signer", and its first cast was refused with
"unknown fid". The repair took effect on shard 1 at 51,311,487 and on shard
2 at 51,146,724, projected for 2026-11-15 19:58 UTC (**pinned**). Quilcast
shipped free signup on 11-13, before the repair. How many accounts were in
that window is not known.

**A fixed quota per account.** 1,008 messages an hour, a burst of 1,008,
refilled at 0.28 a second, shared by casts, reactions, follows and profile
changes, independent of storage; key additions stay at one a minute. Each
node counts in its own memory (**pinned**). Heights: shard 0 at 50,757,411,
shard 1 at 51,431,928, shard 2 at 51,267,213, projected for 11-18.

**The public API was not hardened.** A pull request opened 11-25 lists no
connection limits or header timeouts, an unauthenticated route that retries
on-chain events, and redirect-following webhooks (**web**). It is not
merged.

**The README changed its stance.** It now calls Hypersnap "the canonical
implementation of Farcaster's Hypersnap network", calls Snapchain "the former
protocol", and describes Network School's takeover in hostile terms
(**pinned**). Those are the maintainers' words and not findings. The
practical meaning is that the dispute is now written into the repository
itself, and a client that reads both networks is reading on both sides of it.

**The two engines have drifted.** Snapchain's version 24 went live on
2026-11-24 16:00 UTC. Hypersnap's engine schedule still ends at version 23
(**pinned**). Snapchain's version 24 bounds prune sweeps, a storage matter
Hypersnap no longer has, so relayed messages are not affected. It does show
the rule sets diverging, as the lead developer predicted.

### 11.3 Farcaster's side

- **Channels slipped again.** On 2026-11-13 Snapchain moved on-protocol
  channels from version 24 to version 25. Version 24 shipped on 11-24
  "without the channel rollout", and version 25 "waits on the mainnet
  channel registrar" with no date (**pinned**). Every page that said
  "channels at V24" is corrected.
- **Version 0.17.0** (released 11-16; the changes are on main from 11-11) checks the signer of every gossiped message,
  relays gossip only after the local mempool accepts it, and rejects commit
  certificates with a repeated signer (**pinned**). Its code still does not
  mention Hypersnap.
- **Validators:** the list is unchanged, seven keys.
- **The production API's refusal is unanswered.** The reference client's
  issue about it is open with one comment, from 10-21, and the client has no
  commit since 10-30. I could not test the API. Nothing found says it opened.
- **News:** nothing newer than mid-October on Network School, Neynar's
  developer platform, or third-party client policy.

### 11.4 What this changes

1. **Home's design does not move.** Channels stay "Add to feed". Both
   networks stay providers. Nothing built depends on the dates above.
2. **Home must expect refusals.** The status line per network now has two
   more reasons to show: a per-account hourly quota on Hypersnap, and "unknown
   account" for a new account that has not reached a node.
3. **One public Hypersnap node is not enough.** Hypersnap's own repair
   document lists six public RPC endpoints that answered on 11-14. The gateway
   should hold more than one, and its read fallback should be bounded.
4. **Account creation, if Home adds it, must say what the account is.** Home
   does not create accounts in its first build. A free account would be
   Hypersnap-only with no username, and the interface should say so before
   the reader chooses.
5. **The decentralization margin is thin.** Eight of eleven keys, with one
   operator on three. Home reads from it; it does not need to run it.
6. **Messaging changes.** XMTP's new generation is self-hosted. See
   [messages and wallet §13](messages-and-wallet.md#13-re-read-2026-11-25).
7. **The node-level checks in §6.2 are still the first thing to do** from a
   machine that can reach the nodes.
