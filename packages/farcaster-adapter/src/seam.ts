/**
 * The seam.
 *
 * In the reference client, `useMixedFeedItems` flattens API pages into a render
 * list with a plain `flatMap` (useMixedFeedItems.ts:311). That memo is the one
 * place a client-side filter and re-rank belongs, and this is the function that
 * goes there.
 *
 * Two things it must not get wrong:
 *
 *   Interstitials are not casts. Suggested-user and trending-topic rows have no
 *   author, no timestamp and no reason; ranking them as if they were casts
 *   would scatter them randomly through the feed. They keep their positions.
 *
 *   The render list keeps its original element type. `FeedItemView` is for
 *   deciding; the components downstream already know how to draw the API types
 *   and should keep receiving them untouched.
 */

import type {
  FeedSpec,
  DropReceipt,
  MixSummary,
  PipelineContext,
} from 'home-personalization';
import { runFeedPipeline } from 'home-personalization';

import type { CastFeedItemLike } from './apiShapes';
import { isRenderableCast, toFeedItemView } from './feedItem';

/**
 * Structural stand-in for the client's `MixedFeedItem`. Generic over the
 * discriminant so it fits the real `FeedItemType` enum without importing it —
 * `compat/assertCompat.ts` proves the real union satisfies this.
 */
export type MixedItemLike<TType, TCast extends CastFeedItemLike> =
  | { type: TType; item: TCast }
  | {
      type: Exclude<PropertyKey, TType> extends never ? never : unknown;
      item: unknown;
    };

export type SeamResult<TItem> = {
  /** The render list, personalised. Same element type that came in. */
  items: TItem[];
  receipts: DropReceipt[];
  mix: MixSummary;
  /** Casts removed by the reader's rules. Drives the "N hidden" line. */
  hiddenCount: number;
};

export type SeamOptions<TItem> = {
  /** Narrows the mixed list to cast rows. Usually `i.type === FeedItemType.Cast`. */
  isCast: (item: TItem) => boolean;
  /** Pulls the API feed item out of a cast row. Usually `i => i.item`. */
  getCast: (item: TItem) => CastFeedItemLike;
  spec: FeedSpec;
  context: PipelineContext;
};

/**
 * Personalise a mixed feed list in place of the reference client's `flatMap`.
 *
 * Interstitials are pinned to the fraction of the list they occupied, so a row
 * that sat a quarter of the way down still sits a quarter of the way down after
 * a re-rank that removed half the casts. Anchoring to the absolute index
 * instead would push every interstitial to the end of a heavily filtered feed.
 */
export function personalizeMixedFeed<TItem>(
  items: TItem[],
  { isCast, getCast, spec, context }: SeamOptions<TItem>,
): SeamResult<TItem> {
  const castRows: { item: TItem; view: ReturnType<typeof toFeedItemView> }[] =
    [];
  const interstitials: { item: TItem; fraction: number }[] = [];

  items.forEach((item, index) => {
    if (!isCast(item)) {
      interstitials.push({
        item,
        fraction: items.length <= 1 ? 0 : index / (items.length - 1),
      });
      return;
    }
    const apiItem = getCast(item);
    if (!isRenderableCast(apiItem)) return;
    castRows.push({ item, view: toFeedItemView(apiItem) });
  });

  const byId = new Map(castRows.map((r) => [r.view.id, r.item]));
  const result = runFeedPipeline(
    castRows.map((r) => r.view),
    spec,
    context,
  );

  const ranked: TItem[] = [];
  for (const view of result.items) {
    const original = byId.get(view.id);
    if (original !== undefined) ranked.push(original);
  }

  // Re-insert interstitials at their proportional positions, in original order,
  // clamped so two that were adjacent do not land on the same index.
  const out = [...ranked];
  let lastAt = -1;
  for (const { item, fraction } of interstitials) {
    const at = Math.min(
      out.length,
      Math.max(lastAt + 1, Math.round(fraction * out.length)),
    );
    out.splice(at, 0, item);
    lastAt = at;
  }

  return {
    items: out,
    receipts: result.receipts,
    mix: result.mix,
    hiddenCount: result.receipts.length,
  };
}
