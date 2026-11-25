# A social interoperability layer on Base: honouring existing registries, and one for new entrants

The question was: could we build a decentralized social interoperability layer
that honours the existing registries by adding them to Base, and also gives new
entrants a registry of our own? Written 2026-11-25 from the pinned code of both
node families, the AT Protocol specifications and the earlier pages
([`base-fork-feasibility.md`](base-fork-feasibility.md),
[`base-protocol-bluesky-and-storage.md`](base-protocol-bluesky-and-storage.md),
[`optimal-design.md`](optimal-design.md)).

How to read the evidence. **pinned** means a claim is checked by
`scripts/audit-protocol-claims.mjs` against a named commit. **web** means it comes
from a search result or a post I could not re-read from a repository. **inference**
means my reasoning from those. Nothing was built or deployed, and no network was
queried.

---

## 0. The short answers

**Yes, it is possible, but not in the form "add the existing registries to Base".**
Copying another network's registry onto Base does not make that network honour
yours, and a copy can only be as fresh and as trustworthy as whatever carries it
across. The form that works is **link, do not copy**: a record that says "this Base
account and that account on another network are controlled by the same party",
proved from both sides, and checked by whoever reads it against the other
network's own registry. That needs nobody's permission (§2).

**The chain is needed for less than it first seems.** Farcaster already lets an
account verify an address, and the AT Protocol already lets an account hold any
record a published schema describes, so a link can live in each network's own data
(§2.2). Base is needed for the parts neither network offers: an account owned by a
smart wallet, a neutral directory, a key registry with scope and expiry that a smart
wallet can approve, and permissionless writes for new entrants (§3).

**For new entrants the registry only helps if something accepts it.** A Base-native
account has nowhere to post until a network recognises it. So there are three
routes, and only the first two work without anyone's agreement: create accounts on
existing networks on the entrant's behalf and link them to the Base account; run
our own minimal network; or persuade a node maintainer to honour the registry (§4).

**It is decentralized only up to Base.** Verification can be done by anyone and
needs no Home server, but writes go through Base's sequencer, which is one
company's, and in February 2026 Base was reported to be moving to its own software
stack (§6).

**Recommended shape:** a small, immutable-by-default link registry plus a native
account and key registry, resolver libraries instead of servers, and a build order
in which each step works without anyone's permission (§5, §7).

---

## 1. What "honouring" a registry can mean

| Meaning | What it is | Needs | Verdict |
| --- | --- | --- | --- |
| **Copy** | Mirror the other network's registry state onto Base so contracts can read it | A bridge, an oracle or a light client; trust in it; constant freshness | Possible, weak. Avoid unless a contract on Base must act on another network's ownership |
| **Link** | A signed, revocable claim that two identities are one party, proved on both sides and checked on read | Nothing from the other network | Works today |
| **Canonical** | The other networks treat our registry as theirs | Their maintainers to change their nodes | Unknown; the earlier page's option A |

The Farcaster registries are on Optimism, and the other network, Bluesky, has no
chain at all (§2.3). A copy on Base would therefore be a second-hand picture of
state that changes on another system, and a link is the first-hand fact. If Base
and Optimism still shared native cross-chain messaging, a copy would be cheaper,
but that interop was planned for 2025 and had slipped (**web**), and Base was
reported in February 2026 to be leaving the Optimism stack (**web**, §6). Do not
assume it.

---

## 2. How a link works, network by network

### 2.1 The rule

A link is valid if and only if both directions verify **now**:

1. The Base account's owner signed a claim naming the foreign identity.
2. The foreign identity proves control of that claim, by the foreign network's own
   rules, checked against that network's current registry.

Either side can revoke. A reader re-verifies when it reads and caches the answer for
a short time. The chain stores the claim and gives it an order and a date; it does
not decide whether the foreign half is true.

### 2.2 Farcaster and Hypersnap

- **Ownership** is the custody address in the `IdRegistry` on Optimism, and a node
  can read it (**pinned**). A reader checks that the address that signed the link is
  the account's custody address today.
