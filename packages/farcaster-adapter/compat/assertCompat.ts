/**
 * Compatibility assertions against the real Farcaster client types.
 *
 * `src/apiShapes.ts` declares the slice of the API this adapter reads, so the
 * package builds and tests anywhere. This file is what stops that local copy
 * from quietly drifting: it imports the actual generated types out of a
 * `farcasterxyz/client` checkout and asserts, at compile time, that
 *
 *   - every real type is assignable to the local shape it stands in for, and
 *   - the two enumerations we mirror by value — author quality tiers and
 *     include-reason strings — are *exactly* equal, not merely overlapping.
 *
 * Nothing here runs. If upstream renames a field, changes a cardinality, or
 * adds a ranking reason, `pnpm verify:compat` fails and names it. That is the
 * whole point: a client built on someone else's generated API surface should
 * find out from a compiler, not from a reader whose feed went blank.
 *
 * Path comes from tsconfig.compat.json, which points at a snapshot checkout.
 */

import type {
  ApiCast,
  ApiCastEmbeds,
  ApiCastFeedItem,
  ApiCastFeedItemMeta,
  ApiCastFeedIncludeReason,
  ApiUserQuality,
} from 'farcaster-client-data-types';

import type { AuthorQuality, ReasonType } from 'home-personalization';
import { AUTHOR_QUALITIES, REASON_TYPES } from 'home-personalization';
import type {
  CastEmbedsLike,
  CastFeedItemLike,
  CastFeedItemMetaLike,
  CastLike,
} from '../src/apiShapes';
import { classifyEmbeds } from '../src/embeds';
import { toFeedItemView } from '../src/feedItem';
import { personalizeMixedFeed } from '../src/seam';

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

type Assert<T extends true> = T;
/** Real -> local. Fails if upstream drops or narrows a field we read. */
type Assignable<Real, Local> = [Real] extends [Local] ? true : false;
/** Both directions. Used where a drift in either would be a bug. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// ---------------------------------------------------------------------------
// Structural shapes
// ---------------------------------------------------------------------------

export type _Cast = Assert<Assignable<ApiCast, CastLike>>;
export type _Embeds = Assert<Assignable<ApiCastEmbeds, CastEmbedsLike>>;
export type _Meta = Assert<
  Assignable<ApiCastFeedItemMeta, CastFeedItemMetaLike>
>;
export type _FeedItem = Assert<Assignable<ApiCastFeedItem, CastFeedItemLike>>;

// ---------------------------------------------------------------------------
// Mirrored enumerations
// ---------------------------------------------------------------------------

/**
 * The quality tiers must match exactly. Assignability alone is not enough:
 * if upstream *added* a tier, a one-way check would still pass while the
 * kernel silently treated the new tier as unrankable.
 */
export type _Quality = Assert<Exact<ApiUserQuality, AuthorQuality>>;

/**
 * Same for ranking reasons. A new reason upstream that Home does not name
 * would render as an unlabelled chip and be unmutable — exactly the failure
 * this client exists to fix.
 */
export type _Reasons = Assert<
  Exact<ApiCastFeedIncludeReason['type'], ReasonType>
>;

// Runtime constants have to agree with the types they mirror, too.
export type _QualityConst = Assert<
  Exact<(typeof AUTHOR_QUALITIES)[number], ApiUserQuality>
>;
export type _ReasonConst = Assert<
  Exact<(typeof REASON_TYPES)[number], ApiCastFeedIncludeReason['type']>
>;

// ---------------------------------------------------------------------------
// Field-by-field presence
// ---------------------------------------------------------------------------

/**
 * Structural assignability alone is not enough, and this is the trap.
 *
 * Almost every field the adapter reads is optional upstream. If `includeReason`
 * were renamed to `inclusionReason`, the resulting type would *still* be
 * assignable to a local shape whose fields are all optional — TypeScript is
 * happy to see a missing optional property, and excess-property checking does
 * not apply to non-literal types. The block above would stay green while the
 * why-chip silently rendered nothing on every cast.
 *
 * So each field is also named explicitly. `ApiCast['channel']` is a compile
 * error the moment `channel` stops existing, and the assignability check on the
 * indexed type catches a field that survives under the same name but changes
 * shape. Adding a field the adapter reads means adding a line here.
 */

type Field<T, K extends keyof T> = NonNullable<T[K]>;

// ApiCastFeedItem
export type _F_item_id = Assert<
  Assignable<Field<ApiCastFeedItem, 'id'>, string>
>;
export type _F_item_ts = Assert<
  Assignable<Field<ApiCastFeedItem, 'timestamp'>, number>
>;
export type _F_item_cast = Assert<
  Assignable<Field<ApiCastFeedItem, 'cast'>, CastLike>
>;
export type _F_item_meta = Assert<
  Assignable<Field<ApiCastFeedItem, 'meta'>, CastFeedItemMetaLike>
>;

