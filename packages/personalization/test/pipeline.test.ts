import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { makeFeedSpec, emptySift, defaultSort } from '../src/feedspec/defaults.ts';
import type { FeedItemView, PipelineContext } from '../src/pipeline/types.ts';
import { runFeedPipeline } from '../src/pipeline/index.ts';
import { sift, expiredRules } from '../src/pipeline/sift.ts';
import { diversify, rankNormalize, recencyFactor, affinityFactor, summarizeMix } from '../src/pipeline/rank.ts';
import { compileKeywordRule } from '../src/pipeline/match.ts';

const NOW = 1_700_000_000_000;
const ctx: PipelineContext = { now: NOW };

function item(over: Partial<FeedItemView> & { id: string }): FeedItemView {
  return {
    timestampMs: NOW - 60_000,
    authorFid: 1,
    text: '',
    isRecast: false,
    isReply: false,
    embedKinds: [],
    engagement: { likes: 0, recasts: 0, replies: 0 },
    ...over,
  };
}

describe('keyword matching', () => {
  test('word mode respects boundaries', () => {
    const c = compileKeywordRule({ pattern: 'ai', mode: 'word' }, NOW)!;
    assert.equal(c.test('thoughts on ai today'), true);
    assert.equal(c.test('she said nothing'), false, '"said" must not match "ai"');
    assert.equal(c.test('a chain of detail'), false, '"chain"/"detail" must not match "ai"');
    assert.equal(c.test('AI is fine'), true, 'case-insensitive by default');
  });

  test('word boundaries are unicode-aware, not ascii-only', () => {
    const c = compileKeywordRule({ pattern: 'trade', mode: 'word' }, NOW)!;
    // \b would treat "é" as a non-word character and match here. It must not.
    assert.equal(c.test('tradeé'), false);
    assert.equal(c.test('trade。'), true, 'CJK punctuation is a boundary');
    const jp = compileKeywordRule({ pattern: '相場', mode: 'word' }, NOW)!;
    assert.equal(jp.test('今日の相場は'), false, 'no boundary inside CJK run');
    assert.equal(jp.test('相場 update'), true);
  });

  test('substring mode is naive on purpose', () => {
    const c = compileKeywordRule({ pattern: 'ai', mode: 'substring' }, NOW)!;
    assert.equal(c.test('she said nothing'), true);
  });

  test('expired rules do not compile', () => {
    assert.equal(compileKeywordRule({ pattern: 'x', mode: 'word', expiresAt: NOW - 1 }, NOW), undefined);
    assert.ok(compileKeywordRule({ pattern: 'x', mode: 'word', expiresAt: NOW + 1 }, NOW));
  });

  test('case sensitivity is honoured', () => {
    const c = compileKeywordRule({ pattern: 'AI', mode: 'word', caseSensitive: true }, NOW)!;
    assert.equal(c.test('AI matters'), true);
    assert.equal(c.test('ai matters'), false);
  });
});

