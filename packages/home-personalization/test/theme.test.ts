import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

import {
  contrastRatio,
  deriveTheme,
  ensureContrast,
  mix,
  oklabToRgb,
  parseHex,
  rgbToOklab,
  shiftLightness,
  THEME_PRESETS,
  toHex,
  validateThemeSeed,
  WCAG_AA_LARGE,
  WCAG_AA_TEXT,
} from '../src/theme/index';

describe('colour maths', () => {
  test('hex parsing handles shorthand, case, and a missing hash', () => {
    assert.deepEqual(parseHex('#fff'), parseHex('FFFFFF'));
    assert.deepEqual(parseHex('#000'), { r: 0, g: 0, b: 0 });
    assert.equal(parseHex('nope'), undefined);
    assert.equal(parseHex('#ff'), undefined);
  });

  test('oklab round-trips within a rounding step', () => {
    for (const hex of ['#7c6cff', '#f4ecd8', '#0a0e0a', '#ff0000', '#00ff88']) {
      assert.equal(
        toHex(oklabToRgb(rgbToOklab(parseHex(hex)!))),
        hex.toLowerCase(),
      );
    }
  });

  test('mixing is perceptual, not a muddy sRGB average', () => {
    const midpoint = mix('#0000ff', '#ffff00', 0.5);
    const naive = toHex({ r: 0.5, g: 0.5, b: 0.5 });
    assert.notEqual(midpoint, naive);
    // Oklab keeps the midpoint of two vivid colours vivid rather than grey.
    const lab = rgbToOklab(parseHex(midpoint)!);
    assert.ok(
      Math.hypot(lab.a, lab.b) > 0.02,
      `midpoint went grey: ${midpoint}`,
    );
  });

  test('mix endpoints are exact', () => {
    assert.equal(mix('#123456', '#abcdef', 0), '#123456');
    assert.equal(mix('#123456', '#abcdef', 1), '#abcdef');
  });

  test('contrast matches known WCAG values', () => {
    assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
    assert.equal(contrastRatio('#777777', '#777777'), 1);
  });

  test('lightness shifts stay in gamut', () => {
    assert.equal(shiftLightness('#ffffff', 0.5), '#ffffff');
    assert.equal(shiftLightness('#000000', -0.5), '#000000');
  });
});

describe('ensureContrast', () => {
  test('leaves an already-readable colour alone', () => {
    assert.equal(ensureContrast('#ffffff', '#000000'), '#ffffff');
  });

  test('rescues low-contrast pairs in both directions', () => {
    const onWhite = ensureContrast('#ffe600', '#ffffff');
    assert.ok(
      contrastRatio(onWhite, '#ffffff') >= WCAG_AA_TEXT,
      `got ${contrastRatio(onWhite, '#ffffff')}`,
    );

    const onBlack = ensureContrast('#101010', '#000000');
    assert.ok(contrastRatio(onBlack, '#000000') >= WCAG_AA_TEXT);
  });

  test('preserves hue while fixing lightness', () => {
    const fixed = ensureContrast('#ffe600', '#ffffff');
    const before = rgbToOklab(parseHex('#ffe600')!);
    const after = rgbToOklab(parseHex(fixed)!);
    const hueBefore = Math.atan2(before.b, before.a);
    const hueAfter = Math.atan2(after.b, after.a);
    assert.ok(
      Math.abs(hueBefore - hueAfter) < 0.25,
      'the reader still gets their yellow',
    );
  });
});

describe('deriveTheme', () => {
  test('every preset produces readable text on its own surfaces', () => {
    for (const preset of THEME_PRESETS) {
      const t = deriveTheme(preset);
      for (const key of [
        'primary',
        'secondary',
        'accent',
        'danger',
        'success',
        'warning',
      ] as const) {
        const ratio = contrastRatio(t.text[key], t.background.default);
        assert.ok(
          ratio >= WCAG_AA_TEXT,
          `${preset.id}.text.${key} was ${ratio.toFixed(2)}`,
        );
      }
      const tertiary = contrastRatio(t.text.tertiary, t.background.default);
      assert.ok(
        tertiary >= WCAG_AA_LARGE,
        `${preset.id}.text.tertiary was ${tertiary.toFixed(2)}`,
      );
      const onAccent = contrastRatio(t.text.onAccent, t.background.accent);
      assert.ok(
        onAccent >= WCAG_AA_LARGE,
        `${preset.id} button label was ${onAccent.toFixed(2)}`,
      );
    }
  });

  test('a deliberately terrible seed is repaired, not accepted', () => {
    const t = deriveTheme({
      id: 'bad',
      name: 'Bad',
      mode: 'light',
      background: '#ffffff',
      foreground: '#fafafa',
      accent: '#fffde0',
    });
    assert.ok(
      contrastRatio(t.text.primary, t.background.default) >= WCAG_AA_TEXT,
    );
    assert.ok(
      contrastRatio(t.text.accent, t.background.default) >= WCAG_AA_TEXT,
    );
  });

  test('elevation moves away from the page in both modes', () => {
    const dark = deriveTheme(THEME_PRESETS.find((p) => p.mode === 'dark')!);
    const light = deriveTheme(THEME_PRESETS.find((p) => p.mode === 'light')!);
    const lum = (h: string) => contrastRatio(h, '#000000');
    assert.ok(
      lum(dark.background.elevated) > lum(dark.background.default),
      'dark elevates lighter',
    );
    assert.ok(
      lum(light.background.elevated) < lum(light.background.default),
      'light elevates darker',
    );
  });

  test('radius and font scale derive and clamp', () => {
    const t = deriveTheme({ ...THEME_PRESETS[0]!, radius: 16, fontScale: 99 });
    assert.equal(t.radius.md, 16);
    assert.equal(t.radius.sm, 8);
    assert.equal(t.radius.lg, 24);
    assert.equal(t.fontScale, 1.4, 'clamped to the readable ceiling');
  });
});

describe('theme validation', () => {
  test('accepts a good seed with no issues', () => {
    const { seed, issues } = validateThemeSeed(THEME_PRESETS[0]);
    assert.ok(seed);
    assert.deepEqual(issues, []);
  });

  test('reports missing and malformed fields', () => {
    const { seed, issues } = validateThemeSeed({ id: '', background: 'blue' });
    assert.equal(seed, undefined);
    const fields = issues.map((i) => i.field);
    assert.ok(fields.includes('background'));
    assert.ok(fields.includes('id'));
  });

  test('warns about low contrast but still returns the seed', () => {
    const { seed, issues } = validateThemeSeed({
      id: 'x',
      name: 'X',
      mode: 'light',
      background: '#ffffff',
      foreground: '#f0f0f0',
      accent: '#fdfdfd',
    });
    assert.ok(seed, 'the editor keeps working while the warning shows');
    assert.equal(issues.length, 2);
    assert.ok(issues.every((i) => /legible|visible/.test(i.message)));
  });

  test('clamps hostile numbers from an imported theme', () => {
    const { seed } = validateThemeSeed({
      id: 'x',
      name: 'X',
      mode: 'dark',
      background: '#000000',
      foreground: '#ffffff',
      accent: '#7c6cff',
      radius: 9999,
      fontScale: -3,
    });
    assert.equal(seed!.radius, 28);
    assert.equal(seed!.fontScale, 0.85);
  });
});
