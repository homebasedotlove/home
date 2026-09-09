import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

import { classifyEmbeds, EMBED_KINDS, EMBED_KIND_LABELS } from '../src/embeds';
import { isRenderableCast, toFeedItemView } from '../src/feedItem';
import { personalizeMixedFeed } from '../src/seam';
import { cast, feedItem, homeFeedPage, NOW } from '../src/fixtures';
import { makeFeedSpec, emptySift, defaultSort } from 'home-personalization';

describe('embed classification', () => {
  test('reads the payload, not the array a link arrived in', () => {
    const tokenLink = cast('a', {
      embeds: {
        images: [],
        unknowns: [],
        urls: [{ type: 'url', tokenV2: { ca: '0x1' } }],
      },
    });
    assert.deepEqual(
      classifyEmbeds(tokenLink),
      ['token'],
      'a token link is a token post',
    );

    const nftLink = cast('b', {
      embeds: {
        images: [],
        unknowns: [],
        urls: [{ type: 'url', collection: { id: 'x' } }],
      },
    });
    assert.deepEqual(classifyEmbeds(nftLink), ['nft']);

    const plainLink = cast('c', {
      embeds: { images: [], unknowns: [], urls: [{ type: 'url' }] },
    });
    assert.deepEqual(classifyEmbeds(plainLink), ['link']);
  });

  test('covers every transport the API exposes', () => {
    const everything = cast('a', {
      token: { ca: '0x1' },
      collectible: { id: 'c' },
      embeds: {
        images: [{}],
        videos: [{}],
        casts: [{}],
        snap: [{}],
        transactions: [{}],
        groupInvites: [{}],
        urls: [{ type: 'url' }],
        unknowns: [],
      },
    });
    const kinds = classifyEmbeds(everything);
    for (const expected of [
      'image',
      'video',
      'quote',
      'mini-app',
      'transaction',
      'group-invite',
      'link',
      'token',
      'collectible',
    ]) {
      assert.ok(kinds.includes(expected as never), `missing ${expected}`);
    }
  });

  test('empty arrays are not embeds', () => {
    const bare = cast('a', {
      embeds: { images: [], urls: [], videos: [], unknowns: [] },
    });
    assert.deepEqual(classifyEmbeds(bare), []);
    assert.deepEqual(classifyEmbeds(cast('b')), []);
  });

  test('kinds are deduplicated', () => {
    const twoTokens = cast('a', {
      token: { ca: '0x1' },
      embeds: {
        images: [],
        unknowns: [],
        urls: [
          { type: 'url', token: {} },
          { type: 'url', tokenV2: {} },
        ],
      },
    });
    assert.deepEqual(classifyEmbeds(twoTokens), ['token']);
  });

  test('every kind has a label the settings UI can show', () => {
    for (const kind of EMBED_KINDS) assert.ok(EMBED_KIND_LABELS[kind]);
  });
});

describe('feed item adaptation', () => {
  test('carries the three fields the reference client discards', () => {
    const view = toFeedItemView(
      feedItem('0x1', { reason: 'popular', score: 0.7, authorQuality: 'high' }),
    );
    assert.equal(view.reason, 'popular');
    assert.equal(view.score, 0.7);
    assert.equal(view.authorQuality, 'high');
  });

  test('uses the feed item timestamp, not the cast timestamp', () => {
    const item = feedItem('0x1', { agoHours: 2 });
    item.cast.timestamp = NOW - 999 * 3_600_000;
    assert.equal(
      toFeedItemView(item).timestampMs,
      NOW - 2 * 3_600_000,
      "the feed's own ordering is the one to respect",
    );
  });

  test('a reply is detected from parentHash', () => {
    assert.equal(toFeedItemView(feedItem('a')).isReply, false);
    assert.equal(
      toFeedItemView(feedItem('a', { cast: { parentHash: '0xp' } })).isReply,
      true,
    );
    assert.equal(
      toFeedItemView(feedItem('a', { cast: { parentHash: '' } })).isReply,
      false,
      'an empty hash is not a parent',
    );
  });

  test('engagement counts come across', () => {
    const view = toFeedItemView(
      feedItem('a', { cast: { likes: 12, recastCount: 3, replyCount: 5 } }),
    );
    assert.deepEqual(view.engagement, { likes: 12, recasts: 3, replies: 5 });
  });

  test('an unknown quality tier is dropped, not coerced', () => {
    const view = toFeedItemView(
      feedItem('a', { authorQuality: 'exceptional' }),
    );
    assert.equal(
      view.authorQuality,
      undefined,
      'a tier the client does not understand must not become one it filters on',
    );
    assert.equal(
      toFeedItemView(feedItem('b', { authorQuality: 'spam' })).authorQuality,
      'spam',
    );
  });

  test('missing meta yields an unattributed item rather than a guess', () => {
    const view = toFeedItemView(feedItem('a'));
    assert.equal(view.reason, undefined);
    assert.equal(view.score, undefined);
  });

  test('a non-finite score is rejected', () => {
    const item = feedItem('a');
    item.meta = { score: Number.NaN };
    assert.equal(toFeedItemView(item).score, undefined);
  });

  test('deleted casts are not renderable', () => {
    assert.equal(isRenderableCast(feedItem('a')), true);
    assert.equal(
      isRenderableCast(feedItem('b', { cast: { deleted: true } })),
      false,
    );
  });

  test('the whole fixture page adapts without loss', () => {
    const views = homeFeedPage().map(toFeedItemView);
    assert.equal(views.length, 12);
    assert.equal(new Set(views.map((v) => v.id)).size, 12);
    assert.ok(
      views.every((v) => Number.isFinite(v.timestampMs) && v.authorFid > 0),
    );
    assert.equal(views.filter((v) => v.reason === 'snap-promoted').length, 1);
    assert.equal(views.find((v) => v.id === '0x03')!.channelKey, 'design');
    assert.equal(views.find((v) => v.id === '0x03')!.isRecast, true);
  });
});

