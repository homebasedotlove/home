/**
 * Session accounting.
 *
 * Turning "the app is open" into the two numbers the budgets need. Kept as a
 * pure reducer over explicit events so it is testable without a clock, a
 * simulator, or an AppState listener — the platform layer just forwards
 * foreground and background transitions.
 */

export type SessionState = {
  /** When the current foreground stretch began, or undefined if backgrounded. */
  activeSince?: number;
  /** When the app last went to background. Decides if a return is a new sitting. */
  lastActiveAt?: number;
  /** Completed foreground time in the current sitting. */
  sessionMs: number;
  /** Completed foreground time today. */
  dayMs: number;
  /** Local calendar day that `dayMs` belongs to, as YYYYMMDD. */
  dayKey: number;
  /** Newest cast timestamp the reader has actually seen. Drives catch-up. */
  lastSeenMs?: number;
};

/**
 * A gap this long between foreground stretches starts a new sitting. Thirty
 * minutes matches how people describe "a session": putting the phone down to
 * make coffee is the same sitting, picking it up after lunch is not.
 */
export const NEW_SESSION_AFTER_MS = 30 * 60_000;

/**
 * Local calendar day as YYYYMMDD.
 *
 * Read off the local date rather than computed from epoch arithmetic, because
 * the arithmetic version has to get the sign of `getTimezoneOffset` right and
 * still breaks across DST. Only equality is ever tested, so a readable key
 * beats a continuous one.
 */
export function localDayKey(now: number, date = new Date(now)): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

export function newSession(now: number, date = new Date(now)): SessionState {
  return { sessionMs: 0, dayMs: 0, dayKey: localDayKey(now, date) };
}

/** Zero the daily total when the local day has turned over. */
function rollDay(state: SessionState, now: number, date = new Date(now)): SessionState {
  const key = localDayKey(now, date);
  return key === state.dayKey ? state : { ...state, dayMs: 0, dayKey: key };
}

export function enterForeground(
  state: SessionState,
  now: number,
  date = new Date(now),
): SessionState {
  // Already foregrounded: a duplicate event must not restart the stretch, or
  // the elapsed time since activeSince would be silently discarded.
  if (state.activeSince !== undefined) return rollDay(state, now, date);

  const rolled = rollDay(state, now, date);
  const awayMs = rolled.lastActiveAt === undefined ? 0 : now - rolled.lastActiveAt;
  const startsNewSitting = rolled.lastActiveAt !== undefined && awayMs >= NEW_SESSION_AFTER_MS;
  return {
    ...rolled,
    sessionMs: startsNewSitting ? 0 : rolled.sessionMs,
    activeSince: now,
  };
}

export function enterBackground(
  state: SessionState,
  now: number,
  date = new Date(now),
): SessionState {
  if (state.activeSince === undefined) return rollDay(state, now, date);
  const elapsed = Math.max(0, now - state.activeSince);
  const rolled = rollDay(state, now, date);
  const next: SessionState = {
    ...rolled,
    sessionMs: rolled.sessionMs + elapsed,
    dayMs: rolled.dayMs + elapsed,
    lastActiveAt: now,
  };
  delete next.activeSince;
  return next;
}

/**
 * Current totals including the in-progress stretch, without mutating state.
 * This is what feeds `evaluateBoundaries` on each tick.
 */
export function usageNow(state: SessionState, now: number, date = new Date(now)) {
  const rolled = rollDay(state, now, date);
  const live = rolled.activeSince === undefined ? 0 : Math.max(0, now - rolled.activeSince);
  return {
    sessionMs: rolled.sessionMs + live,
    dayMs: rolled.dayMs + live,
    nowMinute: date.getHours() * 60 + date.getMinutes(),
  };
}

/** Record the newest cast the reader has seen, for catch-up mode. */
export function markSeen(state: SessionState, timestampMs: number): SessionState {
  if (state.lastSeenMs !== undefined && state.lastSeenMs >= timestampMs) return state;
  return { ...state, lastSeenMs: timestampMs };
}
