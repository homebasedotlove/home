# Validation pass, 2026-11-25

Asked: validate all findings, so that there are no errors or gaps in the
current understanding of both networks and how they interoperate. This page
records how it was done, what was wrong, and what cannot be known from the
place the work was done.

**The honest limit.** Nothing here was checked against a running node or a
chain. The sandbox cannot reach either network's public nodes, the Farcaster
production API, or any chain endpoint, and a wider probe was declined by the
permission system and not retried. So "validated" below means: checked against
source code, repositories and package registries. It does not mean observed
live. Section 4 lists everything that needs a live reading, with the exact
read-only command for each.

## 1. How it was checked

| Layer | What it covers | Result |
| --- | --- | --- |
| The mechanical audit | every number, date, name, route and quoted sentence that a script can compare with a pinned source, across 35 pinned repositories | 343 of 343 hold at the pinned commits (the review added 25 claims; each correction below that a script can hold is one of them) |
| The client audit | 34 claims about the reference client | 34 of 34 hold at `73a39bd` |
| Independent review | five reviewers, each given one group of pages and the sources and **not** my conclusions, asked to re-derive every claim from the code; about 950 statements checked | section 3 |
| My own checks | the interoperability core, and every statement taken from a third-party document | section 2 |
| Other gates | 259 tests, compatibility and drift checks, the client audit, the write-path validation (13 checks) | all pass after the corrections |

The mechanical audit proves that a sentence is in a source. It does not prove
that the sentence is true or that my reading of it is right. Every error below
was invisible to it.

## 2. Errors found in earlier pages, and fixed

