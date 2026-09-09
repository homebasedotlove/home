/**
 * The slice of the Farcaster client API this adapter reads.
 *
 * These are declared locally rather than imported from `farcaster-client-data`
 * so the adapter has no build-time dependency on the snapshot, and its tests
 * run anywhere. That would be a lie waiting to happen — a local copy of someone
 * else's types drifts silently — except that `compat/assertCompat.ts` statically
 * asserts each one against the real generated type. If upstream changes shape,
 * `pnpm verify:compat` stops compiling and names the field.
 *
 * Every type here is structurally *wider* than the real one where the real one
 * is narrower (`text: string` rather than a branded alias), so a real value is
 * always assignable to it. The compat check enforces that direction explicitly.
 */

export type CastEmbedsLike = {
  images?: unknown[];
  urls?: {
    type?: string;
    asset?: unknown;
    collection?: unknown;
    tweet?: unknown;
    token?: unknown;
    tokenV2?: unknown;
  }[];
  videos?: unknown[];
  casts?: unknown[];
  unknowns?: unknown[];
  groupInvites?: unknown[];
  transactions?: unknown[];
  snap?: unknown[];
};

export type CastLike = {
  hash: string;
  text: string;
  timestamp: number;
  author: { fid: number };
  parentHash?: string;
  recast?: boolean;
  deleted?: boolean;
  channel?: { key: string };
  token?: unknown;
  collectible?: unknown;
  embeds?: CastEmbedsLike;
  replies: { count: number };
  reactions: { count: number };
  recasts: { count: number };
  quoteCount?: number;
};

export type CastFeedItemMetaLike = {
  includeReason?: { type: string };
  labelReason?: string;
  score?: number;
  authorQuality?: string;
};

export type CastFeedItemLike = {
  id: string;
  timestamp: number;
  pinned?: boolean;
  cast: CastLike;
  meta?: CastFeedItemMetaLike;
};
