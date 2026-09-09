/**
 * The client core.
 *
 * Everything between storage and the screen, with no screen: preferences,
 * session accounting, affinity, feed fetching, the personalization pipeline,
 * and the resolved theme and skin. A React app wraps this; so does the CLI in
 * `src/cli.ts`; so do the end-to-end tests.
 *
 * Having it exist separately from any UI is the point. It means the whole
 * mechanism — cold start, a reader tapping a why-chip, a mute expiring, a
 * session budget running out, a config moving to a new device — can be
 * exercised in milliseconds without a simulator, and that the eventual React
 * layer has nothing in it but rendering.
 */

import type { CastFeedItemLike } from 'farcaster-adapter';
import { personalizeMixedFeed } from 'farcaster-adapter';
import type {
  AffinityState,
  BoundaryState,
  DerivedTheme,
  DropReceipt,
  EffectiveSkin,
  FeedSpec,
  InteractionKind,
  KVStore,
  MixSummary,
  Preferences,
  ReceiptGroup,
  SessionState,
  ThemeMode,
} from 'home-personalization';
import {
  affinityLookup,
  applyCatchUp,
  decayAffinity,
  emptyAffinity,
  enterBackground,
  enterForeground,
  evaluateBoundaries,
  expiredRules,
  getFeed,
  groupReceipts,
  loadPreferences,
  markSeen,
  newSession,
  orderedFeeds,
  recordInteraction,
  resolveSkin,
  resolveTheme,
  savePreferences,
  summarizeReceipts,
  usageNow,
} from 'home-personalization';

/**
 * Where casts come from. Pluggable so the core can be driven by the real API
 * client, by fixtures, or by a recorded session, without knowing which.
 */
export type FeedFetcher = (spec: FeedSpec) => Promise<CastFeedItemLike[]>;

export type Clock = () => number;

export type HomeClientOptions = {
  store: KVStore;
  fetchFeed: FeedFetcher;
  now?: Clock;
  /** Injected so tests and the CLI are not at the mercy of the host timezone. */
  date?: (ms: number) => Date;
  colorScheme?: () => ThemeMode;
};

export type RenderedFeed = {
  spec: FeedSpec;
  /** The render list: original API items, filtered and ranked. */
  items: CastFeedItemLike[];
  receipts: DropReceipt[];
  receiptGroups: ReceiptGroup[];
  /** "14 casts hidden on this page." — absent when nothing was. */
  hiddenSummary?: string;
  mix: MixSummary;
  skin: EffectiveSkin;
  theme: DerivedTheme;
  boundary: BoundaryState;
  /** Catch-up mode reached the end of what is new. */
  caughtUp: boolean;
  /** Catch-up withheld older casts the reader could still ask for. */
  moreAvailable: boolean;
};

const AFFINITY_KEY = 'home.affinity.v1';
const SESSION_KEY = 'home.session.v1';

export class HomeClient {
  private prefs: Preferences;
  private session: SessionState;
  private affinity: AffinityState;
  private readonly store: KVStore;
  private readonly fetchFeed: FeedFetcher;
  private readonly now: Clock;
  private readonly date: (ms: number) => Date;
  private readonly colorScheme: () => ThemeMode;

  /** Non-fatal problems from the last load — corrupt storage, skipped feeds. */
  readonly startupNotes: string[];

  constructor(options: HomeClientOptions) {
    this.store = options.store;
    this.fetchFeed = options.fetchFeed;
    this.now = options.now ?? (() => Date.now());
    this.date = options.date ?? ((ms) => new Date(ms));
    this.colorScheme = options.colorScheme ?? (() => 'dark');

    const loaded = loadPreferences(this.store);
    this.prefs = loaded.preferences;
    this.startupNotes = loaded.notes;

    const now = this.now();
    this.session =
      readJson<SessionState>(this.store, SESSION_KEY) ??
      newSession(now, this.date(now));
    this.affinity =
      readJson<AffinityState>(this.store, AFFINITY_KEY) ?? emptyAffinity(now);
  }

  // -------------------------------------------------------------------------
  // Preferences
  // -------------------------------------------------------------------------

  get preferences(): Preferences {
    return this.prefs;
  }

  get feeds(): FeedSpec[] {
    return orderedFeeds(this.prefs);
  }

