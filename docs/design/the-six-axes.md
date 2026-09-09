# The six axes

The complete customization surface, organised so it can be reasoned about rather
than listed. Each axis maps onto a field in
[`FeedSpec`](../../packages/home-personalization/src/feedspec/types.ts) or
[`Preferences`](../../packages/home-personalization/src/prefs/index.ts), so "what can
I change" and "what is in the export file" are the same question.

Legend: **▸ new** — absent from the reference client. **▸ better** — exists, but
poorly.

---

## Axis 1 — Source: where casts come from

| Source | Notes |
| --- | --- |
| `home` | The ranked server feed. The only source carrying include-reasons. |
| `following` | Strict reverse-chronological. Nothing added, nothing ranked. **▸ better** — exists as a tab, not as something you can shape. |
| `channel` | One channel. |
| `list` **▸ new** | A reader-curated set of accounts. The single most-cited reason power users leave for alt clients. |
| `search` **▸ new** | A saved query as a live feed. Backed by the existing `searchCasts` endpoint — no new API. |
| `blend` **▸ new** | Several sources at fixed proportions: *70% my design list, 30% home*. |

Blends are the interesting one. They let a reader keep discovery without letting
it take over — the complaint about algorithmic feeds is rarely "no discovery",
it is "discovery ate my feed". A proportion is a more honest control than a
toggle because it matches how people actually describe the problem.

## Axis 2 — Sift: what gets removed

Everything here produces a **receipt**: the item, the rule that fired, and a
one-tap undo. See [principle 3](principles.md).

