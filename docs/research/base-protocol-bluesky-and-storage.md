# Building our own protocol on Base, how Bluesky works, and how social data is stored

The questions were: how and why would Home rebuild its own Farcaster or
Hypersnap protocol on Base; how does Bluesky work, completely; and what is the
most common practice for storing all of this data today. Written 2026-11-25
from the code and documents of the five repositories listed in §9, pinned at
the commits named there, beside the pages that already cover Farcaster and
Hypersnap ([`base-fork-feasibility.md`](base-fork-feasibility.md),
[`optimal-design.md`](optimal-design.md)).

How to read the evidence. **pinned** means a claim is checked by
`scripts/audit-protocol-claims.mjs` against a named commit. **web** means it
comes from a search result or a post I could not re-read from a repository.
**background** means general knowledge that I did not re-read here. **inference**
means my reasoning from the other three. Nothing was deployed, no node was run
and no Bluesky service was queried: the sandbox cannot reach them.

---

## 0. The short answers

**Every social protocol is four layers.** Who you are (identity), what you said
(authoritative data), how it travels (sync), and how it is found and shown
(indexes and media). The protocols differ in which layer they make shared and
which they leave to whoever hosts it. Farcaster makes almost everything shared
and ordered by consensus. Bluesky makes only identity shared and lets each
account's data live on a server of the owner's choice (§2).

**Bluesky in one paragraph.** An account is a DID (an identifier that resolves
to a signing key and a hosting server). Its public data is a signed Merkle tree
called a repository, stored on a Personal Data Server (PDS), one SQLite file per
account. A relay merges every server's change stream into one firehose.
Applications (AppViews) read the firehose into their own databases and serve
feeds, search and profiles. Media files are stored beside the repository, not in
it. There is no global consensus: authenticity comes from signatures, and the
only globally shared state is the identity directory, which is a single server
today and is being handed to an independent Swiss association (§3).

**The most common practice for storage** is the same in every system I read.
Content is never on a chain; a chain is used, if at all, for identity and
payments. The authoritative copy is small signed records in an embedded store
beside the writer (RocksDB, SQLite or LMDB). A change stream carries them to
everyone else. Anyone who wants to search or rank builds their own disposable
index in a general database. Images and video sit in object storage behind a CDN,
outside the signed data, and are orders of magnitude bigger than everything
else. The newest trend is the hot path keeping only recent events, with a
separate optional mirror for history (§4).

**Rebuilding on Base can mean three different things** with very different
costs (§5). Putting only the account and key registry on Base, and asking
existing nodes to honour it, is a contract and a small node change. Forking
Hypersnap onto Base needs its own validators. Building a Bluesky-style network
with Base as the identity root needs servers, a relay and indexers, and cannot
join the Bluesky network, because that network accepts only two identity
methods (§5.3).

**Why you would, and why you would not.** The real reasons are accounts that a
smart wallet can own and approve without a transaction, an identity root nobody
can pull from you, and revenue from registration. None of them is about the
user experience that Home promises, all of which is built above the protocol
(§6). The cost is a network with no content and no readers, which is the
reverse of Home's starting position.

**The recommendation** is to stay a client and spend the effort on a registry
proposal and a prototype that costs little and tells us whether anyone will
adopt it (§7).

---

## 1. The layers, and who stores what

| Layer | Farcaster (Snapchain) | Hypersnap | Bluesky (AT Protocol) | Nostr | Mastodon |
| --- | --- | --- | --- | --- | --- |
| **Identity** | account number and keys in contracts on Optimism; copies kept by every node | the same, plus native accounts with no chain | a DID resolved through a directory (`did:plc`) or a domain (`did:web`) | a public key | an address on a server |
| **Authoritative data** | every node holds a signed copy of every message, ordered by a validator set, pruned by what each account paid for | the same, with no storage limits | the owner's repository on the owner's PDS | whichever relays the client sent it to | the owner's server |
| **Where it sits on disk** | RocksDB (**pinned**) | RocksDB, same code | one SQLite file per account (**pinned**) | LMDB in strfry, a popular relay (**pinned**) | PostgreSQL (**background**) |
| **How it travels** | validator blocks and gossip; Hypersnap adds a relay | blocks plus a relay | a firehose from each PDS, merged by relays | websockets to and from relays | HTTP pushes between servers |
| **Search, ranking, feeds** | none on the node; Neynar or Hypersnap's API layer | Hypersnap's API layer, indexes on the node | AppViews, a separate service | whatever a relay or client builds | the server's own database |
| **Media** | not in the protocol: embeds are links | the same | blobs stored by the PDS, outside the repository; CDN copies | links to media servers | object storage (**background**) |

