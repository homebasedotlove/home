import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCatchUp,
  defaultBoundarySettings,
  evaluateBoundaries,
  isQuietNow,
  localMinuteOfDay,
} from '../src/boundaries/index.ts';

const MIN = 60_000;

describe('quiet hours', () => {
  test('a same-day window', () => {
    const q = { startMinute: 9 * 60, endMinute: 17 * 60 };
    assert.equal(isQuietNow(q, 8 * 60), false);
    assert.equal(isQuietNow(q, 9 * 60), true, 'start is inclusive');
    assert.equal(isQuietNow(q, 17 * 60), false, 'end is exclusive');
  });

  test('a window that wraps past midnight, which most of them do', () => {
    const q = { startMinute: 23 * 60, endMinute: 7 * 60 };
    assert.equal(isQuietNow(q, 23 * 60 + 30), true);
    assert.equal(isQuietNow(q, 3 * 60), true);
    assert.equal(isQuietNow(q, 6 * 60 + 59), true);
    assert.equal(isQuietNow(q, 7 * 60), false);
    assert.equal(isQuietNow(q, 12 * 60), false);
  });

  test('a zero-width window is off, not always-on', () => {
    assert.equal(isQuietNow({ startMinute: 60, endMinute: 60 }, 60), false);
  });

  test('undefined settings are never quiet', () => {
    assert.equal(isQuietNow(undefined, 0), false);
  });

  test('localMinuteOfDay reads the local clock', () => {
    const d = new Date(2026, 0, 1, 13, 45);
    assert.equal(localMinuteOfDay(d), 13 * 60 + 45);
  });
});

describe('budgets', () => {
  const usage = (sessionMin: number, dayMin = 0, nowMinute = 12 * 60) => ({
    sessionMs: sessionMin * MIN,
    dayMs: dayMin * MIN,
    nowMinute,
  });

  test('no budget set means no interference', () => {
    const s = evaluateBoundaries(defaultBoundarySettings(), usage(600, 600));
    assert.equal(s.status, 'open');
    assert.equal(s.desaturation, 0);
  });

  test('wind-down begins at three quarters and ramps to full', () => {
    const settings = { ...defaultBoundarySettings(), sessionBudgetMinutes: 20, windDown: true };
    assert.equal(evaluateBoundaries(settings, usage(14)).status, 'open');
    const early = evaluateBoundaries(settings, usage(15));
    assert.equal(early.status, 'winding-down');
    assert.equal(early.desaturation, 0);
    const late = evaluateBoundaries(settings, usage(19));
    assert.ok(late.desaturation > 0.7 && late.desaturation < 1, `got ${late.desaturation}`);
    assert.equal(evaluateBoundaries(settings, usage(20)).status, 'session-over');
  });

  test('wind-down colour only drains when the reader asked for it', () => {
    const settings = { ...defaultBoundarySettings(), sessionBudgetMinutes: 20, windDown: false };
    assert.equal(evaluateBoundaries(settings, usage(25)).desaturation, 0);
  });

  test('the tighter of the two budgets decides, so the counters agree', () => {
    const settings = {
      ...defaultBoundarySettings(),
      sessionBudgetMinutes: 60,
      dailyBudgetMinutes: 30,
    };
    const s = evaluateBoundaries(settings, usage(10, 29));
    assert.equal(s.status, 'winding-down');
    assert.equal(s.remainingMs, 1 * MIN, 'reports the day budget, not the session one');
    assert.equal(evaluateBoundaries(settings, usage(10, 31)).status, 'day-over');
  });

  test('quiet hours win over an unspent budget', () => {
    const settings = {
      ...defaultBoundarySettings(),
      sessionBudgetMinutes: 60,
      quietHours: { startMinute: 0, endMinute: 6 * 60 },
    };
    assert.equal(evaluateBoundaries(settings, usage(1, 1, 2 * 60)).status, 'quiet');
  });

  test('messages state a fact and never scold', () => {
    const settings = { ...defaultBoundarySettings(), sessionBudgetMinutes: 30 };
    const over = evaluateBoundaries(settings, usage(31));
    assert.equal(over.message, "That's 30 minutes. Good place to stop.");
    assert.doesNotMatch(over.message!, /should|too much|wasted|addict/i);
  });
});

describe('catch-up', () => {
  const items = [
    { id: 'new', timestampMs: 300 },
    { id: 'mid', timestampMs: 200 },
    { id: 'old', timestampMs: 100 },
  ];

  test('off by default and a pass-through', () => {
    const r = applyCatchUp(items, 150, defaultBoundarySettings());
    assert.equal(r.items.length, 3);
    assert.equal(r.hasMore, false);
  });

  test('truncates at the last visit and reports that it did', () => {
    const r = applyCatchUp(items, 150, { ...defaultBoundarySettings(), catchUp: true });
    assert.deepEqual(r.items.map((i) => i.id), ['new', 'mid']);
    assert.equal(r.hasMore, true, 'the reader chose to stop; there is more');
    assert.equal(r.caughtUp, false);
  });

  test('distinguishes "caught up" from "you chose to stop"', () => {
    const r = applyCatchUp(items, 999, { ...defaultBoundarySettings(), catchUp: true });
    assert.deepEqual(r.items, []);
    assert.equal(r.caughtUp, true);
  });

  test('a first-ever visit shows everything rather than nothing', () => {
    const r = applyCatchUp(items, undefined, { ...defaultBoundarySettings(), catchUp: true });
    assert.equal(r.items.length, 3);
  });
});
