# Principles

Five rules. Everything else in this design is derived from them, and any feature
that violates one is wrong even if it tests well.

---

## 1. The explanation is the control

Transparency without control is a shrug. Control without transparency is a
gamble. Meta's own research on "Why am I seeing this post?" landed here: people
told them [transparency wasn't enough without corresponding
controls](https://about.fb.com/news/2021/12/changes-to-news-feed-in-2021/).

So in Home they are the same object. The chip that says *Popular* is the button
that turns *Popular* down. There is no separate screen where you go to act on
what you just learned, because that screen is where intent goes to die.

**Test:** every explanation Home shows can be acted on with one tap, without
navigating away.

## 2. Controls live next to what they control

A setting reachable only from a settings screen will be found by the 2% of
readers who go looking. The same setting reachable from the thing it affects
will be found by everyone who is bothered by that thing — which is exactly the
population that wants it.

Density is changed while looking at density. Mutes are created from the post
that prompted them. Feed weights are adjusted with the feed visible behind them.
Settings screens still exist, but as a **review and repair** surface: somewhere
to see everything you have accumulated and undo it. Not the place customization
is discovered.

**Test:** for every control, name the moment in normal use when a reader would
want it. If there isn't one, the control is in the wrong place — or shouldn't
exist.

## 3. Instant, visible, reversible

The reference client's default-feed setting shows a toast reading *"Restart your
app to see your updated default feed!"* That is the anti-pattern in one line.

Every change in Home applies to the visible feed on the next frame. Every change
is undoable from the same place it was made. Filtering keeps **receipts** — a
ledger of what was removed and why, with one-tap restore.

Reversibility is not a safety feature; it is what makes people brave enough to
customize at all. A reader who believes a slider might permanently ruin their
feed will not touch the slider.

**Test:** can the reader see the effect within one second, and undo it within
one tap?

## 4. Opinionated defaults, no cages

"Customizable" is not an excuse to ship a blank product and call configuration
the feature. Home is good before you touch anything: sensible density, a working
feed, three starter feeds that demonstrate the range.

The difference from the reference client is not that Home has fewer opinions. It
is that every opinion is **inspectable and changeable in the same UI that
displays it.** Defaults are a starting position, visibly so.

**Test:** a reader who changes nothing should have a better day than they would
in the reference client. A reader who changes everything should not hit a wall.

## 5. Your configuration is data, and it is yours

Preferences are one JSON document. Export it, read it, edit it, hand it to
someone, import theirs. Feeds and themes each fit in a link.

On an open protocol, your social graph is already portable. Your *taste* — the
accumulated work of teaching a client what you want — should be too. Today it is
the one thing every client still locks in.

This also means Home can be **audited**. Nothing is hidden in a preference the
reader cannot see, and "what is my setup" is always a question with a complete
answer.

**Test:** can a reader export everything, diff two configurations, and restore
on a new device without losing anything?

---

## The rule these produce together

> **Every automatic decision Home makes about a reader's feed is visible, named,
> attributable, and reversible — from the feed itself.**

That sentence is the product. Everything in [`the-six-axes.md`](the-six-axes.md)
is an application of it.
