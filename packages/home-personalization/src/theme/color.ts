/**
 * Colour maths.
 *
 * Mixing happens in Oklab, not in sRGB. Naive RGB interpolation is what makes
 * user-made themes look muddy — the midpoint of a blue and a yellow comes out
 * grey, and every derived step of a palette drifts in lightness. Oklab is
 * perceptually uniform, so "20% lighter" looks 20% lighter for every hue, and
 * a reader who picks one accent colour gets a coherent set of steps from it.
 */

export type RGB = { r: number; g: number; b: number };
export type Oklab = { L: number; a: number; b: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function parseHex(hex: string): RGB | undefined {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return undefined;
  let h = m[1];
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

export function toHex({ r, g, b }: RGB): string {
  const c = (n: number) =>
    Math.round(clamp01(n) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const toGamma = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

export function rgbToOklab({ r, g, b }: RGB): Oklab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToRgb({ L, a, b }: Oklab): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: clamp01(toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp01(
      toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    ),
    b: clamp01(toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  };
}

/** Blend two colours by `t` (0 = a, 1 = b) in Oklab. */
export function mix(aHex: string, bHex: string, t: number): string {
  const a = parseHex(aHex);
  const b = parseHex(bHex);
  if (!a || !b) return aHex;
  const la = rgbToOklab(a);
  const lb = rgbToOklab(b);
  const k = clamp01(t);
  return toHex(
    oklabToRgb({
      L: la.L + (lb.L - la.L) * k,
      a: la.a + (lb.a - la.a) * k,
      b: la.b + (lb.b - la.b) * k,
    }),
  );
}

/** Move a colour's perceptual lightness by `delta` (−1…1), keeping its hue. */
export function shiftLightness(hex: string, delta: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const lab = rgbToOklab(rgb);
  return toHex(oklabToRgb({ ...lab, L: clamp01(lab.L + delta) }));
}

export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const l = (c: number) => toLinear(c);
  return 0.2126 * l(rgb.r) + 0.7152 * l(rgb.g) + 0.0722 * l(rgb.b);
}

/** WCAG 2.1 contrast ratio, 1–21. */
export function contrastRatio(aHex: string, bHex: string): number {
  const a = relativeLuminance(aHex);
  const b = relativeLuminance(bHex);
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Nudge `fg` along the lightness axis until it clears `target` contrast
 * against `bg`.
 *
 * This is what keeps a custom theme usable. A reader who picks a pale yellow
 * accent on a white background gets a readable yellow, not an invisible one,
 * and never has to learn why their choice did not work. The hue they chose is
 * preserved; only lightness moves.
 */
export function ensureContrast(fg: string, bg: string, target = 4.5): string {
  if (contrastRatio(fg, bg) >= target) return fg;
  const bgLum = relativeLuminance(bg);
  const direction = bgLum > 0.18 ? -1 : 1;
  let candidate = fg;
  for (let step = 1; step <= 40; step++) {
    candidate = shiftLightness(fg, direction * step * 0.025);
    if (contrastRatio(candidate, bg) >= target) return candidate;
  }
  // Nothing in this hue reaches the target; fall back to the honest extreme
  // rather than shipping text the reader cannot read.
  return direction < 0 ? '#000000' : '#ffffff';
}

export const WCAG_AA_TEXT = 4.5;
export const WCAG_AA_LARGE = 3;
