# Signature interactions

Four moments. If a reader encounters only these, they should already understand
what Home is for.

Everything else in [the six axes](the-six-axes.md) is reachable through them —
which is the point of [principle 2](principles.md): controls live next to what
they control, and these are the four places "next to" means something.

---

## 1. The why-chip

**Where:** on every cast in a ranked feed, in the metadata line next to the
timestamp.

A small label: *Following*, *Recasted*, *Popular in /design*, *Suggested*,
*Promoted*. Reads as context, not chrome. In a `following` or `list` feed there
is nothing to explain, so no chip appears — the absence is itself information.

**Tap it** and a sheet opens:

```
  Popular
  You're seeing this because it is popular right now.
  Ranked 0.71 — higher than most of what's in this feed.

  [ Less of this ]  [ None of this ]  [ More of this ]
  [ Mute @author ]  [ Mute /channel ]
```

*Less* nudges the group weight down a step and re-ranks the visible feed
immediately. *None* mutes the reason and the cast disappears with an undo
snackbar. *More* nudges up — except on Promoted, where it is absent, because
[that dial only turns one way](the-six-axes.md#what-this-deliberately-does-not-include).

Why this is the first thing built: it costs one render change against
`meta.includeReason`, a field the reference client already receives and
[throws away](../research/reference-client-audit.md#1-the-feed-already-explains-itself-nobody-is-listening).
No backend work. And it teaches the entire mental model — *your feed is made of
named parts, and you own the parts* — without a single word of onboarding copy.

## 2. The mix dial

**Where:** pull the feed down past the refresh threshold and keep pulling.

The feed lifts to reveal a compact panel: a stacked bar of the composition of
what you are looking at right now.

```
  Your feed right now
  ████████████░░░░░░░░░░░░░░░░  42%  People you follow
  ██████████░░░░░░░░░░░░░░░░░░  31%  Through your network
  ███████░░░░░░░░░░░░░░░░░░░░░  24%  Discovery
  █░░░░░░░░░░░░░░░░░░░░░░░░░░░   3%  Promoted
```

Drag a bar. The feed behind it re-orders live, under your thumb, at 60fps —
which is why the
[pipeline](../../packages/home-personalization/src/pipeline/index.ts) is pure and
synchronous and allocates no regexes.

Release to keep it. There is a *Reset* affordance, and closing without releasing
discards.

This is the demo. **"Pull down to see why your feed looks like this, and drag to
change it."** Nobody else has it, because nobody else surfaces the reason data —
and the reason data is right there in the payload.

The panel is also the honest place to admit uncertainty: casts arriving without
a reason are shown as *Unattributed*, not silently bucketed into a category that
sounds plausible.

## 3. Feed receipts

**Where:** a quiet line at the bottom of each loaded page.

```
  14 casts hidden on this page.  See why →
```

Tapping opens the ledger for the current session, grouped by rule:

```
  "election"  (word, expires in 5 days)      8 hidden   [ Unmute ]
  Suggested                                   4 hidden   [ Turn back on ]
  @somebody                                   2 hidden   [ Unmute ]
```

Each row expands to the actual casts, each individually restorable.

This exists because **an unauditable filter is indistinguishable from a bug**. A
reader who suspects their client is quietly eating posts stops trusting the
filters they set themselves — and then stops setting them. The ledger is what
makes aggressive muting safe enough to be worth doing.

It also handles the mute-expiry problem the reference client has no answer to.
When rules lapse, Home surfaces them once — *"3 mutes ended this week. Want them
back?"* — rather than silently reopening the floodgates on content the reader
has forgotten they ever hid.

## 4. Wind-down

**Where:** the whole app, gradually, if the reader turned it on.

Past 75% of a session or daily budget, colour begins to drain from the interface.
Not a modal, not a lock — the saturation curve moves, slowly enough that you
notice it the way you notice the light changing in a room.

At the budget:

> **That's 30 minutes. Good place to stop.**
> [ Keep reading ]

The feed is still there. The button works. Nothing is taken away.

Paired with **catch-up mode**, this is the sharpest thing Home does. Catch-up
shows everything since your last visit and then *ends* — a feed with a bottom.
The end-state distinguishes the two sentences that matter:

- *You're caught up.* — nothing new since last time.
- *That's everything since Tuesday. There's more below if you want it.* — you
  chose to stop, and Home is telling the truth about what it withheld.

No ad-funded client will ship this. That is precisely why it should be in the
first release, not the third: it is the feature that explains, in one screen, why
Home exists.

---

## What ties them together

Each one is the same move: **take a decision the software was making silently,
name it, and hand the reader the handle.**

- The why-chip names the ranker's decision.
- The mix dial names the ranker's proportions.
- Receipts name the filter's decisions.
- Wind-down names the decision to keep going.

None of them is a settings screen. All four are encountered in the course of
ordinary reading, by readers who never went looking. That is the whole design.
