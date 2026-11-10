# Adding messages and a wallet: what is possible, and what fits Home

Written 2026-11-10, two days before the Hypersnap fork is projected. The
[experience walkthrough](../design/experience-walkthrough.md) decided that
Home ships with no inbox and no wallet. This page takes the next question:
if Home adds both, how, and with what. The starting preference was Hypersnap
for messages and Coinbase Smart Wallet for the wallet. Both were tested
against code.

How to read the evidence. **pinned** means a claim is checked by
`scripts/audit-protocol-claims.mjs` against a named commit. **web** means it
was read through a search or a text extractor on 2026-11-10. **unverified**
means one secondary source, or none.

---

## 0. The short answers

**Messages.** Hypersnap, the network, cannot carry private messages and has
no proposal to. Its message types are Farcaster's plus account registration
(**pinned**). What the Hypersnap team does have is **Quorum**: an end-to-end
encrypted messenger with MIT-licensed libraries and a signed link between a
Farcaster account and a Quorum inbox (**pinned**). So "Hypersnap for
messages" means Quorum, and that is possible.

The recommendation is Quorum as Home's first message provider, opt-in,
behind an interface that can hold a second provider. Two checks come before
any build: permission from Quilibrium, and a delivery test. XMTP is the
second provider and the fallback. Farcaster's own direct casts should not be
built on.

**Wallet.** Coinbase Smart Wallet is possible and is the right default
wallet. It cannot be the key that owns a Farcaster account in Home's design.
Both networks approve a posting key by recovering an ordinary key from a
65-byte signature, and a smart wallet has none (**pinned**). So Home keeps
two roles apart: an **account key**, which is an ordinary wallet, and a
**wallet**, which can be Coinbase's.

One naming note. The product has had three names: Coinbase Smart Wallet,
then Base Account from July 2025, then Coinbase Wallet again from
2026-09-10. The SDK is still `@base-org/account` (**pinned**).

**Not verified.** The documentation sites of Coinbase and XMTP, and every
news site, are unreachable from this sandbox; their public repositories were
read instead. No message was sent on any network and no wallet was
connected. Whether Quilibrium permits other clients on Quorum's servers is
unknown. Whether XMTP's fee-charging network has launched is unknown.
Whether Coinbase Wallet kept its Farcaster feed and its XMTP chat after the
rename is unknown.

---

## 1. Messages: what exists

### 1.1 On the two networks: nothing

| Fact | Evidence |
| --- | --- |
| Hypersnap's message types are Snapchain's nineteen plus one, `NATIVE_ONBOARD = 160` | **pinned** |
| No file in either node's source or protocol definitions mentions direct casts or direct messages | **pinned** |
| No issue, discussion or proposal in the Hypersnap organisation concerns private messages | **web**, GitHub search |
| Hypersnap's stated next features are free signups, channels and mini app indexing | **web**, lead developer, 2026-11-04 |

A private message cannot be improvised from casts either. A cast is public,
permanent, and relayed to Farcaster byte for byte, so an encrypted payload
would publish who is talking to whom on two networks.

### 1.2 Farcaster's direct casts: a company service

Farcaster's documentation says direct casts "are currently not part of the
protocol" (**pinned**). Its own proposal, discussion 226 from March 2025, is
still a draft. It describes a server Farcaster operates and says
"End-to-end encryption and decentralization are out of scope for the
initial version" (**web**).

Two clients read that inbox today, Quilcast and Quorum's mobile app, and
they do it the same way (**pinned**):

- The custody key signs a message for
  `client.farcaster.xyz/v2/get-dc-auth-token` and receives a token.
- A relay sets `origin: https://farcaster.xyz` on every request, because
  the service "answers its own site only".
- The signature must be 65 bytes, so only an ordinary key can do it.

That is a private interface reached by presenting as Farcaster's own site.
It can be closed any day, it sits under Network School's terms, and it is
not encrypted end to end.

