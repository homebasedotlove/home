import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

import { defaultPreferences } from '../src/prefs';
import {
  resolveSkin,
  resolveTheme,
  resolveThemeSeed,
  typeScale,
} from '../src/prefs/resolve';
import { contrastRatio, WCAG_AA_TEXT } from '../src/theme';
import {
  groupReceipts,
  summarizeReceipts,
  UNDO_LABEL,
} from '../src/pipeline/receipts';
import type { DropReceipt } from '../src/pipeline/types';

describe('skin resolution', () => {
  test('global defaults apply when a feed says nothing', () => {
    const prefs = defaultPreferences();
    assert.deepEqual(resolveSkin(prefs), prefs.skin);
  });

  test('a feed overrides field by field, not wholesale', () => {
    const prefs = defaultPreferences();
    const skin = resolveSkin(prefs, { density: 'dense' });
    assert.equal(skin.density, 'dense');
    assert.equal(
      skin.media,
      prefs.skin.media,
      'untouched fields keep the global value',
    );
    assert.equal(skin.showWhyChips, prefs.skin.showWhyChips);
  });

  test('an explicit false overrides a true default', () => {
    const prefs = defaultPreferences();
    assert.equal(
      resolveSkin(prefs, { showWhyChips: false }).showWhyChips,
      false,
    );
  });

  test('the Quiet starter feed is calmer than the app around it', () => {
    const prefs = defaultPreferences();
    const quiet = prefs.feeds.find((f) => f.id === 'quiet')!;
    const skin = resolveSkin(prefs, quiet.skin);
    assert.equal(skin.hideCounts, true);
    assert.equal(skin.media, 'tap');
    assert.equal(resolveSkin(prefs).hideCounts, false, 'and only that feed');
  });
});

describe('theme resolution', () => {
  test('follows the OS when asked', () => {
    const prefs = defaultPreferences();
    assert.equal(resolveThemeSeed(prefs, 'dark').id, 'midnight');
    assert.equal(resolveThemeSeed(prefs, 'light').id, 'paper');
  });

  test('ignores the OS when the reader pinned a theme', () => {
    const prefs = {
      ...defaultPreferences(),
      followSystemTheme: false,
      darkThemeId: 'terminal',
    };
    assert.equal(resolveThemeSeed(prefs, 'light').id, 'terminal');
  });

  test('a feed can pin its own theme', () => {
    const prefs = defaultPreferences();
    assert.equal(
      resolveThemeSeed(prefs, 'dark', { themeId: 'sepia' }).id,
      'sepia',
    );
  });

  test('a dangling theme id never leaves the app unthemed', () => {
    const prefs = defaultPreferences();
    assert.ok(resolveThemeSeed(prefs, 'dark', { themeId: 'deleted' }).id);
    const broken = { ...prefs, lightThemeId: 'gone', darkThemeId: 'gone' };
    const seed = resolveThemeSeed(broken, 'light');
    assert.equal(seed.mode, 'light', 'falls back to a theme of the right mode');
  });

  test('resolved themes are always readable', () => {
    const prefs = defaultPreferences();
    for (const scheme of ['light', 'dark'] as const) {
      const theme = resolveTheme(prefs, scheme);
      assert.ok(
        contrastRatio(theme.text.primary, theme.background.default) >=
          WCAG_AA_TEXT,
      );
    }
  });
});

describe('type scale', () => {
  test('font scale multiplies every step', () => {
    const base = typeScale('comfortable', 1);
    const big = typeScale('comfortable', 1.4);
    assert.ok(big.body > base.body);
    assert.ok(big.caption > base.caption);
    assert.equal(big.body, Math.round(15 * 1.4 * 2) / 2);
  });

  test('density changes line height without changing size', () => {
    const comfy = typeScale('comfortable', 1);
    const dense = typeScale('dense', 1);
    assert.equal(comfy.body, dense.body, 'the two axes stay independent');
    assert.ok(dense.bodyLineHeight < comfy.bodyLineHeight);
  });

  test('sizes land on half points, so text never renders blurry', () => {
    const scale = typeScale('compact', 1.15);
    for (const v of [
      scale.caption,
      scale.meta,
      scale.body,
      scale.title,
      scale.display,
    ]) {
      assert.equal(v * 2, Math.round(v * 2));
    }
  });
});

describe('receipt grouping', () => {
  const receipts: DropReceipt[] = [
    {
      itemId: '1',
      authorFid: 1,
      cause: 'muted-keyword',
      detail: 'Matched "election".',
      rule: 'election',
    },
    {
      itemId: '2',
      authorFid: 2,
      cause: 'muted-keyword',
      detail: 'Matched "election".',
      rule: 'election',
    },
    {
      itemId: '3',
      authorFid: 3,
      cause: 'muted-group',
      detail: 'Discovery is off.',
      rule: 'discovery',
    },
    {
      itemId: '4',
      authorFid: 4,
      cause: 'hidden-reply',
      detail: 'Replies are hidden.',
    },
  ];

  test('one row per rule, most-hidden first', () => {
    const groups = groupReceipts(receipts);
    assert.equal(groups.length, 3);
    assert.equal(groups[0]!.rule, 'election');
    assert.equal(groups[0]!.count, 2);
    assert.deepEqual(groups[0]!.itemIds, ['1', '2']);
  });

  test('same rule under different causes stays separate', () => {
    const groups = groupReceipts([
      {
        itemId: 'a',
        authorFid: 1,
        cause: 'muted-group',
        detail: 'x',
        rule: 'promoted',
      },
      {
        itemId: 'b',
        authorFid: 1,
        cause: 'muted-reason',
        detail: 'y',
        rule: 'promoted',
      },
    ]);
    assert.equal(groups.length, 2);
    assert.equal(
      new Set(groups.map((g) => g.key)).size,
      2,
      'keys are unique for React',
    );
  });

  test('every cause has an undo label', () => {
    for (const group of groupReceipts(receipts)) {
      assert.ok(UNDO_LABEL[group.cause], `no label for ${group.cause}`);
    }
  });

  test('the summary line is absent when nothing was hidden', () => {
    assert.equal(summarizeReceipts([]), undefined);
    assert.equal(
      summarizeReceipts(receipts.slice(0, 1)),
      '1 cast hidden on this page.',
    );
    assert.equal(summarizeReceipts(receipts), '4 casts hidden on this page.');
  });
});
