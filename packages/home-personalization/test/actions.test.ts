import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

import { defaultPreferences } from '../src/prefs';
import {
  addFeed,
  addToList,
  duplicateFeed,
  getFeed,
  muteAuthor,
  muteChannel,
  muteKeyword,
  muteReasonGroup,
  MUTE_DURATIONS,
  nudgeReason,
  orderedFeeds,
  removeFeed,
  renameFeed,
  reorderFeeds,
  setActiveFeed,
  setTabs,
  unmuteKeyword,
  unmuteReasonGroup,
  uniqueFeedId,
  upsertList,
} from '../src/prefs/actions';
import { GROUP_WEIGHT_CEILING } from '../src/reasons/index';
import { makeFeedSpec } from '../src/feedspec/defaults';
import { runFeedPipeline } from '../src/pipeline';
import type { FeedItemView } from '../src/pipeline/types';

const NOW = 1_700_000_000_000;

function item(id: string, reason: string, score: number): FeedItemView {
  return {
    id,
    timestampMs: NOW,
    authorFid: 1,
    text: '',
    reason,
    score,
    isRecast: false,
    isReply: false,
    embedKinds: [],
    engagement: { likes: 0, recasts: 0, replies: 0 },
  };
}

describe('the reason sheet', () => {
  test('Less moves the weight down and switches into weighted mode', () => {
    const before = defaultPreferences();
    assert.equal(getFeed(before, 'home')!.sort.mode, 'server');
    const after = nudgeReason(before, 'home', 'discovery', 'down');
    const feed = getFeed(after, 'home')!;
    assert.equal(
      feed.sort.mode,
      'weighted',
      'otherwise the button appears to do nothing',
    );
    assert.equal(feed.sort.weights.discovery, 0.6);
  });

  test('More moves it up, and repeated taps stop at the ceiling', () => {
    let prefs = defaultPreferences();
    for (let i = 0; i < 20; i++)
      prefs = nudgeReason(prefs, 'home', 'direct', 'up');
    assert.equal(
      getFeed(prefs, 'home')!.sort.weights.direct,
      GROUP_WEIGHT_CEILING.direct,
    );
  });

  test('promoted is capped at neutral however the action is reached', () => {
    let prefs = defaultPreferences();
    for (let i = 0; i < 10; i++)
      prefs = nudgeReason(prefs, 'home', 'promoted', 'up');
    assert.equal(getFeed(prefs, 'home')!.sort.weights.promoted, 1);
    assert.equal(GROUP_WEIGHT_CEILING.promoted, 1);
  });

  test('Less never goes below zero', () => {
    let prefs = defaultPreferences();
    for (let i = 0; i < 20; i++)
      prefs = nudgeReason(prefs, 'home', 'network', 'down');
    assert.equal(getFeed(prefs, 'home')!.sort.weights.network, 0);
  });

  test('a nudge visibly re-ranks the feed it was taken on', () => {
    const items = [
      item('pop', 'popular', 0.9),
      item('follow', 'following-author', 0.1),
    ];
    const before = defaultPreferences();
    const homeBefore = getFeed(before, 'home')!;
    assert.deepEqual(
      runFeedPipeline(items, homeBefore, { now: NOW }).items.map((i) => i.id),
      ['pop', 'follow'],
    );

    let prefs = before;
    prefs = nudgeReason(prefs, 'home', 'direct', 'up');
    prefs = nudgeReason(prefs, 'home', 'discovery', 'down');
    const after = runFeedPipeline(items, getFeed(prefs, 'home')!, { now: NOW });
    assert.deepEqual(
      after.items.map((i) => i.id),
      ['follow', 'pop'],
    );
  });

  test('None removes the category and the receipt says which rule fired', () => {
    const items = [
      item('pop', 'popular', 0.9),
      item('follow', 'following-author', 0.1),
    ];
    const prefs = muteReasonGroup(defaultPreferences(), 'home', 'discovery');
    const out = runFeedPipeline(items, getFeed(prefs, 'home')!, { now: NOW });
    assert.deepEqual(
      out.items.map((i) => i.id),
      ['follow'],
    );
    assert.equal(out.receipts[0]!.cause, 'muted-group');
    assert.equal(out.receipts[0]!.rule, 'discovery');

    const restored = unmuteReasonGroup(prefs, 'home', 'discovery');
    assert.equal(
      runFeedPipeline(items, getFeed(restored, 'home')!, { now: NOW }).items
        .length,
      2,
    );
  });

  test('mutations do not touch the document they were given', () => {
    const before = defaultPreferences();
    const snapshot = JSON.stringify(before);
    nudgeReason(before, 'home', 'direct', 'up');
    muteReasonGroup(before, 'home', 'promoted');
    muteKeyword(before, 'home', 'test');
    assert.equal(JSON.stringify(before), snapshot, 'undo depends on this');
  });
});