### 1.3 Quorum: the Hypersnap team's messenger

Quorum is built by Quilibrium, whose lead developer leads Hypersnap.

| Property | What the code says | Evidence |
| --- | --- | --- |
| Encryption | X3DH key agreement, Double Ratchet for one-to-one, Triple Ratchet for groups, on Curve448 | **pinned** |
| Libraries | `@quilibrium/quorum-shared` 2.1.0-45, MIT; the encryption is WebAssembly from `@quilibrium/quilibrium-js-sdk-channels` 2.1.0-2, MIT on npm | **pinned** |
| Applications | desktop and web are AGPL-3.0, mobile is GPL-3.0 | **pinned** |
| Servers | clients speak to `api.quorummessenger.com` over HTTPS and a websocket | **pinned** |
| Link to Farcaster | two signatures: the custody key signs `quorum:link:<address>`, the Quorum key signs `farcaster:link:<custody>` | **pinned** |
| Directory | `GET /users/by-fid/<fid>` returns the linked Quorum address and profile | **pinned** |
| Status | the web app is labelled beta | **pinned** |
| Farcaster inside it | the mobile app has "full Farcaster support" and shows Farcaster direct casts beside Quorum messages | **web**, **pinned** |

Three cautions, all from Quorum's own repositories:

1. **Delivery was still being fixed in August 2026.** The desktop
   repository carries a test rig built "for the DM transport
   investigation: reproducing decrypt failures, measuring send-vs-arrive
   loss" (**pinned**).
2. **The directory is not proof.** The index is written when the
   Quorum-side signature verifies (**pinned**). A client that wants to be
   sure must check the Farcaster-side signature itself, against the
   custody address a node reports for that fid.
3. **The applications cannot be copied into Home.** Home is MIT. Only the
   MIT libraries can be used.

No public terms for other clients were found, and no audit of the
encryption was found in the repositories.

### 1.4 XMTP: the open alternative

| Property | What the sources say | Evidence |
| --- | --- | --- |
| Encryption | Messaging Layer Security, reviewed by NCC Group in December 2024 | **pinned** |
| Identity | an inbox with any number of identities: ordinary wallets, smart contract wallets, passkeys; up to ten installations | **pinned** |
| Smart wallets | supported on Base, Optimism and Ethereum among eleven chains | **pinned** |
| Browser SDK | `@xmtp/browser-sdk`, 7.1.0 on npm, MIT; one tab at a time, because its storage has one owner per origin | **pinned** |
| Cost | about $5 per 100,000 messages in USDC, paid by the app through a gateway service it runs | **pinned** |
| Operation | "all nodes currently hosted by XMTP Labs"; the fee-charging network "expected to launch in early 2026" | **pinned**, as of April 2026 |
| Reach | Coinbase's wallet app uses it for chat | **unverified**, 2026 reviews |

XMTP knows wallets, not Farcaster accounts. Home would find a person by the
addresses they verified on their Farcaster profile, which are already bound
to the account by the protocol.

---

## 2. Messages: the options compared

| | Quorum | XMTP | Farcaster direct casts | A new Hypersnap message type |
| --- | --- | --- | --- | --- |
| Exists today | yes, beta | yes | yes | no |
| End-to-end encrypted | yes | yes, audited | no | n/a |
| Who can be reached | people with a linked Quorum identity | people whose verified address has an XMTP inbox | everyone using Farcaster's app | n/a |
| Finds people by | Farcaster account | wallet address | Farcaster account | n/a |
| What Home runs | nothing | a gateway service, funded | a relay that poses as Farcaster's site | n/a |
| Cost to Home | none found | fees, once charged | none | n/a |
| Works with a smart wallet account | no, the link needs an ordinary key | yes | no | n/a |
| Main risk | maturity, one operator, no terms | cost and an unfinished network move | can be closed; terms; no encryption | does not exist |

