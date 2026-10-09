# Why OP Mainnet, how a cast reaches Snapchain, and how a client talks to it

Three questions, answered from the sources that define the protocol: the
specification and the FIPs that changed it, the contracts and their
documentation, the Snapchain implementation at `v0.14.2`, and the published
client libraries. Written 2026-10-09. Every number below that can be checked
against a file is pinned by `scripts/audit-protocol-claims.mjs`; the rest
names its source inline.

Companion pages: [plugging into Snapchain](../operations/plugging-into-snapchain.md)
is the operational view (limits, costs, vendors, posture); this page is the
mechanism underneath it.

---

## 0. The short answers

**Why OP Mainnet.** A Farcaster account is a number issued by a smart contract,
and the protocol's whole security model rests on that: a message is valid only
if its signer is authorised by the address that owns the account. The protocol
puts exactly three things on a chain, because they need a neutral,
tamper-proof, recoverable record: who owns an account, which keys may sign for
it, and how much storage it has paid for. Everything else is deliberately kept
off-chain for cost and speed. That chain is OP Mainnet because, in August 2023,
Farcaster's users and developers were already on the OP Stack (OP Mainnet,
Base, Zora), Optimism's open-source and identity work (EAS) aligned with the
project, and a rollup made the on-chain steps cheap enough to be routine: the
proposals that moved keys and storage on-chain budgeted about $0.10 to $1 per
key and $5 a year per storage unit. The contracts are not upgradeable and sit
at canonical addresses, so "OP Mainnet" is now a fact of the protocol rather
than a preference. For Home it is a *read* dependency: Snapchain mirrors every
relevant OP event, and a connected app never sends an OP transaction unless it
creates accounts or pays for storage.

**Why post to Snapchain.** Snapchain is where the social data lives. Casts,
reactions, follows and profiles are signed protobuf messages that a node
validates against the on-chain registries, orders into one-second blocks with
a Tendermint-style validator set, merges into per-account state with
deterministic conflict rules, and prunes against the account's paid storage.
Posting means building that message correctly, signing it with a key the
account has authorised, and handing it to a node.

**How a client interacts with it.** Over HTTP on port 3381 or gRPC on 3383, on a
node you run or rent. Reads are keyed lookups (by account, by target, by
parent). Writes are `submitMessage`. Real-time is a per-shard event stream.
Nodes bootstrap from daily snapshots and follow blocks by gossip. There is no
feed, search or notification endpoint; those are built on top.

---

## 1. Why the identity layer is on a chain, and why that chain is OP Mainnet

### 1.1 What has to be on-chain

The protocol overview states the design in one sentence: "Farcaster uses a
smart contract registry on a Turing-complete blockchain to map identifiers to
key pairs." The identifier, the fid, is "cheap, meaningless, and in unlimited
supply"; the registry "allows key rotation in case of exposure, and smart
contract wallets can protect against key loss." Messages are explicitly *not*
on the chain: they are "a few kilobytes in size", "uniquely identified by the
hash of their contents", and carry user-reported timestamps.

Three proposals explain why each on-chain piece exists:

| Piece | Proposal | The reason given |
| --- | --- | --- |
| Storage rent | FIP-6 Flexible Storage (June 2023, finalized) | "free storage incentivizes low quality, high volume content like spam and airdrop farming" and "accelerates storage growth, which incentivizes centralization". Units were priced at $5 a year and deployed "on the same L2 as the Farcaster Identity Registry" |
| Signers in a contract | FIP-7 Onchain Signers (July 2023, finalized) | signers had lived in a per-account CRDT with a FIFO limit, so adding one could evict another and erase data; "Signers should be set onchain on an L2 contract to avoid usability problems with CRDT consensus." Cost estimate: "between $.1 and $1 to add a signer at today's L2 gas prices" |
| Gateways and storage at registration | FIP-10 Gateways (Nov 2023, finalized) | "Since OP Mainnet gas is cheap, malicious actors can spend < $100k to add millions of events." Registration moved behind swappable gateways, every new fid must rent one storage unit, and active keys were capped at 1,000 |

