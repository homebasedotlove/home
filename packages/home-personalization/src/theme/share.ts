/**
 * Theme share links.
 *
 * A theme is ten decisions, so it fits in a URL as comfortably as a feed does.
 * Same codec, same validation posture: what arrives is a stranger's JSON, and
 * `validateThemeSeed` decides what of it is usable before it reaches a screen.
 *
 * The contrast guarantee is what makes this safe to accept at all. An imported
 * theme cannot be unreadable, because `deriveTheme` repairs the palette rather
 * than trusting it — so the worst a bad link can do is look ugly.
 */

import {
  b64urlDecode,
  b64urlEncode,
  lastPathSegmentAfter,
} from '../feedspec/serialize';
import type { ThemeIssue, ThemeSeed } from './index';
import { validateThemeSeed } from './index';

export type ThemeDecodeResult =
  | { ok: true; seed: ThemeSeed; issues: ThemeIssue[] }
  | { ok: false; issues: ThemeIssue[] };

/** Drop anything at its default so the link stays short and legible. */
function compactSeed(seed: ThemeSeed): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: seed.id,
    name: seed.name,
    mode: seed.mode,
    background: seed.background,
    foreground: seed.foreground,
    accent: seed.accent,
  };
  for (const key of ['danger', 'success', 'warning'] as const) {
    if (seed[key]) out[key] = seed[key];
  }
  if (seed.radius !== undefined && seed.radius !== 12) out.radius = seed.radius;
  if (seed.fontScale !== undefined && seed.fontScale !== 1)
    out.fontScale = seed.fontScale;
  if (seed.fonts && Object.keys(seed.fonts).length > 0) out.fonts = seed.fonts;
  return out;
}

export function encodeThemeShare(seed: ThemeSeed): string {
  return b64urlEncode(JSON.stringify(compactSeed(seed)));
}

export function decodeThemeShare(encoded: string): ThemeDecodeResult {
  let json: unknown;
  try {
    json = JSON.parse(b64urlDecode(encoded.trim()));
  } catch (e) {
    return {
      ok: false,
      issues: [
        {
          field: '',
          message: `not a readable theme link: ${(e as Error).message}`,
        },
      ],
    };
  }
  const { seed, issues } = validateThemeSeed(json);
  // Issues here are warnings, not rejections: a low-contrast import is accepted
  // and repaired, and the reader is told what changed.
  return seed ? { ok: true, seed, issues } : { ok: false, issues };
}

export function themeShareUrl(
  seed: ThemeSeed,
  origin = 'https://home.example',
): string {
  return `${origin.replace(/\/$/, '')}/t/${encodeThemeShare(seed)}`;
}

export function parseThemeShareUrl(url: string): ThemeDecodeResult {
  const payload = lastPathSegmentAfter(url, 't');
  if (!payload) {
    return {
      ok: false,
      issues: [{ field: '', message: 'no theme payload found in that link' }],
    };
  }
  return decodeThemeShare(payload);
}
