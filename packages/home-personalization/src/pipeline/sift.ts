/**
 * Filtering, with receipts.
 *
 * Every removal produces a `DropReceipt`. That is the whole design: a filter
 * you cannot audit is indistinguishable from a bug, and a reader who suspects
 * their client is quietly eating posts will stop trusting the filters they set
 * themselves. "14 casts hidden — see why" turns a black box into a ledger.
 */

import { reasonGroup } from '../reasons/index';
import type { DropReceipt, FeedItemView, PipelineContext, RankedQuality } from './types';
import { RANKED_QUALITIES } from './types';
import type { SiftRules } from '../feedspec/types';
import { compileKeywordRules, firstMatch, isExpired } from './match';

/**
 * `unranked` is deliberately absent, so it never fails a floor. A quality
 * filter that silently hides every account the server has not scored yet would
 * mostly hide new accounts — an invisible harm the reader did not ask for and
 * could not diagnose.
 */
const QUALITY_RANK: Partial<Record<string, number>> = Object.fromEntries(
  RANKED_QUALITIES.map((q, i) => [q, i]),
);

function belowQualityFloor(quality: string, floor: RankedQuality): boolean {
  const rank = QUALITY_RANK[quality];
  if (rank === undefined) return false; // unranked or unknown: not a judgement
  return rank < QUALITY_RANK[floor]!;
}

export type SiftResult = {
  kept: FeedItemView[];
  receipts: DropReceipt[];
};

export function sift(
  items: FeedItemView[],
  rules: SiftRules,
  ctx: PipelineContext,
): SiftResult {
  const compiled = compileKeywordRules(rules.keywords, ctx.now);
  const mutedReasons = new Set(rules.mutedReasons);
  const mutedGroups = new Set<string>(rules.mutedGroups);
  const mutedChannels = new Set(rules.channels);
  const mutedEmbeds = new Set(rules.mutedEmbedKinds);
  const mutedAuthors = new Map<number, string | undefined>();
  for (const a of rules.authors) {
    if (isExpired(a, ctx.now)) continue;
    mutedAuthors.set(a.fid, a.note);
  }

  const kept: FeedItemView[] = [];
  const receipts: DropReceipt[] = [];

  const drop = (
    item: FeedItemView,
    cause: DropReceipt['cause'],
    detail: string,
    rule?: string,
  ) => {
    const receipt: DropReceipt = { itemId: item.id, authorFid: item.authorFid, cause, detail };
    if (rule !== undefined) receipt.rule = rule;
    receipts.push(receipt);
  };

  for (const item of items) {
    if (mutedAuthors.has(item.authorFid)) {
      drop(item, 'muted-author', `You muted fid ${item.authorFid}.`, String(item.authorFid));
      continue;
    }

    if (item.reason && mutedReasons.has(item.reason as never)) {
      drop(item, 'muted-reason', `You turned off "${item.reason}".`, item.reason);
      continue;
    }

    const group = item.reason ? reasonGroup(item.reason) : undefined;
    if (group && mutedGroups.has(group)) {
      drop(item, 'muted-group', `You turned off the "${group}" category.`, group);
      continue;
    }

    if (item.channelKey && mutedChannels.has(item.channelKey)) {
      drop(item, 'muted-channel', `You muted /${item.channelKey}.`, item.channelKey);
      continue;
    }

    if (rules.hideReplies && item.isReply) {
      drop(item, 'hidden-reply', 'Replies are hidden in this feed.');
      continue;
    }

    if (rules.hideRecasts && item.isRecast) {
      drop(item, 'hidden-recast', 'Recasts are hidden in this feed.');
      continue;
    }

    if (rules.hideTextless && item.text.trim() === '') {
      drop(item, 'hidden-textless', 'Casts with no text are hidden in this feed.');
      continue;
    }

    if (mutedEmbeds.size > 0) {
      const hit = item.embedKinds.find((k) => mutedEmbeds.has(k));
      if (hit) {
        drop(item, 'muted-embed', `You hid ${hit} embeds.`, hit);
        continue;
      }
    }

    if (rules.minAuthorQuality && item.authorQuality) {
      if (belowQualityFloor(item.authorQuality, rules.minAuthorQuality)) {
        drop(
          item,
          'author-quality',
          `Author is rated ${item.authorQuality}; this feed asks for ${rules.minAuthorQuality} or better.`,
          rules.minAuthorQuality,
        );
        continue;
      }
    }

    if (rules.minScore !== undefined && item.score !== undefined && item.score < rules.minScore) {
      drop(
        item,
        'min-score',
        `Scored ${item.score.toFixed(2)}, below your cutoff of ${rules.minScore}.`,
        String(rules.minScore),
      );
      continue;
    }

    const keywordHit = firstMatch(compiled, item.text);
    if (keywordHit) {
      drop(
        item,
        'muted-keyword',
        `Matched your muted ${keywordHit.rule.mode === 'regex' ? 'pattern' : 'word'} "${keywordHit.rule.pattern}".`,
        keywordHit.rule.pattern,
      );
      continue;
    }

    kept.push(item);
  }

  return { kept, receipts };
}

/**
 * Rules whose expiry has passed. Surfaced as "3 mutes ended this week — want
 * them back?" rather than silently reactivating content the reader has
 * forgotten they ever hid.
 */
export function expiredRules(rules: SiftRules, now: number) {
  return {
    keywords: rules.keywords.filter((k) => isExpired(k, now)),
    authors: rules.authors.filter((a) => isExpired(a, now)),
  };
}
