import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

import { homeFeedPage, NOW, feedItem } from 'farcaster-adapter';
import type { CastFeedItemLike } from 'farcaster-adapter';
import {
  addFeed,
  contrastRatio,
  decodeShare,
  emptySift,
  encodeShare,
  exportPreferences,
  makeFeedSpec,
  memoryStore,
  muteKeyword,
  muteReasonGroup,
  nudgeReason,
  removeFeed,
  setActiveFeed,
  WCAG_AA_TEXT,
} from 'home-personalization';
import type { KVStore } from 'home-personalization';

import { HomeClient } from '../src/client';

const MIN = 60_000;
const HOUR = 3_600_000;

/** A store that survives being handed to a second client, like a real device. */
function device(): KVStore & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getString: (k) => map.get(k),
    setString: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

function client(store: KVStore, at: { ms: number }, page = homeFeedPage()) {
  return new HomeClient({
    store,
    fetchFeed: async () => page,
    now: () => at.ms,
    // Fixed local calendar so day rollover is tested, not the CI timezone.
    date: (ms) => new Date(ms),
  });
}

describe('end to end: a reader who has never opened the app', () => {
  test('cold start renders a working feed with no stored state', async () => {
    const at = { ms: NOW };
    const home = client(device(), at);

    assert.deepEqual(
      home.startupNotes,
      [],
      'nothing to apologise for on first run',
    );
    assert.equal(
      home.feeds.length,
      3,
      'a feed is a thing you can have more than one of',
    );
    assert.equal(home.activeFeed.id, 'home');

    const feed = await home.renderFeed();
    assert.equal(feed.items.length, 12, 'server order, nothing filtered');
    assert.equal(feed.hiddenSummary, undefined);
    assert.equal(feed.mix.total, 12);
    assert.ok(feed.mix.byGroup.direct! > 0 && feed.mix.byGroup.promoted === 1);
    assert.equal(
      feed.boundary.status,
      'open',
      'no budget set means no interference',
    );
    assert.ok(
      contrastRatio(feed.theme.text.primary, feed.theme.background.default) >=
        WCAG_AA_TEXT,
    );
    assert.equal(
      feed.skin.showWhyChips,
      true,
      'the reasons are visible by default',
    );
  });

  test('every visible cast can explain itself', async () => {
    const home = client(device(), { ms: NOW });
    const feed = await home.renderFeed();
    const withReasons = feed.items.filter((i) => i.meta?.includeReason?.type);
    assert.equal(
      withReasons.length,
      feed.items.length,
      'no unexplained casts in a ranked feed',
    );
  });

  test('the Quiet starter feed is materially quieter', async () => {
    const home = client(device(), { ms: NOW });
    const quiet = await home.renderFeed('quiet');
    assert.ok(quiet.items.length < 12);
    assert.equal(
      quiet.mix.byGroup.promoted,
      undefined,
      'no promoted casts at all',
    );
    assert.equal(quiet.mix.byGroup.discovery, undefined);
    assert.equal(quiet.skin.hideCounts, true, 'reading without a scoreboard');
    assert.ok(quiet.hiddenSummary);
  });
});

