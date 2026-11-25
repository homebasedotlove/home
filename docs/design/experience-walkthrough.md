# What using Home is like, surface by surface

Written 2026-11-10. This page answers one question for each part of the
client: what does a reader see, what happens when they tap, and whose
machines make it work. It sits on top of
[the design that fits November 2026](../research/optimal-design.md) and the
[signature interactions](signature-interactions.md); it adds no new
architecture, and it records five decisions those pages had not made.

Every upstream fact below that has a **pinned** or **run** label is checked by `scripts/audit-protocol-claims.mjs` or was run; the block rates, the rotation date and the 11-15 repair are read from commits and third-party notes, and stated as such where they appear.

---

## 0. Read this first

**The fork happened after this page was written.** The page dates from
2026-11-10 19:31 UTC, when the schedule projected 2026-11-12 09:25 UTC. The
heights were moved twelve hours on the morning they were due, and the fork
activated that evening. The re-read of 2026-11-13 is recorded in
[After the fork](#after-the-fork), and the rows it changes are marked there.

**Nothing here was exercised against a live node.** The sandbox this was
written in cannot reach `haatz.quilibrium.com`, `snap.farcaster.xyz` or
`api.farcaster.xyz`. Every "works" below means one of three things, and each
row says which.

| Label | Meaning |
| --- | --- |
| **Built** | In this repository, tested, running in the patched reference client |
| **Kernel** | Logic built and tested in `packages/home-personalization`; no screen yet |
| **Designed** | Decided in the design pages; the upstream route or message exists in pinned code; not built |
| **New here** | Decided for the first time on this page |
| **Farcaster's servers** | Only `api.farcaster.xyz` does this; neither network's nodes do |

**What Home is today.** The reference client plus one patch: the home feed
comes from Farcaster's production API, every ranked cast carries a why-chip
that opens a sheet with *Less / None / More*, and a "N casts hidden" row
shows what the reader's rules removed, with undo. Posting from that build is
refused with `400 - Opt in required` unless the account has accepted Network
School's terms. Everything described as **Designed** is the protocol path:
Home reading from nodes on both networks and signing on the reader's device.

---

## 1. The whole client on one screen

| Surface | What the reader gets | Whose machines | Status |
| --- | --- | --- | --- |
| Feed | A feed Home ranks, with a reason on every cast and a control on every reason | lists from a node on either network; shaped feeds, search and notifications only from a Hypersnap node or Neynar (a Farcaster node serves `/v1` only); Home ranks in the browser | chip and receipts **Built**; Home's own ranking **Designed** |
| Posting | One composer, one signature on the device, one status per network | Home's gateway forwards to a node on each network | **Designed**; signing validated |
| Follows | Public, portable follows; private lists; mutes that are Home's own | protocol for follows and blocks; the device for lists and mutes | lists and mutes **Kernel**; follow writes **Designed** |
| Channels | Browse, read, post into any channel; add a channel to a feed | protocol for casts; Farcaster's servers for membership | **Designed**; a real channel follow is not available |
| Messages | First build: no inbox, and a Message button that opens Farcaster's own composer. Later: an opt-in encrypted inbox | **Farcaster's servers**, then Quorum's | **New here**; plan in [messages and wallet](../research/messages-and-wallet.md) |
| Wallet | First build: none; the reader's own wallet signs in and approves keys. Later: a surface that connects a wallet and holds nothing | the reader's wallet | **New here**; plan in [messages and wallet](../research/messages-and-wallet.md) |
| Notifications | Mentions, replies, reactions and follows, read while Home is open | a node | **Designed**; no push at first |
| Search | People, casts and channels; a search can be saved as a feed | a node | **Designed**; saved-search source **Kernel** |
| Profile | Read everything; edit name, bio, picture; username read-only at first | protocol | **Designed** |
| Mini apps | Open in a new tab | the mini app's own site | **New here** |
| Saved casts | Kept on the device, exportable | the device | **New here** |
| Settings | Feeds, Filters, Appearance, Interaction, Boundaries, Your data, Networks | the device | preferences **Built**; screens **Designed** |

---

## 2. Signing in

Reading needs no account. A signed-out reader gets a launch feed built from
public reads, can open any profile, channel or cast, and can build and save
feeds, because feeds are preferences on the device. **Designed.**

What happens at sign-in depends on where the account's custody key lives.

### 2.1 The account is in a wallet the reader controls

1. **Connect wallet.** The wallet shows a plain signature request over a
   short-lived message naming the fid. Home checks the signer against the
   fid's custody address, read from a node. No server of Farcaster's is
   involved. The reader is signed in and sees their following feed and
   notifications.
2. **First post or like: "Let Home post for you".** The browser generates a
   key. The wallet shows one typed-data signature that approves it for casts
   and reactions only, with a lifetime that slides forward with use and
   idles out after at most ninety days without use. Home's service countersigns the request as
   Home's app, which is why other clients can show "via Home". No gas, no
   transaction.
3. **First follow or profile edit: a second approval,** for a key that may
   also write follows and profile fields. This is deliberate: a leaked
   posting key cannot rewrite who the reader follows. Each node accepts one
   key addition per minute per account, so Home spaces the two approvals, and
   the countersigning app account must be one that each network's node knows:
   an app account registered on Optimism after the fork may be unknown to
   Hypersnap (design §4.3).

The reader can list the keys this browser holds and revoke any of them from
Settings. **Designed**; the signing half is validated by
`pnpm validate:write-path` (13 checks).

### 2.2 The account lives inside the Farcaster app

Most existing accounts were created by email in Farcaster's app, which holds
the custody key. Two routes, neither as clean:

- **Sign in with Farcaster**, approved in the Farcaster app, then a key
  request approved in the same app. **Farcaster's servers**, and
  **unverified**: whether the app still approves another client's key for
  an account that has not accepted the new terms is not known.
- **Move the recovery phrase into a wallet** and use §2.1. Home explains
  this in one screen and never asks for the phrase itself.

### 2.3 No account yet

Home does not create accounts in its first build. It says so and links out.
A Farcaster account is registered on Optimism, which Quilcast prices at
about $0.20 of ETH. Since the fork, Hypersnap registers accounts free with a
proof of work, and those accounts exist on Hypersnap only. Quilcast shipped
that signup the night of the fork.

---

## 3. The feed

### 3.1 What is on screen today — Built

Every cast in the ranked feed has a small coloured label above it. There are
ten, in four colours:

| Group | Labels |
| --- | --- |
| People you follow | Following · Following · older |
| Through your network | Friend of a friend · Recasted · Replied to · Pinned |
| Discovery | Popular in channel · Popular · Suggested |
| Promoted | Promoted |

Tap a label and a sheet opens under it:

```
  You're seeing this because someone you follow recasted it.
  meta.score 0.71

  [ Less of this ]  [ None of this ]  [ More of this ]
```

*Less* and *More* move that group's weight one step and the feed re-ranks.
*None* removes the group. *Promoted* has no *More*. A reason Home has no
copy for still gets a label, and the sheet says "We don't have a description
for this yet".

When the reader's rules remove anything, one row appears in the feed:

```
  3 casts hidden on this page.                               ▾
    Discovery · 2 hidden                          [ Turn back on ]
    “airdrop” · 1 hidden                                [ Unmute ]
```

Each line is one rule and the button that reverses it.

### 3.2 What changes on the protocol path — Designed

- **Home builds the feed.** Candidates come from the reader's following
  feed with recasts, from a node's engagement ranking, and from the
  reader's channels. The kernel ranks them under the reader's weights.
- **The reason carries its facts.** Because Home computed it, the sheet can
  say "Recast by two people you follow" and name them, where today it can
  only name a category. Seven of the ten reasons can be computed from
  protocol data. *Pinned* is partial. *Suggested* becomes Home's own rule,
  labelled as Home's. *Promoted* disappears, because Home has no ads.
- **No "For you" from anyone's model.** A Hypersnap node's `for_you` route
  is its trending route. Home labels trending as trending and says whose
  ranking it is.
- **The Following tab has no labels.** It is newest first, and there is
  nothing to explain.
- **The mix dial.** Pull down past refresh and keep pulling: four bars show
  what the feed is made of, and dragging one re-ranks the feed underneath.
  The ranking code is **Kernel**; the gesture is **Designed**.
- **Network, when it matters.** A cast that only one network holds carries a
  small network mark. A feed can be restricted to one network. Accounts that
  exist only on Hypersnap stay out of discovery until the reader turns them
  on, and are never hidden from a Following feed.
- **Failure is named.** If one source fails, the feed shows the rest and a
  line saying which source did not answer. If all fail, the feed says so
  and lists them. That behaviour is **Built** in `home-client-core`.

**The reader's own state.** A Hypersnap node reports it only when the
request names the reader: whether they liked or recasted each cast, and
whether they follow or block its author (**pinned**). Home always names the
reader on the routes that fill it (the main feeds, a channel, a user's casts,
a single cast and a conversation); search, popular, replies and notification
responses carry no reader state, so a heart there fills in a moment later. A third-party client's feature matrix says
a Hypersnap node leaves this empty; that was written against Hypersnap
0.13.5 and is out of date. A Snapchain node has no such field, so for
Farcaster-side casts Home asks per cast, and a heart may fill in a moment
after the cast appears.

---

## 4. Posting

**Designed.** The composer is one text box. Any account can write up to
10,000 bytes and attach up to four embeds.

The cast is signed once, on the device, and the same bytes go to a node on
each network through Home's gateway. Under the cast, until both answer:

```
  Farcaster   accepted
  Hypersnap   accepted
```

When the two disagree, Home says so and keeps the cast:

```
  Farcaster   refused: no storage on this account
  Hypersnap   accepted                                  [ Retry ]
```

A signed cast is never resubmitted without the reader pressing the button.
Likes, recasts, replies, quotes and deletes work the same way and usually
resolve before the reader looks.

**Images and video — New here.** Neither network hosts media. Farcaster's
upload endpoints are **Farcaster's servers** and, by another client's
account, only serve accounts with a Farcaster-app key. So the first build
attaches links and image URLs and renders them; it does not upload. Uploads
arrive with the gateway, as a size-capped public bucket, and that is a cost
and a moderation duty Home takes on knowingly.

---

## 5. Follows, lists, mutes and blocks

**Follow** — Designed. Tapping Follow, after the second approval in §2.1,
writes a public follow that every Farcaster client reads. Existing follows
need no import; they are already on the network.

Storage is where the two networks part. On Farcaster one storage unit rented since July 2025 holds 200 follows and the oldest is dropped past that (older units hold 1,000 or 2,500, and are still valid), and a per-account hourly limit applies on both networks. After the fork
Hypersnap applies no storage limits. A reader who follows more than their
storage allows will have a longer list on Hypersnap than on Farcaster, and
Home shows both counts when they differ.

**Lists** — Kernel. A list is a private set of accounts that can feed a
tab without a public follow. It lives on the device and travels by export
or share link.

**Mute** — Kernel. Mute an account, a channel or a word for 24 hours,
7 days, 30 days or forever. Mutes are Home's own. They do not change what
any other client shows, and mutes the reader set in Farcaster's app are not
visible to Home, because those live on Farcaster's servers.

**Block** — Designed. A block is a public protocol record, a link of type
`block`, durable since engine version 19. Home can write one with the
second key and hides the accounts the reader has blocked. Whether
Farcaster's own app stores its blocks this way was not checked.

---

## 6. Channels

A channel is, on both networks today, nothing more than a URL that casts
name as their parent. Everything else about channels is a service Farcaster
runs.

| The reader wants to | In Home | Status |
| --- | --- | --- |
| Browse or search channels | A directory with search and trending | **Designed**: a node derives it from casts; Farcaster's public list needs no login |
| Read a channel | Its casts, newest first, one channel per request; a node has no engagement order for a channel, so Home sorts the returned counts itself | **Designed** |
| Post into a channel | Pick the channel in the composer | **Designed**: a cast with that parent URL, on both networks |
| Follow a channel | **Add to feed.** The channel becomes a source in a tab | **Kernel**; local to Home |
| Have that follow show in Farcaster's app | Not available | **Farcaster's servers**, with a token Home's keys may not be able to produce |
| Join, invite, moderate, pin | Not available; membership is shown read-only | **Farcaster's servers** |

Two consequences worth saying to the reader in the interface. The button
says *Add to feed*, not *Follow*, because nobody else can see it. And before
a cast goes into a members-only channel the reader has not joined, the
composer warns that Farcaster's app may not show it there.

On a Hypersnap node a channel's member count means accounts that have posted
in it, not accounts that joined.

Both networks intend to change this. Snapchain has channel messages and
channel follows behind engine version 25, which has no date (version 24
went live on 2026-11-24 without them). Hypersnap's
lead developer has said free channels will come "rather soon". When either
ships, *Add to feed* gains a real follow on that network, and Home will show
which network a channel lives on.

---

## 7. Messages

**Direct messages are not part of either network.** Farcaster's own
documentation says direct casts "are currently not part of the protocol",
and neither node's source mentions them. In the reference client they are 33
endpoints on Farcaster's servers.

**New here: Home ships without an inbox.** There is no Messages item in the
navigation, because a control that cannot work should not be drawn. A
profile has a *Message* button that opens Farcaster's own composer for that
person in a new tab, which works for readers who also use Farcaster's app.

**Revised the same day.** This section first said that Farcaster's inbox
would be the route to take if readers asked for more.
[Messages and wallet](../research/messages-and-wallet.md) looked closer and
reversed that. The two clients that read Farcaster's inbox do it by presenting as Farcaster's own site (one through a relay, one directly), and the inbox is not encrypted
end to end. The plan now is:

1. **Quorum first.** It is the encrypted messenger built by the team behind
   Hypersnap, with MIT libraries and a signed link to a Farcaster account.
   Two checks come before building: permission, and a delivery test.
2. **No second provider for now.** XMTP was named here, but its new SDKs
   have no shared network ([messages and wallet §13](../research/messages-and-wallet.md#13-re-read-2026-11-25)).
   If either check fails, the choice is a self-hosted XMTP backend for Home's
   own readers, or no inbox.
3. **Farcaster's inbox stays a link.**

Any inbox is opt-in and labelled with whose servers carry the messages.

---

## 8. Wallet

**New here: Home has no wallet and never holds funds or keys that move
funds.** The reference web client has none either; its Wallet page is one
sentence pointing at the mobile app, and its 17 wallet endpoints are
**Farcaster's servers**. Home's build will remove the page; today's patch
leaves it in place.

The reader's own wallet is asked for a signature in exactly these places:

| When | What the wallet shows | Cost |
| --- | --- | --- |
| Signing in | A message naming the fid | none |
| Allowing Home to post | Typed data approving a key for casts and reactions | none |
| Allowing follows and profile edits | Typed data approving a second key | none |
| Showing an address on the profile | Typed data proving the address belongs to the fid | none |
| Buying storage | A transaction on Optimism | storage rent plus gas; Home links out at first |

So there are no tips, no token pages, no trading and no send in Home. A
profile shows the addresses its owner verified, read-only.

**What comes after the first build.**
[Messages and wallet](../research/messages-and-wallet.md) plans a Wallet
surface that connects a wallet and still holds nothing, with Coinbase Smart
Wallet offered first. It found one hard limit: a smart wallet cannot approve
Home's posting keys on either network, so the wallet that owns the Farcaster
account and the wallet that holds money are two named things.

---

## 9. The rest

**Notifications — Designed.** One tab with mentions, replies, likes,
recasts and follows, read from a node, in three modes: Everything,
Important, Off. Read state is Home's own. There is **no push at first**:
notifications appear while Home is open. Push needs the gateway and a
webhook, which is later work. A Hypersnap node serves a reader's whole
history from an index once it has finished building it, and until then only
the activity on the reader's newest casts, at most 100 and 75 at the default page size (**pinned**), so Home labels a
notification list from a node that is still indexing as partial. A recast
reads as a like unless the request asks for quotes and deep replies.
Farcaster's own nodes have no notifications route at all.

**Search — Designed.** People, casts and channels from a Hypersnap node; a Farcaster node has no search route. Any search
can be saved as a feed source; that part is **Kernel**.

**Profile — Designed.** Casts, replies, likes, followers, following,
verified addresses, and, where Home can read the signer's key request, which app signed each cast (a node's cast object does not carry it). Editing covers display
name, bio and picture, with the second key. The username is read-only in
the first build, because usernames are issued by a registry Farcaster runs.
An account that exists only on Hypersnap has no registered username (it can still hold an ENS or Basename proof).

**Mini apps — New here.** A mini app in a cast renders as a card that opens
the app's own site in a new tab. Home does not host mini apps in its first
build, which also means no mini app ever talks to the reader's wallet
through Home.

**Saved casts — New here.** Bookmarks in Farcaster's app live on
Farcaster's servers. Home's saves live on the device and are included in
the export.

**Settings — Designed; preferences Built.** Feeds, Filters, Appearance,
Interaction, Boundaries, Your data, and one addition that follows from the
design page: **Networks**, which
lists each provider Home is reading from, the network it belongs to and
whether it is answering, and lets the reader change them. Everything Home
knows about the reader exports as one file and imports on another device.

---

## 10. What the fork changes

| Surface | If the fork holds | If it is postponed or stalls |
| --- | --- | --- |
| Feed | Casts can exist on one network only; network marks start to appear | One set of data served by two kinds of node, as now |
| Posting | The two status lines can differ, most often over storage | The two lines agree |
| Follows | Follow counts diverge for readers over their Farcaster storage | Same list everywhere |
| Channels | Hypersnap may ship its own; a channel gains a home network | Unchanged |
| Accounts | Free Hypersnap-only accounts appear, off in discovery by default | None exist |
| Messages, wallet | Unchanged either way | Unchanged |

### After the fork

Re-read 2026-11-13 at 09:31 UTC. The full record is in
[the design page](../research/optimal-design.md#10-after-the-fork-re-read-2026-11-13).
No node could be reached from here, so this rests on Hypersnap's commits
and three other projects' records.

**It held, on the second schedule.** The heights were moved twelve hours
on the morning of 12 November. The fork activated that evening. Two nodes
were past the cutover by 21:22, and the only stop a monitor recorded that
night was 85 seconds, at 23:36.

| Row above | What happened |
| --- | --- |
| Feed | True now. The two networks produce their own blocks, so a cast can exist on one only |
| Posting | True now, and wider than expected: see Accounts |
| Follows | Not yet observed; it follows from storage limits ending on Hypersnap |
| Channels | Unchanged. The relay does not carry channel messages unless an operator lists them |
| Accounts | True now. Free Hypersnap accounts exist |

**Three things the table did not anticipate.**

- **Hypersnap-only accounts have no username.** Usernames come from a
  server that knows only Optimism accounts. Home shows the display name
  and the id.
- **New Farcaster accounts may or may not appear on Hypersnap.** The relay
  carries no on-chain events, and whether Hypersnap's validators read
  Optimism themselves is private configuration that could not be read.
  Hypersnap's own text intends it ("legacy registrations and signers
  continue to work through the existing contract-backed path"); Quilcast's
  code assumes it does not happen. Neither was measured here. If the
  assumption holds, a reader who joins Farcaster today posts to one network
  only, and Home's status line says so.
- **Sign-in must look on both networks.** An account can now exist on
  either one alone, so Home asks each network for the account before it
  offers to post there.


### Re-read 2026-11-25

Twelve days later, from commits, GitHub pages and package registries. No node
could be reached. The full record is
[design page §11](../research/optimal-design.md#11-re-read-2026-11-25).

| Surface | What changed since 11-13 |
| --- | --- |
| Feed | Nothing visible. Hypersnap produces about 0.64 blocks a second against Snapchain's one, so the two networks' newest casts arrive at different rhythms |
| Posting | **A quota.** Hypersnap now admits 1,008 messages an hour per account per node, counting casts, likes, follows and profile edits. Home shows the refusal on that network's status line and retries only when the reader presses the button |
| Posting, new accounts | A free Hypersnap account could register and receive a signer, and its first cast was refused as "unknown fid". The repair took effect around 11-15. A reader who signed up in the first days may have to wait or re-register |
| Channels | Snapchain moved them from version 24 to **version 25**, with no date. "Add to feed" is unchanged |
| Accounts | Hypersnap-only accounts have no username, which Quilcast says in its own README. Home shows the display name and the id |
| Messages | XMTP stopped being a shared network ([messages and wallet §13](../research/messages-and-wallet.md#13-re-read-2026-11-25)). Quorum is the only planned provider |
| Wallet | Unchanged. Coinbase's SDK, contract and wagmi connector did not move |
| Sign-in | Unchanged. The production API's refusal to accept casts has had no reply in the reference client's tracker since 10-21 |

Two reliability facts bear on every surface. Hypersnap's validator set was
rotated to eleven keys on about 21 November, and its commit history shows
repeated fixes for halts and stalls in the first ten days. Read nodes also
failed to sync after the fork until a snapshot change. Neither was reported
as a mainnet-wide outage in any page I could read, and none could be
measured here.
---

## 11. Decisions recorded here for the first time

| Decision | Why | Overturned if |
| --- | --- | --- |
| No inbox in the first build; a Message button that opens Farcaster's composer | Messages are on nobody's network; the only working route runs through one company's servers and terms | The two checks in [messages and wallet](../research/messages-and-wallet.md) pass, in which case Quorum is added as an opt-in |
| No wallet in the first build, and never one that holds keys | The reference web client has none; a wallet that holds keys adds custody risk | Superseded in part: a connect-only Wallet surface is planned in [messages and wallet](../research/messages-and-wallet.md) |
| No uploads in the first build | No network hosts media; hosting it is a cost and a moderation duty | The gateway exists and a bucket is budgeted |
| Mini apps open in a new tab | Hosting them means brokering wallet requests | As above |
| Saved casts on the device | The only other place is Farcaster's servers | Either network adds a bookmark message |

One correction to the design page follows from §2.1. The gateway there has
three duties. Countersigning key requests as Home's app is a fourth, and it
needs Home's app custody key in a secret store, as the
[end-to-end setup](../operations/setup-end-to-end.md) already says.

---

## 12. Not verified

- Whether the fork activated. It had not been reached when this was written.
- Any live read or write. No node was reachable from here.
- Whether Farcaster's app still approves another client's key, follows a
  channel on a third-party token, or opens the inbox for an account that
  has not accepted Network School's terms.
- Whether Farcaster's app writes its blocks to the protocol.

## 13. Evidence

| Claim | Where it was read |
| --- | --- |
| The fork schedule, first, second and the rotation | `farcasterorg/hypersnap@ce9d003` and `@3fab17d`, `validators.toml` |
| That it activated, and what followed | `bettercallzaal/ZAOOS@9690fca`, `schmrdty/snapdiff@ad49a20`, `backmeupplz/quilcast@3d7e6ec` |
| Ten reasons, four groups, their labels and sentences | `packages/home-personalization/src/reasons/index.ts` |
| The why-chip, its three buttons and the hidden row | `docs/integration/reference-patch/seam-and-chip.patch` |
| Mute durations; receipts copy | `packages/home-personalization/src/prefs/actions.ts`, `src/pipeline/receipts.ts` |
| `for_you` is trending; writes answer 501 | `hypersnap@3fab17d` `src/api/http.rs` |
| Channels on a node are derived from casts; members are posters | `hypersnap@3fab17d` `src/api/channels.rs`; `Opencaster@a3a3685` `FEATURE_SUPPORT.md` |
| A Hypersnap node fills liked, recasted, following and blocking when the request names a viewer; notifications come from an index only once it is complete | `hypersnap@3fab17d` `src/api/http.rs`, `src/network/server.rs` |
| 10,000-byte casts for every account; four embeds | `snapchain@3839f06` `src/core/validations/cast.rs`, `src/version/version.rs` |
| 200 follows per current storage unit | `snapchain@3839f06` `src/storage/store/stores.rs` |
| Block links are durable from engine version 19 | `snapchain@3839f06` `src/version/version.rs`, `link_store.rs` |
| Channel messages and follows wait for engine version 25; version 24 shipped without them | `snapchain@3839f06` `src/version/version.rs` |
| Direct casts are not part of the protocol; the intent URL | `farcasterxyz/docs@3a02c82` `docs/reference/farcaster/direct-casts.md` |
| Channel follow is a call to Farcaster's API with an app-key token; the channel list is public | `farcasterxyz/docs@3a02c82` `docs/reference/farcaster/api.md` |
| The reference client's wallet page and endpoint counts | `farcasterxyz/client@73a39bd` `WalletPage.tsx`, `FarcasterApiClient.ts` |
| Quilcast's inbox, uploads, mutes and account price | `quilcast@f2eedb9` `README.md` |
| "rather soon", from Hypersnap's lead developer, 2026-11-04 | `farcasterorg/hypersnap` issue 51, read on the web |
