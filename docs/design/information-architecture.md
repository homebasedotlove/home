# Information architecture

Where every control lives.

The organising claim is [principle 2](principles.md): **a settings screen is a
repair shop, not a showroom.** Customization is discovered in the feed. Settings
exists so you can see everything you have accumulated, understand it, and undo
it.

---

## Layer 1 — In the feed (where discovery happens)

| Gesture | Opens | Reaches |
| --- | --- | --- |
| Tap a **why-chip** | Reason sheet | Reason weights, reason mutes, author/channel mute |
| **Pull past refresh** | Mix dial | All four group weights, sort mode, reset |
| Long-press a cast | Cast menu | Mute author (with expiry), mute channel, mute a phrase from this cast, "more like this" |
| Tap **"N hidden"** | Receipts | Every rule that fired, with per-rule and per-cast undo |
| Long-press the **feed tab** | Feed sheet | Rename, duplicate, edit, share, per-feed skin, delete |
| **Two-finger pinch** on the feed | Density | Comfortable / compact / dense, applied live |

Six gestures reach roughly 80% of the customization surface. None of them
require knowing that a settings screen exists.

## Layer 2 — The feed editor (where composition happens)

Reached from **+ New feed** in the feed switcher, or *Edit* on any existing
feed. One screen, four sections, a live preview pinned below that re-renders on
every change:

```
  Source      ▸  Home · Following · Channel · List · Search · Blend
  Sift        ▸  3 rules            "election", Suggested, @somebody
  Sort        ▸  Weighted           direct 1.4×, discovery 0.6×
  Skin        ▸  Compact, counts off
  ────────────────────────────────────────────
  Preview     ▸  [ live, scrollable, real casts ]
  ────────────────────────────────────────────
  [ Share ]   [ Duplicate ]   [ Save ]
```

The preview is not a mock. It runs the same
[`runFeedPipeline`](../../packages/home-personalization/src/pipeline/index.ts) call
the real feed does, over the currently cached page. If the change would empty
the feed, the preview says so before it is saved — the failure mode of powerful
filters is a silent empty feed and no idea which rule caused it.

**Share** produces a link. Opening someone's link lands on this same screen in
preview mode, with their rules shown and an *Add to my feeds* button — you see
what you are importing before it becomes yours, including a plain-language note
for anything the validator rejected or clamped.

## Layer 3 — Settings (where review and repair happen)

Six sections. Every one answers *"what have I accumulated, and how do I undo
it?"*

**Feeds** — all feeds, reorderable, which one opens on launch (applied
immediately, [not after a restart](../research/reference-client-audit.md#3-changing-your-default-feed-asks-you-to-restart-the-app)).

**Filters** — every rule in one place, across every feed: keywords, authors,
channels, reasons. Sortable by *most recently added* and *most casts hidden*,
which is the number that tells you whether a rule is doing what you thought.
Expiring rules show their countdown; expired ones sit in a *Lapsed* group
awaiting a decision.

**Appearance** — theme picker, and the theme editor: ten seeds, live preview,
contrast warnings inline next to the offending swatch rather than as a blocking
error. Density, font scale, media policy, counts.

**Interaction** — action bar order, the four gestures, tab bar composition,
keyboard shortcuts on web.

**Boundaries** — budgets, quiet hours, wind-down, catch-up. Plus honest usage
numbers, stated flatly and never as a judgement.

**Your data** — export everything as one JSON file, import, reset a section to
defaults, reset all. This section is short and it is the most important one:
it is what makes [principle 5](principles.md) true rather than aspirational.

### Settings search

One field at the top, searching **labels, descriptions, and current values**.
Typing `mute` finds the filters section, every keyword rule, and the mute
gesture binding. Typing `election` finds the specific rule.

This works because preferences are
[one document with one schema](../../packages/home-personalization/src/prefs/index.ts).
Search over a settings tree is only possible when there is a settings tree, and
that is the payoff for refusing to scatter state across a server object, local
storage, and component state.

---

## Where notifications go

Deliberately not a top-level section, and deliberately not 117 toggles.

Three modes — **Everything / Important / Off** — plus a *Customize* disclosure
containing the granular set for people who want it. The reference client's
notification surface is [78% of its entire preference
schema](../research/reference-client-audit.md#2-the-customization-budget-is-spent-on-notifications);
that ratio is the thing being corrected, and the correction is to fold it into a
disclosure rather than to delete it.

## The rule for adding anything new

Before a control ships, it has to answer three questions:

1. **What moment in ordinary use makes a reader want this?** If there isn't one,
   it belongs in a disclosure or nowhere.
2. **Where does it live in Layer 1?** If the answer is "only in Settings", it
   will be found by 2% of readers. Decide whether that is acceptable, out loud.
3. **How does a reader undo it, and how do they know it fired?** If the answer
   is "they don't", it is not finished.
