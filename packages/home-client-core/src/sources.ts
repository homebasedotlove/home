/**
 * Resolving a FeedSpec's source into casts.
 *
 * The split matters: the *app* knows how to talk to the API, and the core knows
 * how to compose. So a fetcher only ever sees a leaf source — home, following,
 * a channel, a resolved list of fids, a search query — and blending, list
 * resolution and de-duplication happen here, once, rather than in every caller.
 *
 * Without this, `list`, `search` and `blend` are types with no path to a
 * screen, which is how "we support custom feeds" quietly means "we have a
 * struct for it".
 */

import { blendFeeds, dedupeById } from 'home-personalization';
import type {
  FeedSpec,
  Preferences,
  Source,
  SourceBlend,
} from 'home-personalization';
import type { CastFeedItemLike } from 'farcaster-adapter';

/** Every source except a blend, which is composed rather than fetched. */
export type LeafSource = Exclude<Source, SourceBlend>;

/**
 * A list resolved to the accounts it names, so the fetcher never has to know
 * about Home's preference document.
 */
export type ResolvedListSource = {
  kind: 'list';
  listId: string;
  fids: number[];
};

export type ResolvedSource =
  Exclude<LeafSource, { kind: 'list' }> | ResolvedListSource;

/** What the app implements: one leaf source in, a page of casts out. */
export type LeafFetcher = (
  source: ResolvedSource,
  spec: FeedSpec,
) => Promise<CastFeedItemLike[]>;

/** A blend part that did not load. Surfaced to the reader, not just logged. */
export type SourceError = { source: LeafSource; error: unknown };

export type FetchResult = {
  items: CastFeedItemLike[];
  /** Empty unless a blend degraded. One entry per part that failed. */
  errors: SourceError[];
};

/**
 * Thrown when every source of a feed failed.
 *
 * A blend whose parts all fail must not resolve to an empty page: downstream,
 * an empty page in catch-up mode renders as "you're all caught up", which is a
 * lie about the network. A single-source feed already rejects here; this keeps
 * blends on the same path.
 */
export class AllSourcesFailedError extends Error {
  readonly errors: SourceError[];

  constructor(errors: SourceError[]) {
    super(
      `every source in this feed failed to load (${errors.length} of ${errors.length})`,
    );
    this.name = 'AllSourcesFailedError';
    this.errors = errors;
  }
}

export function resolveSource(
  source: LeafSource,
  prefs: Preferences,
): ResolvedSource {
  if (source.kind !== 'list') return source;
  const list = prefs.lists.find((l) => l.id === source.listId);
  // A list that has been deleted resolves to an empty one rather than throwing.
  // The feed then renders empty, which the editor's preview reports as such —
  // a better failure than a crash on a feed the reader forgot they had.
  return { kind: 'list', listId: source.listId, fids: list?.fids ?? [] };
}

/**
 * Fetch whatever a spec's source describes.
 *
 * Blend parts are fetched concurrently and interleaved at their weights. A part
 * that fails is dropped rather than failing the whole feed: losing one source
 * of a blend should degrade the feed, not empty it.
 */
export async function fetchForSpec(
  spec: FeedSpec,
  prefs: Preferences,
  fetchLeaf: LeafFetcher,
): Promise<FetchResult> {
  const source = spec.source;

  if (source.kind !== 'blend') {
    // A single-source failure propagates, as any fetch failure should.
    return {
      items: dedupeById(await fetchLeaf(resolveSource(source, prefs), spec)),
      errors: [],
    };
  }

  // A part the reader has turned down to zero contributes nothing, so fetching
  // it would spend a request every refresh on content that is discarded.
  const active = source.parts.filter((part) => part.weight > 0);
  if (active.length === 0) return { items: [], errors: [] };

  const errors: SourceError[] = [];
  const settled = await Promise.all(
    active.map(async (part) => {
      try {
        return {
          weight: part.weight,
          items: await fetchLeaf(resolveSource(part.source, prefs), spec),
        };
      } catch (error) {
        errors.push({ source: part.source, error });
        return { weight: part.weight, items: [] as CastFeedItemLike[] };
      }
    }),
  );

  if (errors.length === active.length) throw new AllSourcesFailedError(errors);

  // blendFeeds de-duplicates, so a cast reachable from two sources appears once,
  // in the position its highest-weighted source earned it.
  return { items: blendFeeds(settled, blendWindow(source)), errors };
}

const DEFAULT_BLEND_WINDOW = 10;
const MAX_BLEND_WINDOW = 40;

/**
 * Window size for interleaving.
 *
 * Two failure modes pull in opposite directions. Too small and the proportions
 * quantise badly — a 70/30 blend over four slots rounds to 75/25 and the reader
 * gets a mix they did not ask for. Too small in the other sense and a 95/5
 * blend never reaches its minority source at all, which reads as the source
 * being broken.
 *
 * So the window is at least ten (enough for common ratios to land exactly) and
 * at least `total / smallest` (enough for the smallest part to earn one slot),
 * capped so a pathological 999/1 blend does not push its minority source off
 * the end of the page instead.
 */
function blendWindow(source: SourceBlend): number {
  const weights = source.parts.map((p) => p.weight).filter((w) => w > 0);
  const total = weights.reduce((n, w) => n + w, 0);
  const smallest = weights.length > 0 ? Math.min(...weights) : 0;
  if (smallest <= 0 || total <= 0) return DEFAULT_BLEND_WINDOW;
  return Math.min(
    MAX_BLEND_WINDOW,
    Math.max(DEFAULT_BLEND_WINDOW, Math.ceil(total / smallest)),
  );
}
