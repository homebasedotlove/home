# Forking Farcaster or Hypersnap onto Base: feasibility

Written 2026-11-11, the day before the Hypersnap fork is projected. Four
questions were asked: how feasible it is to fork Farcaster or Hypersnap and
put it on Base, what exactly would be on-chain, how Home would read both in
a sustainable and compatible way, and how everything stays readable with a
decentralized set of nodes.

**pinned** means checked by `scripts/audit-protocol-claims.mjs` against a
named commit. **web** means read through a search on 2026-11-11.
**unverified** means one secondary source, or none.

---

## 0. The short answers

**Feasible in code, heavy in people.** A fork is mostly configuration:
Hypersnap is one, and it changes a validator list and one registration
path (**pinned**). What a fork cannot configure is independent operators
willing to run validators, and a reason for readers to hold an account
there.

**"On Base" can only mean the registries.** Casts, reactions, follows and
profiles are not on any chain today and cannot sensibly be. What is
on-chain is who owns an account, which keys may post for it, what was paid,
and who the validators are (**pinned**). Those can move to Base. Base
already carries two of Farcaster's registries (**pinned**).

**The recommendation is not to start a third network.** Put an account and
key registry on Base, and ask Hypersnap to honour it. That buys what Base
is good for, accounts owned by smart wallets and paid for by a sponsor,
with no new validators. A separate network is the fallback, and only with
partners.

**Not verified.** No contract was deployed and no node was run. Base's fees
and the terms of its hosted chains were not read from a primary source.
Whether Hypersnap would accept a Base registry is unknown.

---

## 1. What is on-chain today

| What | Chain | Evidence |
| --- | --- | --- |
| Account ids, and who owns each | Optimism, `IdRegistry` | **pinned** |
| Posting keys of the older, on-chain kind | Optimism, `KeyRegistry` | **pinned** |
| Storage rent | Optimism, `StorageRegistry` | **pinned** |
| Pro purchases | Base, `TierRegistry` | **pinned** |
| Channel ownership | Base in the code, with no mainnet address yet; the code says the chain "is not settled" | **pinned** |
| Names | ENS on Ethereum, Basenames on Base, and a server of Farcaster's | **pinned** |
| Farcaster's validator list and peers | Ethereum, `SnapchainConfigRegistry` | **pinned** |
| Hypersnap's validator list | a file in its repository | **pinned** |

**Not on any chain:** every cast, reaction, follow, profile field,
verification and gasless key; the blocks; the state. Validators order those
among themselves, one block a second on three shards. A node needs 16 GB of
memory, 4 cores and 2 TB of disk (**pinned** in earlier pages).

The six kinds of on-chain event a node stores say the same thing: signer,
signer migrated, id register, storage rent, tier purchase, channel
register (**pinned**).

---

## 2. Four things "put it on Base" could mean

| | A. Registries on Base, existing validators | B. Own validators, anchored on Base | C. A rollup on Base | D. Every message a Base transaction |
| --- | --- | --- | --- | --- |
| New on Base | accounts, keys, optionally a fee | A, plus the validator list and state checkpoints | everything, on a chain of its own | everything |
| New validators | none | at least four, sensibly seven or more | a sequencer | none |
| Stays byte-compatible | yes | yes | only with a custom engine | no |
| Free posting | yes | yes | depends | no |
| Who must agree | Hypersnap's validators | operators Home recruits | Coinbase, for its hosted chains | nobody |
| Verdict | **do this first** | fallback, with partners | no | no |

**Why C fails.** A rollup's value is that its data is available and its
operator replaceable. Base's hosted chains were reported as a waitlisted
beta whose data sits in one cloud store (**web**, **unverified**), and Base
itself runs one sequencer (**web**). That is less decentralized than seven
or eight validators. It also needs the node's engine rebuilt as the
rollup's logic to keep messages byte-compatible.

**Why D fails.** The network was designed for more than 9,000 messages a
second (**pinned**) and carried millions a day in 2024 (**web**). Each
would pay a fee. Posting is free today, on both networks.

---

## 3. What exactly would be on-chain

For option A, three things, all on Base:

1. **An account registry.** An id, its owner, a recovery address, and
   transfer. Farcaster's contracts are MIT and already accept a contract as
   owner (**pinned**), so a Coinbase Smart Wallet can own an account.
2. **A key registry.** Which posting keys an account has authorised. This
   must be on-chain rather than a signed message, for a specific reason.
   Both nodes check contract signatures before a message enters the queue
   and not in consensus, because validators "may see differently"
   (**pinned**). That is acceptable for an address on a profile. For a
   posting key it would let one faulty validator admit a forged key. An
   event on Base is read identically by every validator.
3. **Optionally a fee or rent.** It limits spam and can pay operators.
   Hypersnap chose proof of work and no rent instead (**pinned** in earlier
   pages).

Option B adds two:

4. **The validator list and peers.** Farcaster already keeps these in a
   contract on Ethereum that its validators read at every start
   (**pinned**). The same on Base is cheaper to update.
