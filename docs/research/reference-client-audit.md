# What the reference client leaves on the table

An audit of [`farcasterxyz/client`](https://github.com/farcasterxyz/client), read
at commit `b6922e2` (the snapshot current as of this writing). Every claim below
cites a file in that repository. The point is not that the reference client is
badly built — it is a large, careful, fast codebase. The point is that its
customization budget has been spent almost entirely in one place, and the most
valuable levers it already has are wired to nothing.

## The one-paragraph version

The server tells the client *why* every cast is in your feed. The client shows
that answer only if you go looking for it — in a menu, one cast at a time, for
eight of the ten reasons, as text you cannot act on. Meanwhile the settings
surface offers 117 notification toggles and three themes. The gap between what
the client knows and what it lets you decide is the entire product opportunity.

---

## 1. The feed already explains itself. Nobody is listening.

Every item in the home feed arrives with a `meta` block:

```ts
// packages/farcaster-client-data/src/types/api.ts:5365
export type ApiCastFeedItemMeta = {
  includeReason?: ApiCastFeedIncludeReason;
  labelReason?: string;
  score?: number;
  topHat?: ApiCastFeedItemTopHat;
  authorQuality?: ApiUserQuality;
};
```

`ApiCastFeedIncludeReason` is a ten-member union (`api.ts:5330`) — a
machine-readable answer to "why am I seeing this":

| Reason | What it means |
| --- | --- |
| `following-author` | you follow them |
| `evergreen-following-author` | you follow them, and it kept getting attention |
| `follow-of-follow` | people you follow follow them |
| `recasted-by-following` | someone you follow recasted it |
| `has-reply-by-followed` | someone you follow replied to it |
| `pinned-in-channel` | a channel host pinned it |
| `popular-in-channel` | it is doing well in a channel you follow |
| `popular` | it is popular right now |
| `high-quality-unfollowed` | the ranker thinks you might follow them |
| `snap-promoted` | someone paid to put it there |

Search the codebase for what happens to that field and you find two things.

**Most call sites are analytics.** `ProfileContent.tsx`, `Avatar.tsx`,
`Reactions.tsx`, `Recasts.tsx`, `Replies.tsx` and `Bookmarks.tsx` all attach
`includeReason` to a tracking event.

**One is a real label.** `SourceLabel.tsx` exists on both platforms and turns
the reason into a sentence — *"Recasted by people you follow"*, *"Trending"*,
*"This cast is similar to casts you engaged with."* Credit where it is due: the
reference client is not hiding the ranker. But three things limit it, and each
one is a design decision this client makes differently:

1. **It is mostly not on the cast.** On mobile it renders inside
   `CastInfoPrompt`; on web inside the `CastMenuActions` popover. You have to
   already suspect something and open a menu, one cast at a time. The one
   exception is the web-only `IncludeReasonTopHat`, which puts two of the ten
   reasons (`evergreen-following-author`, `high-quality-unfollowed`) above
   the row. Nothing about the feed as a whole is visible.
2. **It covers eight of ten reasons.** `following-author` and
   `evergreen-following-author` fall through to `undefined` and render nothing —
   so the single most common case in the feed is silent.
3. **It is passive.** Neither implementation contains a single `onPress`,
   `Pressable` or `onClick`. It is a caption, not a control. Learning why a cast
   is there leaves you with no way to change it, which is precisely the gap
   Meta's own research on "Why am I seeing this post?" identified: transparency
   without corresponding controls is not enough.

`meta.authorQuality`, meanwhile, has **zero** non-type references in the
entire repository, and `meta.score` reaches exactly one component: an internal
admin feed-comparison page (`AdminFeedContent.tsx`). The server computes a
ranking score for every cast, ships it over the wire, and no reader ever sees
it.

**This is the wedge.** Not that the reason data is unused — it is partly used —
but that it is used as a caption in a menu rather than as the handle on the
feed. Closing that gap needs no backend work: the field is already in the
payload, and the label already knows how to say it.

Prior art is unambiguous about why this matters: when Facebook shipped "Why am I
seeing this post?", their own research found [transparency into ranking wasn't
enough without corresponding
controls](https://about.fb.com/news/2021/12/changes-to-news-feed-in-2021/). The
explanation has to *be* the control. The data model here supports exactly that.

## 2. The customization budget is spent on notifications

`ApiUserPreferences` (`api.ts:649`) has **149 fields**. **117 of them** are
notification and email toggles — `sendWarpcastRebrandEmails`,
`pushAffinityMiniAppRecommendations`, `inAppDAOVoting`, and 114 more.

What the remaining 32 fields let you decide about the actual reading experience:

- `defaultFeed`: `'home' | 'following'` (`api.ts:784`)
- `replyFilterLevel`: `'low' | 'medium' | 'high'` (`api.ts:790`)
- `conversationRepliesShown`
- a few `expand*` flags for drawer sections

That is the whole surface. Two feed choices, one three-position reply filter.
The ratio tells the story: the client is highly configurable about *what
interrupts you* and nearly unconfigurable about *what you see*.

## 3. Changing your default feed asks you to restart the app

```ts
// apps/farcaster-mobile/src/screens/Feeds/FeedsScreen.tsx:72
toast.show('Restart your app to see your updated default feed!');
```

This is the tell. In a client where personalization is the product, a setting
that requires an app restart is not a rough edge — it is evidence that
preferences are plumbed as a server round-trip plus a cache purge rather than as
reactive local state. Every customization built on that foundation inherits the
latency.

## 4. 797 colour tokens, three choices

`packages/farcaster-expo/src/theme/colors.ts` defines 797 colour tokens.
`getTheme()` (`theme/index.ts:44`) composes them with typography, radii, icon
sizes, and 11,927 lines of generated Tailwind into a single theme object.

`AppThemeNames.ts` then reduces all of that to four themes:

```ts
export type AppThemeName = 'light' | 'dark' | 'holiday-light' | 'holiday-dark';
```

And `ThemeSettings.tsx` exposes three radio buttons — Dark, Light, System — plus
a gated "Festivecaster" toggle.

The architecture is already right: `getTheme(scheme)` is a pure function from a
name to a token set. Nothing about it requires the input to be one of four
strings. The design system can express any theme; the product exposes four.

No font size control. No density control. No accent colour. `fontScale` appears
exactly once in the mobile app, in tab-bar layout maths
(`HomeScreenScrollHandlers.tsx:353`), and never as something a reader can set.

## 5. Filtering is server-side, coarse, and permanent

Muting exists — `addMuteKeyword`, `addMutedChannel`, `fcBlockUser` are all in
the API client. The keyword model is:

```ts
// api.ts:1168
export type ApiMutedKeywordProperties = {
  frames: boolean;
  channels: boolean;
  notifications: boolean;
};
```

Three scope booleans. What is missing:

- **No expiry.** Every mute is forever. "Mute this conference for a week" is the
  case people actually have, and the one they never remember to undo.
- **No match mode.** No word boundaries, so muting `ai` collateral-damages
  *said*, *chain*, and *detail*.
- **No reason-based muting.** You cannot say "never show me
  `high-quality-unfollowed`", even though the server labels every such cast.
- **No receipts.** When a filter removes something you are told nothing. An
  unauditable filter is indistinguishable from a bug, and readers who suspect
  their client is eating posts stop trusting the filters they set themselves.

`replyFilterLevel` is a three-position dial whose semantics live entirely on the
server. You cannot see what it did.

## 6. There are no lists, and no user-defined feeds at all

Feed tabs are built in `HomeFeedPagers/Pagers.tsx`: `Home`, `Following`, then
favourited channels, ordered by `setFavoriteFeedPosition`. Every tab is either a
server-defined feed or a channel.

A reader cannot build a feed. There is no way to say "these 30 accounts", or
"anything matching this search", or "70% my design list, 30% home" — even though
`searchCasts` (`FarcasterApiClient.ts`) already exists and would back a saved
search directly.

This is the single most-cited reason power users leave for alt clients.
[Supercast](https://neynar.com/blog/spotlight-supercast) built a business on
lists and keyword muting; [Recaster](https://apps.apple.com/us/app/recaster/id6501970448)
on configurable home tabs and reverse-chronological feeds. Those are not exotic
features. They are the baseline the reference client does not meet.

## 7. Interaction is fixed

The cast row's action set is hard-coded. There is no swipe action, no
configurable double-tap, no reorderable action bar. `swipeEnabled={false}` in
`Feed.tsx:183` — gestures were given to the pager, so the cast row has none
left.

The bottom tab bar is five fixed screens (`BottomTabNavigator.tsx:146–191`):
Home, Apps, Wallet, Notifications, Direct Casts. You cannot reorder them, and
you cannot remove the ones you never open.

The web client has no global keyboard shortcut system. For a desktop client
whose users are keyboard-native developers, that is a conspicuous absence.

## 8. Nothing acknowledges that a session should end

There is no session timer, no daily budget, no quiet hours, no finite feed. The
feed is infinite, and the only stopping cue is the reader's own willpower.

This is not an oversight — it is the correct decision for an ad-supported
product, and Farcaster [pivoted to a wallet-first
model](https://www.altcoinbuzz.io/cryptocurrency-news/farcaster-shifts-strategy-after-missing-product-fit-for-years/)
after years of not finding social product-market fit. An independent client has
no such conflict. This is the clearest available axis on which to be plainly,
structurally better, and it is one no incumbent can follow.

---

## What this adds up to

Five things are true at once:

1. The server already ships per-item ranking explanations, and the client
   discards them.
2. The theme architecture already supports arbitrary themes, and the product
   exposes four.
3. The feed pipeline has exactly one place where a client-side filter and
   re-rank belongs — `useMixedFeedItems.ts:311`, where pages flatten into a
   render list — and it is currently a plain `flatMap`.
4. Everything power users leave for is absent: lists, saved searches,
   expiring mutes, word-boundary matching, chronological feeds, density.
5. Nothing in the product is on the reader's side about how long they stay.

None of this requires new backend work. Points 1 through 4 are client-side
changes against data the API already returns. That is what makes this worth
building rather than merely worth complaining about.

The design that follows is in [`docs/design/`](../design/README.md); the
architecture is implemented in
[`packages/home-personalization`](../../packages/home-personalization); the six call sites
that connect them to a fork are in
[`docs/integration/wiring-into-a-fork.md`](../integration/wiring-into-a-fork.md).

## Sources

Codebase claims cite `farcasterxyz/client` directly. External context:

- [Farcaster shifts strategy after missing product fit for years — Altcoin Buzz](https://www.altcoinbuzz.io/cryptocurrency-news/farcaster-shifts-strategy-after-missing-product-fit-for-years/)
- [Spotlight: Supercast — Neynar](https://neynar.com/blog/spotlight-supercast)
- [Recaster on the App Store](https://apps.apple.com/us/app/recaster/id6501970448)
- [Changes to News Feed in 2021 — Meta](https://about.fb.com/news/2021/12/changes-to-news-feed-in-2021/)
- [Requests for Startups for the Farcaster Ecosystem — Variant](https://variant.fund/articles/requests-startups-farcaster-ecosystem/)
- [awesome-farcaster — a16z](https://github.com/a16z/awesome-farcaster)