- **A built-in way to link an address already exists.** An account can publish a
  verification: a message signed by the wallet being verified, over the account
  number, the address and a recent block hash (**pinned**). Contract wallets are
  accepted, but the claim must be made on Ethereum or Optimism: the node's list of
  accepted chain ids is 0, 1, 5, 10 and 420, and **Base (8453) is not in it**
  (**pinned**). So a smart wallet that exists only on Base cannot be shown on a
  Farcaster profile; it would need to be deployed on Optimism too. Coinbase's smart
  wallet is designed so that owner updates replay across chains (**pinned**), which
  may make that practical; I did not test it.
- **Hypersnap native accounts** have numbers from 2^32 up, and are controlled by a
  plain key that signs with an ordinary signature, so a smart wallet cannot be their
  owner (**pinned**, earlier pages). A native account can be linked from the Base
  side only.
- **Identifier collisions.** Hypersnap kept its numbers apart from Optimism's by
  starting at 2^32. Our registry should not invent a third integer range. Use a
  namespaced identifier, the chain id and the account contract address, in the style
  of CAIP-10 (**background**).

### 2.3 Bluesky

- An account's identity is a DID, and the DID document names a signing key and a
  hosting server. There is no chain to read. `did:plc` has one to five rotation keys
  that are plain secp256k1 or P-256 keys (**pinned**), so a smart-wallet contract
  cannot be one, and recovery of a Bluesky account cannot be delegated to a contract
  (**inference**).
- **A link can live in the account's own repository.** The protocol lets any
  application publish a record schema under its own name, and the account's
  repository holds records of any published schema (**pinned**). A record that names
  the Base account, signed by the repository's key and delivered over the firehose,
  can be checked by anyone with the public key in the DID document. No oracle.
- **The chain cannot verify the Bluesky half.** It cannot read the PLC directory, so
  the Bluesky side is verified by readers, not by the contract. The contract only
  holds the Base-side claim.
- **Handles.** A handle is a domain that must point back at the DID (**pinned**);
  it is a convenient second check but not the link.

### 2.4 Names

Basenames are the one thing both sides already understand: Farcaster's node resolves
Basename username proofs against Base's ENS registry (**pinned**). Using a Basename
as the human-readable name of a Base account needs no new standard.

---

## 3. What belongs on Base

| On Base | Why Base, and not each network's own data |
| --- | --- |
| **Native account registry.** An owner that may be an ordinary address or a smart wallet; recovery set on creation | Farcaster's nodes do not accept a smart wallet's signature for keys, and Bluesky's identity keys must be plain keys (**pinned**) |
| **Native key registry.** A key, its scopes and its expiry, approved by calling the contract, so the contract checks the smart wallet's signature | Keys that arrive as chain events today have no scope and no expiry (**pinned**); the registry fixes both and works for smart wallets |
| **Link claims.** A small revocable record: the Base account, the foreign network and identifier, the proof type, a timestamp | A neutral, permissionless, ordered place to publish and revoke |
| **Optional anchors.** A Merkle root of signed off-chain items, posted in batches | Tamper evidence for cross-network receipts, if wanted. Not needed for the links |

Do not put on Base: content, follows, reactions, profiles, or copies of the foreign
registries.

**Do not write a new link contract if an attestation standard fits.** The
Ethereum Attestation Service is a schema-and-attestation registry with revocation;
a search result says its schema registry is a predeploy on Base at
`0x4200000000000000000000000000000000000020` and that Coinbase lists it there
(**web**; I found no address for the attestation contract itself and did not read
the code). If it fits, a link is one schema and no custom contract, which removes
an audit.

---

## 4. New entrants

A Base-native account has a smart-wallet owner, a Basename and sponsored gas. What
it can do depends on what accepts it.