In this table the Nostr and Mastodon cells are **background** except strfry's LMDB, and
the Farcaster and Hypersnap cells are **pinned** in the earlier pages.

Two differences matter for the rest of this page. First, in Farcaster the
*network* stores everything and pays for it through storage rent; in Bluesky
the *account's host* stores the account and everyone else stores what they
choose. Second, Farcaster needs agreement on order (consensus) because every
node must hold the same state; Bluesky does not, because each repository is
ordered by its owner's commits.

---

## 2. Why the architectures differ

Farcaster's nodes must agree on one global state: who owns which account, which
keys are active, how much storage each account has, and in what order messages
arrived, because a message is valid only against that state. That is why
Snapchain is a BFT chain with a permissioned set of validators (seven keys at
Farcaster, and eleven at Hypersnap by its schedule), and why a node that disagrees halts. The cost
is paid in operators, upgrades and coordination, and it shows: Hypersnap's first
two weeks had postponements, a stall and several halt fixes (**pinned**,
[`optimal-design.md`](optimal-design.md) §10).

Bluesky avoids that by making each account a self-certifying unit. A repository
is a signed tree. Anyone who holds it can check, with the account's public key,
that it is exactly what the owner committed. Ordering inside an account is the
owner's own revision counter. There is nothing to agree about across accounts,
so there is no consensus layer. The two things that still need a shared answer,
"which key and which host belongs to this DID right now" and "has this account
been deleted", are answered by the identity directory and by account-status
events (**pinned**, `atp`, `did`, `account` specs).

This is an inference worth keeping in mind for §5: of the two designs, the
Bluesky one needs far fewer people to operate, and the Farcaster one gives every
node the whole network without trusting a host. They fail differently. A Bluesky
account is lost if its host disappears and the owner has no backup, which is why
a separate mirror now exists (§3.6).

---

## 3. Bluesky, completely

### 3.1 Identity

An account is identified by a DID. Two methods are accepted and the
specification says it wants the set kept as small as possible: `did:plc` and
`did:web` (**pinned**). A DID resolves to a document that names the account's
signing key, its handle and its PDS.

`did:plc` is a ledger of signed operations. Control belongs to between one and
five rotation keys (secp256k1 or P-256); the DID itself is the first 24 characters
of the base32 SHA-256 of the first operation, so it is self-certifying; an
operation may not exceed 7,500 bytes; and a higher-priority rotation key has 72
hours to rewrite an operation that a lower one signed (**pinned**). The ledger is
kept by a directory server, `plc.directory`. The specification states plainly
that "some trust is required in the PLC server" and limits what it can do to
refusing valid operations and choosing the wrong fork (**pinned**). It has been
operated by Bluesky; in September 2025 Bluesky announced an independent Swiss
association to run it, saying it expects neither that body nor a single global
directory to be the final form, and the directory's README now says the
organisation was founded in 2026 (**pinned**, blog and README). In February 2026 a
read-replica service was released so others can keep and audit a full copy
(**pinned**, blog).

A **handle** is a domain name such as `user.example.com`. It is valid only if the
DID document claims the handle and the handle's domain points back at the DID
(**pinned**). Handles are cosmetic and changeable; the DID is the account.

### 3.2 The repository

An account's public data is a **repository**: a Merkle Search Tree of records,
mapping `collection/record-key` paths to CBOR records, with every change signed
as a **commit** (**pinned**). Details:

| Fact | Value | Evidence |
| --- | --- | --- |
| Tree | Merkle Search Tree; a key's depth is the count of leading zero bits of its SHA-256 divided by two, so fanout is 4 | **pinned** |
| Commit | `did`, `version` 3, `data` (tree root), `rev` (a timestamp-like clock), `prev` (almost always null), `sig` | **pinned** |
| Record keys | `TID` keys sort by time, so new posts are appends | **pinned** |
| Size | "intended to store up to single-digit millions records" | **pinned** |
| Deletion | supported "without leaving a trace or tombstone" | **pinned** |
| Export | CAR v1 file, used for backup, migration and sync | **pinned** |
| Blobs | not in the repository; referenced by hash | **pinned** |

