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
| [`packages/personalization/`](packages/personalization) | The engine, implemented and tested |

**Start with** [the audit](docs/research/reference-client-audit.md) for why, then
[the design](docs/design/README.md) for what.

There is also a visual design spec with a **working mix dial** — drag the
weights and watch a sample feed re-rank using the same maths as the kernel:
[The Legible Feed](https://claude.ai/code/artifact/b4b7eae9-44ec-4198-9660-bc8161314756)
(source: [`docs/design/legible-feed.html`](docs/design/legible-feed.html)).

## The short version

The Farcaster API already tells the client *why* every cast is in your feed —
a ten-member `includeReason` union, plus a ranking score, on every item. The
reference client forwards that to an analytics event and shows you nothing. It
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

## The kernel

[`packages/personalization`](packages/personalization) implements all of it as
pure TypeScript with **no dependencies** — no React, no React Native, no API
client, no storage engine. It runs identically on iOS, on the web, and in
`node --test`.

```
src/reasons/      the include-reason taxonomy, named for humans
src/feedspec/     FeedSpec, validation hardened against untrusted links, share codecs
src/pipeline/     filter → rank → report, pure and synchronous, receipts for everything
src/theme/        Oklab colour maths, seed → palette, enforced WCAG contrast
src/boundaries/   session budgets, quiet hours, the finite feed
src/prefs/        one settings document, migration that survives hostile input
```

```bash
cd packages/personalization
node --test 'test/*.test.ts'    # 88 tests, no install step
```

Requires Node 22.6+ for native TypeScript execution.

## Status

Design and kernel are done and tested. The client itself is not built yet — the
next step is a fork of [`farcasterxyz/client`](https://github.com/farcasterxyz/client)
with the kernel wired in at the [six call
sites](docs/integration/wiring-into-a-fork.md), starting with the why-chip.

## License

MIT. See [LICENSE](LICENSE).
