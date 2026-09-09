/**
 * Themes from seeds.
 *
 * The reference client's palette has 797 colour tokens and exposes three
 * choices to the reader: light, dark, system. The gap between those numbers is
 * the whole problem — nobody is going to hand-edit 797 values, and nobody
 * should have to.
 *
 * So a theme here is a `ThemeSeed`: about ten decisions a person can hold in
 * their head. Everything else is derived, and every derived text colour is run
 * through a contrast check against the surface it lands on. A reader cannot
 * build an unreadable theme, which is what makes it safe to let them build any
 * theme at all.
 */

import {
  contrastRatio,
  ensureContrast,
  mix,
  shiftLightness,
  WCAG_AA_LARGE,
  WCAG_AA_TEXT,
  parseHex,
} from './color';

export * from './color';
export * from './share';

export const THEME_MODES = ['light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export type ThemeSeed = {
  id: string;
  name: string;
  mode: ThemeMode;
  /** The page. Everything else is derived relative to this. */
  background: string;
  /** Body text. Contrast against `background` is enforced, not assumed. */
  foreground: string;
  /** Links, active states, the brand colour. */
  accent: string;
  danger?: string;
  success?: string;
  warning?: string;
  /** Corner radius in points for cards and buttons. */
  radius?: number;
  /** Multiplier on every font size, 0.85–1.4. Independent of OS text scaling. */
  fontScale?: number;
  /** Font stack ids, resolved by the app to real families. */
  fonts?: { body?: string; heading?: string; mono?: string };
};

export type DerivedTheme = {
  seed: ThemeSeed;
  mode: ThemeMode;
  background: {
    default: string;
    elevated: string;
    sunken: string;
    input: string;
    overlay: string;
    accent: string;
    danger: string;
    success: string;
    warning: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    accent: string;
    danger: string;
    success: string;
    warning: string;
    onAccent: string;
  };
  border: { subtle: string; default: string; strong: string; accent: string };
  radius: { sm: number; md: number; lg: number; pill: number };
  fontScale: number;
  fonts: { body: string; heading: string; mono: string };
};

const DEFAULTS = {
  danger: { light: '#c02b2b', dark: '#ff6b6b' },
  success: { light: '#1a7f45', dark: '#4ade80' },
  warning: { light: '#9a6400', dark: '#fbbf24' },
} as const;

export function deriveTheme(seed: ThemeSeed): DerivedTheme {
  const mode = seed.mode;
  const bg = seed.background;
  // "Away from the page" means lighter in a dark theme and darker in a light
  // one, so one set of derivation rules serves both modes.
  const away = mode === 'dark' ? 1 : -1;

  const elevated = shiftLightness(bg, away * 0.045);
  const sunken = shiftLightness(bg, away * -0.02);
  const input = shiftLightness(bg, away * 0.07);

  const fg = ensureContrast(seed.foreground, bg, WCAG_AA_TEXT);
  const secondary = ensureContrast(mix(fg, bg, 0.32), bg, WCAG_AA_TEXT);
  // Tertiary is for timestamps and metadata, which are small but still text;
  // holding it to the large-text threshold keeps it legible without making it
  // compete with the body copy.
  const tertiary = ensureContrast(mix(fg, bg, 0.55), bg, WCAG_AA_LARGE);

  const danger = seed.danger ?? DEFAULTS.danger[mode];
  const success = seed.success ?? DEFAULTS.success[mode];
  const warning = seed.warning ?? DEFAULTS.warning[mode];

  const onAccent =
    contrastRatio('#ffffff', seed.accent) >=
    contrastRatio('#000000', seed.accent)
      ? '#ffffff'
      : '#000000';

  const radius = seed.radius ?? 12;
  const fontScale = Math.min(1.4, Math.max(0.85, seed.fontScale ?? 1));

  return {
    seed,
    mode,
    background: {
      default: bg,
      elevated,
      sunken,
      input,
      overlay: mode === 'dark' ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.45)',
      accent: seed.accent,
      danger: mix(danger, bg, 0.86),
      success: mix(success, bg, 0.86),
      warning: mix(warning, bg, 0.86),
    },
    text: {
      primary: fg,
      secondary,
      tertiary,
      accent: ensureContrast(seed.accent, bg, WCAG_AA_TEXT),
      danger: ensureContrast(danger, bg, WCAG_AA_TEXT),
      success: ensureContrast(success, bg, WCAG_AA_TEXT),
      warning: ensureContrast(warning, bg, WCAG_AA_TEXT),
      onAccent,
    },
    border: {
      subtle: mix(fg, bg, 0.9),
      default: mix(fg, bg, 0.8),
      strong: mix(fg, bg, 0.6),
      accent: seed.accent,
    },
    radius: {
      sm: Math.round(radius * 0.5),
      md: radius,
      lg: Math.round(radius * 1.5),
      pill: 999,
    },
    fontScale,
    fonts: {
      body: seed.fonts?.body ?? 'system',
      heading: seed.fonts?.heading ?? seed.fonts?.body ?? 'system',
      mono: seed.fonts?.mono ?? 'mono',
    },
  };
}