What is *not* specified is what a post is. The specification says it leaves
follows and avatars to application designers: shapes live in **Lexicons**, schemas
published under a name hierarchy, and `app.bsky.*` is Bluesky's own (**pinned**).
That is why other applications can write their own record types into the same
repository.

### 3.3 The Personal Data Server

The PDS is where an account lives. In the reference implementation (**pinned**):

- Each account has its **own SQLite file**, in a directory named for the DID and
  grouped under the first two hex characters of the DID's SHA-256.
- The account's **repository signing key is a file in that same directory**, which
  the server reads to sign commits. In other words the host holds the key that
  makes the account's data authentic.
  The *rotation* key that controls the identity is separate and can be held by the
  user, which is what lets an account move even if its host turns hostile.
- A separate database holds the account table, tokens and invite codes; another
  holds the ordered stream of events that the server emits.
- Blobs are stored on disk or in S3, with a KMS helper for cloud-held keys.

The scaling idea is: one tiny database per account, so there is no single large
database to run, and an account can be moved by copying a repository and
updating its DID document.

### 3.4 Sync: firehose, relay, and who keeps what

Every PDS offers a WebSocket **firehose** of events: `#commit`, `#sync`,
`#identity` and `#account`, each with a sequence number for resuming (**pinned**).
A **relay** subscribes to many PDSes and re-emits one merged firehose. Consumers
do not have to trust the relay, because each commit carries signatures and a
proof that it follows the previous one (the tree can be "inverted" to check the
diff). Missing or inconsistent events are detected and a consumer re-downloads the
repository.

The relay design changed in 2025, and this is the key storage lesson. Early
relays stored a full copy of every repository. That was "expensive to store and
run". Sync version 1.1 made it possible to verify updates without holding the
repository, so relays are now **non-archival**: they keep only recent events
(**pinned**, blog; the post says all relays now run this way). Bluesky's own
figures for a relay of the whole network are about 2 virtual cores, 12 GB of
memory and 30 Mbps, with disk set by the "backfill window", about a couple of
hundred gigabytes for 24 hours (**pinned**, May 2025 post; dated). The
reference relay is a single Go program on one server, with its host and account
state in a SQL database, PostgreSQL in production and SQLite for tests
(**pinned**).

Applications that need history now crawl the network themselves. **Tap** is a
tool from Bluesky for that: it subscribes to a relay, verifies, backfills from each
PDS, and gives an application a clean stream (**pinned**, blog).

### 3.5 The AppView, feeds, labels and moderation

An **AppView** reads the firehose and builds the database that a client queries:
profiles, follows, likes, threads, search, notifications. In the open
implementation that is 45 tables in PostgreSQL, a Redis cache and a gRPC "data
plane" between the API and the database (**pinned**). Bluesky's production
service is reported to have moved its AppView storage from PostgreSQL to
ScyllaDB and uses SQLite elsewhere; I found only secondary write-ups, so treat
that as **web** and unconfirmed.

Feeds are separate services that return a list of post references; labelers are
separate services that publish signed labels about accounts and content; the
moderation tooling is a service of its own (`ozone`, **pinned**). The principle
is that these are all replaceable by the user's choice, which is the AT
Protocol's answer to "who decides what I see".

### 3.6 Resilience: what happens when a host disappears

With non-archival relays, "when a PDS disappears, those repos are gone" unless
someone mirrored them. A $20,000 grant from Bluesky funded **Hubble**, a public
mirror of every repository, synchronised in real time. It holds the current
state, not history, and **no blobs**: its author writes that 43 million
repositories are already a lot and that blobs take "orders of magnitude more
space (think: petabytes)" (**pinned**, blog, March 2026). The honest summary:
the signed data is cheap to keep everywhere; the media is where the real cost is,
and nobody keeps a complete copy.

### 3.7 Governance and what is missing

- The specification covers public data only. Private data was listed as missing
  in the specification itself, and the March 2026 roadmap calls it "permissioned
  data", with several teams building extensions and the Bluesky team planning to
  spend the summer on it (**pinned**). Do not plan on it.
- The roadmap says the public-data protocol is "broadly complete" and that
  further changes to sync are expected to go through the IETF; the creation of an
  AT Protocol working group was formally approved in March 2026 (**pinned**).