| Route | What it does | Works without anyone's agreement | Cost |
| --- | --- | --- | --- |
| **Satellite accounts** | Home provisions an account on each network for the entrant and links it to the Base account | Yes | Farcaster: a registration plus storage, about ten dollars of ether per the writing guide, as the plan records it. Hypersnap: free, with proof of work. Bluesky: a hosted account, free at most hosts (**background**) |
| **Our own minimal network** | Per-account signed repositories on hosting servers, with Base as the root (the earlier page's option C) | Yes, but with no audience | Servers, a relay and an indexer |
| **A network honours the registry** | Hypersnap or Farcaster accepts Base accounts and key events | No | A node patch and a maintainer's yes |

**The satellite route is the one to build first.** The Base account is the root of
control: it holds the Basename, the key policy and the record of what belongs to
whom. The accounts on other networks are where the posting happens. The limits are
real:

- A Farcaster account owned by a smart wallet can add a key only by a sponsored
  transaction, and that key is unscoped (**pinned**). A Farcaster account owned by a
  plain key supports scoped, expiring keys, but then the Base account is a link, not
  the owner.
- A Hypersnap native account needs a plain key, so the entrant's Base smart wallet is
  linked, not controlling.
- A Bluesky account's recovery stays with plain keys.

So in the satellite route the smart wallet **coordinates** the entrant's identities;
on each network the thing that actually signs is still an ordinary key. The only
place the smart wallet becomes the owner is the third route.

**Spam.** Free, sponsored accounts attract abuse; Hypersnap's free accounts are already a
listed risk of discovery floods (earlier design page). Our registry
needs a cost for creation (a small fee, a proof of work, or a sponsor's budget with a
limit), and I have not read Base's current fees.

---

## 5. The design in one picture

```
            +----------------------------- Base ------------------------------+
            |  native account registry   native key registry   link claims    |
            |  (owner: EOA or smart wallet)  (scope, expiry)    (revocable)    |
            +----------------------------------------------------------------+
                 ^                ^                  ^
   signs claim   |                |  approves keys   |  reads and verifies
   (wallet)      |                |  (sponsored tx)  |
        +--------+----+     +-----+--------+   +-----+-----------------+
        | the owner   |     | Home, other  |   | resolver library or    |
        | (smart      |     | clients      |   | service: checks both   |
        |  wallet)    |     +--------------+   | halves of each link    |
        +-------------+                        +-----+------------------+
                                                     |  reads
              +--------------------+-----------------+--------------------+
              | Optimism:          | Hypersnap:      | Bluesky:           |
              | IdRegistry,        | native accounts | DID document and   |
              | custody address    | (fid >= 2^32)   | repository record  |
              +--------------------+-----------------+--------------------+
```

Nothing in the middle is a required server: the resolver is a library that any
client runs, with an optional shared service for speed. Each link is verifiable by
anyone with a node of the other network and a Base RPC endpoint.

**Resolution answers are one of four:** verified now; verified but stale; one half
missing; revoked. A client shows the first and treats the rest as unlinked.

---

## 6. What this does not solve, and the hard problems

| Problem | Why it is hard | What helps |
| --- | --- | --- |
| **Another network will not take our keys** | Both nodes check only plain signatures for a gasless key; Farcaster needs an on-chain registration event for the app account (**pinned**) | The satellite route; asking maintainers |
| **Ownership changes** | A Farcaster account can be transferred; a DID's keys rotate. A link is a snapshot | Re-verify on read; short cache; either side can revoke |
| **Privacy** | A public link joins identities permanently and the chain remembers | Opt-in only; no automatic linking; say so before signing |
| **Squatting and false claims** | A one-way claim proves nothing | Both halves must verify; a claim without its other half is shown as unlinked |
| **Contract governance** | Immutable contracts cannot follow a network that changes; upgradeable ones can be seized | Keep the contract tiny and policy-free; put the rules in readers; timelock any upgrade |
| **Spam on free accounts** | Sponsored creation is a free mint | A creation cost or a capped sponsor budget |
| **Base itself** | One company runs the sequencer (**web**), and in February 2026 Base announced it is moving from the OP Stack to its own unified stack (**web**, Base's blog title and an Optimism governance post; I could not fetch the page) | Keep contracts portable (plain Solidity, standard interfaces); re-read the announcement before choosing a chain; consider the registry on more than one chain |
| **No audience** | A registry is not a network | Build for what works on the networks that exist |

An earlier page, `base-protocol-bluesky-and-storage.md`, said Base and Optimism are
both OP Stack chains; that is out of date if the announcement holds, and has been
corrected there.

**Precedent, with caution.** Bridgy Fed links Bluesky and the fediverse by creating
proxy accounts that mirror the other side, rather than by linking existing
accounts, and it did not support Farcaster in what I found (**web**). It shows
that identity mapping across networks is the hard part, and that a mirror carries
more operational burden than a link.

---

## 7. Build order

Each step works without anyone's permission, and each stops being worth it if the one
before it fails.

1. **Specify the link record and the resolution rule.** Test vectors for each
   network's proof, no chain. Output: a small library and a document.
2. **Publish link claims on a Base test network**, as attestations if the standard
   fits, otherwise a minimal contract. Output: Home shows opt-in linked identities.
3. **Native account and key registry** with a smart wallet approving a scoped,
   expiring key by sponsored transaction. Output: a demonstration, and the node patch
   against a local network, to put in front of the maintainers.
4. **Satellite provisioning** for new entrants, with a creation cost. Output: an
   entrant gets a Base account, a Basename and an account on one existing network.
5. **Only then** consider our own network or a maintainer's adoption (the earlier
   options B and C).

The first two steps cost no validators, no hosting and no permission, and tell us
whether people want linked identities. If they do not, nothing larger would have
worked.

---

## 8. Not verified

- **Nothing was built.** No link was made, no contract deployed, no network queried.
- **Base's stack change** rests on search results, the title of Base's own blog post
  (`A new, unified stack for Base Chain`) and a post on the Optimism governance forum
  dated 2026-02-18. The blog is outside this sandbox's network allowlist, so I could
  not read it. What stays compatible, who runs the sequencer afterwards, and whether
  EAS stays a predeploy are unknown.
- **Whether a Base-deployed Coinbase smart wallet can be deployed at the same address
  on Optimism** (so that a Farcaster verification would work) was not tested.
- **Whether a link record in a Bluesky repository is accepted by the hosting server
  as written** was not tested; the protocol says any published schema is allowed.
- **Whether Hypersnap or Farcaster would honour a Base registry** is unknown.
- **Costs**: Base's fees, a Basename's price and a hosted Bluesky account's terms were
  not read.

---

## 9. Evidence

| Source | State read | Used for |
| --- | --- | --- |
| [farcasterxyz/snapchain](https://github.com/farcasterxyz/snapchain) (`snapchain`) | `3839f06`, 2026-11-23 | the verification message, the accepted claim chain ids, the Base ENS registry constant |
| [farcasterxyz/contracts](https://github.com/farcasterxyz/contracts) (`contracts`) | `58d6b28`, 2026-08-13 | the registration gateway's recovery address |
| [coinbase/smart-wallet](https://github.com/coinbase/smart-wallet) (`coinbase-smart-wallet`) | as pinned | owners as passkeys or addresses, cross-chain replay of owner updates |
| [bluesky-social/atproto-website](https://github.com/bluesky-social/atproto-website) (`atproto-website`) | `605a806`, 2026-11-23 | extending the protocol with record schemas |
| [did-method-plc/did-method-plc](https://github.com/did-method-plc/did-method-plc) (`did-method-plc`) | `79b99aa`, 2026-11-24 | rotation key types |
| Base's blog, "A new, unified stack for Base Chain"; Optimism governance forum | search results, 2026-11-25 | the stack change (**web**, page not read) |
| Coinbase's Verifications listing | search result, 2026-11-25 | the schema registry predeploy on Base (**web**) |
| Bridgy Fed's documentation | search result, 2026-11-25 | the precedent (**web**) |
