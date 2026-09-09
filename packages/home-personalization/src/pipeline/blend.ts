/**
 * Blending several sources into one feed.
 *
 * A blend says "70% my design list, 30% home". The interesting question is what
 * that means for the first ten casts, not for the thousandth: a reader judges a
 * blend by the top of the page. Largest-remainder allocation over a small
 * window gets the proportion visibly right immediately, where naive round-robin
 * takes hundreds of items to converge and looks wrong the whole time.
 */

export type BlendPart<T> = {
  weight: number;
  items: T[];
};

/**
 * Interleave by weight, deterministically.
 *
 * Each window of `window` slots is allocated across the parts in proportion to
 * their weights, with the leftover slots going to the parts whose fractional
 * entitlement is largest. Exhausted parts hand their slots back to the others
 * rather than leaving gaps, so a blend whose minority source runs dry degrades
 * into the majority source instead of ending early.
 */
export function interleaveByWeight<T>(parts: BlendPart<T>[], window = 10): T[] {
  const live = parts.filter((p) => p.weight > 0 && p.items.length > 0);
  if (live.length === 0) return [];
  if (live.length === 1) return [...live[0]!.items];

  const cursors = live.map(() => 0);
  const out: T[] = [];
  const total = () =>
    live.reduce((n, p, i) => n + (p.items.length - cursors[i]!), 0);

  while (total() > 0) {
    const available = live
      .map((p, i) => ({
        i,
        left: p.items.length - cursors[i]!,
        weight: p.weight,
      }))
      .filter((a) => a.left > 0);
    const weightSum = available.reduce((n, a) => n + a.weight, 0);
    const slots = Math.min(window, total());

    // Largest remainder: floor each share, then hand the leftover slots to the
    // parts that were rounded down hardest. Keeps proportions honest at small
    // window sizes, where plain rounding drifts badly.
    const exact = available.map((a) => ({
      ...a,
      share: (a.weight / weightSum) * slots,
    }));
    const alloc = exact.map((e) => ({
      ...e,
      n: Math.min(e.left, Math.floor(e.share)),
    }));
    let assigned = alloc.reduce((n, a) => n + a.n, 0);
    const byRemainder = [...alloc].sort(
      (a, b) =>
        b.share - Math.floor(b.share) - (a.share - Math.floor(a.share)) ||
        a.i - b.i,
    );
    let k = 0;
    while (assigned < slots && k < byRemainder.length * 4) {
      const cand = byRemainder[k % byRemainder.length]!;
      if (cand.n < cand.left) {
        cand.n++;
        assigned++;
      }
      k++;
    }

    // Emit in part order so the highest-weighted source leads each window —
    // the top of the page is what the reader actually reads.
    const ordered = [...alloc].sort((a, b) => b.weight - a.weight || a.i - b.i);
    let emitted = 0;
    for (const a of ordered) {
      for (let n = 0; n < a.n; n++) {
        out.push(live[a.i]!.items[cursors[a.i]!]!);
        cursors[a.i]!++;
        emitted++;
      }
    }
    if (emitted === 0) break; // nothing allocatable; avoid spinning
  }

  return out;
}

/**
 * Drop repeats, keeping the first occurrence.
 *
 * Blends and list feeds routinely surface the same cast from two sources. The
 * reader should see it once, in the position its strongest source earned it.
 */
export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * Interleave and de-duplicate in one step.
 *
 * Generic over anything with an id rather than over `FeedItemView`: blending
 * happens before adaptation, on whatever the fetcher returned, and a function
 * that only needs an id should not demand a whole feed item.
 */
export function blendFeeds<T extends { id: string }>(
  parts: BlendPart<T>[],
  window = 10,
): T[] {
  return dedupeById(interleaveByWeight(parts, window));
}
