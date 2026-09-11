/**
 * Preferences: one document, one schema, one file.
 *
 * The reference client spreads its settings across a server preferences object
 * of 149 fields (117 of which are notification toggles), a handful of MMKV
 * keys, and a scattering of component state. Nobody can answer "what is my
 * setup" from that, let alone move it somewhere else.
 *
 * Here everything the reader has chosen lives in one serialisable document.
 * That single decision buys export, import, backup, sync, diffing, presets,
 * and a settings search that can actually find everything — none of which have
 * to be built separately.
 */

import type { FeedSpec, MediaPolicy, SkinOverrides } from '../feedspec/types';
import { starterFeeds } from '../feedspec/defaults';
import { validateFeedSpec, validateSkinOverrides } from '../feedspec/validate';
import type { ThemeSeed } from '../theme/index';
import { THEME_PRESETS, validateThemeSeed } from '../theme/index';
import type { BoundarySettings } from '../boundaries/index';
import {
  defaultBoundarySettings,
  validateBoundarySettings,
} from '../boundaries/index';

export const PREFERENCES_VERSION = 2;

/** A reader-curated set of accounts. Local, private, exportable. */
export type AuthorList = {
  id: string;
  name: string;
  icon?: string;
  fids: number[];
};

export const CAST_ACTIONS = [
  'reply',
  'recast',
  'like',
  'bookmark',
  'share',
  'quote',
  'copy-link',
  'why',
  'mute-author',
  'none',
] as const;
export type CastAction = (typeof CAST_ACTIONS)[number];

export const TABS = [
  'feeds',
  'explore',
  'notifications',
  'messages',
  'wallet',
  'apps',
  'you',
] as const;
export type TabId = (typeof TABS)[number];

export type Gestures = {
  swipeLeft: CastAction;
  swipeRight: CastAction;
  doubleTap: CastAction;
  longPress: CastAction;
};

export type Preferences = {
  version: number;
  feeds: FeedSpec[];
  /** Tab order for the feed switcher. Ids not present here fall to the end. */
  feedOrder: string[];
  activeFeedId: string;
  lists: AuthorList[];
  themes: ThemeSeed[];
  /** Follow the OS light/dark switch, using the two theme ids below. */
  followSystemTheme: boolean;
  lightThemeId: string;
  darkThemeId: string;
  /** Defaults for every feed that does not override them. */
  skin: Required<
    Pick<
      SkinOverrides,
      'density' | 'media' | 'hideCounts' | 'showWhyChips' | 'absoluteTimestamps'
    >
  >;
  boundaries: BoundarySettings;
  /** Ordered cast-row actions. First four are shown inline; the rest go in the menu. */
  actionBar: CastAction[];
  gestures: Gestures;
  /** Ordered bottom tabs. Between two and five are shown. */
  tabs: TabId[];
};