describe('mutes', () => {
  test('keyword mutes default to word matching', () => {
    const prefs = muteKeyword(defaultPreferences(), 'home', '  AI  ');
    const rule = getFeed(prefs, 'home')!.sift.keywords[0]!;
    assert.equal(rule.pattern, 'AI');
    assert.equal(
      rule.mode,
      'word',
      'substring muting has to be chosen, not inherited',
    );
  });

  test('a temporary mute carries its expiry and stops applying after it', () => {
    const prefs = muteKeyword(defaultPreferences(), 'home', 'cup', {
      forMs: 604_800_000,
      now: NOW,
    });
    const rule = getFeed(prefs, 'home')!.sift.keywords[0]!;
    assert.equal(rule.expiresAt, NOW + 604_800_000);

    const casts = [
      { ...item('a', 'following-author', 0.5), text: 'the cup final' },
    ];
    const feed = getFeed(prefs, 'home')!;
    assert.equal(runFeedPipeline(casts, feed, { now: NOW }).items.length, 0);
    assert.equal(
      runFeedPipeline(casts, feed, { now: NOW + 604_800_001 }).items.length,
      1,
      'lapses on its own',
    );
  });

  test('re-muting the same pattern replaces rather than duplicates', () => {
    let prefs = muteKeyword(defaultPreferences(), 'home', 'gm', {
      forMs: 1000,
      now: NOW,
    });
    prefs = muteKeyword(prefs, 'home', 'gm', { forMs: 9000, now: NOW });
    const keywords = getFeed(prefs, 'home')!.sift.keywords;
    assert.equal(keywords.length, 1);
    assert.equal(keywords[0]!.expiresAt, NOW + 9000);
  });

  test('empty patterns are refused', () => {
    const prefs = muteKeyword(defaultPreferences(), 'home', '   ');
    assert.equal(getFeed(prefs, 'home')!.sift.keywords.length, 0);
  });

  test('a typed regex gets the same guard as an imported one', () => {
    const before = defaultPreferences();
    assert.equal(
      muteKeyword(before, 'home', '(a+)+$', { mode: 'regex' }),
      before,
      'refused, and the document is untouched',
    );
    const after = muteKeyword(before, 'home', '^gm+$', { mode: 'regex' });
    assert.deepEqual(getFeed(after, 'home')!.sift.keywords, [
      { pattern: '^gm+$', mode: 'regex' },
    ]);
  });

  test('unmute removes the rule', () => {
    const prefs = unmuteKeyword(
      muteKeyword(defaultPreferences(), 'home', 'gm'),
      'home',
      'gm',
    );
    assert.equal(getFeed(prefs, 'home')!.sift.keywords.length, 0);
  });

  test('author and channel mutes are idempotent', () => {
    let prefs = muteAuthor(defaultPreferences(), 'home', 42);
    prefs = muteAuthor(prefs, 'home', 42);
    prefs = muteChannel(prefs, 'home', 'design');
    prefs = muteChannel(prefs, 'home', 'design');
    const feed = getFeed(prefs, 'home')!;
    assert.equal(feed.sift.authors.length, 1);
    assert.equal(feed.sift.channels.length, 1);
  });

  test('a mute applies to one feed, not all of them', () => {
    const prefs = muteKeyword(defaultPreferences(), 'home', 'election');
    assert.equal(getFeed(prefs, 'home')!.sift.keywords.length, 1);
    assert.equal(getFeed(prefs, 'following')!.sift.keywords.length, 0);
  });
});