  get activeFeed(): FeedSpec {
    // The active id is kept resolvable by the preference actions, but a
    // hand-edited or imported document could still point nowhere.
    return getFeed(this.prefs, this.prefs.activeFeedId) ?? this.feeds[0]!;
  }

  /**
   * Apply a mutation and persist. Takes any of the pure actions from
   * `home-personalization/prefs/actions`, so `update(p => nudgeReason(p, ...))`
   * is the whole path from a tap to a changed feed.
   */
  update(fn: (prefs: Preferences) => Preferences): Preferences {
    this.prefs = fn(this.prefs);
    savePreferences(this.store, this.prefs);
    return this.prefs;
  }

  /** Mutes that have lapsed since the reader set them, for the review prompt. */
  lapsedRules(feedId = this.activeFeed.id) {
    const feed = getFeed(this.prefs, feedId);
    return feed
      ? expiredRules(feed.sift, this.now())
      : { keywords: [], authors: [] };
  }

  // -------------------------------------------------------------------------
  // Session and affinity
  // -------------------------------------------------------------------------

  foreground(): void {
    const now = this.now();
    this.session = enterForeground(this.session, now, this.date(now));
    this.persistSession();
  }

  background(): void {
    const now = this.now();
    this.session = enterBackground(this.session, now, this.date(now));
    this.persistSession();
  }

  /** Called when the reader likes, replies, recasts, or opens a profile. */
  recordInteraction(fid: number, kind: InteractionKind): void {
    this.affinity = recordInteraction(this.affinity, fid, kind, this.now());
    writeJson(this.store, AFFINITY_KEY, this.affinity);
  }

  get boundaryState(): BoundaryState {
    const now = this.now();
    return evaluateBoundaries(
      this.prefs.boundaries,
      usageNow(this.session, now, this.date(now)),
    );
  }

  get sessionState(): SessionState {
    return this.session;
  }

  // -------------------------------------------------------------------------
  // The feed
  // -------------------------------------------------------------------------

  async renderFeed(feedId?: string): Promise<RenderedFeed> {
    const spec =
      (feedId ? getFeed(this.prefs, feedId) : undefined) ?? this.activeFeed;
    const now = this.now();
    const page = await this.fetchFeed(spec);

    // Affinity is only consulted when the reader has turned the boost on, so
    // the store is never read for a feed that would ignore it.
    const context = {
      now,
      ...(spec.sort.affinityBoost > 0
        ? { affinity: affinityLookup(this.affinity, now) }
        : {}),
    };

    const result = personalizeMixedFeed(page, {
      isCast: () => true,
      getCast: (item) => item,
      spec,
      context,
    });

    // Catch-up runs after ranking, not before: the reader asked for everything
    // since their last visit *in their own order*, not in arrival order.
    const catchUp = applyCatchUp(
      result.items.map((item) => ({ item, timestampMs: item.timestamp })),
      this.session.lastSeenMs,
      this.prefs.boundaries,
    );
    const items = catchUp.items.map((w) => w.item);

    const skin = resolveSkin(this.prefs, spec.skin);
    return {
      spec,
      items,
      receipts: result.receipts,
      receiptGroups: groupReceipts(result.receipts),
      ...(summarizeReceipts(result.receipts)
        ? { hiddenSummary: summarizeReceipts(result.receipts)! }
        : {}),
      mix: result.mix,
      skin,
      theme: resolveTheme(this.prefs, this.colorScheme(), spec.skin),
      boundary: this.boundaryState,
      caughtUp: catchUp.caughtUp,
      moreAvailable: catchUp.hasMore,
    };
  }

  /** Record the newest cast the reader actually reached. Drives catch-up. */
  markRead(timestampMs: number): void {
    this.session = markSeen(this.session, timestampMs);
    this.persistSession();
  }

  /** Trim decayed affinity entries. Cheap; call on background. */
  compact(): void {
    this.affinity = decayAffinity(this.affinity, this.now());
    writeJson(this.store, AFFINITY_KEY, this.affinity);
  }

  private persistSession(): void {
    writeJson(this.store, SESSION_KEY, this.session);
  }
}

function readJson<T>(store: KVStore, key: string): T | undefined {
  const raw = store.getString(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt storage must never brick a cold start; the caller falls back.
    return undefined;
  }
}

function writeJson(store: KVStore, key: string, value: unknown): void {
  store.setString(key, JSON.stringify(value));
}
