/**
 * Defaults and starting points.
 *
 * A customizable client still has to be good before anyone touches a setting.
 * These defaults are opinionated on purpose — the difference from the
 * reference client is not that Home ships without opinions, it is that every
 * opinion here is visible in the same UI that can change it.
 */

import type {
  Density,
  FeedSpec,
  SiftRules,
  SortSpec,
  Source,
} from './types';
import { FEED_SPEC_VERSION } from './types';

export function emptySift(): SiftRules {
  return {
    mutedReasons: [],
    mutedGroups: [],
    keywords: [],
    authors: [],
    channels: [],
    hideReplies: false,
    hideRecasts: false,
    hideTextless: false,
    mutedEmbedKinds: [],
  };
}

export function defaultSort(): SortSpec {
  return {
    mode: 'server',
    weights: {},
    recencyHalfLifeHours: 6,
    affinityBoost: 0,
    diversity: { maxPerAuthor: 3, window: 25 },
  };
}

export function makeFeedSpec(
  id: string,
  name: string,
  source: Source,
  overrides: Partial<Omit<FeedSpec, 'version' | 'id' | 'name' | 'source'>> = {},
): FeedSpec {
  return {
    version: FEED_SPEC_VERSION,
    id,
    name,
    source,
    sift: overrides.sift ?? emptySift(),
    sort: overrides.sort ?? defaultSort(),
    ...(overrides.icon ? { icon: overrides.icon } : {}),
    ...(overrides.skin ? { skin: overrides.skin } : {}),
    ...(overrides.description ? { description: overrides.description } : {}),
  };
}

/**
 * The feeds a new account starts with. Three, not one: the first thing Home
 * teaches is that a feed is a thing you can have more than one of.
 */
export function starterFeeds(): FeedSpec[] {
  return [
    makeFeedSpec('home', 'Home', { kind: 'home' }, {
      icon: '🏠',
      description: "The ranked feed, with its reasons showing.",
      skin: { showWhyChips: true },
    }),
    makeFeedSpec('following', 'Following', { kind: 'following' }, {
      icon: '👥',
      description: 'Only people you follow, newest first. Nothing added.',
      sort: { ...defaultSort(), mode: 'chronological', diversity: {} },
    }),
    makeFeedSpec(
      'quiet',
      'Quiet',
      { kind: 'home' },
      {
        icon: '🌙',
        description:
          'Your network without the discovery layer. No promoted casts, no suggestions, no counts.',
        sift: {
          ...emptySift(),
          mutedGroups: ['promoted', 'discovery'],
        },
        sort: {
          ...defaultSort(),
          mode: 'weighted',
          weights: { direct: 1.4, network: 1 },
          recencyHalfLifeHours: 12,
          diversity: { maxPerAuthor: 2, window: 20 },
        },
        skin: { hideCounts: true, density: 'comfortable', media: 'tap' },
      },
    ),
  ];
}

/** Row heights in points, used by both the list virtualiser and the preview. */
export const DENSITY_METRICS: Record<
  Density,
  { paddingY: number; gap: number; avatar: number; lineHeightScale: number }
> = {
  comfortable: { paddingY: 14, gap: 12, avatar: 40, lineHeightScale: 1.5 },
  compact: { paddingY: 10, gap: 8, avatar: 32, lineHeightScale: 1.4 },
  dense: { paddingY: 6, gap: 6, avatar: 24, lineHeightScale: 1.3 },
};
