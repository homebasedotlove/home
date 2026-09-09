import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

import { blendFeeds, dedupeById, interleaveByWeight } from '../src/pipeline/blend';
import type { FeedItemView } from '../src/pipeline/types';

function make(prefix: string, n: number): FeedItemView[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    timestampMs: 1000 - i,
    authorFid: 1,
    text: '',
    isRecast: false,
    isReply: false,
    embedKinds: [],
    engagement: { likes: 0, recasts: 0, replies: 0 },
  }));
}

const share = (items: { id: string }[], prefix: string) =>
  items.filter((i) => i.id.startsWith(prefix)).length / items.length;

describe('interleaveByWeight', () => {
  test('honours the proportion at the top of the page, not only in the limit', () => {
    const out = interleaveByWeight(
      [
        { weight: 70, items: make('a', 100) },
        { weight: 30, items: make('b', 100) },
      ],
      10,
    );
    const firstTen = out.slice(0, 10);
    assert.equal(share(firstTen, 'a'), 0.7, 'the first window is already 70/30');
    assert.equal(share(out.slice(0, 20), 'a'), 0.7);
  });

  test('weights are relative, so any scale expresses the same blend', () => {
    const asPercent = interleaveByWeight(
      [{ weight: 75, items: make('a', 40) }, { weight: 25, items: make('b', 40) }],
      8,
    );
    const asSliders = interleaveByWeight(
      [{ weight: 3, items: make('a', 40) }, { weight: 1, items: make('b', 40) }],
      8,
    );
    assert.deepEqual(asPercent.map((i) => i.id), asSliders.map((i) => i.id));
  });

  test('emits every item exactly once', () => {
    const out = interleaveByWeight(
      [{ weight: 2, items: make('a', 13) }, { weight: 1, items: make('b', 7) }],
      6,
    );
    assert.equal(out.length, 20);
    assert.equal(new Set(out.map((i) => i.id)).size, 20);
  });

  test('an exhausted source hands its slots back rather than leaving gaps', () => {
    const out = interleaveByWeight(
      [{ weight: 1, items: make('a', 2) }, { weight: 1, items: make('b', 10) }],
      4,
    );
    assert.equal(out.length, 12);
    assert.deepEqual(out.slice(-4).map((i) => i.id.startsWith('b')), [true, true, true, true]);
  });

  test('preserves each source order', () => {
    const out = interleaveByWeight(
      [{ weight: 1, items: make('a', 5) }, { weight: 1, items: make('b', 5) }],
      4,
    );
    const aOrder = out.filter((i) => i.id.startsWith('a')).map((i) => i.id);
    assert.deepEqual(aOrder, ['a0', 'a1', 'a2', 'a3', 'a4']);
  });

  test('zero-weight and empty parts drop out', () => {
    const out = interleaveByWeight([
      { weight: 0, items: make('a', 5) },
      { weight: 1, items: make('b', 3) },
      { weight: 5, items: [] },
    ]);
    assert.deepEqual(out.map((i) => i.id), ['b0', 'b1', 'b2']);
  });

  test('degenerate inputs return empty rather than throwing', () => {
    assert.deepEqual(interleaveByWeight([]), []);
    assert.deepEqual(interleaveByWeight([{ weight: 0, items: [] }]), []);
  });

  test('a single live part is a pass-through', () => {
    const items = make('a', 4);
    assert.deepEqual(interleaveByWeight([{ weight: 3, items }]).map((i) => i.id),
      items.map((i) => i.id));
  });

  test('is deterministic', () => {
    const build = () => interleaveByWeight(
      [{ weight: 5, items: make('a', 20) }, { weight: 3, items: make('b', 20) }, { weight: 2, items: make('c', 20) }],
      10,
    );
    assert.deepEqual(build().map((i) => i.id), build().map((i) => i.id));
  });
});

describe('dedupe', () => {
  test('keeps the first occurrence, so the strongest source wins the slot', () => {
    const dup = [...make('a', 2), ...make('a', 3)];
    assert.deepEqual(dedupeById(dup).map((i) => i.id), ['a0', 'a1', 'a2']);
  });

  test('blendFeeds dedupes across sources', () => {
    const out = blendFeeds([
      { weight: 1, items: make('x', 3) },
      { weight: 1, items: make('x', 3) },
    ], 4);
    assert.equal(out.length, 3);
  });
});
