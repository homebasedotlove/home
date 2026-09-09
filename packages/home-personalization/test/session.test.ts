import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

import {
  affinityLookup,
  decayAffinity,
  emptyAffinity,
  recordInteraction,
  topAuthors,
  AFFINITY_HALF_LIFE_MS,
  AFFINITY_MAX_AUTHORS,
} from '../src/prefs/affinity';
import {
  enterBackground,
  enterForeground,
  localDayKey,
  markSeen,
  newSession,
  usageNow,
  NEW_SESSION_AFTER_MS,
} from '../src/boundaries/session';
import { evaluateBoundaries, defaultBoundarySettings } from '../src/boundaries';
import { affinityFactor } from '../src/pipeline/rank';

const MIN = 60_000;
const T0 = new Date(2026, 4, 20, 10, 0, 0).getTime();

describe('session accounting', () => {
  test('foreground time accumulates across stretches', () => {
    let s = newSession(T0);
    s = enterForeground(s, T0);
    s = enterBackground(s, T0 + 5 * MIN);
    s = enterForeground(s, T0 + 6 * MIN);
    s = enterBackground(s, T0 + 9 * MIN);
    assert.equal(s.sessionMs, 8 * MIN);
    assert.equal(s.dayMs, 8 * MIN);
  });

  test('background time is not counted', () => {
    let s = enterForeground(newSession(T0), T0);
    s = enterBackground(s, T0 + MIN);
    const usage = usageNow(s, T0 + 60 * MIN, new Date(T0 + 60 * MIN));
    assert.equal(usage.sessionMs, MIN, 'an hour asleep adds nothing');
  });

  test('a short interruption continues the sitting', () => {
    let s = enterForeground(newSession(T0), T0);
    s = enterBackground(s, T0 + 10 * MIN);
    s = enterForeground(s, T0 + 11 * MIN);
    assert.equal(
      s.sessionMs,
      10 * MIN,
      'checking a notification is not a new session',
    );
  });

  test('a long absence starts a fresh sitting but keeps the daily total', () => {
    let s = enterForeground(newSession(T0), T0);
    s = enterBackground(s, T0 + 20 * MIN);
    const back = T0 + 20 * MIN + NEW_SESSION_AFTER_MS;
    s = enterForeground(s, back, new Date(back));
    assert.equal(s.sessionMs, 0);
    assert.equal(s.dayMs, 20 * MIN, 'the day budget still remembers');
  });

  test('a duplicate foreground event does not discard elapsed time', () => {
    let s = enterForeground(newSession(T0), T0);
    s = enterForeground(s, T0 + 5 * MIN, new Date(T0 + 5 * MIN));
    s = enterBackground(s, T0 + 10 * MIN);
    assert.equal(s.sessionMs, 10 * MIN);
  });

  test('a background event while already backgrounded is harmless', () => {
    let s = enterForeground(newSession(T0), T0);
    s = enterBackground(s, T0 + MIN);
    s = enterBackground(s, T0 + 5 * MIN);
    assert.equal(s.sessionMs, MIN);
  });

  test('usageNow includes the in-progress stretch without committing it', () => {
    const s = enterForeground(newSession(T0), T0);
    const usage = usageNow(s, T0 + 3 * MIN, new Date(T0 + 3 * MIN));
    assert.equal(usage.sessionMs, 3 * MIN);
    assert.equal(s.sessionMs, 0, 'state is untouched');
  });

  test('nowMinute is local, which is what quiet hours compare against', () => {
    const at = new Date(2026, 4, 20, 23, 30);
    assert.equal(
      usageNow(newSession(at.getTime()), at.getTime(), at).nowMinute,
      23 * 60 + 30,
    );
  });

  test('the daily total resets on the local calendar day, not on a 24h timer', () => {
    let s = enterForeground(newSession(T0), T0);
    s = enterBackground(s, T0 + 30 * MIN);
    assert.equal(s.dayMs, 30 * MIN);

    const nextDay = new Date(2026, 4, 21, 0, 5);
    const rolled = usageNow(s, nextDay.getTime(), nextDay);
    assert.equal(rolled.dayMs, 0, 'five minutes past midnight is a new day');
  });

  test('the day key survives a DST boundary without collapsing two days', () => {
    const a = new Date(2026, 2, 8, 1, 30);
    const b = new Date(2026, 2, 9, 1, 30);
    assert.notEqual(localDayKey(a.getTime(), a), localDayKey(b.getTime(), b));
    const sameDayLater = new Date(2026, 2, 8, 23, 59);
    assert.equal(
      localDayKey(a.getTime(), a),
      localDayKey(sameDayLater.getTime(), sameDayLater),
    );
  });

  test('markSeen only moves forward', () => {
    let s = markSeen(newSession(T0), 500);
    s = markSeen(s, 200);
    assert.equal(s.lastSeenMs, 500);
    s = markSeen(s, 900);
    assert.equal(s.lastSeenMs, 900);
  });

  test('feeds straight into evaluateBoundaries', () => {
    let s = enterForeground(newSession(T0), T0);
    s = enterBackground(s, T0 + 31 * MIN);
    const settings = { ...defaultBoundarySettings(), sessionBudgetMinutes: 30 };
    const state = evaluateBoundaries(
      settings,
      usageNow(s, T0 + 31 * MIN, new Date(T0 + 31 * MIN)),
    );
    assert.equal(state.status, 'session-over');
  });
});