describe('end to end: tapping a why-chip changes the feed', () => {
  test('Less on Discovery demotes it and the change persists', async () => {
    const store = device();
    const at = { ms: NOW };
    const home = client(store, at);

    const before = await home.renderFeed();
    const beforeOrder = before.items.map((i) => i.id);

    // The whole path from a tap to a changed feed.
    home.update((p) => nudgeReason(p, 'home', 'discovery', 'down'));
    home.update((p) => nudgeReason(p, 'home', 'direct', 'up'));

    const after = await home.renderFeed();
    assert.notDeepEqual(
      after.items.map((i) => i.id),
      beforeOrder,
      'the feed visibly moved',
    );
    assert.equal(
      after.items.length,
      before.items.length,
      'a weight is not a filter',
    );

    const firstReason = after.items[0]!.meta!.includeReason!.type;
    assert.ok(
      ['following-author', 'evergreen-following-author'].includes(firstReason),
      `expected a followed author on top, got ${firstReason}`,
    );

    // A second client on the same device sees the same feed.
    const reopened = client(store, at);
    const persisted = await reopened.renderFeed();
    assert.deepEqual(
      persisted.items.map((i) => i.id),
      after.items.map((i) => i.id),
    );
  });

  test('None removes the category and the ledger says which rule did it', async () => {
    const home = client(device(), { ms: NOW });
    home.update((p) => muteReasonGroup(p, 'home', 'promoted'));

    const feed = await home.renderFeed();
    assert.equal(
      feed.items.some((i) => i.meta?.includeReason?.type === 'snap-promoted'),
      false,
    );
    assert.equal(feed.hiddenSummary, '1 cast hidden on this page.');

    const group = feed.receiptGroups.find((g) => g.rule === 'promoted');
    assert.ok(group, 'the reader can see exactly what fired');
    assert.equal(group.cause, 'muted-group');
    assert.equal(group.count, 1);
    assert.equal(group.itemIds.length, 1);
  });

  test('promoted cannot be boosted however many times it is tapped', async () => {
    const home = client(device(), { ms: NOW });
    for (let i = 0; i < 10; i++) {
      home.update((p) => nudgeReason(p, 'home', 'promoted', 'up'));
    }
    assert.equal(home.activeFeed.sort.weights.promoted, 1);
  });
});

describe('end to end: a mute that expires on its own', () => {
  test('hides now, lapses later, and asks before coming back', async () => {
    const store = device();
    const at = { ms: NOW };
    const home = client(store, at);

    home.update((p) =>
      muteKeyword(p, 'home', 'brooklyn', { forMs: 7 * 24 * HOUR, now: at.ms }),
    );

    const muted = await home.renderFeed();
    assert.equal(
      muted.items.some((i) => i.cast.text.includes('brooklyn')),
      false,
    );
    const group = muted.receiptGroups.find((g) => g.rule === 'brooklyn')!;
    assert.equal(group.cause, 'muted-keyword');
    assert.equal(home.lapsedRules().keywords.length, 0, 'still live');

    // A week and a minute later.
    at.ms = NOW + 7 * 24 * HOUR + MIN;
    const later = client(store, at);
    const back = await later.renderFeed();
    assert.equal(
      back.items.some((i) => i.cast.text.includes('brooklyn')),
      true,
    );
    assert.equal(back.hiddenSummary, undefined);
    assert.equal(
      later.lapsedRules().keywords.length,
      1,
      'surfaced for review rather than silently reactivated',
    );
  });

  test('word matching does not collateral-damage innocent casts', async () => {
    const page: CastFeedItemLike[] = [
      feedItem('a', {
        reason: 'following-author',
        cast: { text: 'thoughts on ai today' },
      }),
      feedItem('b', {
        reason: 'following-author',
        cast: { text: 'she said nothing' },
      }),
      feedItem('c', {
        reason: 'following-author',
        cast: { text: 'a chain of detail' },
      }),
    ];
    const at = { ms: NOW };
    const home = client(device(), at, page);
    home.update((p) => muteKeyword(p, 'home', 'ai'));
    const feed = await home.renderFeed();
    assert.deepEqual(
      feed.items.map((i) => i.id),
      ['b', 'c'],
    );
  });
});

