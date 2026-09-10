import { existsSync } from 'node:fs';
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

/**
 * The integration proof.
 *
 * Everything else in this repo tests Home's source. This tests the COMPILED
 * artifacts from inside a farcasterxyz/client checkout — the same dist files
 * Vite bundles into the web app — driven by the exact FeedSpec patched into
 * that client's `useFeedItems.ts`.
 *
 * Opt-in, because it needs a built client:
 *
 *   SNAPSHOT=/path/to/client pnpm --filter farcaster-adapter build
 *   HOME_CLIENT=/path/to/client pnpm --filter farcaster-adapter test
 *
 * Skipped, not failed, when that checkout is absent: a contributor without one
 * should still get a green suite.
 */
const CLIENT = process.env.HOME_CLIENT ?? process.env.SNAPSHOT ?? '';
const adapterDist = `${CLIENT}/packages/farcaster-adapter/dist/index.js`;
const kernelDist = `${CLIENT}/packages/home-personalization/dist/index.js`;
const available =
  Boolean(CLIENT) && existsSync(adapterDist) && existsSync(kernelDist);

/**
 * Loaded from the client's dist, so untyped here by construction — the point is
 * to exercise the built artifact, not this repo's declarations. The casts are
 * safe because every use sits inside `describe.skipIf(!available)`.
 */
type Loaded = Record<string, (...args: never[]) => never>;
const emptyModule = {} as Loaded;

const adapter: Loaded = available
  ? ((await import(/* @vite-ignore */ adapterDist)) as Loaded)
  : emptyModule;
const kernel: Loaded = available
  ? ((await import(/* @vite-ignore */ kernelDist)) as Loaded)
  : emptyModule;

/* eslint-disable @typescript-eslint/no-explicit-any */
const personalizeMixedFeed = adapter.personalizeMixedFeed as any;
const makeFeedSpec = kernel.makeFeedSpec as any;
const emptySift = kernel.emptySift as any;
const defaultSort = kernel.defaultSort as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const NOW = 1_764_600_000_000;
const user = (fid: number, name: string) => ({
  fid,
  username: name,
  displayName: name,
  pfp: { url: 'https://example.invalid/a.png', verified: false },
  profile: {
    bio: { text: '', mentions: [] },
    location: { placeId: '', description: '' },
  },
  followerCount: 100,
  followingCount: 100,
});
const item = (
  id: string,
  fid: number,
  name: string,
  text: string,
  reason: string,
  score: number,
) => ({
  id,
  timestamp: NOW - 60000,
  otherParticipants: [],
  replies: [],
  cast: {
    hash: id,
    threadHash: id,
    author: user(fid, name),
    text,
    timestamp: NOW - 60000,
    replies: { count: 0 },
    reactions: { count: 0 },
    recasts: { count: 0 },
    watches: { count: 0 },
    embeds: { images: [], urls: [], unknowns: [] },
  },
  meta: { includeReason: { type: reason }, score },
});

// Byte-for-byte the spec patched into useFeedItems.ts in the client: the state
// a reader reaches by tapping Less on Discovery a few times and More on the
// people they follow.
const homeFeedSpec = !available
  ? undefined
  : makeFeedSpec(
      'home',
      'Home',
      { kind: 'home' },
      {
        sift: { ...emptySift(), mutedGroups: ['promoted'] },
        sort: {
          ...defaultSort(),
          mode: 'weighted',
          weights: { direct: 3, network: 1, discovery: 0.3 },
        },
      },
    );

// A gentler mix, for the cap test below.
const gentleSpec = !available
  ? undefined
  : makeFeedSpec(
      'home',
      'Home',
      { kind: 'home' },
      {
        sift: { ...emptySift(), mutedGroups: ['promoted'] },
        sort: {
          ...defaultSort(),
          mode: 'weighted',
          weights: { direct: 1.8, network: 1, discovery: 0.5 },
        },
      },
    );

const page = [
  item('0xaa', 501, 'popularperson', 'POPULAR high score', 'popular', 0.95),
  item('0xbb', 502, 'promoter', 'PROMOTED should vanish', 'snap-promoted', 0.9),
  item('0xcc', 503, 'friend', 'FOLLOWED low score', 'following-author', 0.1),
  item('0xdd', 504, 'suggested', 'SUGGESTED', 'high-quality-unfollowed', 0.7),
  item('0xee', 505, 'recaster', 'RECASTED', 'recasted-by-following', 0.5),
];

const run = (spec = homeFeedSpec) =>
  personalizeMixedFeed(page, {
    isCast: () => true,
    getCast: (i: unknown) => i,
    spec,
    context: { now: NOW },
  });

const label = (i: { cast: { text: string } }) => i.cast.text.split(' ')[0];

describe.skipIf(!available)(
  'the seam, running from the artifacts built inside the client',
  () => {
    test('the promoted cast is removed and the receipt names the rule', () => {
      const out = run();
      assert.equal(
        out.items.some((i: never) => label(i) === 'PROMOTED'),
        false,
      );
      assert.equal(out.hiddenCount, 1);
      assert.equal(out.receipts[0].cause, 'muted-group');
      assert.equal(out.receipts[0].rule, 'promoted');
    });

    test("the reader's weights re-rank the real feed", () => {
      const server = page.filter((i) => label(i) !== 'PROMOTED').map(label);
      const weighted = run().items.map(label);
      assert.notDeepEqual(weighted, server, 'the feed did not move');
      assert.equal(
        weighted[0],
        'FOLLOWED',
        `a followed author scored 0.10 leads over a popular cast scored 0.95: ${weighted.join(', ')}`,
      );
    });

    test('but a weight nudges within the band rather than overriding it', () => {
      // Deliberate, and the same cap that governs affinity: at 1.8x, direct does
      // not overcome a 4x normalised score gap. A slider that could annihilate
      // the server's ranking would produce a feed the reader did not intend and
      // could not diagnose. The ordering still changes; it just does not invert.
      const gentle = run(gentleSpec).items.map(label);
      const server = page.filter((i) => label(i) !== 'PROMOTED').map(label);
      assert.notDeepEqual(gentle, server);
      assert.notEqual(gentle[0], 'FOLLOWED');
    });

    test('nothing vanishes without a receipt', () => {
      const out = run();
      assert.equal(out.items.length + out.receipts.length, page.length);
    });

    test('the render list holds the original API objects, not adapted copies', () => {
      assert.ok(run().items.every((i: never) => page.includes(i)));
    });

    test('every surviving item keeps its meta intact for the why-chip', () => {
      assert.ok(
        run().items.every(
          (i: { meta?: { includeReason?: { type: string } } }) =>
            Boolean(i.meta?.includeReason?.type),
        ),
      );
    });

    test('the mix reports what is actually visible', () => {
      const out = run();
      assert.equal(out.mix.total, 4);
      assert.equal(out.mix.byGroup.promoted, undefined);
      assert.equal(out.mix.byGroup.direct, 1);
    });
  },
);