| # | Page | What it said | What is true | How it was found |
| --- | --- | --- | --- | --- |
| 1 | walkthrough §3 | a Hypersnap node does not tell the client whether the reader liked a cast | it fills liked, recasted, following and blocking whenever the request names the reader | a third-party document, written against Hypersnap 0.13.5, was quoted as fact; the current code contradicts it |
| 2 | walkthrough §9 | a node keeps no complete notification history | it serves the full history from an index once built, and only the last 100 casts' activity until then; a recast reads as a like unless the request asks otherwise | same source, same cause |
| 3 | two Snapchain pages and the Base page | Farcaster's validators are Neynar five, Uno and Degen | the configuration file shows Neynar five, `moria` and `isengard` since version 18; the documentation table is stale | I read the documentation table and not the file |
| 4 | design §10, walkthrough | blocks were "still being produced four and a half hours later" | two reference nodes were past the cutover at 21:22 and a monitor saw one 85-second stop at 23:36; nothing longer was reported | a sentence that went beyond its evidence |
| 5 | design §2, the central comparison table | Farcaster on engine V23; Hypersnap storage-derived rate limits only; "no first-party app"; messages "cross by the relay" | Farcaster is on V24; Hypersnap has a fixed per-account quota; Quilibrium's own app reads Farcaster; no relay instance was observed | the table was written on 11-10 and only part of it was updated on 11-13 and 11-25 |
| 6 | design §10.3, walkthrough | a new Farcaster account "may not appear on Hypersnap" because "a validator follows Optimism only where its operator set an endpoint" | neither stock install configures an on-chain subscriber, no document tells operators to, and Hypersnap's own text says legacy registrations keep working; which happens on mainnet is private configuration and unknown | I had leaned on one client's code comment |
| 7 | design §4.3, plan §1.2 | the owner should create an app account and Home's key requests would work on both networks | Farcaster accepts a key request only for an app account with an on-chain registration event; Hypersnap accepts that or a native account. Only an account registered before 2026-11-12 is certain to work on both | found by reading the key-request validation on both nodes |
| 8 | client audit, running guide | the mobile seam is at line 311 | line 326 at the snapshot CI clones; the audit failed on this line | known since 10-09, now closed |
| 9 | plugging, mechanics, setup pages | write protection is the node's `--rpc-auth` flag | the node has no such flag; the credential is the config key `rpc_auth` or `SNAPCHAIN_RPC_AUTH`, and following the old text leaves the write port open | reviewer A |
| 10 | the same pages | a gasless `KEY_ADD` is signed over key, scopes, TTL and nonce, and the service assembles and submits it | the signature also covers the key type and a non-zero `deadline`, and the **new key signs the envelope**, so the browser signs it and the service cannot | reviewer A |
| 11 | plugging page | `KEY_REMOVE` is never limited; there is a 30-day storage grace period; the legacy cohort ends 2024-08-24 | it has its own limiter of 5 a minute; the node has no grace logic; the cutoff constant is 2024-08-29 (a comment in the code is stale) | reviewer A |
| 12 | three pages | the validator set is hard-coded in a file and "is being moved" to a registry | validators pull their set from the registry at every boot, on by default; read nodes use the file | reviewer A |
| 13 | mechanics page | shard 0 holds channels and verifications; ten error codes; `validateMessage` is a dry run; a node that is a version behind halts; four OP contracts | shard 0 already holds `KEY_ADD`, `KEY_REMOVE` and `LEND_STORAGE`; five codes exist and none says why; `validateMessage` is stateless; V18 to V25 share one protocol version so the halt does not fire; three OP contracts | reviewer A |
| 14 | design page | on Hypersnap, identity comes "from OP Mainnet as before" and a node is "complete for identity" | only if the operator sets an Optimism endpoint, which the stock install does not, and the relay omits on-chain events | reviewer B |
| 15 | design page, walkthrough | a channel feed is "ordered by engagement" | it is newest first, one channel per request | reviewer B |
| 16 | hypersnap, design | 140 routes, 102 of 103 present, every mutating route returns 501 | 140 is a count of route strings; 42 of Neynar's 103 paths answer 501 for at least one method; the webhook and mini-app routes are live | reviewers B and C |
| 17 | both-networks | `balanceOf(fid)` on the VOTE token; Snapchain serves the `/v2` shapes | the token id is the fid, so `ownerOf(fid)`; Snapchain serves no `/v2` route | reviewer C |
| 18 | plan, path, landscape | whether the production API answers Home's origin is untested and "plausibly permissive" | two forks that deployed the client report an allowlist of four origins, so Home needs a same-origin proxy and a host that runs a function; the preflight test also used the wrong method | reviewer E |
| 19 | plan, landscape | `snap`, `pop` and `snap.uno.fun` are public read nodes | `snap` and `uno` are listed as validators, only `pop` as a reader; Snapchain's node answers no browser preflight, so browsers cannot write to it | reviewer E |
| 20 | messages page | the wallet contract requires a passkey for every signature | owners may be passkeys or Ethereum addresses | reviewer D |
| 21 | Base page | a key event on Base is "read identically by every validator"; a fork is "mostly configuration" | consensus does not re-read the chain, and on-chain keys carry no scope or expiry; Hypersnap's changes are a module of about 1,500 lines referred to from dozens of files, plus several other changes | reviewer D |
| 22 | landscape, path | registration price plus storage; the build writes `build/`; `assetlinks.json` has placeholders; the docs list one service | the price is the storage unit price; it writes `dist/`; only the Apple file has placeholders; the docs list two services | reviewer E |
| 23 | design, plan | channel registrar "on Base" | the code points at Base in the connector and at Ethereum L1 in the channel check; not deployed | reviewer A |
| 24 | design, both-networks, plan | `crackle` is a public node; the quorum is seven keys "run by Neynar" | `crackle` is password protected; two of the seven keys are not shown as Neynar's | reviewers B, C |

Rows 1 to 8 were my own text. Rows 1 to 3 repeated stale third-party documents
that I quoted, and row 12 was true when written in August and went stale. Rows 9 to 24 were found only by the independent
reviewers; the mechanical audit could not see any of them, because each was a
sentence that matched its source and was still wrong.

## 3. Independent review

Five reviewers worked from the repositories and not from my conclusions. Each
was told to re-derive every claim, to mark each as clean, an error, a gap, an
overstatement, stale or unsupported, and to edit nothing.

| Reviewer | Pages | Statements checked | Findings returned |
| --- | --- | --- | --- |
| A | plugging into Snapchain, protocol mechanics, setup end to end | about 270 | 23 numbered, about 12 smaller |
| B | optimal design | about 210 | 20 |
| C | Hypersnap, both networks | about 150 | 20, plus 12 sections that are stale but unmarked |
| D | walkthrough, messages and wallet, Base fork | about 190 | 15 |
| E | client landscape, plan, path to operational | about 135 | 20 |

