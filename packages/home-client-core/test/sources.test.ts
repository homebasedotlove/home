import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

import { feedItem, NOW } from 'farcaster-adapter';
import type { CastFeedItemLike } from 'farcaster-adapter';
import {
  defaultPreferences,
  makeFeedSpec,
  memoryStore,
  upsertList,
} from 'home-personalization';
import type { FeedSpec, Preferences } from 'home-personalization';

import {
  AllSourcesFailedError,
  fetchForSpec,
  resolveSource,
  type ResolvedSource,
} from '../src/sources';
import { HomeClient } from '../src/client';

function page(prefix: string, n: number): CastFeedItemLike[] {
  return Array.from({ length: n }, (_, i) =>
    feedItem(`${prefix}${i}`, {
      reason: 'following-author',
      score: (n - i) / n,
    }),
  );
}

/** Records what the app-level fetcher was actually asked for. */
function recordingFetcher(pages: Record<string, CastFeedItemLike[]>) {
  const seen: ResolvedSource[] = [];
  const fetch = async (source: ResolvedSource) => {
    seen.push(source);
    const key =
      source.kind === 'channel'
        ? `channel:${source.channelKey}`
        : source.kind === 'search'
          ? `search:${source.query}`
          : source.kind === 'list'
            ? `list:${source.listId}`
            : source.kind;
    return pages[key] ?? [];
  };
  return { fetch, seen };
}

describe('source resolution', () => {
  test('a list is resolved to fids before the fetcher sees it', async () => {
    const prefs = upsertList(defaultPreferences(), {
      id: 'designers',
      name: 'Designers',
      fids: [1, 2, 3],
    });
    const resolved = resolveSource(
      { kind: 'list', listId: 'designers' },
      prefs,
    );
    assert.deepEqual(resolved, {
      kind: 'list',
      listId: 'designers',
      fids: [1, 2, 3],
    });
  });

  test('a deleted list resolves empty rather than throwing', async () => {
    const resolved = resolveSource(
      { kind: 'list', listId: 'gone' },
      defaultPreferences(),
    );
    assert.deepEqual(resolved, { kind: 'list', listId: 'gone', fids: [] });
  });

  test('leaf sources pass through untouched', () => {
    const prefs = defaultPreferences();
    for (const source of [
      { kind: 'home' as const },
      { kind: 'following' as const },
      { kind: 'channel' as const, channelKey: 'design' },
      { kind: 'search' as const, query: 'farcaster' },
    ]) {
      assert.deepEqual(resolveSource(source, prefs), source);
    }
  });
});

describe('fetching for a spec', () => {
  const prefs = (): Preferences =>
    upsertList(defaultPreferences(), { id: 'l', name: 'List', fids: [7, 8] });

  test('a simple source is fetched once and de-duplicated', async () => {
    const { fetch, seen } = recordingFetcher({
      home: [...page('a', 3), ...page('a', 2)],
    });
    const { items } = await fetchForSpec(
      makeFeedSpec('t', 'T', { kind: 'home' }),
      prefs(),
      fetch,
    );
    assert.equal(seen.length, 1);
    assert.deepEqual(
      items.map((i) => i.id),
      ['a0', 'a1', 'a2'],
    );
  });

  test('a search feed reaches the fetcher as a query', async () => {
    const { fetch, seen } = recordingFetcher({ 'search:oklab': page('s', 2) });
    const { items } = await fetchForSpec(
      makeFeedSpec('t', 'T', { kind: 'search', query: 'oklab' }),
      prefs(),
      fetch,
    );
    assert.deepEqual(seen[0], { kind: 'search', query: 'oklab' });
    assert.equal(items.length, 2);
  });

  test('a blend fetches every part and honours the proportion', async () => {
    const { fetch, seen } = recordingFetcher({
      home: page('h', 30),
      'list:l': page('l', 30),
    });
    const spec: FeedSpec = makeFeedSpec('t', 'T', {
      kind: 'blend',
      parts: [
        { source: { kind: 'list', listId: 'l' }, weight: 70 },
        { source: { kind: 'home' }, weight: 30 },
      ],
    });
    const { items } = await fetchForSpec(spec, prefs(), fetch);

    assert.equal(seen.length, 2, 'each part fetched exactly once');
    assert.ok(seen.some((s) => s.kind === 'list' && s.fids.length === 2));

    const firstTen = items.slice(0, 10);
    const fromList = firstTen.filter((i) => i.id.startsWith('l')).length;
    assert.equal(
      fromList,
      7,
      '70/30 is visible in the first ten, not the thousandth',
    );
  });

  test('one failing part degrades the blend instead of emptying the feed', async () => {
    const fetch = async (source: ResolvedSource) => {
      if (source.kind === 'search') throw new Error('search is down');
      return page('h', 10);
    };
    const { items, errors } = await fetchForSpec(
      makeFeedSpec('t', 'T', {
        kind: 'blend',
        parts: [
          { source: { kind: 'home' }, weight: 1 },
          { source: { kind: 'search', query: 'x' }, weight: 1 },
        ],
      }),
      prefs(),
      fetch,
    );
    assert.equal(items.length, 10, 'the surviving source still renders');
    assert.equal(
      errors.length,
      1,
      'and the failure is reported, not swallowed',
    );
    assert.equal(errors[0]!.source.kind, 'search');
  });

  test('every part failing throws rather than resolving to an empty page', async () => {
    const fetch = async () => {
      throw new Error('offline');
    };
    await assert.rejects(
      fetchForSpec(
        makeFeedSpec('t', 'T', {
          kind: 'blend',
          parts: [
            { source: { kind: 'home' }, weight: 1 },
            { source: { kind: 'following' }, weight: 1 },
          ],
        }),
        prefs(),
        fetch,
      ),
      (error: unknown) => {
        assert.ok(error instanceof AllSourcesFailedError);
        assert.equal(error.errors.length, 2);
        return true;
      },
    );
  });

  test('a single-source failure propagates, same as a blend that loses everything', async () => {
    const fetch = async () => {
      throw new Error('offline');
    };
    await assert.rejects(
      fetchForSpec(makeFeedSpec('t', 'T', { kind: 'home' }), prefs(), fetch),
      /offline/,
    );
  });

  test('a part turned down to zero is not fetched at all', async () => {
    const { fetch, seen } = recordingFetcher({ home: page('h', 6) });
    const { items } = await fetchForSpec(
      makeFeedSpec('t', 'T', {
        kind: 'blend',
        parts: [
          { source: { kind: 'home' }, weight: 1 },
          { source: { kind: 'search', query: 'expensive' }, weight: 0 },
        ],
      }),
      prefs(),
      fetch,
    );
    assert.deepEqual(
      seen.map((s) => s.kind),
      ['home'],
      'no request every refresh for nothing',
    );
    assert.equal(items.length, 6);
  });

  test('a cast reachable from two sources appears once', async () => {
    const shared = page('same', 4);
    const fetch = async () => shared;
    const { items } = await fetchForSpec(
      makeFeedSpec('t', 'T', {
        kind: 'blend',
        parts: [
          { source: { kind: 'home' }, weight: 1 },
          { source: { kind: 'following' }, weight: 1 },
        ],
      }),
      prefs(),
      fetch,
    );
    assert.equal(items.length, 4);
    assert.equal(new Set(items.map((i) => i.id)).size, 4);
  });

  test('a lopsided blend still shows the minority source early', async () => {
    const { fetch } = recordingFetcher({
      home: page('h', 60),
      following: page('f', 60),
    });
    const { items } = await fetchForSpec(
      makeFeedSpec('t', 'T', {
        kind: 'blend',
        parts: [
          { source: { kind: 'home' }, weight: 95 },
          { source: { kind: 'following' }, weight: 5 },
        ],
      }),
      prefs(),
      fetch,
    );
    const firstMinority = items.findIndex((i) => i.id.startsWith('f'));
    assert.ok(
      firstMinority >= 0 && firstMinority < 40,
      `minority source first appears at ${firstMinority}; a 95/5 blend that shows nothing for pages reads as a bug`,
    );
  });
});

