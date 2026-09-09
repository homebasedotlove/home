/**
 * The include-reason taxonomy.
 *
 * The Farcaster client API attaches `meta.includeReason` to every home feed
 * item, explaining why the server put it in front of you. The reference client
 * does surface this — `SourceLabel.tsx` turns eight of the ten reasons into a
 * sentence — but only inside a menu you have to open, one cast at a time, as
 * text with no `onPress` on it (see docs/research/reference-client-audit.md).
 *
 * This module turns the same field into the backbone of the product: a stable
 * set of categories that can be named on the cast, weighted by the reader, and
 * muted outright. Everything downstream — the why-chip, the mix dial, the feed
 * receipts — reads from here, so the vocabulary stays consistent, and every
 * reason has copy rather than eight of ten.
 */

/** Reason type strings as they arrive from the API. */
export const REASON_TYPES = [
  'following-author',
  'evergreen-following-author',
  'follow-of-follow',
  'recasted-by-following',
  'has-reply-by-followed',
  'pinned-in-channel',
  'popular-in-channel',
  'popular',
  'high-quality-unfollowed',
  'snap-promoted',
] as const;

export type ReasonType = (typeof REASON_TYPES)[number];

/**
 * Coarse buckets. Ten reasons is too many dials for a human; three is too few
 * to be useful. These four are the distinctions people actually make when they
 * describe a feed they dislike: "this isn't my people", "this is engagement
 * bait", "this is an ad".
 */
export const REASON_GROUPS = [
  'direct',
  'network',
  'discovery',
  'promoted',
] as const;

export type ReasonGroup = (typeof REASON_GROUPS)[number];

export type ReasonDescriptor = {
  type: ReasonType;
  group: ReasonGroup;
  /** Sentence fragment completing "You're seeing this because…". */
  because: string;
  /** Short chip label. Fits in ~24 characters at feed density. */
  chip: string;
  /**
   * Whether a reader can plausibly want *more* of this. Promoted content can
   * be reduced or removed but never boosted — a client that lets you turn the
   * ad dial up is not being honest about whose interest it serves.
   */
  boostable: boolean;
};

const DESCRIPTORS: Record<ReasonType, ReasonDescriptor> = {
  'following-author': {
    type: 'following-author',
    group: 'direct',
    because: 'you follow them',
    chip: 'Following',
    boostable: true,
  },
  'evergreen-following-author': {
    type: 'evergreen-following-author',
    group: 'direct',
    because: 'you follow them and it kept getting attention',
    chip: 'Following · older',
    boostable: true,
  },
  'follow-of-follow': {
    type: 'follow-of-follow',
    group: 'network',
    because: 'people you follow follow them',
    chip: 'Friend of a friend',
    boostable: true,
  },
  'recasted-by-following': {
    type: 'recasted-by-following',
    group: 'network',
    because: 'someone you follow recasted it',
    chip: 'Recasted',
    boostable: true,
  },
  'has-reply-by-followed': {
    type: 'has-reply-by-followed',
    group: 'network',
    because: 'someone you follow replied to it',
    chip: 'Replied to',
    boostable: true,
  },
  'pinned-in-channel': {
    type: 'pinned-in-channel',
    group: 'network',
    because: 'a channel host pinned it',
    chip: 'Pinned',
    boostable: true,
  },
  'popular-in-channel': {
    type: 'popular-in-channel',
    group: 'discovery',
    because: 'it is doing well in a channel you follow',
    chip: 'Popular in channel',
    boostable: true,
  },
  popular: {
    type: 'popular',
    group: 'discovery',
    because: 'it is popular right now',
    chip: 'Popular',
    boostable: true,
  },
  'high-quality-unfollowed': {
    type: 'high-quality-unfollowed',
    group: 'discovery',
    because: 'we think you might want to follow them',
    chip: 'Suggested',
    boostable: true,
  },
  'snap-promoted': {
    type: 'snap-promoted',
    group: 'promoted',
    because: 'someone paid to put it here',
    chip: 'Promoted',
    boostable: false,
  },
};

export function describeReason(type: string): ReasonDescriptor | undefined {
  return DESCRIPTORS[type as ReasonType];
}

export function reasonGroup(type: string): ReasonGroup | undefined {
  return DESCRIPTORS[type as ReasonType]?.group;
}

/**
 * Human sentence for the "why am I seeing this" sheet. Falls back to an honest
 * admission rather than a plausible-sounding guess: a client that invents
 * explanations is worse than one that stays quiet.
 */
export function explainReason(type: string | undefined): string {
  if (!type) return "We don't know why this is here.";
  const d = describeReason(type);
  if (!d) return `We don't have a description for this yet (${type}).`;
  return `You're seeing this because ${d.because}.`;
}

export function allReasons(): ReasonDescriptor[] {
  return REASON_TYPES.map((t) => DESCRIPTORS[t]);
}

export function reasonsInGroup(group: ReasonGroup): ReasonDescriptor[] {
  return allReasons().filter((d) => d.group === group);
}

export const GROUP_LABELS: Record<ReasonGroup, string> = {
  direct: 'People you follow',
  network: 'Through your network',
  discovery: 'Discovery',
  promoted: 'Promoted',
};
