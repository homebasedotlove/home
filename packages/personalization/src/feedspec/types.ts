/**
 * A FeedSpec is a complete, portable description of one feed: where its casts
 * come from, what gets removed, what comes first, and how it looks.
 *
 * Three properties are load-bearing:
 *
 *   Serializable — it is plain JSON, so it round-trips through a share link,
 *   a gist, a channel post, or an export file. Your taste travels with you the
 *   way your social graph already does.
 *
 *   Declarative — it says what the reader wants, not how to compute it. The
 *   same spec can be evaluated on-device today and pushed to a server later
 *   without the reader relearning anything.
 *
 *   Total — every knob the UI offers is a field here. There is no hidden
 *   second source of truth, so "export my setup" is always honest.
 */

import type { ReasonGroup, ReasonType } from '../reasons/index.ts';

export const FEED_SPEC_VERSION = 1;

// ---------------------------------------------------------------------------
// Source: where casts come from
// ---------------------------------------------------------------------------

/** The server's ranked feed. Carries include-reasons; the only source that does. */
export type SourceHome = { kind: 'home' };

/** Strict reverse-chronological from people you follow. No ranking, no injection. */
export type SourceFollowing = { kind: 'following' };

export type SourceChannel = { kind: 'channel'; channelKey: string };

/**
 * A reader-curated set of accounts. The reference client has no lists at all;
 * this is the single most-requested power-user feature across alt clients.
 */
export type SourceList = { kind: 'list'; listId: string };

/** A saved search, evaluated as a live feed. Backed by the existing searchCasts endpoint. */
export type SourceSearch = { kind: 'search'; query: string };

/**
 * Several sources interleaved at fixed proportions — "70% my design list,
 * 30% home". Weights are normalised at evaluation time, so they can be
 * expressed however the UI finds convenient (percentages, 1–10 sliders).
 */
export type SourceBlend = {
  kind: 'blend';
  parts: { source: Exclude<Source, SourceBlend>; weight: number }[];
};

export type Source =
  | SourceHome
  | SourceFollowing
  | SourceChannel
  | SourceList
  | SourceSearch
  | SourceBlend;

// ---------------------------------------------------------------------------
// Sift: what gets removed
// ---------------------------------------------------------------------------

export const MATCH_MODES = ['substring', 'word', 'regex'] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export type KeywordRule = {
  pattern: string;
  /**
   * `word` respects word boundaries, so muting "ai" does not also mute
   * "said", "chain", and "detail" — the failure that makes people give up on
   * keyword muting everywhere it is offered as naive substring matching.
   */
  mode: MatchMode;
  caseSensitive?: boolean;
  /**
   * Epoch millis after which this rule stops applying. Temporary mutes are
   * the ones people actually want ("not this conference, not this week") and
   * the ones they never remember to undo.
   */
  expiresAt?: number;
  /** Optional note to self, shown when the rule is reviewed later. */
  note?: string;
};

export type AuthorRule = {
  fid: number;
  expiresAt?: number;
  note?: string;
};

export type SiftRules = {
  /** Include-reason categories to drop entirely. */
  mutedReasons: ReasonType[];
  /** Whole reason groups to drop. Coarser dial over the same axis. */
  mutedGroups: ReasonGroup[];
  keywords: KeywordRule[];
  authors: AuthorRule[];
  channels: string[];
  /** Drop casts whose only presence is a reply surfaced into the feed. */
  hideReplies: boolean;
  /** Drop recasts, showing only original posts. */
  hideRecasts: boolean;
  /** Drop casts with no text of their own (bare link/media drops). */
  hideTextless: boolean;
  /** Embed kinds to drop, e.g. 'token', 'mini-app', 'video', 'image'. */
  mutedEmbedKinds: string[];
  /** Drop casts from accounts the server scores below this quality tier. */
  minAuthorQuality?: 'low' | 'medium' | 'high';
  /**
   * Drop casts whose server ranking score falls below this. Useful as a
   * blunt "less filler" control once a reader has seen what scores look like.
   */
  minScore?: number;
};

// ---------------------------------------------------------------------------
// Sort: what comes first
// ---------------------------------------------------------------------------

export const SORT_MODES = ['server', 'chronological', 'weighted'] as const;
export type SortMode = (typeof SORT_MODES)[number];

/**
 * Multipliers per reason group. 1 leaves the server's ordering alone, 0 is
 * equivalent to a mute, and values above 1 pull a category forward.
 * Deliberately capped in the UI rather than unbounded: a slider that can
 * annihilate every other signal produces a feed the reader did not intend.
 */
export type ReasonWeights = Partial<Record<ReasonGroup, number>>;

export type DiversityCaps = {
  /** Max casts from one author within a sliding window of items. */
  maxPerAuthor?: number;
  /** Max casts from one channel within the same window. */
  maxPerChannel?: number;
  /** Window size in items. Defaults to 25 when caps are set. */
  window?: number;
};

export type SortSpec = {
  mode: SortMode;
  weights: ReasonWeights;
  /**
   * Hours for a score to decay by half in weighted mode. Lower means a
   * fresher, more restless feed; higher means good posts stay up longer.
   */
  recencyHalfLifeHours: number;
  /**
   * 0–1. How much to boost accounts the reader actually engages with, using
   * on-device interaction history that never leaves the phone.
   */
  affinityBoost: number;
  diversity: DiversityCaps;
};

// ---------------------------------------------------------------------------
// Skin: how it looks
// ---------------------------------------------------------------------------

export const DENSITIES = ['comfortable', 'compact', 'dense'] as const;
export type Density = (typeof DENSITIES)[number];

export const MEDIA_POLICIES = ['always', 'wifi', 'tap', 'never'] as const;
export type MediaPolicy = (typeof MEDIA_POLICIES)[number];

export type SkinOverrides = {
  density?: Density;
  media?: MediaPolicy;
  /** Hide like/recast/reply counts. Reading without a scoreboard. */
  hideCounts?: boolean;
  /** Show the why-chip on every item rather than on long-press only. */
  showWhyChips?: boolean;
  /** Absolute timestamps instead of "2h". */
  absoluteTimestamps?: boolean;
  /** Theme id to switch to while this feed is open. */
  themeId?: string;
};

// ---------------------------------------------------------------------------
// The spec
// ---------------------------------------------------------------------------

export type FeedSpec = {
  version: typeof FEED_SPEC_VERSION;
  id: string;
  name: string;
  /** Single emoji shown on the feed tab. */
  icon?: string;
  source: Source;
  sift: SiftRules;
  sort: SortSpec;
  skin?: SkinOverrides;
  /** Free-text note from whoever authored the spec, shown on import. */
  description?: string;
};
