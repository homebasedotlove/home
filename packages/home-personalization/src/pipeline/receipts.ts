/**
 * Grouping receipts for the ledger UI.
 *
 * The feed produces one receipt per removed cast. The reader wants one row per
 * *rule* — "election: 8 hidden [Unmute]" — because the rule is what they can
 * act on. This turns the flat log into that view without the UI having to know
 * how causes map onto rules.
 */

import type { DropReceipt } from './types';

export type ReceiptGroup = {
  /** Stable key: cause plus the rule that fired. Safe as a React key. */
  key: string;
  cause: DropReceipt['cause'];
  /** The rule value — a keyword, an fid, a channel key, a reason type. */
  rule?: string;
  /** Sentence for the row, taken from the first receipt in the group. */
  detail: string;
  count: number;
  itemIds: string[];
};

/** Human label for the "undo" button, so the UI does not re-derive it. */
export const UNDO_LABEL: Record<DropReceipt['cause'], string> = {
  'muted-reason': 'Turn back on',
  'muted-group': 'Turn back on',
  'muted-keyword': 'Unmute',
  'muted-author': 'Unmute',
  'muted-channel': 'Unmute',
  'muted-embed': 'Show these again',
  'hidden-reply': 'Show replies',
  'hidden-recast': 'Show recasts',
  'hidden-textless': 'Show these again',
  'author-quality': 'Lower the bar',
  'min-score': 'Lower the cutoff',
};

export function groupReceipts(receipts: DropReceipt[]): ReceiptGroup[] {
  const groups = new Map<string, ReceiptGroup>();
  for (const r of receipts) {
    const key = r.rule === undefined ? r.cause : `${r.cause}:${r.rule}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      existing.itemIds.push(r.itemId);
      continue;
    }
    const group: ReceiptGroup = {
      key,
      cause: r.cause,
      detail: r.detail,
      count: 1,
      itemIds: [r.itemId],
    };
    if (r.rule !== undefined) group.rule = r.rule;
    groups.set(key, group);
  }
  // Most-hidden first: the rule doing the most work is the one worth reviewing,
  // and it is usually the one the reader has forgotten they set.
  return [...groups.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** "14 casts hidden on this page." — or nothing at all when none were. */
export function summarizeReceipts(receipts: DropReceipt[]): string | undefined {
  if (receipts.length === 0) return undefined;
  const n = receipts.length;
  return `${n} cast${n === 1 ? '' : 's'} hidden on this page.`;
}
