/**
 * The pipeline works on a normalised item, not on the client's API types.
 *
 * That indirection is the point: the ranking and filtering rules are the part
 * of this client worth keeping when the API changes shape, when a second data
 * source appears, or when someone forks this for a different protocol. The
 * adapter that maps `ApiCastFeedItem` onto `FeedItemView` lives in the app, is
 * about forty lines, and is the only file that has to change.
 */

export type AuthorQuality = 'low' | 'medium' | 'high';

export type FeedItemView = {
  id: string;
  timestampMs: number;
  authorFid: number;
  /** Cast text, already unwrapped from any recast envelope. */
  text: string;
  channelKey?: string;
  /** `meta.includeReason.type` from the API, when the source provides one. */
  reason?: string;
  /** `meta.score` — the server's own ranking score. */
  score?: number;
  authorQuality?: AuthorQuality;
  isRecast: boolean;
  isReply: boolean;
  /** Normalised embed kinds: 'image' | 'video' | 'token' | 'mini-app' | 'link' | … */
  embedKinds: string[];
  engagement: { likes: number; recasts: number; replies: number };
};

export type PipelineContext = {
  /** Evaluation time. Injected so tests and previews are deterministic. */
  now: number;
  /**
   * On-device affinity in 0–1: how much this reader actually engages with an
   * author, computed from local interaction history that never leaves the
   * device. Absent means "no opinion", which scores the same as neutral.
   */
  affinity?: (fid: number) => number;
};

/** Why one item was removed. The reader can see and undo every one of these. */
export type DropReceipt = {
  itemId: string;
  authorFid: number;
  /** Machine-readable cause, for grouping in the receipts view. */
  cause:
    | 'muted-reason'
    | 'muted-group'
    | 'muted-keyword'
    | 'muted-author'
    | 'muted-channel'
    | 'muted-embed'
    | 'hidden-reply'
    | 'hidden-recast'
    | 'hidden-textless'
    | 'author-quality'
    | 'min-score';
  /** Sentence for the receipts view. */
  detail: string;
  /**
   * The exact rule that fired, so "unmute this" has something to point at.
   * A keyword pattern, an fid, a channel key, a reason type.
   */
  rule?: string;
};

export type MixSummary = {
  /** Item counts per reason group, after filtering. */
  byGroup: Record<string, number>;
  /** Item counts per reason type, after filtering. */
  byReason: Record<string, number>;
  /** Items whose source gave no reason (chronological feeds, search, lists). */
  unattributed: number;
  total: number;
};

export type PipelineResult = {
  items: FeedItemView[];
  receipts: DropReceipt[];
  mix: MixSummary;
};
