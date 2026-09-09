/**
 * Fixtures shaped exactly like real API responses.
 *
 * Shipped from `src` rather than `test` so the client core and its end-to-end
 * tests use the same page the adapter's unit tests do — one definition of what
 * a realistic feed looks like, not three that drift apart.
 *
 * They are typed against `CastFeedItemLike`, and `compat/assertCompat.ts`
 * proves that shape matches the real generated `ApiCastFeedItem`. So a fixture
 * that satisfies these types is a fixture the real API could have produced —
 * which is the closest thing to live data available without credentials.
 */

import type { CastFeedItemLike, CastLike } from './apiShapes';

export const NOW = 1_764_600_000_000;
const HOUR = 3_600_000;

type CastOverrides = Partial<
  Omit<CastLike, 'author' | 'replies' | 'reactions' | 'recasts'>
> & {
  fid?: number;
  likes?: number;
  recastCount?: number;
  replyCount?: number;
};

export function cast(hash: string, overrides: CastOverrides = {}): CastLike {
  const {
    fid = 1,
    likes = 0,
    recastCount = 0,
    replyCount = 0,
    ...rest
  } = overrides;
  return {
    hash,
    text: '',
    timestamp: NOW,
    author: { fid },
    replies: { count: replyCount },
    reactions: { count: likes },
    recasts: { count: recastCount },
    ...rest,
  };
}

export function feedItem(
  id: string,
  options: {
    reason?: string;
    score?: number;
    authorQuality?: string;
    agoHours?: number;
    cast?: CastOverrides;
    pinned?: boolean;
  } = {},
): CastFeedItemLike {
  const timestamp = NOW - (options.agoHours ?? 0) * HOUR;
  const item: CastFeedItemLike = {
    id,
    timestamp,
    cast: cast(id, { timestamp, ...options.cast }),
  };
  if (options.pinned) item.pinned = true;
  const meta: NonNullable<CastFeedItemLike['meta']> = {};
  if (options.reason) meta.includeReason = { type: options.reason };
  if (options.score !== undefined) meta.score = options.score;
  if (options.authorQuality) meta.authorQuality = options.authorQuality;
  if (Object.keys(meta).length > 0) item.meta = meta;
  return item;
}

/**
 * A page shaped like one the home feed actually returns: a mix of reasons, a
 * promoted cast, a recast, a reply, a token post, a mini-app, and an author
 * posting three times in a row.
 */
export function homeFeedPage(): CastFeedItemLike[] {
  return [
    feedItem('0x01', {
      reason: 'following-author',
      score: 0.62,
      agoHours: 0.4,
      cast: {
        fid: 123,
        text: 'the thing nobody tells you about open protocols',
      },
    }),
    feedItem('0x02', {
      reason: 'popular',
      score: 0.94,
      agoHours: 1.1,
      authorQuality: 'high',
      cast: { fid: 5650, text: 'wrote up why client diversity matters' },
    }),
    feedItem('0x03', {
      reason: 'recasted-by-following',
      score: 0.71,
      agoHours: 0.9,
      cast: {
        fid: 4823,
        text: 'shipped: /design has a moderation queue now',
        recast: true,
        channel: { key: 'design' },
      },
    }),
    feedItem('0x04', {
      reason: 'snap-promoted',
      score: 0.55,
      agoHours: 0.2,
      cast: {
        fid: 9021,
        text: 'Trade perps with 1-click on Base.',
        embeds: {
          snap: [{ type: 'snap' }],
          images: [],
          urls: [],
          unknowns: [],
        },
      },
    }),
    feedItem('0x05', {
      reason: 'popular-in-channel',
      score: 0.83,
      agoHours: 5.5,
      cast: {
        fid: 1177,
        text: 'a taxonomy of feed anxiety',
        channel: { key: 'design' },
      },
    }),
    feedItem('0x06', {
      reason: 'high-quality-unfollowed',
      score: 0.68,
      agoHours: 1.8,
      authorQuality: 'neutral',
      cast: {
        fid: 762,
        text: 'infinite scroll is the absence of a stopping cue',
      },
    }),
    feedItem('0x07', {
      reason: 'following-author',
      score: 0.44,
      agoHours: 2.3,
      cast: { fid: 239, text: 'gm. 41 degrees and clear in brooklyn' },
    }),
    feedItem('0x08', {
      reason: 'follow-of-follow',
      score: 0.51,
      agoHours: 3.1,
      authorQuality: 'unranked',
      cast: {
        fid: 3390,
        text: 'open sourced the indexer',
        embeds: {
          images: [],
          unknowns: [],
          urls: [{ type: 'url', tokenV2: { ca: '0xabc' } }],
        },
      },
    }),
    feedItem('0x09', {
      reason: 'has-reply-by-followed',
      score: 0.77,
      agoHours: 7.2,
      cast: {
        fid: 2044,
        text: 'the ranking score is right there in the payload',
        parentHash: '0xparent',
      },
    }),
    // Same author three times: exercises the diversity cap.
    feedItem('0x0a', {
      reason: 'following-author',
      score: 0.4,
      agoHours: 0.5,
      cast: { fid: 239, text: 'one' },
    }),
    feedItem('0x0b', {
      reason: 'following-author',
      score: 0.39,
      agoHours: 0.6,
      cast: { fid: 239, text: 'two' },
    }),
    feedItem('0x0c', {
      reason: 'popular',
      score: 0.88,
      agoHours: 4.4,
      authorQuality: 'spam',
      cast: { fid: 474, text: 'three things about decentralized social' },
    }),
  ];
}