// ApiCastFeedItemMeta — the three fields the reference client discards.
export type _F_meta_reason = Assert<
  Assignable<Field<ApiCastFeedItemMeta, 'includeReason'>, { type: string }>
>;
export type _F_meta_score = Assert<
  Assignable<Field<ApiCastFeedItemMeta, 'score'>, number>
>;
export type _F_meta_quality = Assert<
  Assignable<Field<ApiCastFeedItemMeta, 'authorQuality'>, string>
>;
export type _F_reason_type = Assert<
  Assignable<ApiCastFeedIncludeReason['type'], string>
>;

// ApiCast
export type _F_cast_text = Assert<Assignable<Field<ApiCast, 'text'>, string>>;
export type _F_cast_ts = Assert<
  Assignable<Field<ApiCast, 'timestamp'>, number>
>;
export type _F_cast_author = Assert<
  Assignable<Field<ApiCast, 'author'>, { fid: number }>
>;
export type _F_cast_parent = Assert<
  Assignable<Field<ApiCast, 'parentHash'>, string>
>;
export type _F_cast_recast = Assert<
  Assignable<Field<ApiCast, 'recast'>, boolean>
>;
export type _F_cast_deleted = Assert<
  Assignable<Field<ApiCast, 'deleted'>, boolean>
>;
export type _F_cast_channel = Assert<
  Assignable<Field<ApiCast, 'channel'>, { key: string }>
>;
export type _F_cast_token = Assert<Assignable<Field<ApiCast, 'token'>, object>>;
export type _F_cast_collectible = Assert<
  Assignable<Field<ApiCast, 'collectible'>, object>
>;
export type _F_cast_embeds = Assert<
  Assignable<Field<ApiCast, 'embeds'>, CastEmbedsLike>
>;
export type _F_cast_replies = Assert<
  Assignable<Field<ApiCast, 'replies'>, { count: number }>
>;
export type _F_cast_reactions = Assert<
  Assignable<Field<ApiCast, 'reactions'>, { count: number }>
>;
export type _F_cast_recasts = Assert<
  Assignable<Field<ApiCast, 'recasts'>, { count: number }>
>;

// ApiCastEmbeds — the arrays the embed classifier reads.
export type _F_emb_images = Assert<
  Assignable<Field<ApiCastEmbeds, 'images'>, unknown[]>
>;
export type _F_emb_urls = Assert<
  Assignable<Field<ApiCastEmbeds, 'urls'>, unknown[]>
>;
export type _F_emb_videos = Assert<
  Assignable<Field<ApiCastEmbeds, 'videos'>, unknown[]>
>;
export type _F_emb_casts = Assert<
  Assignable<Field<ApiCastEmbeds, 'casts'>, unknown[]>
>;
export type _F_emb_snap = Assert<
  Assignable<Field<ApiCastEmbeds, 'snap'>, unknown[]>
>;
export type _F_emb_txs = Assert<
  Assignable<Field<ApiCastEmbeds, 'transactions'>, unknown[]>
>;
export type _F_emb_invites = Assert<
  Assignable<Field<ApiCastEmbeds, 'groupInvites'>, unknown[]>
>;

// ApiCastUrlEmbed — a link that is really a token or an NFT.
type RealUrlEmbed = Field<ApiCastEmbeds, 'urls'>[number];
export type _F_url_token = Assert<Assignable<RealUrlEmbed['token'], unknown>>;
export type _F_url_tokenV2 = Assert<
  Assignable<RealUrlEmbed['tokenV2'], unknown>
>;
export type _F_url_asset = Assert<Assignable<RealUrlEmbed['asset'], unknown>>;
export type _F_url_collection = Assert<
  Assignable<RealUrlEmbed['collection'], unknown>
>;

// ---------------------------------------------------------------------------
// The functions accept real values
// ---------------------------------------------------------------------------

declare const realCast: ApiCast;
declare const realItem: ApiCastFeedItem;

export const _classifyAcceptsReal = () => classifyEmbeds(realCast);
export const _adaptAcceptsReal = () => toFeedItemView(realItem);

/**
 * Mirrors `CastFeedItem` from farcaster-client-hooks/src/types.ts. Written out
 * rather than imported because that module pulls in @tanstack/react-query and
 * two sibling modules, none of which this adapter needs. The `item` field is
 * the real `ApiCastFeedItem`, which is the part that matters.
 */
type RealCastRow = { type: 1; item: ApiCastFeedItem };
type RealSuggestionRow = { type: 0; item: { users: unknown[] } };
type RealMixedItem = RealCastRow | RealSuggestionRow;

declare const realMixed: RealMixedItem[];

export const _seamAcceptsRealMixedFeed = () =>
  personalizeMixedFeed(realMixed, {
    isCast: (i): boolean => i.type === 1,
    getCast: (i) => (i as RealCastRow).item,
    spec: {} as never,
    context: { now: 0 },
  });