describe('end to end: boundaries', () => {
  test('a session budget winds down and then says so, without locking anyone out', async () => {
    const store = device();
    const at = { ms: NOW };
    const home = client(store, at);
    home.update((p) => ({
      ...p,
      boundaries: { ...p.boundaries, sessionBudgetMinutes: 20, windDown: true },
    }));

    home.foreground();
    assert.equal((await home.renderFeed()).boundary.status, 'open');

    at.ms = NOW + 16 * MIN;
    const winding = await home.renderFeed();
    assert.equal(winding.boundary.status, 'winding-down');
    assert.ok(winding.boundary.desaturation > 0);
    assert.ok(winding.items.length > 0, 'the feed is still there');

    at.ms = NOW + 21 * MIN;
    const over = await home.renderFeed();
    assert.equal(over.boundary.status, 'session-over');
    assert.equal(
      over.boundary.message,
      "That's 20 minutes. Good place to stop.",
    );
    assert.ok(over.items.length > 0, 'nothing is taken away');
    assert.doesNotMatch(over.boundary.message!, /should|too much|wasted/i);
  });

  test('backgrounding stops the clock', async () => {
    const at = { ms: NOW };
    const home = client(device(), at);
    home.update((p) => ({
      ...p,
      boundaries: { ...p.boundaries, sessionBudgetMinutes: 20 },
    }));

    home.foreground();
    at.ms = NOW + 5 * MIN;
    home.background();
    at.ms = NOW + 5 * HOUR;
    const feed = await home.renderFeed();
    assert.equal(
      feed.boundary.status,
      'open',
      'five hours asleep cost nothing',
    );
  });

  test('catch-up gives the feed a bottom, and distinguishes the two endings', async () => {
    const store = device();
    const at = { ms: NOW };
    const home = client(store, at);
    home.update((p) => ({
      ...p,
      boundaries: { ...p.boundaries, catchUp: true },
    }));

    // Reader has seen everything older than three hours ago.
    home.markRead(NOW - 3 * HOUR);
    const fresh = await home.renderFeed();
    assert.ok(fresh.items.length > 0 && fresh.items.length < 12);
    assert.equal(
      fresh.moreAvailable,
      true,
      'told the truth about what it withheld',
    );
    assert.equal(fresh.caughtUp, false);
    assert.ok(fresh.items.every((i) => i.timestamp > NOW - 3 * HOUR));

    // Now they reach the newest cast.
    home.markRead(NOW + 1);
    const done = await home.renderFeed();
    assert.deepEqual(done.items, []);
    assert.equal(
      done.caughtUp,
      true,
      "'you're caught up' is a different sentence",
    );
  });
});

describe('end to end: affinity stays off until asked for', () => {
  test('engagement history changes nothing at the default boost', async () => {
    const at = { ms: NOW };
    const home = client(device(), at);
    const before = (await home.renderFeed()).items.map((i) => i.id);

    for (let i = 0; i < 20; i++) home.recordInteraction(474, 'reply');
    const after = (await home.renderFeed()).items.map((i) => i.id);
    assert.deepEqual(
      after,
      before,
      'a client that silently re-ranks by click history is the thing you left',
    );
  });

  test('and reorders once the reader opts in', async () => {
    const at = { ms: NOW };
    const home = client(device(), at);
    home.update((p) =>
      addFeed(
        p,
        makeFeedSpec(
          'tuned',
          'Tuned',
          { kind: 'home' },
          {
            sort: {
              mode: 'weighted',
              weights: {},
              recencyHalfLifeHours: 720,
              affinityBoost: 1,
              diversity: {},
            },
          },
        ),
      ),
    );

    const rankOf = (ids: string[], fid: number, page = homeFeedPage()) =>
      ids.findIndex(
        (id) => page.find((p) => p.id === id)!.cast.author.fid === fid,
      );

    const before = (await home.renderFeed('tuned')).items.map((i) => i.id);
    for (let i = 0; i < 10; i++) home.recordInteraction(239, 'reply');
    const after = (await home.renderFeed('tuned')).items.map((i) => i.id);

    assert.notDeepEqual(after, before);
    assert.ok(
      rankOf(after, 239) < rankOf(before, 239),
      'the author they engage with moves up',
    );
    assert.equal(after.length, before.length, 'a boost is not a filter');
  });

  test('but affinity nudges rather than overrides', async () => {
    // Deliberate: the multiplier tops out at 2x, so engaging with someone
    // cannot bury a cast the server scored far higher. A client where one
    // reply rewrites the whole ranking is not a boost, it is a different feed
    // the reader did not ask for.
    const at = { ms: NOW };
    const home = client(device(), at);
    home.update((p) =>
      addFeed(
        p,
        makeFeedSpec(
          'tuned',
          'Tuned',
          { kind: 'home' },
          {
            sort: {
              mode: 'weighted',
              weights: {},
              recencyHalfLifeHours: 720,
              affinityBoost: 1,
              diversity: {},
            },
          },
        ),
      ),
    );
    for (let i = 0; i < 50; i++) home.recordInteraction(239, 'reply');
    const top = (await home.renderFeed('tuned')).items[0]!;
    assert.equal(
      top.cast.author.fid,
      5650,
      'the top-scored cast still leads despite heavy engagement elsewhere',
    );
  });
});