**How the findings were treated.** I re-read the cited source for every
finding that changes a number, a name, a code or a mechanism before editing a
page, and added a script claim where the source could hold it (25 new claims;
the audit is 343 of 343). Findings that rest on web-only material, on commit
history that the shallow pins do not contain, or on a count I could not
reproduce were not re-derived: they were either softened in the text or listed
below as not changed. One claim of mine was wrong in the first draft of a new
audit claim (the registry's roles for `uno` and `pop`); the audit failed it, and
I corrected the claim.

**What the reviewers did not find.** Nothing in the interoperability core was
overturned: the two nodes verify the same signatures, accept the same message
bytes, and use the same key rules; the relay carries the types it is said to
carry and not on-chain events or native accounts; the storage regimes are as
stated; the rate and quota arithmetic and the validator key counts hold; the
version and fork dates hold. Reviewer B recomputed the rotation window and
reached the same one.

**Findings left unchanged, with the reason.**

- *Not resolvable without the web or full history:* the number of a FIP (the
  node's CLI README calls gasless keys FIP-272 while the list says 266; the page
  now shows both), whether the 10-28 pull request moved channels from V21 or V23,
  commit counts and commit times on pins that are one commit deep, the date and
  contents of the first fork schedule, and whether the free or the paid Neynar tier
  includes the hub endpoint (two sources disagree; recorded as unverified).
- *Low value, left as written:* the testnet validator names in the setup page,
  the devnet engine version, whether the bootstrap script or the compose entry
  point writes the read node's config file, the wagmi head version against its npm
  release, the "2 TB" against "1.5 TB" in two of the node's own documents, and the
  two log lines that differ between the Hypersnap and both-networks pages.
- *Disagreement left open:* the client snapshot named `b6922e2` is absent from
  the client repository's own history, but is the snapshot that the older mirror
  and the Hypersnap web notes name; I kept it as the audit's baseline and the
  audit also holds at `0c289ed` and `73a39bd`.

## 4. What cannot be known from here, and what would settle it

Each row is a statement the pages make or depend on that was **not** observed.
The commands are read-only. Hosts are the documented public ones; run them from
a machine that can reach them. `jq` and `curl` are enough unless noted.

| # | Unknown | Why it matters | What would settle it |
| --- | --- | --- | --- |
| U1 | Are both networks producing blocks now, and at what rate? | everything in §10 and §11 of the design page rests on commits and third parties | two readings 60 seconds apart; blocks per second is the difference over 60. Expect about 0.64 on Hypersnap and about 1.0 on Farcaster |
| U2 | Did Hypersnap's validator rotation take effect, and do all eleven keys sign? | the quorum margin and the "wake holds three keys" reasoning | read a block above the rotation height on each shard and compare its commit signers with the eleven keys in `validators.toml` |
| U3 | Does Hypersnap learn of Optimism registrations made after the fork? | whether a new Farcaster account, a new app account or an on-chain key reaches Hypersnap; design §4.3 and the walkthrough depend on it | compare the newest account on Optimism with each node's registration event for it |
| U4 | Is a relay instance running, and delivering both ways? | the whole "messages cross" story; nothing read shows an instance | look up recent casts by hash on the other node |
| U5 | Does Farcaster's public node answer a browser preflight today? | whether a browser-only client can write to both networks, or a gateway is needed | the code agrees with the third party's 2026-10-16 measurement (Farcaster's node code has no handler for the preflight, so a stock node answers 404; Hypersnap's code answers 204), so what is unknown is only whether the public host has since put something in front of the node. One request settles it |
| U6 | Does Farcaster's production API still refuse casts without opt-in, and does it still send its origin allowlist only to four origins? | design §4.9, the plan's decision about the production API, and whether Home needs the same-origin proxy | the allowlist is two forks' report from 2026-10-17 and 2026-11-22; one `OPTIONS` with `Access-Control-Request-Method: POST` from Home's origin settles it; the casting refusal needs a real account, and the owner decides whether to try |
| U7 | Does Farcaster's own app approve another client's key request, follow a channel on a third-party token, or open the inbox, for an account that has not accepted the new terms? | the sign-in paths and the inbox plan | needs a real account |
| U8 | Which validators does Farcaster's on-chain registry name today? | the file shows version 18 as of 2026-11-23; the registry may be newer | read `configVersion()` from the registry contract |
| U9 | Does Quilibrium permit other clients on Quorum's servers, and does Quorum deliver messages reliably? | the first message provider | ask; then a two-profile delivery test of a few hundred messages |
| U10 | Does XMTP's previous shared network continue, and on what terms? | whether it is still a usable second provider | XMTP's forum and blog; its documentation site is blocked here |
| U11 | What Coinbase's window shows, whether gas can be sponsored without a developer account, and any regional limits | the wallet approvals page | Coinbase's documentation sites, blocked here |
| U12 | What happened to Neynar's API and hosted nodes after the sale | the plan's provider list | one authenticated call |
| U13 | Was there a mainnet-wide halt between 11-14 and 11-24, and how long? | the reliability picture of Hypersnap; only commit subjects were read | the operators' monitors, or the Hypersnap tracker |
| U14 | Can a native fid sign in through the four Quick Auth routes of a Hypersnap node? | whether free accounts can use the token sign-in at all | the `/v1/fidAddressType` handler looks native custody up, so it probably works; one signed-in test settles it |

```sh
# U1  health and rate (run twice, 60 s apart; blocks/s = difference / 60)
for h in https://haatz.quilibrium.com https://snap.farcaster.xyz:3381; do
  curl -s $h/v1/info | jq -c '{host: "'$h'", version, shards: [.shardInfos[] | {shardId, maxHeight, blockDelay}]}'
done

# U2  who signed a block above shard 0's rotation height 50,971,518 (needs grpcurl; node gRPC is port 3383)
grpcurl -plaintext -d '{"start_block_number": 50971600, "stop_block_number": 50971600}' \
  haatz.quilibrium.com:3383 HubService/GetBlocks | jq '.commits.signatures | length'
# compare the signer set to the eleven keys under [[consensus.validator_sets]] in validators.toml

# U3  does Hypersnap know the newest Optimism account?
RPC=https://mainnet.optimism.io
IDREG=0x00000000Fc6c5F01Fc30151999387Bb99A9f489b
N=$(curl -s -X POST $RPC -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"'$IDREG'","data":"0xeb08ab28"},"latest"]}' \
  | jq -r .result | xargs printf '%d\n')
echo "newest account on Optimism: $N"
for h in https://haatz.quilibrium.com https://snap.farcaster.xyz:3381; do
  curl -s "$h/v1/onChainEventsByFid?fid=$N&event_type=EVENT_TYPE_ID_REGISTER" | jq '.events | length'
done   # Farcaster should print 1; Hypersnap prints 1 only if it reads Optimism

# U4  does a recent cast cross? (take a legacy account that has storage on both)
H=$(curl -s "https://haatz.quilibrium.com/v1/castsByFid?fid=3&pageSize=1&reverse=true" | jq -r '.messages[0].hash')
curl -s "https://snap.farcaster.xyz:3381/v1/castById?fid=3&hash=$H" | jq -r '.hash // "absent"'

# U5  browser preflight to Farcaster's public node
curl -s -i -X OPTIONS -H 'Origin: https://example.com' -H 'Access-Control-Request-Method: POST' \
  https://snap.farcaster.xyz:3381/v1/submitMessage | head -12

# U8  Farcaster's on-chain configuration version (0xdd64d24d is the selector of configVersion(),
#     computed with viem's toFunctionSelector; the result is a hex number)
curl -s -X POST https://ethereum-rpc.publicnode.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0x00000000fc51aD6eb74EAE89ba4b01b1776fBA85","data":"0xdd64d24d"},"latest"]}' | jq -r .result
```

What was checked about these commands, since they were not run: the routes and
parameter names against the pinned Farcaster node code, the JSON field names of
`/v1/info` (`shardInfos`, `maxHeight`, `blockDelay`), the gRPC service and
method (`HubService/GetBlocks`, request field `start_block_number`), the two
contract selectors (`idCounter()` is `0xeb08ab28`, `configVersion()` is
`0xdd64d24d`), and that `idCounter` is the number of the **last** account
registered, so it names the newest one. Not checked: that the public hosts
expose the gRPC port, that the public Ethereum endpoint accepts the call, and
the exact output format. U2 needs `grpcurl` and the node's `rpc.proto`; if the
host does not expose the port, read the same block from a node you run.

## 5. What this does to the earlier conclusions

- **Unchanged:** the design (providers per network, keys on the device, write
  once and show both results), the build order, the decision not to run a
  node yet, Quorum first for messages, Coinbase's wallet as a connect-only
  wallet, and the recommendation against a third network.
- **Changed:** twenty-four corrections in section 2: statements of fact in
  every page that had them, one design constraint (the app account), and one
  decision that the evidence now settles (Home's web build needs a same-origin
  proxy). None changes the order of the build.
- **Still open:** the fourteen rows of section 4. The two that most affect the
  design are U3 and U4, and both can be settled in a minute from a machine
  that reaches the nodes.
