/**
 * On-device affinity.
 *
 * Who does this reader actually engage with, as opposed to who they once
 * followed? The signal is obvious and the ethics are not, so three rules are
 * built in rather than left to the caller:
 *
 *   It never leaves the device. There is no serialisation format here that is
 *   meant to be uploaded, and the store is deliberately small enough to keep in
 *   local storage.
 *
 *   It is off unless asked for. `affinityBoost` defaults to 0, and at 0 the
 *   ranking term vanishes entirely. A client that silently re-ranks by your own
 *   click history is doing the thing you left.
 *
 *   It decays. Interest is not permanent, and a store that only accumulates
 *   would pin a reader to whatever they cared about a year ago.
 */

export type InteractionKind = 'like' | 'recast' | 'reply' | 'open-profile' | 'dwell';

/** What each interaction is worth. Replying is a stronger signal than liking. */
const WEIGHTS: Record<InteractionKind, number> = {
  reply: 3,
  recast: 2.5,
  like: 1,
  'open-profile': 1.5,
  dwell: 0.25,
};

export type AffinityState = {
  /** fid -> accumulated, decayed score. */
  scores: Record<string, number>;
  /** When the store was last decayed, so decay is applied lazily. */
  updatedAt: number;
};

/** Score halves after this long without interaction. */
export const AFFINITY_HALF_LIFE_MS = 30 * 86_400_000;

/** Cap on tracked authors, so the store cannot grow without bound. */
export const AFFINITY_MAX_AUTHORS = 500;

export function emptyAffinity(now: number): AffinityState {
  return { scores: {}, updatedAt: now };
}

/**
 * Apply elapsed decay. Done lazily on read and write rather than on a timer:
 * the result is identical and it costs nothing while the app is closed.
 */
export function decayAffinity(state: AffinityState, now: number): AffinityState {
  const elapsed = now - state.updatedAt;
  if (elapsed <= 0) return state;
  const factor = Math.pow(0.5, elapsed / AFFINITY_HALF_LIFE_MS);
  if (factor > 0.999) return state;
  const scores: Record<string, number> = {};
  for (const [fid, score] of Object.entries(state.scores)) {
    const next = score * factor;
    // Drop what has decayed into noise; keeps the store small without a sweep.
    if (next >= 0.01) scores[fid] = next;
  }
  return { scores, updatedAt: now };
}

export function recordInteraction(
  state: AffinityState,
  fid: number,
  kind: InteractionKind,
  now: number,
): AffinityState {
  const decayed = decayAffinity(state, now);
  const key = String(fid);
  const scores = { ...decayed.scores, [key]: (decayed.scores[key] ?? 0) + WEIGHTS[kind] };

  if (Object.keys(scores).length > AFFINITY_MAX_AUTHORS) {
    const kept = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, AFFINITY_MAX_AUTHORS);
    return { scores: Object.fromEntries(kept), updatedAt: now };
  }
  return { scores, updatedAt: now };
}

/**
 * Build the 0–1 lookup the ranker consumes.
 *
 * Normalised against the reader's own maximum, not a global constant: what
 * counts as "a lot of engagement" differs by an order of magnitude between a
 * lurker and a poster, and an absolute threshold would make the boost do
 * nothing for one and everything for the other. 0.5 is the neutral midpoint,
 * so an author with no history scores the same as one the reader is indifferent
 * to, and the ranking term stays 1.
 */
export function affinityLookup(
  state: AffinityState,
  now: number,
): (fid: number) => number | undefined {
  const decayed = decayAffinity(state, now);
  const values = Object.values(decayed.scores);
  const max = values.length > 0 ? Math.max(...values) : 0;
  if (max <= 0) return () => undefined;
  return (fid: number) => {
    const score = decayed.scores[String(fid)];
    if (score === undefined) return undefined;
    return 0.5 + 0.5 * Math.min(1, score / max);
  };
}

/** The authors this reader engages with most. Powers "build a list from this". */
export function topAuthors(state: AffinityState, now: number, limit = 30): number[] {
  return Object.entries(decayAffinity(state, now).scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([fid]) => Number(fid));
}
