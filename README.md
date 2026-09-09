# home

A Farcaster client built on one bet: **you should be able to change anything,
and you should never have to go looking for the switch.**

The protocol already made your social graph portable. Your *taste* — the
accumulated work of teaching a client what you want to see — is still locked in.
Home is an attempt to unlock it.

## Where things are

| | |
| --- | --- |
| [`docs/research/`](docs/research/reference-client-audit.md) | What the reference client leaves on the table, with citations |
| [`docs/design/`](docs/design/README.md) | Principles, the six customization axes, the four signature interactions, information architecture, roadmap |
| [`docs/integration/`](docs/integration/wiring-into-a-fork.md) | The six call sites that connect the kernel to a fork of `farcasterxyz/client` |
| [`packages/home-personalization/`](packages/home-personalization) | The engine, implemented and tested |

**Start with** [the audit](docs/research/reference-client-audit.md) for why, then
[the design](docs/design/README.md) for what.

There is also a visual design spec with a **working mix dial** — drag the
weights and watch a sample feed re-rank using the same maths as the kernel:
[The Legible Feed](https://claude.ai/code/artifact/b4b7eae9-44ec-4198-9660-bc8161314756)
(source: [`docs/design/legible-feed.html`](docs/design/legible-feed.html)).

## The short version

The Farcaster API already tells the client *why* every cast is in your feed —
a ten-member `includeReason` union, plus a ranking score, on every item. The
reference client shows that only in a menu, one cast at a time, for eight of the
ten reasons, as text you cannot act on — and drops the score entirely. It
also ships 797 colour tokens behind three theme buttons, and 117 notification
toggles against two feed choices.

So Home:

- **Shows the reason on every cast, and makes it the control.** Tap *Popular* to
  turn Popular down. The explanation and the handle are the same object.
- **Makes feeds things you build.** Source, filters, ranking, and appearance in
  one JSON document that fits in a link. Lists, saved searches, blends.
- **Keeps receipts.** Every removal is logged with the rule that caused it and a
  one-tap undo. An unauditable filter is indistinguishable from a bug.
- **Opens the palette safely.** Themes are ten decisions, not 797 tokens — and
  every derived colour is contrast-checked, so you cannot build a theme you
  cannot read.
- **Lets a session end.** Budgets, quiet hours, and a catch-up feed with a
  bottom. No incumbent will ship this; that is the point.

## The code

Three packages, no runtime dependencies, pinned to the same Node the reference
client uses (20.19.5) and built with its prettier config and tsconfig shape.

| | |
| --- | --- |
| [`home-personalization`](packages/home-personalization) | The kernel: reasons, FeedSpec, the filter/rank pipeline, Oklab theming, boundaries, preferences. No React, no API client, no storage engine. |
| [`farcaster-adapter`](packages/farcaster-adapter) | The type boundary, and the replacement for the reference client's feed `flatMap`. |
| [`home-client-core`](packages/home-client-core) | Everything between storage and the screen, with no screen. |

```bash
pnpm install
pnpm check:all                          # format, typecheck, build, test, compat
pnpm --filter home-client-core demo     # watch the whole mechanism run
```

The demo drives a cold start, a reader tapping a why-chip, a mute expiring after
a week, a session budget winding down, catch-up ending the feed, and a config
moving to a new device — printing the feed at each step. Every claim in
[`docs/design`](docs/design/README.md) is observable there without a simulator,
an API key, or a phone.

### Staying compatible

```bash
SNAPSHOT=../client pnpm verify:compat
```

Compiles the adapter against the snapshot's own generated `api.ts`, asserting
the shape of all 34 fields it reads plus exact equality on the two enumerations
Home mirrors. `pnpm verify:compat:drift` then mutates upstream eleven ways and
fails if any goes undetected — a compatibility check that cannot fail is worse
than no check. Both run in CI.

## Status

The design, the kernel, the adapter, and the client core are done: 204 tests,
green against snapshot `b6922e2`. The React layer is not built yet — the next
step is a fork of [`farcasterxyz/client`](https://github.com/farcasterxyz/client)
with `home-client-core` wired in at the [six call
sites](docs/integration/wiring-into-a-fork.md), starting with the why-chip.

## License

MIT. See [LICENSE](LICENSE).
