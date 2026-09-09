export * from './types';
export * from './match';
export * from './sift';
export * from './rank';
export * from './blend';
export * from './receipts';

import type { FeedSpec } from '../feedspec/types';
import { rank, summarizeMix } from './rank';
import { sift } from './sift';
import type { FeedItemView, PipelineContext, PipelineResult } from './types';

/**
 * Filter, then rank, then report.
 *
 * Pure and synchronous by design: the same call runs against the live feed,
 * against a cached page to power the live preview under a slider, and against
 * a fixture in a test. A reader dragging the mix dial is watching this
 * function run on every frame, which is why nothing in here allocates a regex
 * or touches storage.
 */
export function runFeedPipeline(
  items: FeedItemView[],
  spec: FeedSpec,
  ctx: PipelineContext,
): PipelineResult {
  const { kept, receipts } = sift(items, spec.sift, ctx);
  const ordered = rank(kept, spec.sort, ctx);
  return { items: ordered, receipts, mix: summarizeMix(ordered) };
}
