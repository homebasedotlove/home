# What using Home is like, surface by surface

Written 2026-11-10. This page answers one question for each part of the
client: what does a reader see, what happens when they tap, and whose
machines make it work. It sits on top of
[the design that fits November 2026](../research/optimal-design.md) and the
[signature interactions](signature-interactions.md); it adds no new
architecture, and it records five decisions those pages had not made.

Every upstream fact below is pinned by `scripts/audit-protocol-claims.mjs`.

---

## 0. Read this first

**The fork has not happened.** This page was written at 2026-11-10 19:31 UTC.
Hypersnap's validator set changes at fixed block heights, and the file that
schedules them projects 2026-11-12 09:25:20 UTC. No repository this project
reads had moved since the last read: Hypersnap is at `ce9d003`, Snapchain at
`1405794`, the reference client at `73a39bd`. So "did it hold" has no answer
yet. A re-read is scheduled for 2026-11-13 09:30 UTC and will be recorded in
[After the fork](#after-the-fork).

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
| Feed | A feed Home ranks, with a reason on every cast and a control on every reason | nodes on either network; Home ranks in the browser | chip and receipts **Built**; Home's own ranking **Designed** |
| Posting | One composer, one signature on the device, one status per network | Home's gateway forwards to a node on each network | **Designed**; signing validated |
| Follows | Public, portable follows; private lists; mutes that are Home's own | protocol for follows and blocks; the device for lists and mutes | lists and mutes **Kernel**; follow writes **Designed** |
| Channels | Browse, read, post into any channel; add a channel to a feed | protocol for casts; Farcaster's servers for membership | **Designed**; a real channel follow is not available |
| Messages | No inbox. A Message button that opens Farcaster's own composer | **Farcaster's servers** | **New here** |
| Wallet | None. The reader's own wallet signs in and approves keys | the reader's wallet | **New here** |
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
   cannot exceed ninety days. Home's service countersigns the request as
   Home's app, which is why other clients can show "via Home". No gas, no
   transaction.
3. **First follow or profile edit: a second approval,** for a key that may
   also write follows and profile fields. This is deliberate: a leaked
   posting key cannot rewrite who the reader follows.

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
about $0.20 of ETH. After the fork, Hypersnap registers accounts free with a
proof of work, and those accounts exist on Hypersnap only.

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

One visible difference from Farcaster's app: a node does not tell Home
whether the reader already liked a cast. Home reads that separately, so a
heart may fill in a moment after the cast appears.

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

Storage is where the two networks part. On Farcaster one current storage
unit holds 200 follows and the oldest is dropped past that. After the fork
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
| Read a channel | Its casts, newest first or by engagement | **Designed** |
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
channel follows behind engine version 24, which has no date. Hypersnap's
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

If readers ask for more, there are two routes, and the first is the one to
take:

1. **Farcaster's inbox, through Farcaster's servers,** as Quilcast does it:
   the custody wallet signs one authorisation and the client keeps a token
   that opens direct casts and nothing else. It reaches everyone already on
   Farcaster. It also puts a Farcaster session on Home's side, under
   Network School's terms, and whether accounts that declined those terms
   can use it is **unverified**.
2. **An open messaging protocol keyed to verified addresses.** Independent
   of Farcaster, and empty on day one.

Either would be opt-in and labelled with whose servers carry the messages.

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
| Showing an address on the profile | A message proving the address belongs to the fid | none |
| Buying storage | A transaction on Optimism | storage rent plus gas; Home links out at first |

So there are no tips, no token pages, no trading and no send in Home. A
profile shows the addresses its owner verified, read-only.

---

## 9. The rest

**Notifications — Designed.** One tab with mentions, replies, likes,
recasts and follows, read from a node, in three modes: Everything,
Important, Off. Read state is Home's own. There is **no push at first**:
notifications appear while Home is open. Push needs the gateway and a
webhook, which is later work. A node does not keep a complete historical
inbox, so Home does not claim one.

**Search — Designed.** People, casts and channels from a node. Any search
can be saved as a feed source; that part is **Kernel**.

**Profile — Designed.** Casts, replies, likes, followers, following,
verified addresses, and which app signed each cast. Editing covers display
name, bio and picture, with the second key. The username is read-only in
the first build, because usernames are issued by a registry Farcaster runs.

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

*To be filled by the re-read scheduled for 2026-11-13 09:30 UTC: whether the
heights were reached, whether they were moved again, and which rows above
came true.*

---

## 11. Decisions recorded here for the first time

| Decision | Why | Overturned if |
| --- | --- | --- |
| No inbox; a Message button that opens Farcaster's composer | Messages are on nobody's network; the only working route runs through one company's servers and terms | Readers ask, in which case Farcaster's inbox is added as an opt-in |
| No wallet in Home | The reference web client has none; a wallet adds custody risk and no customisation | A mini app host is built, which needs a wallet bridge |
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
| The fork schedule and projection | `farcasterorg/hypersnap@ce9d003` `validators.toml` |
| Ten reasons, four groups, their labels and sentences | `packages/home-personalization/src/reasons/index.ts` |
| The why-chip, its three buttons and the hidden row | `docs/integration/reference-patch/seam-and-chip.patch` |
| Mute durations; receipts copy | `packages/home-personalization/src/prefs/actions.ts`, `src/pipeline/receipts.ts` |
| `for_you` is trending; writes answer 501 | `hypersnap@ce9d003` `src/api/http.rs` |
| Channels on a node are derived from casts; members are posters | `hypersnap@ce9d003` `src/api/channels.rs`; `Opencaster@a3a3685` `FEATURE_SUPPORT.md` |
| A node leaves the viewer's like state empty; no complete inbox | `Opencaster@a3a3685` `apps/web-client/FEATURE_SUPPORT.md` |
| 10,000-byte casts for every account; four embeds | `snapchain@1405794` `src/core/validations/cast.rs`, `src/version/version.rs` |
| 200 follows per current storage unit | `snapchain@1405794` `src/storage/store/stores.rs` |
| Block links are durable from engine version 19 | `snapchain@1405794` `src/version/version.rs`, `link_store.rs` |
| Channel messages and follows wait for engine version 24 | `snapchain@1405794` `src/version/version.rs` |
| Direct casts are not part of the protocol; the intent URL | `farcasterxyz/docs@3a02c82` `docs/reference/farcaster/direct-casts.md` |
| Channel follow is a call to Farcaster's API with an app-key token; the channel list is public | `farcasterxyz/docs@3a02c82` `docs/reference/farcaster/api.md` |
| The reference client's wallet page and endpoint counts | `farcasterxyz/client@73a39bd` `WalletPage.tsx`, `FarcasterApiClient.ts` |
| Quilcast's inbox, uploads, mutes and account price | `quilcast@f2eedb9` `README.md` |
| "rather soon", from Hypersnap's lead developer, 2026-11-04 | `farcasterorg/hypersnap` issue 51, read on the web |
