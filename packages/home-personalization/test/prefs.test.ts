import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

import {
  PREFERENCES_KEY,
  PREFERENCES_VERSION,
  defaultPreferences,
  exportPreferences,
  importPreferences,
  loadPreferences,
  memoryStore,
  migratePreferences,
  savePreferences,
} from '../src/prefs/index';
import { THEME_PRESETS } from '../src/theme/index';

describe('defaults', () => {
  test('a new reader gets three feeds, not one', () => {
    const p = defaultPreferences();
    assert.equal(p.feeds.length, 3);
    assert.deepEqual(
      p.feedOrder,
      p.feeds.map((f) => f.id),
    );
    assert.ok(
      p.feeds.some((f) => f.sort.mode === 'chronological'),
      'an unranked option ships by default',
    );
    assert.ok(p.feeds.some((f) => f.sift.mutedGroups.includes('promoted')));
  });

  test('the default tab bar is within the usable range', () => {
    const p = defaultPreferences();
    assert.ok(p.tabs.length >= 2 && p.tabs.length <= 5);
  });
});

describe('round-trip', () => {
  test('save then load returns what was saved', () => {
    const store = memoryStore();
    const prefs = defaultPreferences();
    prefs.activeFeedId = 'quiet';
    prefs.skin.hideCounts = true;
    savePreferences(store, prefs);
    const { preferences, usedDefaults } = loadPreferences(store);
    assert.equal(usedDefaults, false);
    assert.equal(preferences.activeFeedId, 'quiet');
    assert.equal(preferences.skin.hideCounts, true);
  });

  test('an empty store yields defaults without complaining', () => {
    const r = loadPreferences(memoryStore());
    assert.equal(r.usedDefaults, true);
    assert.deepEqual(r.notes, []);
  });

  test('corrupt storage falls back instead of throwing on a cold start', () => {
    const store = memoryStore({ [PREFERENCES_KEY]: '{not json' });
    const r = loadPreferences(store);
    assert.equal(r.usedDefaults, true);
    assert.equal(r.notes.length, 1);
    assert.match(r.notes[0]!, /could not be read/);
  });

  test('junk inside a stored feed loads instead of throwing', () => {
    // A hand-edited or half-written document. Before the guard this threw out
    // of loadPreferences on every cold start, with no way to recover.
    const raw = JSON.parse(exportPreferences(defaultPreferences()));
    raw.feeds[0].sift.keywords = [null];
    raw.feeds[0].sift.authors = [null];
    const store = memoryStore({ [PREFERENCES_KEY]: JSON.stringify(raw) });
    const { preferences, usedDefaults } = loadPreferences(store);
    assert.equal(usedDefaults, false);
    assert.equal(preferences.feeds.length, 3, 'the feed survives');
    assert.deepEqual(preferences.feeds[0]!.sift.keywords, []);
  });

  test('export is human-readable and re-imports identically', () => {
    const prefs = defaultPreferences();
    const json = exportPreferences(prefs);
    assert.ok(json.includes('\n  '), 'pretty-printed so a reader can edit it');
    const back = importPreferences(json);
    assert.deepEqual(back.preferences, prefs);
  });
});

describe('migration', () => {
  test('one bad feed costs that feed, not the whole import', () => {
    const prefs = defaultPreferences();
    const raw = JSON.parse(exportPreferences(prefs));
    raw.feeds.push({ version: 1, id: 'broken', source: { kind: 'nope' } });
    const r = migratePreferences(raw);
    assert.equal(r.preferences.feeds.length, 3);
    assert.equal(r.notes.length, 1);
    assert.match(r.notes[0]!, /skipped/);
  });

  test('a newer document is salvaged and the reader is told', () => {
    const raw = {
      ...JSON.parse(exportPreferences(defaultPreferences())),
      version: 999,
    };
    const r = migratePreferences(raw);
    assert.match(r.notes.join(' '), /newer version/);
    assert.equal(r.preferences.version, PREFERENCES_VERSION);
    assert.equal(r.preferences.feeds.length, 3, 'known fields survive');
  });

  test('presets are always restored, so a reader cannot delete every theme', () => {
    const raw = JSON.parse(exportPreferences(defaultPreferences()));
    raw.themes = [];
    const r = migratePreferences(raw);
    assert.equal(r.preferences.themes.length, THEME_PRESETS.length);
  });

  test('a custom theme survives alongside the presets', () => {
    const raw = JSON.parse(exportPreferences(defaultPreferences()));
    raw.themes = [
      {
        id: 'mine',
        name: 'Mine',
        mode: 'dark',
        background: '#111111',
        foreground: '#eeeeee',
        accent: '#ff8800',
      },
    ];
    const r = migratePreferences(raw);
    assert.ok(r.preferences.themes.some((t) => t.id === 'mine'));
    assert.ok(r.preferences.themes.some((t) => t.id === 'midnight'));
  });

  test('dangling ids fall back to something that exists', () => {
    const raw = JSON.parse(exportPreferences(defaultPreferences()));
    raw.activeFeedId = 'deleted-long-ago';
    raw.feedOrder = ['deleted-long-ago', 'home'];
    raw.darkThemeId = 'gone';
    const r = migratePreferences(raw);
    assert.ok(
      r.preferences.feeds.some((f) => f.id === r.preferences.activeFeedId),
    );
    assert.equal(r.preferences.feedOrder.includes('deleted-long-ago'), false);
    assert.equal(
      r.preferences.feedOrder.length,
      3,
      'feeds missing from the order are appended',
    );
    assert.equal(r.preferences.darkThemeId, 'midnight');
  });

  test('an unusable tab bar is refused with an explanation', () => {
    const raw = JSON.parse(exportPreferences(defaultPreferences()));
    raw.tabs = ['feeds'];
    const r = migratePreferences(raw);
    assert.equal(r.preferences.tabs.length, 5);
    assert.match(r.notes.join(' '), /between 2 and 5/);
  });

  test('unknown actions and gestures are dropped, not stored', () => {
    const raw = JSON.parse(exportPreferences(defaultPreferences()));
    raw.actionBar = ['like', 'launch-missiles', 'reply'];
    raw.gestures = {
      swipeLeft: 'nope',
      swipeRight: 'quote',
      doubleTap: 'like',
      longPress: 'why',
    };
    const r = migratePreferences(raw);
    assert.deepEqual(r.preferences.actionBar, ['like', 'reply']);
    assert.equal(
      r.preferences.gestures.swipeLeft,
      'bookmark',
      'falls back to the default',
    );
    assert.equal(r.preferences.gestures.swipeRight, 'quote');
  });

  test('lists are bounded and malformed entries dropped', () => {
    const raw = JSON.parse(exportPreferences(defaultPreferences()));
    raw.lists = [
      { id: 'a', name: 'Designers', fids: [1, 2, 'x', -5] },
      { id: '', name: 'Nameless', fids: [] },
    ];
    const r = migratePreferences(raw);
    assert.equal(r.preferences.lists.length, 1);
    assert.deepEqual(r.preferences.lists[0]!.fids, [1, 2]);
  });

  test('garbage in is defaults out, never a throw', () => {
    for (const junk of [null, 42, 'string', [], true]) {
      const r = migratePreferences(junk);
      assert.equal(r.preferences.version, PREFERENCES_VERSION);
    }
    assert.equal(importPreferences('<<<not json>>>').usedDefaults, true);
  });
});