---

## 3. Messages: the recommendation

**Decision.** Add messages as a provider, the way networks are providers.
Build Quorum first. Keep XMTP as the second provider and the fallback. Keep
the button that opens Farcaster's own composer, and do not relay Farcaster's
inbox.

**Why Quorum first.**

- It is the only option that links to a Farcaster account by signature
  rather than by wallet address.
- It needs no service of Home's and has no fee in its code.
- Its users are the people most likely to use a client that reads
  Hypersnap.
- Its libraries are MIT, so Home's licence is unaffected.

**Why not Quorum alone.** It is beta, one company runs its servers, and it
cannot serve an account owned by a smart wallet. XMTP covers each of those.

**What the reader sees.**

- A **Messages** item appears only after the reader turns it on in
  Settings. Turning it on creates an inbox key in the browser and asks the
  account key for one signature, to link the inbox to the Farcaster
  account.
- On a profile, **Message** is live when that person can be reached, and
  says through what: "Quorum, end-to-end encrypted". Otherwise it opens
  Farcaster's composer in a new tab, labelled as Farcaster's.
- The inbox states whose servers carry it, the same way a cast states its
  network.
- Losing the browser's storage loses the inbox key. Home offers an
  encrypted export when the inbox is created, and says why.

**What Home builds.** A message-provider interface with three methods:
can this person be reached, open a conversation, send. A Quorum provider on
the MIT libraries. Storage for the inbox key, encrypted at rest. The link
check from §1.3. No server.

**Two gates before building.**

1. **Permission.** Ask Quilibrium whether another client may register
   users and send through its servers, and on what terms.
2. **Delivery.** Two browser profiles, the MIT libraries only, a few
   hundred messages each way, counted. Quorum's own team needed such a rig.

**Overturned if** either gate fails, in which case XMTP goes first. Also if
either network ships messages in its protocol, or if Coinbase's wallet
proves to be where Home's readers already talk.

---

## 4. What a smart wallet can sign for a Farcaster account

This table decides the wallet design. A smart wallet proves itself by
answering a contract call, not by a recoverable signature.

| Action | Ordinary wallet | Coinbase Smart Wallet | Evidence |
| --- | --- | --- | --- |
| Register an account on Optimism | yes | yes, contracts accept contract signatures | **pinned** |
| Add a posting key on-chain | yes | yes, at the cost of a transaction; the key is unscoped | **pinned** |
| Approve a scoped, expiring posting key with no transaction | yes | **no**, on either network | **pinned** |
| Register a free Hypersnap-only account | yes | **no** | **pinned** |
| Sign in | yes | yes, if the verifier asks the chain | **pinned** |
| Show the address on a profile | yes | yes, with the claim made on Ethereum or Optimism, not Base | **pinned** |
| Open Farcaster's direct casts | yes | **no** | **pinned** |
| Link a Quorum inbox | yes | **no**, as written | **pinned** |
| Hold an XMTP inbox | yes | yes | **pinned** |

Home's write path rests on the third row. A reader whose account is owned
by a smart wallet could still post through an on-chain key, but that key
costs a transaction, never expires and cannot be limited to casts.

---

## 5. Wallet: what Coinbase Smart Wallet is today

| Fact | Evidence |
| --- | --- |
| A smart contract wallet with many owners, each a passkey or an Ethereum address; MIT | **pinned** |
| It validates signatures through a hash bound to its own address and chain | **pinned** |
| An owner can add another owner, so the wallet need not depend on one site | **pinned** |
| The SDK is `@base-org/account` 2.6.0, Apache-2.0, released 2026-10-29 | **pinned** |
| Its README says "Base Account is now Coinbase Wallet" and that it remains "the current recommended SDK" until a next-generation one is ready | **pinned** |
| It connects through a window at `keys.coinbase.com`; nothing is installed | **pinned** |
| wagmi ships a `baseAccount` connector for it | **pinned** |
| The reference web client already uses wagmi, with an empty connector list and a vendor's embedded wallet | **pinned** |
| Coinbase renamed its Base App back to Coinbase Wallet on 2026-09-10 and turned it toward trading | **web**, news summaries |

