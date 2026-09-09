/**
 * Preference mutations.
 *
 * Every one is a pure function from a Preferences document to a new one. That
 * is what makes undo trivial (keep the previous document), makes the live
 * preview possible (apply speculatively, do not commit), and keeps the
 * provider a thin write-through cache rather than a place where business logic
 * accumulates.
 *
 * The reason-sheet actions are here too: `nudgeReason` and `muteReasonGroup`
 * are what the why-chip's Less / More / None buttons call. They are the
 * shortest path in the codebase from "the reader tapped a label" to "the feed
 * changed", which is the whole product.
 */

import type {
  FeedSpec,
  KeywordRule,
  MatchMode,
  SortSpec,
} from '../feedspec/types';
import { LIMITS } from '../feedspec/validate';
import type { ReasonGroup } from '../reasons';
import type { AuthorList, CastAction, Preferences, TabId } from './index';

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

function replaceFeed(
  prefs: Preferences,
  id: string,
  fn: (f: FeedSpec) => FeedSpec,
): Preferences {
  return {
    ...prefs,
    feeds: prefs.feeds.map((f) => (f.id === id ? fn(f) : f)),
  };
}

export function getFeed(prefs: Preferences, id: string): FeedSpec | undefined {
  return prefs.feeds.find((f) => f.id === id);
}

/** Feeds in the reader's chosen order, with any stragglers appended. */
export function orderedFeeds(prefs: Preferences): FeedSpec[] {
  const byId = new Map(prefs.feeds.map((f) => [f.id, f]));
  const out: FeedSpec[] = [];
  for (const id of prefs.feedOrder) {
    const f = byId.get(id);
    if (f) {
      out.push(f);
      byId.delete(id);
    }
  }
  return [...out, ...byId.values()];
}

// ---------------------------------------------------------------------------
// The reason sheet
// ---------------------------------------------------------------------------

/** How far one Less / More tap moves a weight. */
export const NUDGE_STEP = 0.4;

/**
 * Promoted content can be reduced or removed, never amplified. Enforced here
 * rather than only in the UI, so the cap holds however the action is reached.
 */
export const GROUP_WEIGHT_CEILING: Record<ReasonGroup, number> = {
  direct: LIMITS.maxWeight,
  network: LIMITS.maxWeight,
  discovery: LIMITS.maxWeight,
  promoted: 1,
};

export function nudgeReason(
  prefs: Preferences,
  feedId: string,
  group: ReasonGroup,
  direction: 'up' | 'down',
): Preferences {
  return replaceFeed(prefs, feedId, (feed) => {
    const current = feed.sort.weights[group] ?? 1;
    const next = clamp(
      Math.round(
        (current + (direction === 'up' ? NUDGE_STEP : -NUDGE_STEP)) * 10,
      ) / 10,
      0,
      GROUP_WEIGHT_CEILING[group],
    );
    const sort: SortSpec = {
      ...feed.sort,
      // A nudge only means anything in weighted mode, so taking one switches
      // into it. Silently leaving the feed on server order would make the
      // button appear to do nothing.
      mode: 'weighted',
      weights: { ...feed.sort.weights, [group]: next },
    };
    return { ...feed, sort };
  });
}

export function muteReasonGroup(
  prefs: Preferences,
  feedId: string,
  group: ReasonGroup,
): Preferences {
  return replaceFeed(prefs, feedId, (feed) =>
    feed.sift.mutedGroups.includes(group)
      ? feed
      : {
          ...feed,
          sift: {
            ...feed.sift,
            mutedGroups: [...feed.sift.mutedGroups, group],
          },
        },
  );
}

export function unmuteReasonGroup(
  prefs: Preferences,
  feedId: string,
  group: ReasonGroup,
): Preferences {
  return replaceFeed(prefs, feedId, (feed) => ({
    ...feed,
    sift: {
      ...feed.sift,
      mutedGroups: feed.sift.mutedGroups.filter((g) => g !== group),
    },
  }));
}