describe('the seam', () => {
  type Row =
    | { type: 'cast'; item: ReturnType<typeof feedItem> }
    | { type: 'suggestions' };

  const rows = (): Row[] => [
    ...homeFeedPage()
      .slice(0, 4)
      .map((item) => ({ type: 'cast' as const, item })),
    { type: 'suggestions' as const },
    ...homeFeedPage()
      .slice(4)
      .map((item) => ({ type: 'cast' as const, item })),
  ];

  const opts = (spec: ReturnType<typeof makeFeedSpec>) => ({
    isCast: (r: Row) => r.type === 'cast',
    getCast: (r: Row) =>
      (r as { type: 'cast'; item: ReturnType<typeof feedItem> }).item,
    spec,
    context: { now: NOW },
  });

  test('returns the original row objects, not adapted ones', () => {
    const input = rows();
    const spec = makeFeedSpec('t', 'T', { kind: 'home' });
    const out = personalizeMixedFeed(input, opts(spec));
    for (const row of out.items) {
      assert.ok(
        input.includes(row),
        'components keep receiving the types they know',
      );
    }
  });

  test('interstitials survive filtering and stay proportionally placed', () => {
    const spec = makeFeedSpec(
      't',
      'T',
      { kind: 'home' },
      {
        sift: { ...emptySift(), mutedGroups: ['discovery', 'promoted'] },
      },
    );
    const out = personalizeMixedFeed(rows(), opts(spec));
    const suggestionIndex = out.items.findIndex(
      (r) => r.type === 'suggestions',
    );
    assert.notEqual(
      suggestionIndex,
      -1,
      'not ranked away as if it were a cast',
    );
    assert.ok(suggestionIndex > 0 && suggestionIndex < out.items.length - 1);
    assert.ok(out.hiddenCount > 0);
  });

  test('a fully filtered feed still keeps its interstitials', () => {
    const spec = makeFeedSpec(
      't',
      'T',
      { kind: 'home' },
      {
        sift: {
          ...emptySift(),
          mutedGroups: ['direct', 'network', 'discovery', 'promoted'],
        },
      },
    );
    const out = personalizeMixedFeed(rows(), opts(spec));
    assert.deepEqual(
      out.items.map((r) => r.type),
      ['suggestions'],
    );
  });

  test('deleted casts never reach the pipeline', () => {
    const input: Row[] = [
      {
        type: 'cast',
        item: feedItem('live', { reason: 'popular', score: 0.5 }),
      },
      {
        type: 'cast',
        item: feedItem('gone', {
          reason: 'popular',
          score: 0.9,
          cast: { deleted: true },
        }),
      },
    ];
    const out = personalizeMixedFeed(
      input,
      opts(makeFeedSpec('t', 'T', { kind: 'home' })),
    );
    assert.equal(out.items.length, 1);
    assert.equal(out.hiddenCount, 0, 'a deleted cast is not a filtered one');
  });

  test('reports the mix of what is actually visible', () => {
    const out = personalizeMixedFeed(
      rows(),
      opts(makeFeedSpec('t', 'T', { kind: 'home' })),
    );
    assert.equal(out.mix.total + out.hiddenCount, 12);
    assert.equal(out.mix.byGroup.promoted, 1);
    assert.ok(out.mix.byGroup.direct! >= 3);
  });

  test('weights actually reorder the rendered list', () => {
    const server = personalizeMixedFeed(
      rows(),
      opts(makeFeedSpec('t', 'T', { kind: 'home' })),
    );
    const weighted = personalizeMixedFeed(
      rows(),
      opts(
        makeFeedSpec(
          't',
          'T',
          { kind: 'home' },
          {
            sort: {
              ...defaultSort(),
              mode: 'weighted',
              weights: { direct: 3, discovery: 0.2 },
            },
          },
        ),
      ),
    );
    assert.notDeepEqual(
      server.items.map((r) => (r.type === 'cast' ? r.item.id : 'x')),
      weighted.items.map((r) => (r.type === 'cast' ? r.item.id : 'x')),
    );
  });

  test('an empty list is not a crash', () => {
    const out = personalizeMixedFeed(
      [] as Row[],
      opts(makeFeedSpec('t', 'T', { kind: 'home' })),
    );
    assert.deepEqual(out.items, []);
    assert.equal(out.mix.total, 0);
  });
});
