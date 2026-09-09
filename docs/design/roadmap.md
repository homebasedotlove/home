# Roadmap

What to build in what order, and how to tell whether it worked.

The ordering rule: **each milestone should be independently shippable and
independently convincing.** Nothing here is a foundation-laying phase that pays
off three milestones later.

---

## M1 — Legibility

*The feed explains itself.*

- The adapter (`ApiCastFeedItem` → `FeedItemView`)
- Why-chips on every ranked cast
- The reason sheet, with *Less / None / More* wired to preferences
- Preferences provider over MMKV / localStorage
- Settings → Your data: export and import

**Why first:** one render change against a field the API already sends. No
backend work, no new fetch code, no schema negotiation. It is the cheapest thing
in this document and the most differentiating.

**Done when:** a reader can tap any cast and learn, truthfully, why it is there —
and act on the answer without leaving the feed.

**Watch:** what fraction of readers tap a chip in week one. If it is under 10%
the chip is too quiet or reads as decoration.

## M2 — Control

*The explanation becomes the handle.*

- The pipeline at the `flatItems` seam
- Sift: reason mutes, word-boundary keywords, expiring mutes, structural hides
- Sort: chronological, weighted, diversity caps
- Feed receipts, with per-rule and per-cast undo
- The mix dial

**Why second:** M1 taught the vocabulary; this makes it operational. Ship
receipts *with* filtering, never after — a filter without a ledger is
[indistinguishable from a bug](signature-interactions.md#3-feed-receipts), and
readers who suspect their client is eating posts stop setting filters at all.

**Done when:** a reader can meaningfully reshape their feed in under a minute,
see exactly what changed, and put it back.

**Watch:** the ratio of mutes created to mutes reverted. Healthy is *some*
reversion — near-zero means readers are afraid to experiment, and the undo path
is not visible enough.

## M3 — Composition

*Feeds become things you make.*

- FeedSpec-backed tabs, reorderable
- The feed editor with a live preview
- New sources: list, search, blend
- Share links, and the import preview screen
- Launch feed applied immediately

**Why third:** it needs M2's pipeline to be worth anything. A feed builder whose
output cannot be filtered or ranked is a channel picker.

**Done when:** a reader can build a feed, hand someone a link, and have them see
the same thing.

**Watch:** how many readers create a second feed, and how many open a shared
one. Sharing is the whole reason the format is JSON in a link; if nobody shares,
the format is over-engineered and the sharing affordance is buried.

## M4 — Appearance

*The palette opens.*

- `getTheme` accepts a `DerivedTheme`
- `colorsFromDerived`: the 10-role → 797-token mapping
- The seed editor with live preview and inline contrast warnings
- Density, font scale, media policy, counts off
- Per-feed skin overrides
- Theme share links

**Why here:** the largest mechanical change in the project and the one most
easily parallelised, but not the most differentiating. Custom themes are
table stakes elsewhere; a legible feed is not available anywhere.

**Done when:** a reader can build a theme they would not be embarrassed to
share, and cannot build one they cannot read.

**Watch:** contrast-warning rate in the editor. High is fine — it means the
guardrail is doing its job. What would be bad is readers abandoning the editor
mid-session, which means the warnings read as rejection rather than help.

## M5 — Boundaries

*The app takes the reader's side.*

- Session provider and usage accounting
- Budgets, quiet hours, wind-down
- Catch-up mode and the finite feed
- Honest usage numbers in Settings

**Why last, and why not optional:** it is the least dependent on everything else
and the most dependent on the rest of the client being good. Shipping a session
limiter on a mediocre feed reads as an apology. Shipping it on a feed the reader
built themselves reads as respect.

**Done when:** a reader can reach the end of their feed.

**Watch:** whether readers who enable a budget keep it enabled after a month.
The failure mode is a wellness feature that gets switched on once, felt as
nagging, and switched off — which would mean the copy is scolding somewhere.

## M6 — Depth

- Configurable action bar and gestures
- Tab bar composition
- Keyboard shortcuts on web
- Affinity boost, opt-in, on-device
- Preset configurations ("Morning", "Deep", "Social") and time-of-day switching

---

## The measure that matters

Not engagement. A client designed around
[Axis 6](the-six-axes.md#axis-6--boundaries-how-long-it-lasts) that then
optimises for time-on-app is lying to itself.

The number to watch is **how many readers have changed something** — any feed,
any rule, any theme — and, of those, how many changed something *more than
once*. The second visit to a control is the signal that customization is being
used as a tool rather than tried as a novelty.

A distant second: **shared configurations opened by someone other than their
author.** That is the number that would say taste has become portable, which is
the thing an open protocol is supposed to make possible and currently doesn't.