// ---------------------------------------------------------------------------
// Mutes
// ---------------------------------------------------------------------------

export const MUTE_DURATIONS = [
  { label: '24 hours', ms: 86_400_000 },
  { label: '7 days', ms: 604_800_000 },
  { label: '30 days', ms: 2_592_000_000 },
  { label: 'Forever', ms: undefined },
] as const;

export function muteKeyword(
  prefs: Preferences,
  feedId: string,
  pattern: string,
  options: {
    mode?: MatchMode;
    forMs?: number;
    now?: number;
    note?: string;
  } = {},
): Preferences {
  const trimmed = pattern.trim().slice(0, LIMITS.keywordChars);
  if (!trimmed) return prefs;
  return replaceFeed(prefs, feedId, (feed) => {
    // Word matching by default. Substring muting is the setting that makes
    // people give up on keyword filters, so it has to be chosen, not inherited.
    const rule: KeywordRule = {
      pattern: trimmed,
      mode: options.mode ?? 'word',
    };
    if (options.forMs !== undefined) {
      rule.expiresAt = (options.now ?? Date.now()) + options.forMs;
    }
    if (options.note) rule.note = options.note.slice(0, 140);
    const without = feed.sift.keywords.filter(
      (k) => !(k.pattern === trimmed && k.mode === rule.mode),
    );
    return { ...feed, sift: { ...feed.sift, keywords: [...without, rule] } };
  });
}

export function unmuteKeyword(
  prefs: Preferences,
  feedId: string,
  pattern: string,
): Preferences {
  return replaceFeed(prefs, feedId, (feed) => ({
    ...feed,
    sift: {
      ...feed.sift,
      keywords: feed.sift.keywords.filter((k) => k.pattern !== pattern),
    },
  }));
}

export function muteAuthor(
  prefs: Preferences,
  feedId: string,
  fid: number,
  options: { forMs?: number; now?: number; note?: string } = {},
): Preferences {
  return replaceFeed(prefs, feedId, (feed) => {
    const rule = {
      fid,
      ...(options.forMs !== undefined
        ? { expiresAt: (options.now ?? Date.now()) + options.forMs }
        : {}),
      ...(options.note ? { note: options.note.slice(0, 140) } : {}),
    };
    const without = feed.sift.authors.filter((a) => a.fid !== fid);
    return { ...feed, sift: { ...feed.sift, authors: [...without, rule] } };
  });
}

export function unmuteAuthor(
  prefs: Preferences,
  feedId: string,
  fid: number,
): Preferences {
  return replaceFeed(prefs, feedId, (feed) => ({
    ...feed,
    sift: {
      ...feed.sift,
      authors: feed.sift.authors.filter((a) => a.fid !== fid),
    },
  }));
}

export function muteChannel(
  prefs: Preferences,
  feedId: string,
  key: string,
): Preferences {
  return replaceFeed(prefs, feedId, (feed) =>
    feed.sift.channels.includes(key)
      ? feed
      : {
          ...feed,
          sift: { ...feed.sift, channels: [...feed.sift.channels, key] },
        },
  );
}

export function unmuteChannel(
  prefs: Preferences,
  feedId: string,
  key: string,
): Preferences {
  return replaceFeed(prefs, feedId, (feed) => ({
    ...feed,
    sift: {
      ...feed.sift,
      channels: feed.sift.channels.filter((c) => c !== key),
    },
  }));
}

// ---------------------------------------------------------------------------
// Feeds
// ---------------------------------------------------------------------------

export function addFeed(prefs: Preferences, feed: FeedSpec): Preferences {
  const id = uniqueFeedId(prefs, feed.id);
  const next = { ...feed, id };
  return {
    ...prefs,
    feeds: [...prefs.feeds, next],
    feedOrder: [...prefs.feedOrder, id],
  };
}

/**
 * Importing a shared feed must never overwrite one the reader already has,
 * so a colliding id gets a suffix instead of replacing what is there.
 */