export function defaultPreferences(): Preferences {
  const feeds = starterFeeds();
  return {
    version: PREFERENCES_VERSION,
    feeds,
    feedOrder: feeds.map((f) => f.id),
    activeFeedId: feeds[0]!.id,
    lists: [],
    themes: [...THEME_PRESETS],
    followSystemTheme: true,
    lightThemeId: 'paper',
    darkThemeId: 'midnight',
    skin: {
      density: 'comfortable',
      media: 'always' as MediaPolicy,
      hideCounts: false,
      showWhyChips: true,
      absoluteTimestamps: false,
    },
    boundaries: defaultBoundarySettings(),
    actionBar: [
      'reply',
      'recast',
      'like',
      'bookmark',
      'share',
      'why',
      'copy-link',
    ],
    gestures: {
      swipeLeft: 'bookmark',
      swipeRight: 'reply',
      doubleTap: 'like',
      longPress: 'why',
    },
    tabs: ['feeds', 'explore', 'notifications', 'messages', 'you'],
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * The narrowest interface that MMKV, localStorage, and an in-memory map all
 * satisfy. Keeping it synchronous matters: preferences are read during the
 * first render of the feed, and an async read there means a frame of the wrong
 * theme on every cold start.
 */
export type KVStore = {
  getString(key: string): string | undefined;
  setString(key: string, value: string): void;
  remove(key: string): void;
};

export function memoryStore(seed: Record<string, string> = {}): KVStore {
  const map = new Map(Object.entries(seed));
  return {
    getString: (k) => map.get(k),
    setString: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

export const PREFERENCES_KEY = 'home.preferences.v2';

export type LoadResult = {
  preferences: Preferences;
  /** True when defaults were used because nothing valid was stored. */
  usedDefaults: boolean;
  /** Non-fatal problems worth surfacing once, not on every launch. */
  notes: string[];
};

export function loadPreferences(store: KVStore): LoadResult {
  const raw = store.getString(PREFERENCES_KEY);
  if (!raw)
    return { preferences: defaultPreferences(), usedDefaults: true, notes: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt storage must never brick the app. Fall back and say so, rather
    // than throwing on a cold start with no way for the reader to recover.
    return {
      preferences: defaultPreferences(),
      usedDefaults: true,
      notes: ['Saved settings could not be read, so defaults were restored.'],
    };
  }
  return migratePreferences(parsed);
}

export function savePreferences(store: KVStore, prefs: Preferences): void {
  store.setString(PREFERENCES_KEY, JSON.stringify(prefs));
}

// ---------------------------------------------------------------------------
// Migration and import
// ---------------------------------------------------------------------------

/**
 * Bring any stored or imported document up to the current schema.
 *
 * Unknown fields are dropped and invalid entries are skipped individually, so
 * one malformed feed in an imported file costs the reader that feed rather
 * than the whole import. Every skip is reported.
 */
export function migratePreferences(input: unknown): LoadResult {
  const notes: string[] = [];
  const defaults = defaultPreferences();
  if (typeof input !== 'object' || input === null) {
    return {
      preferences: defaults,
      usedDefaults: true,
      notes: ['Settings were not an object.'],
    };
  }
  const raw = input as Record<string, unknown>;
  const prefs: Preferences = { ...defaults };

  const version = typeof raw.version === 'number' ? raw.version : 0;
  if (version > PREFERENCES_VERSION) {
    // Forward compatibility: a newer build wrote this. Keep what parses and
    // say so, rather than silently discarding a reader's whole configuration.
    notes.push(
      `These settings were saved by a newer version (${version}). Anything this build does not recognise was left out.`,
    );
  }

  if (Array.isArray(raw.feeds)) {
    const feeds: FeedSpec[] = [];
    for (const [i, f] of raw.feeds.entries()) {
      const result = validateFeedSpec(f);
      if (result.ok) feeds.push(result.spec);
      else
        notes.push(
          `Feed ${i + 1} was skipped: ${result.issues[0]?.message ?? 'invalid'}.`,
        );
    }
    if (feeds.length > 0) prefs.feeds = feeds;
  }

  const feedIds = new Set(prefs.feeds.map((f) => f.id));
  prefs.feedOrder = Array.isArray(raw.feedOrder)
    ? raw.feedOrder.filter(
        (id): id is string => typeof id === 'string' && feedIds.has(id),
      )
    : prefs.feeds.map((f) => f.id);
  for (const f of prefs.feeds) {
    if (!prefs.feedOrder.includes(f.id)) prefs.feedOrder.push(f.id);
  }

  prefs.activeFeedId =
    typeof raw.activeFeedId === 'string' && feedIds.has(raw.activeFeedId)
      ? raw.activeFeedId
      : (prefs.feedOrder[0] ?? prefs.feeds[0]!.id);

  if (Array.isArray(raw.themes)) {
    const themes: ThemeSeed[] = [];
    for (const t of raw.themes) {
      const { seed } = validateThemeSeed(t);
      if (seed) themes.push(seed);
    }
    // Presets are always available, so a reader cannot delete their way into a
    // state with no theme to fall back to.
    const byId = new Map(THEME_PRESETS.map((p) => [p.id, p]));
    for (const t of themes) byId.set(t.id, t);
    prefs.themes = [...byId.values()];
  }

  const themeIds = new Set(prefs.themes.map((t) => t.id));
  if (typeof raw.lightThemeId === 'string' && themeIds.has(raw.lightThemeId)) {
    prefs.lightThemeId = raw.lightThemeId;
  }
  if (typeof raw.darkThemeId === 'string' && themeIds.has(raw.darkThemeId)) {
    prefs.darkThemeId = raw.darkThemeId;
  }
  if (typeof raw.followSystemTheme === 'boolean')
    prefs.followSystemTheme = raw.followSystemTheme;

  if (Array.isArray(raw.lists)) {
    prefs.lists = raw.lists
      .filter(
        (l): l is Record<string, unknown> =>
          typeof l === 'object' && l !== null,
      )
      .map((l) => ({
        id: String(l.id ?? '').slice(0, 64),
        name: String(l.name ?? '').slice(0, 40),
        ...(typeof l.icon === 'string'
          ? { icon: [...l.icon].slice(0, 2).join('') }
          : {}),
        fids: Array.isArray(l.fids)
          ? l.fids
              .filter((n): n is number => typeof n === 'number' && n > 0)
              .slice(0, 5000)
          : [],
      }))
      .filter((l) => l.id && l.name);
  }

  // Validated field by field, like feeds and themes: an unknown density or
  // media policy falls back to the default instead of reaching the renderer.
  const skin = validateSkinOverrides(raw.skin);
  prefs.skin = {
    density: skin.density ?? prefs.skin.density,
    media: skin.media ?? prefs.skin.media,
    hideCounts: skin.hideCounts ?? prefs.skin.hideCounts,
    showWhyChips: skin.showWhyChips ?? prefs.skin.showWhyChips,
    absoluteTimestamps:
      skin.absoluteTimestamps ?? prefs.skin.absoluteTimestamps,
  };
  // Spreading this block verbatim let an imported file carry
  // `sessionBudgetMinutes: "twenty"` and a quiet window of -5..9999 that
  // never ended. A missing block validates to the defaults.
  prefs.boundaries = validateBoundarySettings(raw.boundaries);
  if (Array.isArray(raw.actionBar)) {
    const actions = raw.actionBar.filter((a): a is CastAction =>
      (CAST_ACTIONS as readonly string[]).includes(a as string),
    );
    if (actions.length > 0) prefs.actionBar = actions;
  }
  if (typeof raw.gestures === 'object' && raw.gestures !== null) {
    const g = raw.gestures as Record<string, unknown>;
    const pick = (v: unknown, fallback: CastAction): CastAction =>
      (CAST_ACTIONS as readonly string[]).includes(v as string)
        ? (v as CastAction)
        : fallback;
    prefs.gestures = {
      swipeLeft: pick(g.swipeLeft, defaults.gestures.swipeLeft),
      swipeRight: pick(g.swipeRight, defaults.gestures.swipeRight),
      doubleTap: pick(g.doubleTap, defaults.gestures.doubleTap),
      longPress: pick(g.longPress, defaults.gestures.longPress),
    };
  }
  if (Array.isArray(raw.tabs)) {
    const tabs = raw.tabs.filter((t): t is TabId =>
      (TABS as readonly string[]).includes(t as string),
    );
    // Below two tabs the bar stops being a navigation control; above five it
    // stops being tappable. Out-of-range configurations fall back rather than
    // producing an unusable app.
    if (tabs.length >= 2 && tabs.length <= 5) prefs.tabs = tabs;
    else if (tabs.length > 0)
      notes.push(
        'Tab bar needs between 2 and 5 tabs; the default set was kept.',
      );
  }

  prefs.version = PREFERENCES_VERSION;
  return { preferences: prefs, usedDefaults: false, notes };
}

/** Pretty-printed so a reader who opens the file can read and edit it. */
export function exportPreferences(prefs: Preferences): string {
  return JSON.stringify(prefs, null, 2);
}

export function importPreferences(json: string): LoadResult {
  try {
    return migratePreferences(JSON.parse(json));
  } catch (e) {
    return {
      preferences: defaultPreferences(),
      usedDefaults: true,
      notes: [`That file could not be read: ${(e as Error).message}`],
    };
  }
}

export * from './actions';
export * from './resolve';
export * from './affinity';
