# Home — the design

Home is a Farcaster client built on one bet: **the reader should be able to
change anything, and should never have to go looking for the switch.**

That second clause is the hard half. Customizable software usually fails in a
specific way — a settings screen grows to two hundred toggles, nobody opens it,
and the product ends up both harder to use *and* no more personal. The reference
client is already partway there: 117 notification toggles that most people never
touch, and almost no control over the thing they look at every day.

So the design is organised around **where a control lives**, not just what it
does.

## The documents

| | |
| --- | --- |
| [`principles.md`](principles.md) | The five rules everything else is derived from |
| [`the-six-axes.md`](the-six-axes.md) | The complete customization surface |
| [`signature-interactions.md`](signature-interactions.md) | The four moments that make the client feel different |
| [`information-architecture.md`](information-architecture.md) | Where every control lives, and why settings screens come last |
| [`roadmap.md`](roadmap.md) | What to build first, and how to tell if it worked |
| [`legible-feed.html`](legible-feed.html) | The visual spec, with a working mix dial — [published here](https://claude.ai/code/artifact/b4b7eae9-44ec-4198-9660-bc8161314756) |

The evidence these are responding to is in
[`../research/reference-client-audit.md`](../research/reference-client-audit.md).
The engine that implements them is
[`packages/personalization`](../../packages/personalization).

## The shape of it in one page

Everything a reader has chosen lives in **one serialisable document**. Not
server preferences plus local storage plus component state — one document, one
schema, one file. That single decision buys export, import, backup, presets,
diffing, sharing, and a settings search that can find everything, without any of
them being built separately.

Inside that document, feeds are the unit. A **FeedSpec** says where casts come
from, what gets removed, what comes first, and how it looks. It is JSON, so it
fits in a link. Your taste becomes as portable as your social graph already is —
which is the dividend an open protocol is supposed to pay, and currently
doesn't.

The feed itself is legible. The API already labels every cast with why it is
there; Home shows that label, and makes it tappable. **The explanation is the
control.** You do not tune your feed in Settings; you tune it from the feed, on
the post that annoyed you, and watch it change.

And Home takes a position no ad-funded client can: it is on the reader's side
about how long they stay. Session budgets, quiet hours, and a feed that can
*end* are first-class features, not a wellness afterthought.
