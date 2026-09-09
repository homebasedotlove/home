/**
 * Ranking.
 *
 * Two decisions shape this file.
 *
 * Scores are rank-normalised before anything else touches them. `meta.score`
 * arrives on an undocumented scale that the server is free to change; treating
 * it as a percentile within the current batch makes the reader's weights mean
 * the same thing this week as last week, and lets scored and unscored items
 * sit in one list without one class swamping the other.
 *
 * Raw engagement counts are deliberately not an input. Re-ranking on likes
 * on-device would just rebuild the popularity contest the reader opened this
 * feed to get away from, using worse data than the server has.
 */

import { reasonGroup } from '../reasons/index';
import type { DiversityCaps, SortSpec } from '../feedspec/types';
import type { FeedItemView, MixSummary, PipelineContext } from './types';

const HOUR_MS = 3_600_000;

/**
 * Map scores onto (0, 1) by rank. Ties share the average of the positions they
 * span, so a batch where the server scored everything identically stays
 * neutral instead of picking an arbitrary winner.
 *
 * The interval is open at both ends — position p of n maps to (p + 1)/(n + 1),
 * not p/(n - 1). With a closed interval the lowest-scored item in every batch
 * normalises to exactly 0, and zero times any weight is still zero: the
 * reader's "more from people I follow" slider would visibly move and silently
 * fail to lift that item. Leaving headroom at both ends keeps every weight
 * meaningful for every item.
 */
export function rankNormalize(items: FeedItemView[]): Map<string, number> {
  const out = new Map<string, number>();
  const scored = items.filter((i) => i.score !== undefined);
  if (scored.length === 0) {
    for (const i of items) out.set(i.id, 0.5);
    return out;
  }
  const sorted = [...scored].sort((a, b) => a.score! - b.score!);
  const denom = sorted.length + 1;
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1]!.score === sorted[i]!.score)
      j++;
    const avgPos = (i + j) / 2;
    const value = (avgPos + 1) / denom;
    for (let k = i; k <= j; k++) out.set(sorted[k]!.id, value);
    i = j + 1;
  }
  for (const item of items) {
    if (!out.has(item.id)) out.set(item.id, 0.5);
  }
  return out;
}

export function recencyFactor(ageMs: number, halfLifeHours: number): number {
  if (halfLifeHours <= 0) return 1;
  const ageHours = Math.max(0, ageMs) / HOUR_MS;
  return Math.pow(0.5, ageHours / halfLifeHours);
}

/**
 * Affinity in 0–1 becomes a multiplier centred on 1. At `boost` = 0 the term
 * vanishes entirely, so a reader who has not opted in is never silently
 * re-ranked by their own click history.
 */
export function affinityFactor(
  affinity: number | undefined,
  boost: number,
): number {
  if (!boost || affinity === undefined) return 1;
  return 1 + boost * (affinity - 0.5) * 2;
}

export function scoreItem(
  item: FeedItemView,
  normalized: number,
  sort: SortSpec,
  ctx: PipelineContext,
): number {
  const group = item.reason ? reasonGroup(item.reason) : undefined;
  const weight = group ? (sort.weights[group] ?? 1) : 1;
  const recency = recencyFactor(
    ctx.now - item.timestampMs,
    sort.recencyHalfLifeHours,
  );
  const affinity = affinityFactor(
    ctx.affinity?.(item.authorFid),
    sort.affinityBoost,
  );
  // A zero weight collapses a whole category to the bottom while preserving
  // the relative order inside it, so turning the dial back up restores the
  // ordering the reader had rather than an arbitrary one.
  return Math.max(normalized * weight * recency * affinity, 0);
}

/**
 * Interleave so no author or channel dominates a window.
 *
 * Over-cap items are deferred, never dropped. Removing a post because someone
 * posted four times in a row is a judgement the reader did not ask for; moving
 * it down the page produces the same relief and loses nothing.
 */
export function diversify(
  items: FeedItemView[],
  caps: DiversityCaps,
): FeedItemView[] {
  const { maxPerAuthor, maxPerChannel } = caps;
  if (!maxPerAuthor && !maxPerChannel) return items;
  const window = caps.window ?? 25;

  const emitted: FeedItemView[] = [];
  const deferred: FeedItemView[] = [];
  const recent: FeedItemView[] = [];

  const countIn = (
    pick: (i: FeedItemView) => string | undefined,
    key: string,
  ) => recent.reduce((n, i) => (pick(i) === key ? n + 1 : n), 0);

  const fits = (item: FeedItemView): boolean => {
    if (maxPerAuthor !== undefined) {
      if (
        countIn((i) => String(i.authorFid), String(item.authorFid)) >=
        maxPerAuthor
      )
        return false;
    }
    if (maxPerChannel !== undefined && item.channelKey) {
      if (countIn((i) => i.channelKey, item.channelKey) >= maxPerChannel)
        return false;
    }
    return true;
  };

  const emit = (item: FeedItemView) => {
    emitted.push(item);
    recent.push(item);
    if (recent.length > window) recent.shift();
  };

  for (const item of items) {
    // Before taking the next item, see whether anything held back earlier now
    // fits. This keeps deferred posts close to their original position rather
    // than exiling them all to the end of the page.
    for (let d = 0; d < deferred.length; d++) {
      const candidate = deferred[d]!;
      if (fits(candidate)) {
        deferred.splice(d, 1);
        emit(candidate);
        d--;
      }
    }
    if (fits(item)) emit(item);
    else deferred.push(item);
  }

  return [...emitted, ...deferred];
}

export function rank(
  items: FeedItemView[],
  sort: SortSpec,
  ctx: PipelineContext,
): FeedItemView[] {
  let ordered: FeedItemView[];

  if (sort.mode === 'chronological') {
    ordered = [...items].sort((a, b) => b.timestampMs - a.timestampMs);
  } else if (sort.mode === 'weighted') {
    const normalized = rankNormalize(items);
    const scores = new Map<string, number>();
    for (const item of items) {
      scores.set(
        item.id,
        scoreItem(item, normalized.get(item.id) ?? 0.5, sort, ctx),
      );
    }
    ordered = [...items].sort((a, b) => {
      const d = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
      // Newest first among equals, then by id so the order is total and a
      // re-render never reshuffles the page under the reader's thumb.
      return d !== 0
        ? d
        : b.timestampMs - a.timestampMs ||
            (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
  } else {
    ordered = [...items];
  }

  return diversify(ordered, sort.diversity);
}

export function summarizeMix(items: FeedItemView[]): MixSummary {
  const byGroup: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  let unattributed = 0;

  for (const item of items) {
    if (!item.reason) {
      unattributed++;
      continue;
    }
    byReason[item.reason] = (byReason[item.reason] ?? 0) + 1;
    const g = reasonGroup(item.reason);
    if (g) byGroup[g] = (byGroup[g] ?? 0) + 1;
    else unattributed++;
  }

  return { byGroup, byReason, unattributed, total: items.length };
}