describe('end to end: a configuration moves to a new device', () => {
  test('export, import, and the feed comes out identical', async () => {
    const oldPhone = device();
    const at = { ms: NOW };
    const home = client(oldPhone, at);

    home.update((p) => muteReasonGroup(p, 'home', 'promoted'));
    home.update((p) => muteKeyword(p, 'home', 'brooklyn'));
    home.update((p) => nudgeReason(p, 'home', 'direct', 'up'));
    home.update((p) => ({
      ...p,
      skin: { ...p.skin, density: 'compact', hideCounts: true },
    }));
    home.update((p) => setActiveFeed(p, 'home'));

    const original = await home.renderFeed();
    const backup = exportPreferences(home.preferences);

    const newPhone = device();
    newPhone.setString('home.preferences.v2', backup);
    const restored = client(newPhone, at);
    assert.deepEqual(restored.startupNotes, []);

    const migrated = await restored.renderFeed();
    assert.deepEqual(
      migrated.items.map((i) => i.id),
      original.items.map((i) => i.id),
    );
    assert.deepEqual(migrated.mix, original.mix);
    assert.equal(migrated.skin.density, 'compact');
    assert.equal(migrated.hiddenSummary, original.hiddenSummary);
  });

  test('corrupt storage falls back rather than bricking the cold start', async () => {
    const broken = device();
    broken.setString('home.preferences.v2', '{ not json');
    broken.setString('home.session.v1', 'garbage');
    broken.setString('home.affinity.v1', '[[[');

    const home = client(broken, { ms: NOW });
    assert.equal(home.startupNotes.length, 1);
    assert.match(home.startupNotes[0]!, /could not be read/);
    const feed = await home.renderFeed();
    assert.equal(feed.items.length, 12, 'the app still works');
  });

  test('a feed shared as a link produces the same ranking for the recipient', async () => {
    const at = { ms: NOW };
    const author = client(device(), at);
    const spec = makeFeedSpec(
      'curated',
      'Curated',
      { kind: 'home' },
      {
        sift: {
          ...emptySift(),
          mutedGroups: ['promoted'],
          keywords: [{ pattern: 'gm', mode: 'word' }],
        },
        sort: {
          mode: 'weighted',
          weights: { direct: 2, discovery: 0.5 },
          recencyHalfLifeHours: 12,
          affinityBoost: 0,
          diversity: { maxPerAuthor: 2, window: 10 },
        },
        skin: { density: 'dense', hideCounts: true },
      },
    );
    author.update((p) => addFeed(p, spec));
    const authorView = await author.renderFeed('curated');

    const link = encodeShare(spec);
    const decoded = decodeShare(link);
    assert.equal(decoded.ok, true);
    if (!decoded.ok) return;

    const recipient = client(device(), at);
    recipient.update((p) => addFeed(p, decoded.spec));
    const recipientView = await recipient.renderFeed(decoded.spec.id);

    assert.deepEqual(
      recipientView.items.map((i) => i.id),
      authorView.items.map((i) => i.id),
      'taste is portable, not just the graph',
    );
    assert.deepEqual(recipientView.mix, authorView.mix);
    assert.equal(recipientView.skin.density, 'dense');
  });

  test("importing someone's feed never clobbers your own", async () => {
    const at = { ms: NOW };
    const home = client(device(), at);
    const theirs = makeFeedSpec('home', 'Their Home', { kind: 'following' });
    home.update((p) => addFeed(p, theirs));

    assert.equal(home.feeds.length, 4);
    assert.equal(
      home.preferences.feeds.find((f) => f.id === 'home')!.name,
      'Home',
    );
    assert.ok(home.preferences.feeds.some((f) => f.id === 'home-2'));
  });

  test('the last feed cannot be deleted out from under the reader', async () => {
    const home = client(device(), { ms: NOW });
    home.update((p) => removeFeed(p, 'quiet'));
    home.update((p) => removeFeed(p, 'following'));
    home.update((p) => removeFeed(p, 'home'));
    assert.equal(home.feeds.length, 1);
    assert.ok((await home.renderFeed()).items.length > 0);
  });
});