## 6. Wallet: the options compared

| | Coinbase Smart Wallet | Any wallet the browser offers | An embedded wallet vendor | Keys in Home's storage |
| --- | --- | --- | --- | --- |
| Reader installs something | no | yes | no | no |
| Home holds keys | no | no | the vendor does | **yes** |
| Cost to Home | none to connect | none | per user | none |
| Can also be the account key | no | yes | depends | yes |
| Main risk | one company, renamed twice in fourteen months | fewer readers have one | lock-in and cost | custody |

The fourth column is what Quilcast does and what the walkthrough ruled out.
The third is what the reference client does for Farcaster's own wallet.

## 7. Wallet: the recommendation

**Decision.** Add a Wallet surface that connects wallets and holds nothing.
Offer Coinbase Smart Wallet first, through wagmi's connector, beside every
wallet the browser already exposes. Keep the account key and the wallet as
two named things. Remove the embedded-wallet vendor from Home's build.

**Why.**

- It needs no install and no seed phrase, which suits readers who arrive
  without a wallet.
- The integration is one connector in a library the client already ships.
- Home never holds a key that moves money.
- The same wallet can hold an XMTP inbox, so the second message provider
  comes almost free.

**What the reader sees.**

- Settings shows two lines: **Account key**, the wallet that owns the
  Farcaster account, and **Wallet**, the one that holds money. They may be
  the same ordinary wallet. They cannot both be a Coinbase Smart Wallet.
- The Wallet tab shows the address, the ETH and USDC balances on Base and
  Optimism, and a way to receive.
- **Show on my profile** verifies the address on the Farcaster account.
- **Pay** on a profile sends ETH or USDC to that person's verified address.
  Each payment opens Coinbase's window for approval.

**Build order.**

1. Connect, address, two balances, receive.
2. Verify the address on the profile.
3. Pay a person.
4. Buy Farcaster storage from the wallet.
5. A mini app host that passes the wallet through, one permission per app.

**Not built.** Trading, swaps, token pages, and Farcaster's tips, which are
its servers.

**Overturned if** Coinbase retires this SDK before its successor exists, or
restricts which sites may open its window, or if either network starts
accepting contract signatures for posting keys. The last would let one
Coinbase Smart Wallet be both roles.

---

## 8. How the two choices fit together

| Key | Lives | Does | Lost if |
| --- | --- | --- | --- |
| Account key | the reader's ordinary wallet | signs in, approves posting keys, links the inbox | the reader loses that wallet |
| Posting key | this browser, scoped, expiring | casts, likes, follows | nothing; approve another |
| Inbox key | this browser, exportable | reads and sends Quorum messages | browser storage is cleared without an export |
| Wallet | Coinbase's passkey, or any wallet | holds and sends money; can hold an XMTP inbox | the passkey and every other owner are lost |

The preference that started this page holds with one adjustment. Quorum
for messages and Coinbase Smart Wallet for money work together, provided
the Farcaster account itself is owned by an ordinary key.

## 9. What changes in earlier pages

The walkthrough's decisions "no inbox" and "no wallet" stay true for the
first build. This page replaces their "overturned if" with a plan: messages
after the two gates in §3, the wallet in the order of §7. Neither changes
the design page's rule that no server of Home's holds a key.

## 10. Limitations, option by option

Asked directly on 2026-11-10: what each choice cannot do. "Confirmed" means
pinned in code. Everything else is marked.

### 10.1 Coinbase's wallet as Home's wallet