- The reference packages are MIT, and the repository READMEs say dual-licensed MIT
  and Apache 2.0 (**pinned**), so another network can reuse the code.

### 3.8 What Bluesky is not

It is not fully decentralised in operation yet. In the posts I read, the identity
directory (until the new organisation takes over), the main relay and the main
AppView are still operated by Bluesky. The protocol allows more, and independent
PDS hosts, relays, PLC replicas and a public mirror now exist and are growing, but
that is a direction and not a finished state (**inference** from the posts). Likewise, a Bluesky account's *own* authenticity is strong and
its *availability* depends on its host.

---

## 4. The most common practice for storing the data

Reading the systems side by side, the common practice has six parts.

1. **Content stays off-chain.** Farcaster, Bluesky, Nostr and Mastodon store no
   post on a chain. Farcaster uses Optimism for who owns an account, which keys
   it has, and what was paid; Bluesky uses a directory (or a domain); Nostr has no
   shared identity layer (**pinned** for the first two).
2. **The authoritative copy is small, signed, and beside the writer, in an
   embedded database.** RocksDB for Snapchain, SQLite per account for a PDS, LMDB
   for strfry (**pinned**). Nobody runs one large shared database for the
   authoritative data.
3. **A change stream is the sync mechanism**: blocks and gossip at Farcaster,
   firehose at Bluesky, websockets at Nostr (**pinned**).
4. **Indexes are separate, rebuildable and general-purpose.** Anything that
   searches or ranks builds a database from the stream: PostgreSQL in the open
   Bluesky AppView (**pinned**), a Scylla-class store at Bluesky's production
   scale (**web**), Postgres and Redis for Farcaster's own replicator, `shuttle`
   (earlier pages). The index is disposable: lose it and you
   replay the stream.
5. **Media is out of band.** Object storage with a CDN in front, with the signed
   record holding only a hash or a link. It dominates cost.
6. **History is a separate, optional service.** The hot path keeps recent events;
   archives and mirrors keep the rest (Bluesky's switch to non-archival relays and
   Hubble; Hypersnap's removal of storage limits is the opposite choice and
   pushes growth onto every node, which one operator's 685 GB disk already
   outgrew (**pinned**, earlier page)).

### What each layer costs, from the numbers I could read

| Item | Number | Evidence |
| --- | --- | --- |
| A Snapchain read node | 16 GB memory, 4 cores, 1.5 to 2 TB of disk | **pinned** |
| A Bluesky relay for the whole network | about 2 vCPU, 12 GB, 30 Mbps, plus a disk sized by backfill (24 hours is a couple of hundred GB) | **pinned**, dated May 2025 |
| Bluesky repositories mirrored by Hubble | more than 43 million | **pinned**, blog March 2026 |
| Bluesky media | "orders of magnitude" more than the repositories, "petabytes" | **pinned**, guest post |
| Farcaster per-account storage | one 2025 unit holds 100 casts, 200 links, 200 reactions | **pinned** |
| A PDS | one SQLite file per account, plus blobs | **pinned** |

### What this means for Home's own storage

Home is a client, so it should store the least. A browser cache of what the
reader has seen; a gateway for the things that need a server (a database for
Home's own state, object storage for any media Home hosts, a queue for relayed
writes); and a choice of providers for the protocol data. Home should not hold
the global data, and no part of the plan needs it to. If Home ever runs its own
nodes, the numbers above say Snapchain-style nodes are about a terabyte and a
half of disk each, and a Bluesky-style relay is small but a mirror is not.

---

## 5. What "our own protocol on Base" could mean

Everything Farcaster keeps on a chain is identity, keys and payment, so "on Base"
can only mean moving those (**pinned**, [`base-fork-feasibility.md`](base-fork-feasibility.md)
§1). The node's code fixes the addresses of the three Optimism registries and the
one Base registry it watches as constants, and has two chains for its on-chain
connector (**pinned**). So pointing an identity registry at Base is a **code
change** in the node and a contract deployment, not a setting.

There are three designs.

### 5.1 A: put the account and key registry on Base and ask existing nodes to honour it

- **On Base.** An account registry whose owner may be an ordinary address or a
  smart wallet, and a key registry whose events carry the key, its scopes and its
  expiry.