export function uniqueFeedId(prefs: Preferences, wanted: string): string {
  const taken = new Set(prefs.feeds.map((f) => f.id));
  if (!taken.has(wanted)) return wanted;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${wanted}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${wanted}-${Date.now()}`;
}

export function removeFeed(prefs: Preferences, id: string): Preferences {
  // A reader with no feeds has no app. Refuse the last one rather than
  // recovering from an empty state later.
  if (prefs.feeds.length <= 1) return prefs;
  const feeds = prefs.feeds.filter((f) => f.id !== id);
  const feedOrder = prefs.feedOrder.filter((f) => f !== id);
  const activeFeedId =
    prefs.activeFeedId === id
      ? (feedOrder[0] ?? feeds[0]!.id)
      : prefs.activeFeedId;
  return { ...prefs, feeds, feedOrder, activeFeedId };
}

export function duplicateFeed(
  prefs: Preferences,
  id: string,
  name?: string,
): Preferences {
  const feed = getFeed(prefs, id);
  if (!feed) return prefs;
  return addFeed(prefs, {
    ...feed,
    id: uniqueFeedId(prefs, `${feed.id}-copy`),
    name: (name ?? `${feed.name} copy`).slice(0, LIMITS.nameChars),
  });
}

export function renameFeed(
  prefs: Preferences,
  id: string,
  name: string,
): Preferences {
  const trimmed = name.trim().slice(0, LIMITS.nameChars);
  if (!trimmed) return prefs;
  return replaceFeed(prefs, id, (f) => ({ ...f, name: trimmed }));
}

export function reorderFeeds(
  prefs: Preferences,
  from: number,
  to: number,
): Preferences {
  const order = orderedFeeds(prefs).map((f) => f.id);
  if (from < 0 || from >= order.length || to < 0 || to >= order.length)
    return prefs;
  const next = [...order];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return prefs;
  next.splice(to, 0, moved);
  return { ...prefs, feedOrder: next };
}

export function setActiveFeed(prefs: Preferences, id: string): Preferences {
  return getFeed(prefs, id) ? { ...prefs, activeFeedId: id } : prefs;
}

export function updateFeed(
  prefs: Preferences,
  id: string,
  patch: Partial<Omit<FeedSpec, 'id' | 'version'>>,
): Preferences {
  return replaceFeed(prefs, id, (f) => ({
    ...f,
    ...patch,
    id: f.id,
    version: f.version,
  }));
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export function upsertList(prefs: Preferences, list: AuthorList): Preferences {
  const exists = prefs.lists.some((l) => l.id === list.id);
  return {
    ...prefs,
    lists: exists
      ? prefs.lists.map((l) => (l.id === list.id ? list : l))
      : [...prefs.lists, list],
  };
}

export function removeList(prefs: Preferences, id: string): Preferences {
  return { ...prefs, lists: prefs.lists.filter((l) => l.id !== id) };
}

export function addToList(
  prefs: Preferences,
  listId: string,
  fid: number,
): Preferences {
  return {
    ...prefs,
    lists: prefs.lists.map((l) =>
      l.id === listId && !l.fids.includes(fid)
        ? { ...l, fids: [...l.fids, fid] }
        : l,
    ),
  };
}

export function removeFromList(
  prefs: Preferences,
  listId: string,
  fid: number,
): Preferences {
  return {
    ...prefs,
    lists: prefs.lists.map((l) =>
      l.id === listId ? { ...l, fids: l.fids.filter((f) => f !== fid) } : l,
    ),
  };
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

export function setActionBar(
  prefs: Preferences,
  actions: CastAction[],
): Preferences {
  return actions.length > 0 ? { ...prefs, actionBar: actions } : prefs;
}

export function setTabs(prefs: Preferences, tabs: TabId[]): Preferences {
  // Two is the floor for a bar to be navigation; five is the ceiling for it to
  // stay tappable. Outside that the request is refused, not clamped, so the
  // reader is told rather than surprised.
  return tabs.length >= 2 && tabs.length <= 5 ? { ...prefs, tabs } : prefs;
}
