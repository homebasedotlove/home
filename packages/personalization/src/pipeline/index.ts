export * from './types.ts';
export * from './match.ts';
export * from './sift.ts';
export * from './rank.ts';

import type { FeedSpec } from '../feedspec/types.ts';
import { rank, summarizeMix } from './rank.ts';
import { sift } from './sift.ts';
import type { FeedItemView, PipelineContext, PipelineResult } from './types.ts';

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