| Limitation | Standing |
| --- | --- |
| It cannot be the account key. It cannot approve a posting key without a transaction on either network, register a Hypersnap-only account, open Farcaster's inbox, or sign the Quorum link | confirmed, §4 |
| Every approval opens a window on Coinbase's site. Home's pages must not send `Cross-Origin-Opener-Policy: same-origin`, and browsers that block pop-ups block the wallet | confirmed for the window and the header; pop-up blocking is inferred |
| The SDK reports usage to Coinbase unless Home turns that off; it is on by default | confirmed |
| The reader's passkey works through Coinbase's site. If that site refuses Home, the wallet is unusable in Home; the money stays reachable only through Coinbase or through a second owner the reader added | the contract allows a second owner, confirmed; the rest is inferred from the design |
| Ethereum-family chains only | no other chain family appears in the SDK source, read 2026-11-10; not pinned |
| An address shown on a profile must make its claim on Ethereum or Optimism, not Base, where the wallet mostly lives | confirmed |
| Signatures are bound to one chain and one wallet address and need a chain lookup to verify, so services that expect an ordinary signature refuse them | confirmed |
| Sending costs gas unless Home pays it through Coinbase's sponsorship service | **unverified**; documentation blocked |
| Home must read balances itself; anything beyond ETH and USDC needs an indexing service | design consequence |
| The product was renamed twice in fourteen months and a replacement SDK is announced with no date | confirmed in the SDK's README |
| Whether Coinbase restricts countries or sites | **unverified** |

### 10.2 Quorum for messages

| Limitation | Standing |
| --- | --- |
| It reaches only people who have linked a Quorum identity. It is not Farcaster's inbox, and nothing sent from Farcaster's app arrives | confirmed by design; how many people that is, **unknown** |
| The web app is beta, and message delivery was still being repaired in August 2026 | confirmed |
| One company's servers carry it, with no published terms for other clients | host confirmed; terms not found |
| Messages are not kept on a server. Clearing the browser's storage loses the history and the key unless the reader exported a backup | confirmed in Quorum's own notes |
| The link needs an ordinary key that owns the Farcaster account. Accounts held inside Farcaster's app, or by a smart wallet, cannot link | confirmed as coded |
| The directory is not proof; Home must check both signatures itself | confirmed |
| The MIT library is incomplete: its README says hooks and utilities are still in the AGPL desktop app. Home writes that part itself | confirmed |
| Its keys use a curve browsers cannot hold as protected keys, so Home must encrypt them at rest itself | inferred |
| No audit of the encryption was found | not found, which is not proof of absence |
| A paid tier exists, paid on Ethereum; it was not found to gate messages | tier confirmed; gating not found |

### 10.3 Hypersnap for messages

| Limitation | Standing |
| --- | --- |
| It does not exist: no message type, no proposal | confirmed |
| If its validators added one, the relay would not carry it, so nobody on Farcaster's side could be reached | confirmed for the relay's type list |
| Anything written to the chain is public and permanent, so who talks to whom would be visible unless the design hides it | design consequence |
| Its stated next features are signups, channels and mini app indexing | **web** |

### 10.4 Farcaster's direct casts

| Limitation | Standing |
| --- | --- |
| A private interface, reached by presenting as Farcaster's own site. It can be closed without notice | confirmed in two clients |
| Not encrypted end to end; Farcaster's servers hold readable messages | **web**, Farcaster's own draft |
| Home would need a relay that every reader's inbox token passes through, which breaks the rule that no server of Home's can act for a reader | confirmed for the relay |
| Only an ordinary key that owns the account can open it. Accounts held inside Farcaster's app, or by a smart wallet, cannot | confirmed for the 65-byte check |
| The inbox token covers text. Images and reactions need a full Farcaster session | confirmed |
| It sits under Network School's terms; whether accounts that declined them can use it is **unknown** | unknown |

Its one advantage is reach: everyone on Farcaster is there.

### 10.5 XMTP