5. **State checkpoints.** A root every so often, so that a snapshot from
   any host can be checked without trusting the host. This is new work.

**Never on-chain:** casts, reactions, follows, profile fields, blocks.

A reader with a smart wallet would then create an account and authorise
Home in one sponsored transaction, with no ordinary wallet at all. That
removes the limit found in
[messages and wallet](messages-and-wallet.md) §4.

---

## 4. Reading every network, compatibly

Five rules, each already true of something in the code.

1. **Never change the message.** The same bytes, hash and signature are
   valid wherever the account and its key are known. Hypersnap's relay
   depends on exactly this (**pinned** in earlier pages).
2. **Give every registry its own range of ids.** Farcaster's contract
   counts up from one. Hypersnap's own accounts start at 2^32 and are
   open-ended (**pinned**). A Base registry needs a range neither can
   reach, agreed with Hypersnap before the first account. Home already
   treats ids as strings.
3. **A network can only show accounts whose registry it follows.** A fork
   must keep following Optimism to show Farcaster's accounts. Farcaster
   follows nothing new, so accounts made on Base or on Hypersnap never
   appear there (**pinned**: its code does not mention Hypersnap).
4. **Prefer registries any network can check.** A contract can be read by
   anyone with an RPC endpoint. An id assigned inside one network's
   consensus can only be trusted by reading that network. This is the case
   for Base over a third set of validator-assigned ids.
5. **Merge at the client, by message hash.** Home's provider registry
   already tags each source with its network and removes duplicates. A
   third network is one more value, not a new design.

**What sustainable costs.** A fork must take every upstream release.
Snapchain shipped two in the week after its sale (**pinned**), and
Hypersnap's lead developer expects breaking changes "with no real warning"
(**web**). Hypersnap keeps a conformance suite for this (**pinned**). Home's
weekly audit already names what moved.

---

## 5. Staying decentralized while everything reads

| Network | Validators | Operators | Who decides the list |
| --- | --- | --- | --- |
| Farcaster | 7 | 3, with 5 run by one | the owner of a contract on Ethereum |
| Hypersnap, from the fork | 8 | 8 | a file its maintainers publish |

Both rows are **pinned**. Farcaster commits a block with five of seven
signatures.

What keeps a network both readable and decentralized:

- **Independent validators.** One operator must not hold a third of the
  votes. This is recruitment, not code.
- **A public validator list with its history,** so a new node can check
  every block since the start. On-chain makes the history tamper-evident.
- **Open read nodes.** Anyone can run one today on both networks
  (**pinned**). Keep it so.
- **More than one snapshot host,** with checkpoints to verify them.
  Validators never prune (**pinned**), so the history exists; it has to be
  served.
- **A relay run by more than one party,** in both directions.
- **Pay for it.** Operators need a reason to stay. A fee on Base split
  among them by contract is one; grants are another. Hypersnap's operators
  are volunteers today.

Under option A none of this is Home's to build. It inherits Hypersnap's
eight operators.

---

## 6. The recommendation

1. **Do not fork consensus.** Home is a client with no readers yet, and
   the design page lists a validator and an account registry under what
   Home will not build. A third network splits readers a third way.
2. **Propose a Base registry to Hypersnap.** One document: accounts and
   keys on Base, an id range, why keys must be events. It asks eight
   operators for one code path, of the size they already added for their
   own registration, about 1,400 lines (**pinned**).
3. **If that is declined, deploy the registry anyway.** It is cheap, MIT,
   and any network can adopt it later. Run the node change as a tracked
   fork only with operators who are not Home.
4. **Rule out C and D.**

**Overturned if** Hypersnap stalls or closes its validator set, or if
Network School moves Farcaster's own account registry to Base, which would
make a second one pointless.

## 7. Not verified

- Whether Hypersnap would honour a Base registry.
- Base's fees, and the terms and status of its hosted chains.
- Today's message volume on either network.
- Any deployment, any node run, any sponsored registration.

## 8. Evidence

| Claim | Where it was read |
| --- | --- |
| Which contracts are followed on which chain | `snapchain@1405794` `src/connectors/onchain_events/mod.rs` |
| The six on-chain event kinds | `snapchain@1405794` `proto/definitions/onchain_event.proto` |
| Validators read their list from a contract on Ethereum; read nodes from a file | `snapchain@1405794` `site/docs/pages/node-types.mdx` |
| Seven validators, three operators, five of seven | `snapchain@1405794` `site/docs/pages/validators.mdx` |
| Contract signatures are checked outside consensus | `snapchain@1405794` `src/mempool/l1_validator.rs` |
| Design target above 9,000 a second | `snapchain@1405794` `site/docs/pages/whitepaper.mdx` |
| Hypersnap's registration path and its size; its conformance suite | `hypersnap@ce9d003` `src/native_registration.rs`, `tests/conformance` |
| Farcaster's contracts are MIT and accept contract owners | `farcasterxyz/contracts@58d6b28` |
| 2024 message volumes; Base's hosted chains and sequencer | search summaries of news and documentation; sites blocked here |