describe('the client renders every source kind', () => {
  test('a blended feed goes all the way through the pipeline', async () => {
    const store = memoryStore();
    const client = new HomeClient({
      store,
      now: () => NOW,
      fetchFeed: async (source) =>
        source.kind === 'home' ? page('h', 10) : page('f', 10),
    });
    client.update((p) => upsertList(p, { id: 'l', name: 'List', fids: [1] }));
    client.update((p) => ({
      ...p,
      feeds: [
        ...p.feeds,
        makeFeedSpec('blended', 'Blended', {
          kind: 'blend',
          parts: [
            { source: { kind: 'home' }, weight: 3 },
            { source: { kind: 'following' }, weight: 1 },
          ],
        }),
      ],
      feedOrder: [...p.feedOrder, 'blended'],
    }));

    const feed = await client.renderFeed('blended');
    assert.equal(feed.items.length, 20);
    assert.ok(feed.items.some((i) => i.id.startsWith('h')));
    assert.ok(feed.items.some((i) => i.id.startsWith('f')));
    assert.equal(feed.mix.total, 20);
  });
});

describe('a degraded blend is visible to the reader', () => {
  test('renderFeed reports which source failed, and still renders', async () => {
    const client = new HomeClient({
      store: memoryStore(),
      now: () => NOW,
      fetchFeed: async (source) => {
        if (source.kind === 'following') throw new Error('following is down');
        return page('h', 8);
      },
    });
    client.update((p) => ({
      ...p,
      feeds: [
        ...p.feeds,
        makeFeedSpec('blended', 'Blended', {
          kind: 'blend',
          parts: [
            { source: { kind: 'home' }, weight: 7 },
            { source: { kind: 'following' }, weight: 3 },
          ],
        }),
      ],
      feedOrder: [...p.feedOrder, 'blended'],
    }));

    const feed = await client.renderFeed('blended');
    assert.equal(feed.items.length, 8);
    assert.equal(feed.sourceErrors.length, 1);
    assert.equal(feed.sourceErrors[0]!.source.kind, 'following');
  });

  test('an offline blend errors rather than claiming the reader is caught up', async () => {
    const client = new HomeClient({
      store: memoryStore(),
      now: () => NOW,
      fetchFeed: async () => {
        throw new Error('offline');
      },
    });
    client.update((p) => ({
      ...p,
      boundaries: { ...p.boundaries, catchUp: true },
      feeds: [
        ...p.feeds,
        makeFeedSpec('blended', 'Blended', {
          kind: 'blend',
          parts: [
            { source: { kind: 'home' }, weight: 1 },
            { source: { kind: 'following' }, weight: 1 },
          ],
        }),
      ],
      feedOrder: [...p.feedOrder, 'blended'],
    }));
    client.markRead(NOW - 1000);

    await assert.rejects(
      client.renderFeed('blended'),
      AllSourcesFailedError,
      'catch-up must never render an offline feed as "you are all caught up"',
    );
  });

  test('a healthy feed reports no source errors', async () => {
    const client = new HomeClient({
      store: memoryStore(),
      now: () => NOW,
      fetchFeed: async () => page('h', 5),
    });
    assert.deepEqual((await client.renderFeed()).sourceErrors, []);
  });
});
