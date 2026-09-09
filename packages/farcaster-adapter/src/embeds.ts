/**
 * Embed classification.
 *
 * The API groups embeds by transport — images, urls, snap — but a reader
 * filtering their feed thinks in terms of what the thing *is*: "no token
 * charts", "no mini-apps". A URL embed carrying a `token` payload is a token
 * post regardless of the array it arrived in, so classification looks inside
 * the url embeds rather than stopping at the top-level keys.
 */

import type { CastLike } from './apiShapes';

/** The kinds a reader can mute. Stable strings — they are stored in FeedSpecs. */
export const EMBED_KINDS = [
  'image',
  'video',
  'link',
  'quote',
  'token',
  'nft',
  'mini-app',
  'transaction',
  'group-invite',
  'collectible',
] as const;

export type EmbedKind = (typeof EMBED_KINDS)[number];

export const EMBED_KIND_LABELS: Record<EmbedKind, string> = {
  image: 'Images',
  video: 'Videos',
  link: 'Link previews',
  quote: 'Quoted casts',
  token: 'Token charts',
  nft: 'NFTs',
  'mini-app': 'Mini apps',
  transaction: 'Transactions',
  'group-invite': 'Group invites',
  collectible: 'Collectibles',
};

const has = (v: unknown): boolean => Array.isArray(v) && v.length > 0;

export function classifyEmbeds(cast: CastLike): EmbedKind[] {
  const kinds = new Set<EmbedKind>();
  const embeds = cast.embeds;

  if (embeds) {
    if (has(embeds.images)) kinds.add('image');
    if (has(embeds.videos)) kinds.add('video');
    if (has(embeds.casts)) kinds.add('quote');
    if (has(embeds.snap)) kinds.add('mini-app');
    if (has(embeds.transactions)) kinds.add('transaction');
    if (has(embeds.groupInvites)) kinds.add('group-invite');

    for (const url of embeds.urls ?? []) {
      // A link that resolves to a token or an NFT is not a link post to
      // someone muting token charts, so the payload decides, not the array.
      if (url.token || url.tokenV2) kinds.add('token');
      else if (url.asset || url.collection) kinds.add('nft');
      else kinds.add('link');
    }
  }

  // Carried on the cast rather than in embeds, but the same thing to a reader.
  if (cast.token) kinds.add('token');
  if (cast.collectible) kinds.add('collectible');

  return [...kinds];
}
