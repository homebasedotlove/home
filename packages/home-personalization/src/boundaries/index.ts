/**
 * Boundaries.
 *
 * Every control elsewhere in this package answers "what do you want to see".
 * This one answers "how much, and when" — and it is the axis no ad-funded
 * client will ever ship, because a session that ends on purpose is revenue
 * left on the table. An independent client has no such conflict, so this is
 * the clearest place to be plainly better.
 *
 * The rules are deliberately soft. A client that locks its reader out breeds
 * workarounds; one that tells the truth about time spent and then gets out of
 * the way gets used. Nothing here blocks anything — the app decides what to do
 * with the returned state, and "keep reading" is always available.
 */

export type QuietHours = {
  /** Minutes after local midnight, 0–1439. */
  startMinute: number;
  endMinute: number;
};

export type BoundarySettings = {
  /** Soft stop for one sitting. */
  sessionBudgetMinutes?: number;
  /** Soft stop for the day, across sittings. */
  dailyBudgetMinutes?: number;
  quietHours?: QuietHours;
  /**
   * A finite feed: show what arrived since the last visit, then end. The
   * single highest-leverage change available here — infinite scroll is not a
   * feature anyone asked for, it is the absence of a stopping cue.
   */
  catchUp: boolean;
  /**
   * Drain colour as the budget runs out. A gradient is a better signal than an
   * alert: it is noticeable without demanding a decision, and it cannot be
   * dismissed into meaninglessness the way a modal can.
   */
  windDown: boolean;
};

export type BoundaryUsage = {
  /** Milliseconds in the current sitting. */
  sessionMs: number;
  /** Milliseconds today, including the current sitting. */
  dayMs: number;
  /** Minutes after local midnight, right now. */
  nowMinute: number;
};

export type BoundaryStatus = 'open' | 'winding-down' | 'session-over' | 'day-over' | 'quiet';

export type BoundaryState = {
  status: BoundaryStatus;
  /** 0 = full colour, 1 = fully drained. Only non-zero when windDown is on. */
  desaturation: number;
  /** Milliseconds left in the tighter of the two budgets, if any. */
  remainingMs?: number;
  /** One plain sentence for the reader. Never a scold. */
  message?: string;
};

export function defaultBoundarySettings(): BoundarySettings {
  return { catchUp: false, windDown: false };
}

const MIN = 60_000;

/** Handles windows that wrap past midnight, which most of them do. */
export function isQuietNow(quiet: QuietHours | undefined, nowMinute: number): boolean {
  if (!quiet) return false;
  const { startMinute: s, endMinute: e } = quiet;
  if (s === e) return false;
  return s < e ? nowMinute >= s && nowMinute < e : nowMinute >= s || nowMinute < e;
}

/** Minutes after local midnight for a Date, in the runtime's local zone. */
export function localMinuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Fraction of the budget spent, past which wind-down begins. */
const WINDDOWN_AT = 0.75;

export function evaluateBoundaries(
  settings: BoundarySettings,
  usage: BoundaryUsage,
): BoundaryState {
  if (isQuietNow(settings.quietHours, usage.nowMinute)) {
    return {
      status: 'quiet',
      desaturation: settings.windDown ? 1 : 0,
      message: 'Quiet hours. The feed is here when you want it.',
    };
  }

  const budgets: { kind: 'session' | 'day'; limitMs: number; usedMs: number }[] = [];
  if (settings.sessionBudgetMinutes) {
    budgets.push({
      kind: 'session',
      limitMs: settings.sessionBudgetMinutes * MIN,
      usedMs: usage.sessionMs,
    });
  }
  if (settings.dailyBudgetMinutes) {
    budgets.push({ kind: 'day', limitMs: settings.dailyBudgetMinutes * MIN, usedMs: usage.dayMs });
  }
  if (budgets.length === 0) return { status: 'open', desaturation: 0 };

  // The binding constraint is whichever budget has least left, so the reader
  // is never told they have twenty minutes by one counter and none by another.
  let tightest = budgets[0]!;
  for (const b of budgets) {
    if (b.limitMs - b.usedMs < tightest.limitMs - tightest.usedMs) tightest = b;
  }

  const remainingMs = Math.max(0, tightest.limitMs - tightest.usedMs);
  const spent = tightest.usedMs / tightest.limitMs;

  if (spent >= 1) {
    const minutes = Math.round(tightest.limitMs / MIN);
    return {
      status: tightest.kind === 'session' ? 'session-over' : 'day-over',
      desaturation: settings.windDown ? 1 : 0,
      remainingMs: 0,
      message:
        tightest.kind === 'session'
          ? `That's ${minutes} minutes. Good place to stop.`
          : `That's your ${minutes} minutes for today.`,
    };
  }

  if (spent >= WINDDOWN_AT) {
    const progress = (spent - WINDDOWN_AT) / (1 - WINDDOWN_AT);
    return {
      status: 'winding-down',
      desaturation: settings.windDown ? Math.min(1, progress) : 0,
      remainingMs,
      message: `${Math.ceil(remainingMs / MIN)} min left.`,
    };
  }

  return { status: 'open', desaturation: 0, remainingMs };
}

/**
 * Catch-up mode: everything since the last visit, oldest boundary first, and
 * then the feed ends.
 *
 * `hasMore` reports whether the cutoff actually truncated anything, so the UI
 * can distinguish "you are caught up" from "there is more, you chose to stop"
 * — two very different sentences to show someone.
 */
export function applyCatchUp<T extends { timestampMs: number }>(
  items: T[],
  lastSeenMs: number | undefined,
  settings: BoundarySettings,
): { items: T[]; hasMore: boolean; caughtUp: boolean } {
  if (!settings.catchUp || lastSeenMs === undefined) {
    return { items, hasMore: false, caughtUp: false };
  }
  const fresh = items.filter((i) => i.timestampMs > lastSeenMs);
  return {
    items: fresh,
    hasMore: fresh.length < items.length,
    caughtUp: fresh.length === 0,
  };
}

export * from './session';