The architecture page summarises the rule that governs all of this: "Actions
are performed onchain only when security and consistency are critical. Use of
onchain actions is kept at a minimum to reduce costs and improve performance."

### 1.2 How OP Mainnet was chosen

Before August 2023 the registries lived on the Goerli testnet. A Farcaster
engineering note of the time (on HackMD, unreachable from this sandbox and
known here only through a search excerpt) weighed deploying to Ethereum L1 and
re-deploying to an L2 later against going to an L2 directly, the cost of the
first option being that every existing fid would have to be re-registered.

On 2023-08-22 Dan Romero announced the decision: "Thrilled to announce
Farcaster will be moving to OP Mainnet. Many of our most active users &
developers are building on the OP Stack across OP Mainnet, Base & Zora. We're
also excited about Optimism's strong commitment to open source & OP Mainnet
identity initiatives like EAS." (The date is decoded from the post's snowflake
id, 1693986385315963024.) Coverage at the time tied the move to permissionless
sign-ups: once on a real chain with real fees, anyone could register without a
corporate API.

The Snapchain connector still carries the fingerprint of that week: it starts
reading OP Mainnet at block 108,864,739, mined on 2023-08-29 (derived from the
block and timestamp pair in Snapchain's own on-chain API example). The
registries were redeployed once more on 2023-11-07, with gateways, under
FIP-10; hubs cut over 24 hours after the `Migrated` event.

Why an L2 rather than Ethereum itself is implicit in the numbers above: the
protocol wanted on-chain steps that cost cents, not dollars, and happen in
seconds, not minutes. Why OP Mainnet rather than another rollup is the
ecosystem argument in the announcement. There is no FIP that compares chains;
the choice was made by the team and recorded in the deployment.

### 1.3 Which chain holds what today

The contracts documentation (2026-08-13) draws the current map. Addresses are
the canonical deployments the specification names.

| Chain | Contract | Role |
| --- | --- | --- |
| OP Mainnet (chain id 10) | IdRegistry `0x00000000Fc6c5F01Fc30151999387Bb99A9f489b` | fid ↔ custody address, recovery address, transfers |
| OP Mainnet | IdGateway `0x00000000Fc25870C6eD6b6c7E41Fb078b7656f69` | registration; requires renting one storage unit |
| OP Mainnet | KeyRegistry `0x00000000Fc1237824fb747aBDE0FF18990E59b7e` | on-chain signers, key type 1 (Ed25519) and type 2 (auth addresses); 1,000 active keys per fid |
| OP Mainnet | KeyGateway | adds keys; validates app attestation through the SignedKeyRequestValidator `0x00000000fc700472606ed4fa22623acf62c60553` |
| OP Mainnet | StorageRegistry `0x00000000fcCe7f938e7aE6D3c335bD6a1a7c593D` | storage units, priced in USD and paid in ETH via a Chainlink oracle |
| OP Mainnet | Bundler; RecoveryProxy `0x00000000FcB080a4D6c39a9354dA9EB9bC104cd7` | the Bundler registers, rents and adds a key in one transaction; the proxy is a changeable recovery executor behind a fixed address |
| Base (chain id 8453) | TierRegistry `0x00000000fc84484d585C3cF48d213424DFDE43FD` | Farcaster Pro subscriptions (FIP-236, finalized). The FIP does not say why Base |
| Base, by default | channel registrar (stock Basenames `RegistrarController` and `BaseRegistrar`) | on-protocol channels, FIP-276 draft; the FIP calls the target chain "an open question" |
| Ethereum L1 (chain id 1) | FnameResolver, SnapchainConfigRegistry `0x00000000fc51aD6eb74EAE89ba4b01b1776fBA85` | CCIP resolution of `*.fcast.id`; validator sets and peer lists (FIP-277, review) |
| off-chain | fname registry at `fnames.farcaster.xyz` | free usernames, authorised by a custody-address signature |

So the protocol is already multi-chain. "OP" is specifically where identity,
keys and storage are, and that is the part a client cannot route around.

### 1.4 How Snapchain depends on OP Mainnet

A node does not trust clients about accounts; it reads the chain. The
on-chain connector subscribes to the four OP contracts and the Base Tier
Registry, and turns their logs into on-chain events that are themselves
sequenced into shard 0 and fanned out:

| Event type | Source contract | What it tells the node |
| --- | --- | --- |
| `EVENT_TYPE_ID_REGISTER` (3) | IdRegistry | the fid exists, its custody and recovery addresses, transfers |
| `EVENT_TYPE_SIGNER` (1) | KeyRegistry | a key was added or removed, with the app's `SignedKeyRequest` metadata |
| `EVENT_TYPE_STORAGE_RENT` (4) | StorageRegistry | units rented, by whom, expiring when |
| `EVENT_TYPE_TIER_PURCHASE` (5) | TierRegistry on Base | Pro status, which allows 10K casts (and, before V20, four embeds) |
| `EVENT_TYPE_CHANNEL_REGISTER` (6) | channel registrar | channel ownership (gated to V21, not yet on mainnet) |

The node configuration has one RPC URL for OP Mainnet, a second for Base and a
third `l1_rpc_url` for Ethereum, the last needed to validate `.eth` username
proofs. The contracts documentation states the two assumptions hubs make about
the chain: "All event history from IdRegistry, KeyRegistry and StorageRegistry
will be accessible via an OP Mainnet node" and "OP Mainnet will not re-org
after 6 confirmations are received."

Every message a node merges is checked against this mirrored state: the fid
must have an `ID_REGISTER` event, the signer must be an active key, and the
account's storage decides what gets pruned. That is the mechanical meaning of
"we have to use OP": the authority a cast relies on is an OP Mainnet event,
read by the node, not something a client can assert.

### 1.5 What that means for Home, action by action

| Home wants to | Touches OP Mainnet? | How |
| --- | --- | --- |
| Look up a user's fid, custody address, keys, storage | no transaction; reads mirrored state | Snapchain `onChainIdRegistryEventByAddress`, `onChainSignersByFid`, `signersByFid`, `storageLimitsByFid`; or the contracts' view functions over any OP RPC |
| Let a user authorise Home to post | **no**, with a gasless `KEY_ADD` (custody-wallet EIP-712 signature, submitted to Snapchain); **yes** with the legacy `KeyGateway.add`, paid by the user or a sponsor | section 2.3 |
| Post, react, follow, edit a profile | **never** | section 2 |
| Create an account for a new user | **yes**: `IdGateway.register` or the Bundler, plus one storage unit; or Neynar's registration endpoint, which pays from a Neynar-held wallet | FIP-10 made the storage unit mandatory |
| Give a user more storage | **yes** to rent (`StorageRegistry`); **no** to lend a unit Home already owns (`LEND_STORAGE`, type 15, since V11) | |
| Verify a wallet address on a profile | no transaction; the user signs an EIP-712 claim that goes inside a Snapchain message | spec §2.6 |

A connected app, which is what Home is until it decides to create accounts,
needs an OP Mainnet RPC only to double-check state, and can get the same facts
from any Snapchain node.

---

## 2. Posting to Snapchain, byte by byte

### 2.1 The envelope

A message is two protobufs. `MessageData` is what the user means; `Message`
wraps it with the proof that the user meant it.

| `MessageData` field | Meaning | Rule |
| --- | --- | --- |
| `type` | one of the `MessageType` values | the body must match the type |
| `fid` | the author | must be registered |
| `timestamp` | seconds since the Farcaster epoch, 2021-01-01T00:00:00Z | at most 600 seconds ahead of the block it lands in (`ALLOWED_CLOCK_SKEW_SECONDS`); the docs page still says 15 minutes |
| `network` | `MAINNET` = 1, `TESTNET` = 2, `DEVNET` = 3 | a mainnet node accepts only mainnet messages; this stops replay across networks |
| `body` | one of the typed bodies | cast, reaction, link, user data, verification, username proof, frame action, link compaction, storage lend, key add and remove, and the four channel bodies |

| `Message` field | Meaning |
| --- | --- |
| `data` or `data_bytes` | the `MessageData`, as an object or as the exact bytes that were hashed. Snapchain requires `data_bytes` because protobuf serialisation differs between implementations and the hash is over bytes |
| `hash` | 20 bytes: BLAKE3 of `data_bytes`, truncated to 160 bits (`HASH_SCHEME_BLAKE3` = 1) |
| `signature`, `signature_scheme` | 64-byte Ed25519 signature **over the hash** (`SIGNATURE_SCHEME_ED25519` = 1). `EIP712` (= 2) exists in the enum but the node's envelope check accepts only Ed25519; Ethereum signatures live inside bodies |
| `signer` | the 32-byte Ed25519 public key that signed |

Size limits (`validations/message.rs`): 2,048 bytes of `data_bytes` for an
ordinary message, 16,384 for a Pro user's 10K cast or a username proof, 65,536
for a link compaction message.

The message types in use today, from the Snapchain proto:

| Id | Type | Id | Type |
| --- | --- | --- | --- |
| 1 | `CAST_ADD` | 11 | `USER_DATA_ADD` |
| 2 | `CAST_REMOVE` | 12 | `USERNAME_PROOF` |
| 3 | `REACTION_ADD` | 13 | `FRAME_ACTION` (validated, never stored) |
| 4 | `REACTION_REMOVE` | 14 | `LINK_COMPACT_STATE` |
| 5 | `LINK_ADD` | 15 | `LEND_STORAGE` |
| 6 | `LINK_REMOVE` | 16 | `KEY_ADD` |
| 7 | `VERIFICATION_ADD_ETH_ADDRESS` | 17 | `KEY_REMOVE` |
| 8 | `VERIFICATION_REMOVE` | 18–21 | `CHANNEL_UPDATE`, `CHANNEL_MEMBER`, `CHANNEL_PIN`, `CHANNEL_MODERATE` (gated to V21) |

### 2.2 Hash, then sign

The order matters and is the most common source of invalid messages:

1. Serialise `MessageData` to bytes. The reference serialiser is ts-proto
   `v1.146.0`; any other serialiser is fine **if** you send the bytes you
   hashed in `data_bytes`. The protocol repository ships conformance vectors
   under `vectors/` so another implementation can prove parity.
2. `hash = blake3(data_bytes)[0..20]`.
3. `signature = ed25519_sign(hash)` with the signer's private key. The node
   calls `verify_strict(message.hash, signature)` against `message.signer`.
   One caution: the Rust snippet in the Snapchain HTTP docs signs the data
   bytes rather than the hash; the node would reject that message. The
   TypeScript builders sign the hash, which is what the spec and the node
   expect.
4. Put `data_bytes`, `hash`, `hash_scheme`, `signature`, `signature_scheme`
   and `signer` in a `Message`, encode it, and POST the bytes.

Messages are totally ordered by `(timestamp, hash)`: later timestamp wins, and
equal timestamps are broken by comparing hash bytes. Every conflict rule in the
protocol is built on that order.

### 2.3 What makes the signer valid

The node's `validate_user_message` runs, in order: the stateless checks above;
"the user has a custody address" (an `ID_REGISTER` event for the fid); "the
user has a valid signer", which is an active key for the fid matching
`message.signer`; and, for gasless keys, that the message type is in the key's
declared scopes. Two kinds of key satisfy the second check:

| Key | Registered by | Scope and life | Cost |
| --- | --- | --- | --- |
| On-chain (KeyRegistry key type 1) | `KeyGateway.add` with the app's `SignedKeyRequest` metadata, usually approved in the Farcaster app | grandfathered: any message type, no expiry, removed only by a transaction | gas on OP Mainnet |
| Gasless (`KEY_ADD`, since V16 on 2026-05-07) | a Snapchain message carrying the custody address's EIP-712 `KeyAdd` signature, the app's off-chain-domain `SignedKeyRequest`, explicit `scopes`, a `ttl` of at most 90 days (sliding, refreshed on use) and a per-fid nonce; the new key signs the envelope | only the listed types; expires when unused; 1,000 active keys per fid; one `KEY_ADD` a minute per fid | none |

`KEY_ADD` and `KEY_REMOVE` are the exception to "the signer must already be
active": their authority comes from the custody signature inside the body, so
the envelope check is skipped for them. A removed key stops future messages
only; since V14 (FIP-238) its past messages stay.

### 2.4 Body rules a composer must respect

| Body | Rules (spec §2 and `validations/cast.rs`) |
| --- | --- |
| `CastAddBody` | text ≤ 320 bytes as `CAST`, 321–1024 as `LONG_CAST`, up to 10,000 as `TEN_K_CAST` for Pro; up to 4 embeds (URL or cast id) since V20; up to 10 mentions, each a fid with a byte position in `mentions_positions`, ascending and unique; an optional parent that is a cast id or a URL of 1–256 bytes (that URL is how FIP-2 channels work today) |
| `CastRemoveBody` | the 20-byte hash of the cast; it tombstones the add and is itself kept |
| `ReactionBody` | type (like, recast) plus a target cast id or target URL |
| `LinkBody` | a type string of ≤ 8 bytes (`follow`) and a target fid; an optional `displayTimestamp` ≤ the message timestamp |
| `UserDataBody` | one typed field per message: pfp, display name, bio, URL, username, location, X and GitHub handles, banner, profile token, `LIVE_AT` (14) |
| `VerificationAddAddressBody` | an EIP-712 claim over `(fid, address, network, blockHash)` signed by the wallet being verified; contract wallets include a chain id of 1 or 10 |
| `UserNameProof` | an fname proof signed by the custody address or the fname server, or an ENS proof signed by the name's owner; names match `^[a-z0-9][a-z0-9-]{0,15}$` |

### 2.5 The journey of a submitted message

What happens between `POST /v1/submitMessage` and a reader seeing the cast,
with the code that does each step.

1. **Transport.** HTTP: the encoded `Message` as `application/octet-stream`,
   optional HTTP basic auth if the node runs with `--rpc-auth`. gRPC:
   `SubmitMessage` on port 3383. The HTTP handler forwards to the same gRPC
   service and returns the message as JSON on success.
2. **Which node took it.** A **read node** has no mempool of its own: it
   rejects a message that is already merged and otherwise gossips it to the
   validators (`ReadNodeMempool::run`). A **validator** admits it to the
   mempool of the shard the fid routes to.
3. **Sharding.** `shard = (sha256(fid as 8 bytes)[0..4] mod num_shards) + 1`.
   Mainnet has two data shards; shard 0 carries blocks, on-chain events and
   the state that must be globally ordered (channels, verifications from V21).
4. **Admission.** The mempool rejects duplicates, applies the feature gates for
   the current engine version, and charges the rate limiters: one `KEY_ADD`
   per minute per fid always; otherwise, where the operator enabled it,
   `max(100, storage allowance ÷ 10)` messages per hour per fid.
5. **Ordering.** Consensus is Malachite, a Tendermint implementation, with a
   one-second block time (propose 1,000 ms, prevote and precommit 500 ms).
   The proposer pulls at most 1,000 messages from the mempool into a shard
   chunk; two-thirds of the validators sign; shard 0 bundles the shard roots
   into the block. Finality is the commit.
6. **Merge.** The engine replays the chunk: `validate_user_message` (section
   2.3), then the store's CRDT merge. For a cast: an identical hash is a
   duplicate; a `CastRemove` for the same hash wins over the add; otherwise
   the add is stored. For reactions and links, same `(fid, type, target)` keeps
   the higher `(timestamp, hash)`, and a remove beats an add at equal
   timestamps. For user data, one value per type.
7. **Pruning.** After the merge the engine compares the account's usage with
   its storage limit for that message type and prunes the lowest-ordered
   messages until it fits, emitting one event per pruned message. A new 2025
   unit holds 100 casts; the 101st cast silently evicts the oldest.
8. **Events.** `MERGE_MESSAGE` (1), `PRUNE_MESSAGE` (2), `REVOKE_MESSAGE` (3),
   `MERGE_USERNAME_PROOF` (6), `MERGE_ON_CHAIN_EVENT` (9), `MERGE_FAILURE`
   (10), `BLOCK_CONFIRMED` (11) and `CHANNEL_OWNER_CHANGE_HINT` (12), each
   stamped with block number and shard. Event ids are
   `block_height << 14 | sequence`, so at most 16,384 events per block per
   shard, and the same id can occur on two shards.

**What the response means.** A `200` with the message echoed back means the
node accepted it into the mempool or forwarded it. It does not mean it is in a
block. The migration guide is explicit: `submitMessage` is best-effort, and "it
is possible, but rare, that `submitMessage` succeeds but the submitted message
fails to get included." Confirm by reading the cast back (`castById`) or by
watching for its `MERGE_MESSAGE` event. Failures come back as `HubError` codes:
`bad_request.validation_failure`, `bad_request.duplicate`,
`bad_request.unknown_signer`, `bad_request.unknown_fid`,
`bad_request.no_storage`, `bad_request.prunable`, `bad_request.conflict`,
`unavailable.*`.

### 2.6 Casting in six lines

```ts
import { makeCastAdd, NobleEd25519Signer, FarcasterNetwork, Message } from '@farcaster/core';

const signer = new NobleEd25519Signer(privateKeyBytes);            // the approved key
const cast = await makeCastAdd(
  { text: 'hello', embeds: [], embedsDeprecated: [], mentions: [], mentionsPositions: [] },
  { fid, network: FarcasterNetwork.MAINNET },                        // timestamp defaults to now
  signer,
);
const bytes = Message.encode(cast._unsafeUnwrap()).finish();         // sets dataBytes, hash, signature
await fetch(`${node}/v1/submitMessage`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
```

`makeCastAdd(body, { fid, network, timestamp? }, signer)` builds the data,
hashes it with `blake3_20`, signs the hash, and fills `dataBytes`. The same
shape exists for every type: `makeReactionAdd`, `makeLinkAdd`,
`makeUserDataAdd`, `makeCastRemove`, `makeKeyAdd`, `makeLendStorage`, and so
on. `getFarcasterTime()` and `toFarcasterTime()` convert to epoch seconds
(`FARCASTER_EPOCH` is 1609459200000 ms). In the browser the same package
works; `@farcaster/hub-nodejs` adds the gRPC clients for servers.

---

## 3. Interacting with Snapchain overall

### 3.1 Topology

| Element | Fact | Source |
| --- | --- | --- |
| Validators | a permissioned set; seven keys in the latest `validators.toml` set, five attributed to Neynar and one to Uno; moving to the L1 config registry | `validators.toml`, `validators.mdx`, FIP-277 |
| Read nodes | anyone; follow blocks, serve the full API, forward writes to validators | `read_node` config, `ReadNodeMempool` |
| Shards | shard 0 for blocks, on-chain events and globally ordered state; data shards 1 and 2; fid → shard by SHA-256 | `routing.rs`, `/v1/info` |
| Blocks | one-second target; header carries height, timestamp, protocol version, parent hash, state root, events hash; each transaction is one fid's user messages and system messages plus the account root afterwards | `consensus.rs`, `blocks.proto` |
| Bootstrap | download the latest snapshot (about 200 GB) from the public R2 bucket `pub-d352dd8819104a778e20d08888c5a661.r2.dev`, then stream blocks from peers | `snapshot.rs`, getting started |
| Hardware | 16 GB RAM, 4 cores, 2 TB disk, public IP with 3381–3383 open | getting started |

### 3.2 Transports and conventions

- **HTTP, port 3381.** JSON responses; hashes, addresses and keys as `0x` hex;
  signatures and other binary fields as base64; enums as their names. Paging
  with `pageSize`, `pageToken` (opaque, from `nextPageToken`) and `reverse`.
  `Access-Control-Allow-Origin: *` by default, so a browser can read a node
  directly. `--rpc-auth user:pass` protects the write endpoints with basic
  auth.
- **gRPC, port 3383.** The same surface as typed methods, plus streaming:
  `Subscribe`, `GetBlocks`, `GetShardChunks`. `@farcaster/hub-nodejs` gives
  `getSSLHubRpcClient(address)`, `getInsecureHubRpcClient(address)` and
  `getAuthMetadata(user, pass)`. The gRPC-web package `@farcaster/hub-web` is
  "not fully supported".
- **Hosted.** Neynar exposes the identical `/v1` surface at
  `https://snapchain-api.neynar.com` behind an `x-api-key` header. Farcaster's
  own `crackle.farcaster.xyz:3383` is password-protected.

### 3.3 Reading

Everything is a keyed lookup; there is no query language and no join.

| Need | Endpoint | Notes |
| --- | --- | --- |
| A cast | `castById?fid=&hash=` | hashes are 20 bytes |
| An account's casts, reactions, links, profile, verifications | `castsByFid`, `reactionsByFid`, `linksByFid`, `userDataByFid`, `verificationsByFid` | paged, newest first with `reverse=1` |
| Replies and quotes | `castsByParent` (cast id or parent URL), `castsByMention` | the parent URL form is how channel casts are found today |
| Who reacted, who follows | `reactionsByCast`, `reactionsByTarget`, `linksByTargetFid` | |
| Accounts and keys | `fids`, `onChainIdRegistryEventByAddress`, `onChainSignersByFid`, `signersByFid` | the last returns on-chain and gasless keys with scopes and expiry, plus the nonces a `KEY_ADD` needs |
| Storage | `storageLimitsByFid` | per-type limit and usage, unit cohorts, units |
| Names | `userNameProofByName`, `userNameProofsByFid`; the fname server's `/transfers?name=` | |
| Channels (V21) | `channelMetadata`, `channelMembers`, `channelFollowers`, `channelPin`, `channelModerations`, `channelOwner` | code present, not yet active on mainnet |
| Node state | `info` (version, shards, `nextEngineVersionTimestamp`), `currentPeers` | |

A "following" timeline is therefore `linksByFid` for the reader, then
`castsByFid` for each followed account, merged by timestamp, or a mirror.
`@farcaster/shuttle` streams events into Postgres for exactly this, and needs
Postgres, Redis and Node 21.

### 3.4 Writing

`submitMessage` (one), `submitBulkMessages` (several, sequentially, with
per-message errors) and `validateMessage` (dry run; it also validates frame
actions, which are never stored). Requirements in one list: `dataBytes` set,
`data` unset; hash and signature as in section 2.2; a signer the fid has
authorised, with the right scope; a timestamp within 600 seconds of now; a
body within its limits; and, if the node enforces it, the per-fid hourly
budget. Then confirm, because inclusion is best-effort.

### 3.5 Events and subscriptions

- `GET /v1/events?from_event_id=&shard_index=&stop_id=` pages events; gRPC
  `Subscribe({ event_types, from_id, shard_index })` streams them. Pass the
  shard, because ids are per shard.
- Resume from the last id you processed. Nodes keep events for **3 days** by
  default (`event_retention`), so a consumer that falls further behind must
  re-read state rather than replay.
- `BLOCK_CONFIRMED` closes each block with its event count, which is how a
  consumer knows a block is complete; `MERGE_FAILURE` reports a message that
  was ordered but did not merge; `MERGE_ON_CHAIN_EVENT` is how an app learns
  about new accounts, keys and storage without an OP RPC.

### 3.6 The external inputs a node mirrors

| Input | Where from | Used for |
| --- | --- | --- |
| OP Mainnet logs from the four registries | the node's OP RPC, from block 108,864,739 | fids, custody, keys, storage |
| Base logs from the Tier Registry (and, later, the channel registrar) | the node's Base RPC, from block 31,180,908 | Pro, channels |
| Ethereum L1 | `l1_rpc_url` | resolving `.eth` names for username proofs |
| Fname transfers | `https://fnames.farcaster.xyz/transfers`, polled by the fname connector | free usernames |

These are the only places where Snapchain trusts something it did not order
itself, and each is a consensus input: validators ingest the same events in
the same order through shard 0.

### 3.7 Versioning

Behaviour changes are gated by **engine version**, activated at a timestamp
agreed in code (`version.rs`); the block header carries the protocol version,
and a node that sees a block with an unexpected version halts rather than
diverge. `GET /v1/info` returns `nextEngineVersionTimestamp` so an app can see
a change coming. Five versions activated between May and August 2026; the
cadence is weeks, not quarters. The protocol specification repository
describes the Hubble-era release train and still omits `KEY_ADD` and channels;
the code is the reference.

### 3.8 What Snapchain is not

It stores and orders signed social messages. It does not rank, search, notify,
host media, or carry private messages: images and videos are URLs in embeds,
direct casts are off-protocol, and every feed is something a client or vendor
computes from the per-account lists above. That boundary is why Home's
why-chip data comes from Farcaster's backend today and why a protocol-native
Home has to compute its own discovery reasons.

---

## 4. What this means for Home's code

- **OP Mainnet is a dependency Home reads, not one it drives.** Resolve
  custody, keys and storage from a node (`signersByFid`,
  `storageLimitsByFid`) or from the contracts' view functions. Home sends an
  OP transaction only if it chooses to register users or buy storage for them.
- **Writes are a four-step function**: build the body, `makeX(body, { fid,
  network }, signer)`, `Message.encode`, POST. Keep it in one module behind the
  adapter so every mutation (`createCast` today) swaps to it the same way.
- **Pre-flight before submitting**: the signer's scopes admit the type, the
  account has an `ID_REGISTER` event, the body is within limits, and the
  account has storage headroom for that type. Each of these is a read Home can
  do, and each failure is a user-facing message worth getting right.
- **Confirm by events, not by status code.** Subscribe to the reader's shard
  and treat `MERGE_MESSAGE` for the hash as success, `MERGE_FAILURE` as
  failure, and silence after a few blocks as a retry.
- **Timestamps are the client's.** Set them from a trusted clock; the node
  rejects anything more than 600 seconds ahead, and a backdated timestamp will
  lose every conflict against the reader's later messages.

---

## Sources

| Source | State read | Used for |
| --- | --- | --- |
| [farcasterxyz/protocol](https://github.com/farcasterxyz/protocol) `docs/OVERVIEW.md`, `docs/SPECIFICATION.md`, `vectors/` | `aa6bdfb`, 2026-06-18 | design rationale, message and CRDT rules, fname server |
| FIPs [#98 Flexible Storage](https://github.com/farcasterxyz/protocol/discussions/98), [#103 Onchain Signers](https://github.com/farcasterxyz/protocol/discussions/103), [#133 Gateways](https://github.com/farcasterxyz/protocol/discussions/133), [#207 Snapchain](https://github.com/farcasterxyz/protocol/discussions/207), [#236 Farcaster Pro](https://github.com/farcasterxyz/protocol/discussions/236), [#238](https://github.com/farcasterxyz/protocol/discussions/238), [#266 Snapchain Signers](https://github.com/farcasterxyz/protocol/discussions/266), [#276 Channels](https://github.com/farcasterxyz/protocol/discussions/276), [#277 Config Registry](https://github.com/farcasterxyz/protocol/discussions/277) | read 2026-10-09 | why each on-chain piece exists; chain choices |
| [farcasterxyz/contracts](https://github.com/farcasterxyz/contracts) `docs/docs.md` | `58d6b28`, 2026-08-13 | deployment map, invariants, migration, assumptions |
| [farcasterxyz/snapchain](https://github.com/farcasterxyz/snapchain) `src/`, `proto/`, `site/docs/` | `8f82bcc`, 2026-08-13, v0.14.2 | validation, mempool, consensus, sharding, events, connectors, API reference, whitepaper |
| [farcasterxyz/docs](https://github.com/farcasterxyz/docs) | `3a02c82`, 2026-04-07 | architecture pages, FAQ, developer guides |
| `@farcaster/core` 0.20.0, `@farcaster/hub-nodejs` 0.17.0 | npm, 2026-07-29 | builders, signers, error codes, clients |
| [Dan Romero, 2023-08-22](https://x.com/dwr/status/1693986385315963024) | via search excerpt | the stated reasons for OP Mainnet |
| Farcaster engineering note on HackMD (`hackmd.io/@farcasterxyz/rkfR8q0k2`) | via search excerpt only; blocked here | the Goerli-era deployment options |