- Mute by **include-reason** or reason group **▸ new** — *"never show me
  Suggested"*. Only possible because the API labels every cast; see the
  [audit](../research/reference-client-audit.md#1-the-feed-already-explains-itself-nobody-is-listening).
- Keyword mutes with **word-boundary matching** **▸ better** — muting `ai` stops
  hitting *said*, *chain*, *detail*. Unicode-aware, so it works on Japanese and
  Cyrillic too, which `\b` does not.
- **Expiring mutes** **▸ new** — *"mute 'conference' for 7 days"*. The case
  people actually have. Expired rules surface for review rather than silently
  reactivating content the reader forgot they hid.
- Mute by **embed kind** **▸ new** — no token charts, no mini-app promos.
- **Author quality and score floors** **▸ new** — using `meta.authorQuality` and
  `meta.score`, both currently unread by the reference client. `ApiUserQuality`
  is not a three-tier ladder — it is `harmful | spam | automated | low | neutral
  | high | unranked` — and `unranked` is exempt from the floor by design. A
  quality filter that silently hid every account the server has not scored yet
  would mostly hide new accounts: an invisible harm the reader did not ask for
  and could not diagnose.
- Structural hides **▸ new** — replies, recasts, textless link-drops.
- Muted authors and channels **▸ better** — same as today, plus expiry and notes.

## Axis 3 — Sort: what comes first

- **Server** — the ranking as sent. The default, because it is good.
- **Chronological** **▸ better** — genuinely reverse-chronological, available on
  any source rather than only the Following tab.
- **Weighted** **▸ new** — multipliers per reason group. *More from people I
  follow, less from strangers.*

Two implementation choices matter to how this feels:

**Scores are rank-normalised before weights apply.** `meta.score` arrives on an
undocumented scale the server may change. Treating it as a percentile within the
current batch means the reader's weights mean the same thing next week as this
week. It also lets scored and unscored items coexist without one class swamping
the other. The normalisation maps onto an *open* interval — position `p` of `n`
becomes `(p+1)/(n+1)` — because with a closed interval the lowest-scored item
normalises to exactly zero, and zero times any weight is still zero: the slider
would visibly move and silently do nothing for that item.

**Raw engagement counts are not an input.** Re-ranking on likes on-device would
rebuild the popularity contest the reader opened this feed to escape, using
worse data than the server has.

Plus:

- **Recency half-life** **▸ new** — how fast good posts fall. Low is restless,
  high is calm.
- **Affinity boost** **▸ new** — weight accounts you actually engage with, from
  on-device history that never leaves the device. Off by default; a client that
  silently re-ranks by your own click history is doing the thing you left.
- **Diversity caps** **▸ new** — max N per author or channel in a window.
  Over-cap items are *deferred, never dropped*: removing a post because someone
  posted four times is a judgement the reader did not ask for, and moving it
  down the page gives the same relief while losing nothing.

## Axis 4 — Skin: how it looks

- **Density**: comfortable / compact / dense **▸ new**
- **Media policy**: always / wifi / tap-to-load / never **▸ better** — exists as
  a data-usage setting, not as a reading preference
- **Themes from seeds** **▸ better** — ten decisions, not 797 tokens and not
  three presets. Background, foreground, accent, three status colours, radius,
  font scale, font stack. Everything else derives.
- **Contrast is enforced, not assumed.** Every derived text colour is checked
  against the surface it lands on and nudged along the lightness axis until it
  clears WCAG AA, preserving hue. A reader who picks a pale yellow accent gets a
  readable yellow. *You cannot build an unreadable theme* — which is what makes
  it safe to let people build any theme.
- **Font scale** **▸ new** — independent of OS scaling
- **Hide engagement counts** **▸ new** — reading without a scoreboard
- **Absolute timestamps** **▸ new**
- **Per-feed skin overrides** **▸ new** — a Quiet feed can be calmer than the
  rest of the app without changing the app
- **Theme share links** **▸ new** — ten decisions fit in a URL. An imported
  theme cannot be unreadable, because the palette is repaired rather than
  trusted, so the worst a stranger's link can do is look ugly.

## Axis 5 — Motion: how it behaves

- **Configurable action bar** **▸ new** — pick and order the cast-row actions.
  First four inline, rest in the menu.
- **Gestures** **▸ new** — swipe left, swipe right, double-tap, long-press, each
  bound to any action. The reference client gave the horizontal gesture to the
  pager and left the cast row with none.
- **Tab bar** **▸ new** — choose and order 2–5 tabs. Remove the ones you never
  open.
- **Keyboard shortcuts** (web) **▸ new** — the reference web client has no
  global shortcut system, for an audience that is keyboard-native.
- **Launch feed** **▸ better** — which feed opens first, applied *immediately*,
  not after a restart.

## Axis 6 — Boundaries: how long it lasts

The axis no ad-funded client will ship, because a session that ends on purpose
is revenue left on the table. An independent client has no conflict here, which
makes it the clearest place to be structurally better.

- **Session and daily budgets** — soft. The tighter of the two governs, so two
  counters never disagree.
- **Wind-down** — colour drains as the budget runs out. A gradient is a better
  signal than a modal: noticeable without demanding a decision, and impossible
  to dismiss into meaninglessness.
- **Quiet hours** — including windows that wrap past midnight, which most do.
- **Catch-up mode** — a *finite* feed: everything since your last visit, then it
  ends. Infinite scroll is not a feature anyone asked for; it is the absence of
  a stopping cue.
- **Counts off** — see Axis 4. Belongs to both.

Nothing here blocks anything. A client that locks its reader out breeds
workarounds; one that tells the truth about time spent and then gets out of the
way gets used. "Keep reading" is always one tap away, and the copy never scolds —
*"That's 30 minutes. Good place to stop."*, not *"You've been scrolling too
long."*

---

## What this deliberately does not include

- **Custom ranking code.** A FeedSpec is declarative data, not a program.
  Executable feed rules would be a remote-code-execution surface in a share
  link, and share links are the point.
- **Weights above 4×.** A slider that can annihilate every other signal produces
  a feed the reader did not intend and cannot diagnose.
- **Boosting promoted content.** Promoted casts can be reduced or removed, never
  amplified. A client that lets you turn the ad dial *up* is not being honest
  about whose interest it serves.
- **Server-side custom feeds, for now.** Everything above runs on-device against
  data the API already returns. That keeps the first release independent of
  backend work, and keeps the reader's rules on the reader's device.