describe('sift', () => {
  test('drops by reason, group, keyword, author and produces a receipt for each', () => {
    const items = [
      item({ id: 'a', reason: 'following-author', text: 'hello' }),
      item({ id: 'b', reason: 'snap-promoted', text: 'buy this' }),
      item({ id: 'c', reason: 'popular', text: 'gm' }),
      item({ id: 'd', reason: 'following-author', text: 'the election is close', authorFid: 9 }),
      item({ id: 'e', reason: 'following-author', authorFid: 42, text: 'anything' }),
    ];
    const rules = {
      ...emptySift(),
      mutedGroups: ['promoted' as const],
      mutedReasons: ['popular' as const],
      keywords: [{ pattern: 'election', mode: 'word' as const }],
      authors: [{ fid: 42 }],
    };
    const { kept, receipts } = sift(items, rules, ctx);
    assert.deepEqual(kept.map((i) => i.id), ['a']);
    assert.equal(receipts.length, 4);
    const causes = Object.fromEntries(receipts.map((r) => [r.itemId, r.cause]));
    assert.equal(causes.b, 'muted-group');
    assert.equal(causes.c, 'muted-reason');
    assert.equal(causes.d, 'muted-keyword');
    assert.equal(causes.e, 'muted-author');
    assert.equal(receipts.find((r) => r.itemId === 'd')!.rule, 'election');
  });

  test('expired mutes stop applying and are reported for review', () => {
    const rules = {
      ...emptySift(),
      keywords: [{ pattern: 'cup', mode: 'word' as const, expiresAt: NOW - 1000 }],
      authors: [{ fid: 7, expiresAt: NOW - 1000 }],
    };
    const items = [item({ id: 'a', text: 'the cup final' }), item({ id: 'b', authorFid: 7 })];
    const { kept } = sift(items, rules, ctx);
    assert.deepEqual(kept.map((i) => i.id), ['a', 'b']);
    const expired = expiredRules(rules, NOW);
    assert.equal(expired.keywords.length, 1);
    assert.equal(expired.authors.length, 1);
  });

  test('quality and score floors', () => {
    const items = [
      item({ id: 'lo', authorQuality: 'low', score: 0.9 }),
      item({ id: 'spam', authorQuality: 'spam', score: 0.9 }),
      item({ id: 'hi', authorQuality: 'high', score: 0.9 }),
      item({ id: 'weak', authorQuality: 'high', score: 0.1 }),
    ];
    const { kept } = sift(items, { ...emptySift(), minAuthorQuality: 'neutral', minScore: 0.5 }, ctx);
    assert.deepEqual(kept.map((i) => i.id), ['hi']);
  });

  test('a quality floor never hides accounts the server has not rated', () => {
    const items = [
      item({ id: 'new', authorQuality: 'unranked' }),
      item({ id: 'nosignal' }),
      item({ id: 'bad', authorQuality: 'spam' }),
    ];
    const { kept, receipts } = sift(items, { ...emptySift(), minAuthorQuality: 'high' }, ctx);
    assert.deepEqual(kept.map((i) => i.id), ['new', 'nosignal']);
    assert.equal(receipts[0]!.cause, 'author-quality');
  });

  test('the quality tiers are ordered as the API defines them', () => {
    const items = [
      item({ id: 'harmful', authorQuality: 'harmful' }),
      item({ id: 'spam', authorQuality: 'spam' }),
      item({ id: 'automated', authorQuality: 'automated' }),
      item({ id: 'low', authorQuality: 'low' }),
      item({ id: 'neutral', authorQuality: 'neutral' }),
      item({ id: 'high', authorQuality: 'high' }),
    ];
    const { kept } = sift(items, { ...emptySift(), minAuthorQuality: 'low' }, ctx);
    assert.deepEqual(kept.map((i) => i.id), ['low', 'neutral', 'high']);
  });

  test('structural hides', () => {
    const items = [
      item({ id: 'r', isReply: true }),
      item({ id: 'rc', isRecast: true }),
      item({ id: 'empty', text: '   ' }),
      item({ id: 'tok', embedKinds: ['token'] }),
      item({ id: 'ok', text: 'words' }),
    ];
    const { kept } = sift(
      items,
      { ...emptySift(), hideReplies: true, hideRecasts: true, hideTextless: true, mutedEmbedKinds: ['token'] },
      ctx,
    );
    assert.deepEqual(kept.map((i) => i.id), ['ok']);
  });
});