- **How a smart wallet approves a key.** By calling the contract in a sponsored
  transaction. The *contract* checks the smart wallet's signature on Base, so
  the nodes only read an event. That is the missing piece today: both nodes accept
  an ordinary signature only for a gasless key, so a smart wallet cannot approve a
  scoped, expiring key without a transaction (**pinned**,
  [`messages-and-wallet.md`](messages-and-wallet.md) §4).
- **What is new.** The key event must carry scope and expiry, because keys that
  arrive on-chain today are grandfathered with no scope check and no expiry
  (**pinned**).
- **Who must act.** Hypersnap or Farcaster's node authors must accept the new
  event. Whether they would is **unknown**.
- **Cost.** Contracts, an audit, and a node patch. No new validators.
- **Risk.** It depends on the other network's goodwill and release cycle, and the
  nodes' engine versions mean something different on each network, so a change
  has to be ported twice (**pinned**).

### 5.2 B: fork Hypersnap onto Base and run our own network

- **On Base.** Everything in A, plus optionally storage rent and a validator
  registry.
- **What Home runs.** A validator set with a quorum (Hypersnap needs eight of
  eleven keys), read nodes, a relay to and from the other networks, an API layer,
  and upgrade coordination by timestamp.
- **Cost.** The code is available, GPL-3.0, and Hypersnap shows a small team can
  fork one in weeks. The cost is operators, and the incidents show it: postponed
  twice, a stall, halt fixes, and read nodes that could not sync (**pinned**).
- **What users get.** Nothing the other networks do not, except what the registry
  adds. A relay carries messages, but never on-chain events or native accounts,
  so Home's accounts and the other networks' accounts would be separate worlds that
  share a message format (**pinned**).

### 5.3 C: a Bluesky-style network with Base as the identity root

- **On Base.** An identity registry replacing the PLC directory: an account maps
  to a signing key, a hosting URL and a recovery owner that may be a smart wallet.
- **Off Base.** Per-account signed repositories on hosting servers, a relay and
  indexers. The reference software is MIT and Apache 2.0 and could be reused.
- **Cost.** No consensus and no validators, so far fewer people to run. But
  servers, a relay, an AppView and tooling are real work, and nothing in the
  existing Bluesky network would carry over: **the AT Protocol accepts only
  `did:plc` and `did:web`**, and its governance intends to keep the set small
  (**pinned**). A Base-rooted method would put us outside that network, which makes
  this a third network, the thing the earlier recommendation was against.
- **A trade-off to know.** In the reference PDS the host holds the repository
  signing key (§3.3), so accounts depend on their host more than a Farcaster
  account, whose key is on the user's device, does. Whether to copy that is a
  design choice (**inference**).

### 5.4 The three side by side

| | A: registry on Base | B: fork onto Base | C: Bluesky-style on Base |
| --- | --- | --- | --- |
| New network | no | yes | yes |
| Validators | none | yes | none |
| Code to write | contracts and a node patch | A plus operations and upgrades | servers, relay, indexer |
| Depends on others | yes, to adopt it | partners for validators | no, but no existing audience |
| Smart-wallet accounts without a transaction | partly (a sponsored transaction) | the same | the same |
| Audience on day one | Farcaster's and Hypersnap's, if adopted | none | none |
| Cost to find out | low | high | medium |

---

## 6. Why you would want it, and why you would not

**Real reasons**, in order of how much they are about this decision:

1. **Smart-wallet accounts that can approve keys.** This is a concrete, verified
   gap today (§5.1), and the only one that a registry on Base closes.
2. **An identity root that no one can take from you.** A registry on a chain
   cannot be withdrawn by one company, unlike a directory server, and the
   Bluesky case shows the pain: it took until 2025 to start moving the directory
   to an independent body. A chain brings its own dependency, though: Base's
   sequencer is run by one company (**web**).
3. **Revenue.** Registration and storage fees can accrue to whoever owns the
   registry. That is the main reason an organisation builds a protocol and not
   only a client (**inference**).
4. **Choosing the rules.** Scoped and expiring keys by default, recoverable
   accounts, storage policy and moderation hooks.

**Reasons that sound strong and are not:**

- *Cheaper accounts.* Base and Optimism were both OP Stack chains, so fees were of
  the same class (**background**). Base was reported in February 2026 to be moving
  to its own stack (**web**, unconfirmed; see
  [`interop-layer-on-base.md`](interop-layer-on-base.md) §6). I did not read current
  fees.