describe('end to end: the whole loop is stable', () => {
  test('rendering repeatedly does not drift', async () => {
    const home = client(device(), { ms: NOW });
    home.update((p) => nudgeReason(p, 'home', 'network', 'up'));
    const a = await home.renderFeed();
    const b = await home.renderFeed();
    const c = await home.renderFeed();
    assert.deepEqual(
      a.items.map((i) => i.id),
      b.items.map((i) => i.id),
    );
    assert.deepEqual(
      b.items.map((i) => i.id),
      c.items.map((i) => i.id),
    );
  });

  test('filtered casts plus rendered casts always account for the whole page', async () => {
    const home = client(device(), { ms: NOW });
    home.update((p) => muteReasonGroup(p, 'home', 'discovery'));
    home.update((p) => muteKeyword(p, 'home', 'brooklyn'));
    const feed = await home.renderFeed();
    assert.equal(
      feed.items.length + feed.receipts.length,
      12,
      'nothing vanishes without a receipt',
    );
  });
});

describe('end to end: storage that parses but is wrong', () => {
  test('a corrupt session record falls back to a fresh one instead of NaN', async () => {
    const store = device();
    store.setString(
      'home.session.v1',
      JSON.stringify({
        sessionMs: 'abc',
        dayMs: null,
        dayKey: 'x',
        activeSince: 'now',
      }),
    );
    const home = client(store, { ms: NOW });
    home.update((p) => ({
      ...p,
      boundaries: { ...p.boundaries, sessionBudgetMinutes: 20 },
    }));
    const feed = await home.renderFeed();
    assert.equal(feed.boundary.status, 'open');
    assert.equal(feed.boundary.remainingMs, 20 * MIN, 'a real number, not NaN');
  });

  test('a corrupt affinity record is discarded and interactions still work', async () => {
    const store = device();
    store.setString(
      'home.affinity.v1',
      JSON.stringify({ scores: 'nope', updatedAt: 'never' }),
    );
    const home = client(store, { ms: NOW });
    home.recordInteraction(239, 'reply');
    const stored = JSON.parse(store.dump()['home.affinity.v1']!) as {
      scores: Record<string, number>;
    };
    assert.equal(stored.scores['239'], 3, 'starts clean and records the reply');
  });

  test('a crash mid-sitting does not end the next session before it starts', async () => {
    const store = device();
    const at = { ms: NOW };
    const before = client(store, at);
    before.update((p) => ({
      ...p,
      boundaries: { ...p.boundaries, sessionBudgetMinutes: 20 },
    }));
    before.foreground();
    // The process dies here: the open stretch is persisted, never closed.

    at.ms = NOW + 3 * HOUR;
    const after = client(store, at);
    after.foreground();
    const feed = await after.renderFeed();
    assert.equal(feed.boundary.status, 'open');
    assert.equal(
      feed.boundary.remainingMs,
      20 * MIN,
      'the hours the phone sat in a pocket were not reading',
    );
  });

  test('a quick relaunch after a crash continues the sitting', async () => {
    const store = device();
    const at = { ms: NOW };
    const before = client(store, at);
    before.update((p) => ({
      ...p,
      boundaries: { ...p.boundaries, sessionBudgetMinutes: 20 },
    }));
    before.foreground();
    at.ms = NOW + 5 * MIN;
    before.background();
    at.ms = NOW + 6 * MIN;
    before.foreground();
    // Crash.

    at.ms = NOW + 10 * MIN;
    const after = client(store, at);
    after.foreground();
    assert.equal(
      (await after.renderFeed()).boundary.remainingMs,
      15 * MIN,
      'the five completed minutes still count; the lost stretch does not',
    );
  });
});