export type ThemeIssue = { field: string; message: string };

/**
 * Check a seed before it is saved or imported. Returns issues rather than
 * throwing: the theme editor shows them next to the offending swatch while the
 * reader keeps editing, instead of refusing the whole theme.
 */
export function validateThemeSeed(input: unknown): {
  seed?: ThemeSeed;
  issues: ThemeIssue[];
} {
  const issues: ThemeIssue[] = [];
  if (typeof input !== 'object' || input === null) {
    return { issues: [{ field: '', message: 'theme must be an object' }] };
  }
  const raw = input as Record<string, unknown>;
  const hex = (
    v: unknown,
    field: string,
    required: boolean,
  ): string | undefined => {
    if (typeof v !== 'string' || !parseHex(v)) {
      if (required)
        issues.push({ field, message: 'must be a hex colour like #1a1a1a' });
      return undefined;
    }
    return v;
  };

  const background = hex(raw.background, 'background', true);
  const foreground = hex(raw.foreground, 'foreground', true);
  const accent = hex(raw.accent, 'accent', true);
  const mode: ThemeMode = raw.mode === 'light' ? 'light' : 'dark';
  const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : '';
  const name =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim().slice(0, 40)
      : '';
  if (!id) issues.push({ field: 'id', message: 'required' });
  if (!name) issues.push({ field: 'name', message: 'required' });
  if (!background || !foreground || !accent) return { issues };

  const seed: ThemeSeed = { id, name, mode, background, foreground, accent };
  for (const key of ['danger', 'success', 'warning'] as const) {
    const v = hex(raw[key], key, false);
    if (v) seed[key] = v;
  }
  if (typeof raw.radius === 'number' && Number.isFinite(raw.radius)) {
    seed.radius = Math.min(28, Math.max(0, raw.radius));
  }
  if (typeof raw.fontScale === 'number' && Number.isFinite(raw.fontScale)) {
    seed.fontScale = Math.min(1.4, Math.max(0.85, raw.fontScale));
  }
  if (typeof raw.fonts === 'object' && raw.fonts !== null) {
    const f = raw.fonts as Record<string, unknown>;
    seed.fonts = {};
    for (const k of ['body', 'heading', 'mono'] as const) {
      if (typeof f[k] === 'string')
        seed.fonts[k] = (f[k] as string).slice(0, 32);
    }
  }

  // Warn rather than reject: the derivation will fix these, and the editor
  // says so, so the reader learns what happened instead of being overruled.
  if (contrastRatio(foreground, background) < WCAG_AA_TEXT) {
    issues.push({
      field: 'foreground',
      message:
        'too low-contrast to read; it will be darkened or lightened to stay legible',
    });
  }
  if (contrastRatio(accent, background) < WCAG_AA_LARGE) {
    issues.push({
      field: 'accent',
      message:
        'too close to the background; links will be adjusted to stay visible',
    });
  }

  return { seed, issues };
}

/** Starting points. Every one is a seed, so every one is editable in place. */
export const THEME_PRESETS: ThemeSeed[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    mode: 'dark',
    background: '#0f0f11',
    foreground: '#f2f2f4',
    accent: '#7c6cff',
  },
  {
    id: 'paper',
    name: 'Paper',
    mode: 'light',
    background: '#fbfaf7',
    foreground: '#1b1a18',
    accent: '#3b5bdb',
    radius: 8,
  },
  {
    id: 'terminal',
    name: 'Terminal',
    mode: 'dark',
    background: '#0a0e0a',
    foreground: '#c8e6c9',
    accent: '#4ade80',
    radius: 2,
    fonts: { body: 'mono', heading: 'mono', mono: 'mono' },
  },
  {
    id: 'sepia',
    name: 'Sepia',
    mode: 'light',
    background: '#f4ecd8',
    foreground: '#3a2f1e',
    accent: '#9a5b2c',
    radius: 6,
    fontScale: 1.05,
  },
  {
    id: 'high-contrast',
    name: 'High contrast',
    mode: 'dark',
    background: '#000000',
    foreground: '#ffffff',
    accent: '#ffd400',
    radius: 4,
    fontScale: 1.15,
  },
];