- *Distribution through Coinbase.* Unverified and out of Home's control.
- *The Home experience.* Everything Home promises (a ranked feed with reasons and
  controls, receipts, one signature for two networks, messages and a wallet) sits
  above the protocol. The design pages show each is reachable on the existing
  networks (**pinned**, [`optimal-design.md`](optimal-design.md),
  [`experience-walkthrough.md`](../design/experience-walkthrough.md)).

**Why not:**

- **No content and no readers.** A new network starts at zero. A multi-network
  client starts with all of Farcaster's and Hypersnap's content, and could add
  Bluesky's.
- **Operating consensus is fragile and people-heavy.** B needs independent
  operators; C needs a relay, an AppView and a hosting business.
- **The audience problem is the same for Bluesky.** After years and a funded
  company, its decentralisation is still partial (§3.8). A small team starting
  today does not get that for free.

---

## 7. Recommendation

1. **Stay a client of existing networks.** It is the only option whose whole
   value does not depend on adoption by others.
2. **Make the Base registry a cheap experiment, not a project.** Specify the
   account and key events (including scope and expiry), deploy to a Base test
   network, show a smart wallet approving a scoped key with a sponsored
   transaction, and write the node patch against a local devnet. A few weeks of
   work, and it produces something a maintainer can evaluate.
3. **Ask before building more.** Ask Hypersnap and Farcaster's maintainers whether
   they would honour such a registry. The answer decides between A and the
   alternatives.
4. **Revisit B or C only if** a maintainer accepts the registry *and* at least
   three independent partners commit to run validators or hosting, or if
   smart-wallet accounts prove to be what readers ask for.
5. **If Bluesky is of interest as a network to read,** treat it like the others:
   a provider behind the same adapter, not a reason to rebuild. It is public data
   with open APIs, reference code under MIT, and a design that a client can read
   without running anything. That would be a separate piece of research.

---

## 8. Not verified

- **Nothing was run.** No contract was deployed; no node, relay, PDS or AppView
  was started; no Bluesky or Farcaster service was queried.
- **Bluesky's production storage** (the ScyllaDB move and the size of its
  AppView) rests on secondary write-ups. The relay hardware figures are from a
  May 2025 post and the 43 million figure from a March 2026 guest post, so both are
  dated.
- **Mastodon's storage** and the exact present status of Nostr relay software
  beyond strfry were not re-read.
- **Base's fees and sequencer terms** were not read from a primary source.
- **Whether Hypersnap or Farcaster would accept a Base registry** is unknown.
- **Whether adding a DID method to the AT Protocol's reference code is a small or
  a large change** was not read; the governance point (two blessed methods) was.
- **Hubble's present state** (launched, funded for a year) is from its announcement.

---

## 9. Evidence

| Source | State read | Used for |
| --- | --- | --- |
| [bluesky-social/atproto](https://github.com/bluesky-social/atproto) (pinned as `atproto`) | `665c90c`, 2026-11-25 | the PDS's per-account SQLite and key file, blob stores, the AppView's tables and dependencies, the package map |
| [bluesky-social/atproto-website](https://github.com/bluesky-social/atproto-website) (`atproto-website`) | `605a806`, 2026-11-23 | the specifications (repository, DID, sync, blob, handle, account), the roadmap and the posts on relays, Hubble and PLC |
| [did-method-plc/did-method-plc](https://github.com/did-method-plc/did-method-plc) (`did-method-plc`) | `79b99aa`, 2026-11-24 | the PLC rules, the directory's trust model, the new organisation |
| [bluesky-social/indigo](https://github.com/bluesky-social/indigo) (`indigo`) | `6017e7e`, 2026-11-24 | the relay's design and storage |
| [hoytech/strfry](https://github.com/hoytech/strfry) (`strfry`) | `4cd3cf6`, 2026-09-04, frozen | a Nostr relay's storage engine |
| [farcasterxyz/snapchain](https://github.com/farcasterxyz/snapchain) (`snapchain`) | `3839f06`, 2026-11-23 | RocksDB, the fixed contract addresses and the two on-chain chains |
| Pragmatic Engineer's write-up of Bluesky's infrastructure | search result, 2026-11-25 | the move to ScyllaDB (**web**, unconfirmed) |