| Limitation | Standing |
| --- | --- |
| It finds wallets, not Farcaster accounts. A person is reachable only if they verified an address and that address has an inbox. A reader with no wallet has no inbox | confirmed for the identity model |
| Home must run a gateway service and pay fees in USDC, about $5 per 100,000 messages, once fees are charged | confirmed as of April 2026 |
| The network was mid-move in April 2026: one company ran every node, and the browser SDK was not yet marked ready for the fee-charging network. Today's state is **unknown** | confirmed as of April |
| One browser tab at a time | confirmed |
| Ten installations per inbox; every browser profile is one, and cleared storage spends one | confirmed for the limit |
| History on a new device, spam controls and web push were not read | **not checked** |
| Its largest audience is Coinbase's wallet app, which turned toward trading in September | **unverified** |

### 10.6 What the limits add up to

- **No option reaches everyone privately.** Farcaster's inbox has reach
  without privacy or permission. Quorum and XMTP have privacy without
  reach.
- **Two kinds of account are shut out of every option but XMTP:** those
  held inside Farcaster's app and those owned by a smart wallet.
- **Coinbase's wallet is a good money wallet and a poor identity.** Used
  for money only, its limits are a pop-up, a default that must be turned
  off, and a dependence on one company.

## 11. Not verified

- Whether Quilibrium permits other clients on Quorum's servers, and
  whether those servers accept requests from another site's pages.
- Quorum's delivery rate today, and whether its encryption was audited.
- Whether XMTP's fee-charging network has launched, and its current fee.
- Whether Coinbase's wallet app still carries a Farcaster feed and XMTP
  chat after the rename.
- Whether Farcaster's direct-cast service accepts accounts that have not
  taken Network School's terms.
- Every flow in §3 and §7. None was run.

## 12. Evidence

| Claim | Where it was read |
| --- | --- |
| Message types on both nodes; no mention of direct messages | `snapchain@1405794`, `hypersnap@ce9d003`, `proto/definitions/message.proto`, `src`, `proto` |
| Posting-key approval recovers an ordinary key, identically on both nodes | both, `src/core/validations/key.rs` |
| Hypersnap registration recovers an ordinary key | `hypersnap@ce9d003` `src/native_registration.rs` |
| Contract signatures for address verification; chains | `snapchain@1405794` `contract_signature.rs`, `verification.rs`, `onchain_events/mod.rs` |
| Farcaster's contracts accept contract signatures | `farcasterxyz/contracts@58d6b28` `IdRegistry.sol`, `abstract/Signatures.sol` |
| Sign-in verification can ask the chain | `auth-monorepo@ae3dffd` `auth-client/README.md`, `jfs/src/index.ts` |
| How two clients reach Farcaster's inbox | `quilcast@f2eedb9` `server/dm.mjs`, `server/upload.mjs`, `src/write.ts`; `quorum-mobile@37c0fe6` `services/farcaster/directCastAuth.ts` |
| Quorum's encryption, licences, servers, link and directory | `quorum-shared@c00c61e`, `quorum-desktop@db04b99`, `quorum-mobile@37c0fe6` |
| XMTP's identity, chains, fees and status | `xmtp/docs-xmtp-org@8b513c9`, `xmtp/libxmtp@ab6fdcd` |
| The smart wallet contract | `coinbase/smart-wallet@a4e83fd` |
| The SDK, its name, its window, its reporting default and its header requirement | `base/account-sdk@1c31057` |
| wagmi's connector | `wevm/wagmi@e6d5dad` |
| The reference client's wallet stack | `farcasterxyz/client@73a39bd` `apps/farcaster-web` |
| Farcaster's direct-cast drafts | `farcasterxyz/protocol` discussions 226 and 99, issue 5, read on the web |
| The rename on 2026-09-10 | news search summaries; `coinbase/coinbase-wallet-sdk` pull request 1911 |
| No messaging proposal in the Hypersnap organisation | GitHub searches of `farcasterorg`, read on the web |
