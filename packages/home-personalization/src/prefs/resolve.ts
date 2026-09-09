/**
 * Resolving what is actually in effect right now.
 *
 * Preferences are layered — a global default with a per-feed override, a theme
 * pair with an OS switch above it. Every consumer needs the resolved answer,
 * and none of them should re-derive it. These are the only functions in the
 * codebase allowed to know the precedence rules.
 */

import type { Density, MediaPolicy, SkinOverrides } from '../feedspec/types';
import { DENSITY_METRICS } from '../feedspec/defaults';
import type { DerivedTheme, ThemeMode, ThemeSeed } from '../theme';
import { deriveTheme, THEME_PRESETS } from '../theme';
import type { Preferences } from './index';

export type EffectiveSkin = {
  density: Density;
  media: MediaPolicy;
  hideCounts: boolean;
  showWhyChips: boolean;
  absoluteTimestamps: boolean;
  themeId?: string;
};

/** Per-feed overrides win over the global defaults, field by field. */
export function resolveSkin(prefs: Preferences, feedSkin?: SkinOverrides): EffectiveSkin {
  const base: EffectiveSkin = { ...prefs.skin };
  if (!feedSkin) return base;
  return {
    density: feedSkin.density ?? base.density,
    media: feedSkin.media ?? base.media,
    hideCounts: feedSkin.hideCounts ?? base.hideCounts,
    showWhyChips: feedSkin.showWhyChips ?? base.showWhyChips,
    absoluteTimestamps: feedSkin.absoluteTimestamps ?? base.absoluteTimestamps,
    ...(feedSkin.themeId ? { themeId: feedSkin.themeId } : {}),
  };
}

/**
 * Which theme seed is live.
 *
 * A feed may pin its own theme — a Quiet feed can be calmer than the rest of
 * the app. Otherwise the reader's light/dark pair applies, switched by the OS
 * when they asked for that. A pinned id that no longer exists falls through
 * rather than leaving the app unthemed.
 */
export function resolveThemeSeed(
  prefs: Preferences,
  colorScheme: ThemeMode,
  feedSkin?: SkinOverrides,
): ThemeSeed {
  const byId = new Map(prefs.themes.map((t) => [t.id, t]));
  const pinned = feedSkin?.themeId ? byId.get(feedSkin.themeId) : undefined;
  if (pinned) return pinned;

  const wanted = prefs.followSystemTheme
    ? colorScheme === 'dark'
      ? prefs.darkThemeId
      : prefs.lightThemeId
    : prefs.darkThemeId;

  return (
    byId.get(wanted) ??
    // Last resorts, in order: any theme of the right mode, any theme at all,
    // then the built-in preset. The app always has a theme.
    prefs.themes.find((t) => t.mode === colorScheme) ??
    prefs.themes[0] ??
    THEME_PRESETS[0]!
  );
}

export function resolveTheme(
  prefs: Preferences,
  colorScheme: ThemeMode,
  feedSkin?: SkinOverrides,
): DerivedTheme {
  return deriveTheme(resolveThemeSeed(prefs, colorScheme, feedSkin));
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export type TypeScale = {
  /** Point sizes, already multiplied by the theme's font scale. */
  caption: number;
  meta: number;
  body: number;
  title: number;
  display: number;
  /** Line height in points for body copy at this density. */
  bodyLineHeight: number;
};

const BASE_SCALE = { caption: 11, meta: 13, body: 15, title: 18, display: 24 } as const;

/**
 * Density and font scale are independent axes and must stay that way: a reader
 * who wants big text in a tight layout is expressing a real preference, not a
 * mistake, and collapsing the two into one "size" control loses it.
 */
export function typeScale(density: Density, fontScale: number): TypeScale {
  const metrics = DENSITY_METRICS[density];
  const round = (n: number) => Math.round(n * fontScale * 2) / 2;
  const body = round(BASE_SCALE.body);
  return {
    caption: round(BASE_SCALE.caption),
    meta: round(BASE_SCALE.meta),
    body,
    title: round(BASE_SCALE.title),
    display: round(BASE_SCALE.display),
    bodyLineHeight: Math.round(body * metrics.lineHeightScale * 2) / 2,
  };
}

export function densityMetrics(density: Density) {
  return DENSITY_METRICS[density];
}