describe('feed management', () => {
  test('an imported feed never overwrites one the reader has', () => {
    const before = defaultPreferences();
    const collide = makeFeedSpec('home', 'Their Home', { kind: 'home' });
    const after = addFeed(before, collide);
    assert.equal(after.feeds.length, 4);
    assert.equal(uniqueFeedId(before, 'home'), 'home-2');
    assert.ok(getFeed(after, 'home-2'));
    assert.equal(
      getFeed(after, 'home')!.name,
      'Home',
      'the original is untouched',
    );
  });

  test('the last feed cannot be deleted', () => {
    let prefs = defaultPreferences();
    prefs = removeFeed(prefs, 'quiet');
    prefs = removeFeed(prefs, 'following');
    const guarded = removeFeed(prefs, 'home');
    assert.equal(guarded.feeds.length, 1, 'a reader with no feeds has no app');
  });

  test('deleting the active feed moves the reader somewhere real', () => {
    let prefs = setActiveFeed(defaultPreferences(), 'quiet');
    prefs = removeFeed(prefs, 'quiet');
    assert.ok(getFeed(prefs, prefs.activeFeedId), 'active id always resolves');
    assert.equal(prefs.feedOrder.includes('quiet'), false);
  });

  test('duplicate copies the rules under a new id', () => {
    const source = muteKeyword(defaultPreferences(), 'quiet', 'election');
    const prefs = duplicateFeed(source, 'quiet');
    const copy = prefs.feeds[prefs.feeds.length - 1]!;
    assert.equal(copy.id, 'quiet-copy');
    assert.equal(copy.name, 'Quiet copy');
    assert.deepEqual(
      copy.sift.keywords,
      getFeed(source, 'quiet')!.sift.keywords,
    );
  });

  test('reorder moves a feed and keeps every id', () => {
    const prefs = reorderFeeds(defaultPreferences(), 2, 0);
    assert.deepEqual(prefs.feedOrder, ['quiet', 'home', 'following']);
    assert.equal(orderedFeeds(prefs)[0]!.id, 'quiet');
  });

  test('an out-of-range reorder is a no-op', () => {
    const before = defaultPreferences();
    assert.deepEqual(reorderFeeds(before, 9, 0).feedOrder, before.feedOrder);
    assert.deepEqual(reorderFeeds(before, 0, -1).feedOrder, before.feedOrder);
  });

  test('orderedFeeds appends anything missing from the order', () => {
    const prefs = { ...defaultPreferences(), feedOrder: ['quiet'] };
    assert.deepEqual(
      orderedFeeds(prefs).map((f) => f.id),
      ['quiet', 'home', 'following'],
    );
  });

  test('rename trims, caps and refuses empty', () => {
    let prefs = renameFeed(defaultPreferences(), 'home', '  Morning  ');
    assert.equal(getFeed(prefs, 'home')!.name, 'Morning');
    prefs = renameFeed(prefs, 'home', '   ');
    assert.equal(getFeed(prefs, 'home')!.name, 'Morning');
    prefs = renameFeed(prefs, 'home', 'x'.repeat(200));
    assert.equal(getFeed(prefs, 'home')!.name.length, 40);
  });

  test('setActiveFeed ignores ids that do not exist', () => {
    const before = defaultPreferences();
    assert.equal(
      setActiveFeed(before, 'nope').activeFeedId,
      before.activeFeedId,
    );
  });
});

describe('lists and tabs', () => {
  test('lists upsert and accumulate without duplicates', () => {
    let prefs = upsertList(defaultPreferences(), {
      id: 'd',
      name: 'Designers',
      fids: [1],
    });
    prefs = addToList(prefs, 'd', 2);
    prefs = addToList(prefs, 'd', 2);
    assert.deepEqual(prefs.lists[0]!.fids, [1, 2]);
    prefs = upsertList(prefs, { id: 'd', name: 'Design', fids: [9] });
    assert.equal(prefs.lists.length, 1);
    assert.equal(prefs.lists[0]!.name, 'Design');
  });

  test('an unusable tab bar is refused, not clamped', () => {
    const before = defaultPreferences();
    assert.deepEqual(setTabs(before, ['feeds']).tabs, before.tabs);
    assert.deepEqual(
      setTabs(before, [
        'feeds',
        'explore',
        'notifications',
        'messages',
        'wallet',
        'apps',
      ]).tabs,
      before.tabs,
    );
    assert.deepEqual(setTabs(before, ['feeds', 'you']).tabs, ['feeds', 'you']);
  });
});

describe('mute durations', () => {
  test('every preset produces the expiry the label promises', () => {
    for (const { label, ms } of MUTE_DURATIONS) {
      const prefs = muteKeyword(defaultPreferences(), 'home', 'x', {
        ...(ms === undefined ? {} : { forMs: ms }),
        now: NOW,
      });
      const rule = getFeed(prefs, 'home')!.sift.keywords[0]!;
      if (ms === undefined) {
        assert.equal(rule.expiresAt, undefined, `${label} never expires`);
      } else {
        assert.equal(rule.expiresAt, NOW + ms, label);
      }
    }
  });

  test('the presets are ordered shortest to forever, for the sheet', () => {
    const finite: number[] = MUTE_DURATIONS.flatMap((d) =>
      d.ms === undefined ? [] : [d.ms],
    );
    assert.deepEqual(
      finite,
      [...finite].sort((a, b) => a - b),
    );
    assert.equal(
      MUTE_DURATIONS[MUTE_DURATIONS.length - 1]!.ms,
      undefined,
      'forever is last',
    );
  });
});
