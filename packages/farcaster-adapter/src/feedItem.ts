/**
 * `ApiCastFeedItem` -> `FeedItemView`.
 *
 * The single file in the system that knows both type worlds. Everything the
 * kernel decides is expressed against `FeedItemView`, so when the API changes
 * this is the only place that has to move.
 *
 * The three fields worth pointing at are `meta.includeReason`, `meta.score` and
 * `meta.authorQuality`. The reference client receives all three on every home
 * feed item and reads none of them outside analytics. They are why this adapter
 * exists.
 */

import type { AuthorQuality, FeedItemView } from 'home-personalization';
import { AUTHOR_QUALITIES } from 'home-personalization';

import type { CastFeedItemLike, CastLike } from './apiShapes';
import { classifyEmbeds } from './embeds';

function toAuthorQuality(value: string | undefined): AuthorQuality | undefined {
  if (!value) return undefined;
  // Unknown tiers are dropped rather than coerced: a quality the client does
  // not understand must not silently become one it filters on.
  return (AUTHOR_QUALITIES as readonly string[]).includes(value)
    ? (value as AuthorQuality)
    : undefined;
}

/**
 * A recast arrives as the original cast with `recast: true`, so the text,
 * author and engagement all belong to the original. That is what the reader
 * sees, so that is what gets filtered and ranked.
 */
export function toFeedItemView(item: CastFeedItemLike): FeedItemView {
  const cast: CastLike = item.cast;

  const view: FeedItemView = {
    id: item.id,
    // Feed item timestamp, not cast timestamp: for a recast or an evergreen
    // item these differ, and the feed's own ordering is the one to respect.
    timestampMs: item.timestamp,
    authorFid: cast.author.fid,
    text: cast.text,
    isRecast: cast.recast === true,
    isReply: typeof cast.parentHash === 'string' && cast.parentHash.length > 0,
    embedKinds: classifyEmbeds(cast),
    engagement: {
      likes: cast.reactions.count,
      recasts: cast.recasts.count,
      replies: cast.replies.count,
    },
  };

  if (cast.channel?.key) view.channelKey = cast.channel.key;

  const meta = item.meta;
  if (meta?.includeReason?.type) view.reason = meta.includeReason.type;
  if (typeof meta?.score === 'number' && Number.isFinite(meta.score)) view.score = meta.score;
  const quality = toAuthorQuality(meta?.authorQuality);
  if (quality) view.authorQuality = quality;

  return view;
}

/** A deleted cast is never worth ranking; drop it before the pipeline sees it. */
export function isRenderableCast(item: CastFeedItemLike): boolean {
  return item.cast.deleted !== true;
}