describe('imported skin and boundaries are validated, not trusted', () => {
  test('a hostile quiet window cannot put the app into permanent quiet hours', () => {
    const raw = JSON.parse(exportPreferences(defaultPreferences()));
    raw.boundaries = { quietHours: { startMinute: -5, endMinute: 9999 } };
    const { preferences } = migratePreferences(raw);
    assert.equal(preferences.boundaries.quietHours, undefined);
  });

  test('a string budget does not become NaN arithmetic', () => {
    const raw = JSON.parse(exportPreferences(defaultPreferences()));
    raw.boundaries = { sessionBudgetMinutes: 'twenty', dailyBudgetMinutes: -3 };
    const { preferences } = migratePreferences(raw);
    assert.equal(preferences.boundaries.sessionBudgetMinutes, undefined);
    assert.equal(preferences.boundaries.dailyBudgetMinutes, undefined);
  });

  test('valid boundaries survive, clamped to a day', () => {
    const raw = JSON.parse(exportPreferences(defaultPreferences()));
    raw.boundaries = {
      catchUp: true,
      windDown: true,
      sessionBudgetMinutes: 25.6,
      dailyBudgetMinutes: 99999,
      quietHours: { startMinute: 1380, endMinute: 420 },
    };
    const { preferences } = migratePreferences(raw);
    assert.deepEqual(preferences.boundaries, {
      catchUp: true,
      windDown: true,
      sessionBudgetMinutes: 26,
      dailyBudgetMinutes: 1440,
      quietHours: { startMinute: 1380, endMinute: 420 },
    });
  });

  test('a half-specified quiet window is dropped, not guessed', () => {
    const raw = JSON.parse(exportPreferences(defaultPreferences()));
    raw.boundaries = { quietHours: { startMinute: 60 } };
    assert.equal(
      migratePreferences(raw).preferences.boundaries.quietHours,
      undefined,
    );
  });

  test('unknown boundary fields are not persisted', () => {
    const raw = JSON.parse(exportPreferences(defaultPreferences()));
    raw.boundaries = { evil: 1, catchUp: true };
    const b = migratePreferences(raw).preferences.boundaries as Record<
      string,
      unknown
    >;
    assert.equal('evil' in b, false);
  });

  test('a hostile skin falls back field by field', () => {
    const raw = JSON.parse(exportPreferences(defaultPreferences()));
    raw.skin = { density: 'gigantic', media: 42, hideCounts: 'maybe', evil: 1 };
    const { preferences } = migratePreferences(raw);
    const defaults = defaultPreferences().skin;
    assert.equal(preferences.skin.density, defaults.density);
    assert.equal(preferences.skin.media, defaults.media);
    assert.equal(preferences.skin.hideCounts, defaults.hideCounts);
    assert.equal('evil' in preferences.skin, false);
  });

  test('a valid skin is kept, including an explicit false', () => {
    const raw = JSON.parse(exportPreferences(defaultPreferences()));
    raw.skin = { density: 'dense', showWhyChips: false };
    const { preferences } = migratePreferences(raw);
    assert.equal(preferences.skin.density, 'dense');
    assert.equal(
      preferences.skin.showWhyChips,
      false,
      'false is a real choice',
    );
  });
});