describe('affinity', () => {
  test('is inert until the reader opts in', () => {
    let a = emptyAffinity(T0);
    a = recordInteraction(a, 7, 'reply', T0);
    const lookup = affinityLookup(a, T0);
    assert.equal(
      affinityFactor(lookup(7), 0),
      1,
      'boost 0 means no effect at all',
    );
  });

  test('an untouched author has no opinion, which ranks neutral', () => {
    const a = recordInteraction(emptyAffinity(T0), 7, 'like', T0);
    assert.equal(affinityLookup(a, T0)(999), undefined);
    assert.equal(affinityFactor(undefined, 0.5), 1);
  });

  test('replying counts for more than liking', () => {
    let a = emptyAffinity(T0);
    a = recordInteraction(a, 1, 'reply', T0);
    a = recordInteraction(a, 2, 'like', T0);
    const lookup = affinityLookup(a, T0);
    assert.ok(lookup(1)! > lookup(2)!);
  });

  test('scores are relative to the reader, not an absolute threshold', () => {
    let lurker = emptyAffinity(T0);
    lurker = recordInteraction(lurker, 1, 'like', T0);
    let poster = emptyAffinity(T0);
    for (let i = 0; i < 50; i++)
      poster = recordInteraction(poster, 1, 'reply', T0);
    assert.equal(affinityLookup(lurker, T0)(1), affinityLookup(poster, T0)(1));
  });

  test('interest decays', () => {
    const a = recordInteraction(emptyAffinity(T0), 7, 'reply', T0);
    const later = decayAffinity(a, T0 + AFFINITY_HALF_LIFE_MS);
    assert.ok(Math.abs(later.scores['7']! - 3 / 2) < 1e-9);
    const muchLater = decayAffinity(a, T0 + AFFINITY_HALF_LIFE_MS * 20);
    assert.equal(
      muchLater.scores['7'],
      undefined,
      'decayed into noise and dropped',
    );
  });

  test('the store cannot grow without bound', () => {
    let a = emptyAffinity(T0);
    for (let fid = 1; fid <= AFFINITY_MAX_AUTHORS + 50; fid++) {
      a = recordInteraction(a, fid, 'like', T0);
    }
    assert.equal(Object.keys(a.scores).length, AFFINITY_MAX_AUTHORS);
  });

  test('topAuthors ranks by engagement, for building a list', () => {
    let a = emptyAffinity(T0);
    a = recordInteraction(a, 1, 'like', T0);
    a = recordInteraction(a, 2, 'reply', T0);
    a = recordInteraction(a, 2, 'reply', T0);
    a = recordInteraction(a, 3, 'recast', T0);
    assert.deepEqual(topAuthors(a, T0, 2), [2, 3]);
  });

  test('the lookup produces a boost above neutral for engaged authors', () => {
    let a = emptyAffinity(T0);
    a = recordInteraction(a, 1, 'reply', T0);
    a = recordInteraction(a, 2, 'dwell', T0);
    const lookup = affinityLookup(a, T0);
    assert.ok(affinityFactor(lookup(1), 0.5) > 1);
    assert.ok(affinityFactor(lookup(2), 0.5) >= 1);
  });
});