describe('rank', () => {
  test('rankNormalize maps onto an open interval and averages ties', () => {
    const n = rankNormalize([
      item({ id: 'a', score: 10 }),
      item({ id: 'b', score: 5 }),
      item({ id: 'c', score: 5 }),
      item({ id: 'd', score: 1 }),
    ]);
    // (position + 1) / (n + 1): nothing lands on 0, so no item is immune to
    // the reader's weights.
    assert.equal(n.get('d'), 0.2);
    assert.equal(n.get('a'), 0.8);
    // b and c span positions 1 and 2 -> mean 1.5 -> 2.5 / 5
    assert.equal(n.get('b'), 0.5);
    assert.equal(n.get('c'), 0.5);
  });

  test('the lowest-scored item can still be lifted by a weight', () => {
    const items = [
      item({ id: 'pop', reason: 'popular', score: 100 }),
      item({ id: 'follow', reason: 'following-author', score: 0 }),
    ];
    const spec = makeFeedSpec('t', 'T', { kind: 'home' }, {
      sort: { ...defaultSort(), mode: 'weighted', recencyHalfLifeHours: 0, weights: { direct: 3 } },
    });
    assert.deepEqual(runFeedPipeline(items, spec, ctx).items.map((i) => i.id), ['follow', 'pop']);
  });

  test('rankNormalize is scale-invariant', () => {
    const small = rankNormalize([item({ id: 'a', score: 0.001 }), item({ id: 'b', score: 0.002 })]);
    const big = rankNormalize([item({ id: 'a', score: 1000 }), item({ id: 'b', score: 2000 })]);
    assert.deepEqual([...small.entries()], [...big.entries()]);
  });

  test('unscored items sit at the midpoint rather than the bottom', () => {
    const n = rankNormalize([item({ id: 'a', score: 10 }), item({ id: 'b' }), item({ id: 'c', score: 1 })]);
    assert.equal(n.get('b'), 0.5);
  });

  test('recency halves on schedule', () => {
    assert.equal(recencyFactor(0, 6), 1);
    assert.ok(Math.abs(recencyFactor(6 * 3_600_000, 6) - 0.5) < 1e-9);
    assert.ok(Math.abs(recencyFactor(12 * 3_600_000, 6) - 0.25) < 1e-9);
    assert.equal(recencyFactor(999, 0), 1, 'a zero half-life disables decay');
  });

  test('affinity is inert until the reader opts in', () => {
    assert.equal(affinityFactor(1, 0), 1);
    assert.equal(affinityFactor(undefined, 0.5), 1);
    assert.equal(affinityFactor(0.5, 0.5), 1);
    assert.ok(affinityFactor(1, 0.5) > 1);
    assert.ok(affinityFactor(0, 0.5) < 1);
  });

  test('weights reorder the feed', () => {
    const items = [
      item({ id: 'pop', reason: 'popular', score: 1 }),
      item({ id: 'follow', reason: 'following-author', score: 0 }),
    ];
    const spec = makeFeedSpec('t', 'T', { kind: 'home' }, {
      sort: { ...defaultSort(), mode: 'weighted', recencyHalfLifeHours: 0, weights: { direct: 4 } },
    });
    const out = runFeedPipeline(items, spec, ctx);
    assert.deepEqual(out.items.map((i) => i.id), ['follow', 'pop']);
  });

  test('a zero weight sinks a category without deleting it', () => {
    const items = [
      item({ id: 'pop', reason: 'popular', score: 1 }),
      item({ id: 'follow', reason: 'following-author', score: 0.2 }),
    ];
    const spec = makeFeedSpec('t', 'T', { kind: 'home' }, {
      sort: { ...defaultSort(), mode: 'weighted', recencyHalfLifeHours: 0, weights: { discovery: 0 } },
    });
    const out = runFeedPipeline(items, spec, ctx);
    assert.deepEqual(out.items.map((i) => i.id), ['follow', 'pop']);
    assert.equal(out.items.length, 2, 'weighting is not filtering');
  });

  test('chronological ignores score entirely', () => {
    const items = [
      item({ id: 'old', score: 100, timestampMs: NOW - 100_000 }),
      item({ id: 'new', score: 0, timestampMs: NOW - 10 }),
    ];
    const spec = makeFeedSpec('t', 'T', { kind: 'following' }, {
      sort: { ...defaultSort(), mode: 'chronological', diversity: {} },
    });
    assert.deepEqual(runFeedPipeline(items, spec, ctx).items.map((i) => i.id), ['new', 'old']);
  });

  test('server mode preserves the order it was given', () => {
    const items = [item({ id: 'a', score: 0 }), item({ id: 'b', score: 9 })];
    const spec = makeFeedSpec('t', 'T', { kind: 'home' }, {
      sort: { ...defaultSort(), diversity: {} },
    });
    assert.deepEqual(runFeedPipeline(items, spec, ctx).items.map((i) => i.id), ['a', 'b']);
  });

  test('ordering is total, so equal scores never reshuffle between runs', () => {
    const items = [
      item({ id: 'b', score: 1, timestampMs: NOW }),
      item({ id: 'a', score: 1, timestampMs: NOW }),
    ];
    const spec = makeFeedSpec('t', 'T', { kind: 'home' }, {
      sort: { ...defaultSort(), mode: 'weighted', recencyHalfLifeHours: 0, diversity: {} },
    });
    const once = runFeedPipeline(items, spec, ctx).items.map((i) => i.id);
    const twice = runFeedPipeline([...items].reverse(), spec, ctx).items.map((i) => i.id);
    assert.deepEqual(once, twice);
  });
});

describe('diversify', () => {
  test('spaces out a flooding author without dropping anything', () => {
    const items = [
      item({ id: '1', authorFid: 1 }),
      item({ id: '2', authorFid: 1 }),
      item({ id: '3', authorFid: 1 }),
      item({ id: '4', authorFid: 2 }),
      item({ id: '5', authorFid: 3 }),
    ];
    const out = diversify(items, { maxPerAuthor: 2, window: 3 });
    assert.equal(out.length, items.length, 'nothing is dropped');
    assert.deepEqual(new Set(out.map((i) => i.id)), new Set(items.map((i) => i.id)));
    assert.ok(out.findIndex((i) => i.id === '3') > out.findIndex((i) => i.id === '4'));
  });

  test('no caps is a pass-through', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })];
    assert.equal(diversify(items, {}), items);
  });

  test('channel caps apply independently of author caps', () => {
    const items = [
      item({ id: '1', authorFid: 1, channelKey: 'x' }),
      item({ id: '2', authorFid: 2, channelKey: 'x' }),
      item({ id: '3', authorFid: 3, channelKey: 'x' }),
      item({ id: '4', authorFid: 4, channelKey: 'y' }),
    ];
    const out = diversify(items, { maxPerChannel: 2, window: 3 });
    assert.deepEqual(out.map((i) => i.id), ['1', '2', '4', '3']);
  });
});

describe('mix summary', () => {
  test('counts by group and reason and flags unattributed items', () => {
    const mix = summarizeMix([
      item({ id: 'a', reason: 'following-author' }),
      item({ id: 'b', reason: 'follow-of-follow' }),
      item({ id: 'c', reason: 'popular' }),
      item({ id: 'd' }),
    ]);
    assert.equal(mix.total, 4);
    assert.equal(mix.unattributed, 1);
    assert.deepEqual(mix.byGroup, { direct: 1, network: 1, discovery: 1 });
    assert.equal(mix.byReason['popular'], 1);
  });
});
