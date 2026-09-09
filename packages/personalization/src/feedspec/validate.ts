/**
 * Validation for FeedSpecs.
 *
 * A spec that arrives over a share link is untrusted input from a stranger.
 * It is JSON, so it cannot execute anything — but it can carry a regular
 * expression, and a regex is the one field in this format that can hang a
 * phone. Everything here is written on the assumption that the author of the
 * spec is not the reader importing it.
 */

import { REASON_GROUPS, REASON_TYPES } from '../reasons/index.ts';
import type {
  AuthorRule,
  FeedSpec,
  KeywordRule,
  SiftRules,
  SortSpec,
  Source,
} from './types.ts';
import {
  DENSITIES,
  FEED_SPEC_VERSION,
  MATCH_MODES,
  MEDIA_POLICIES,
  SORT_MODES,
} from './types.ts';
import { defaultSort, emptySift } from './defaults.ts';

export type ValidationIssue = { path: string; message: string };

export type ValidationResult =
  | { ok: true; spec: FeedSpec; warnings: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] };

export const LIMITS = {
  nameChars: 40,
  descriptionChars: 280,
  keywordChars: 128,
  regexChars: 64,
  keywordRules: 200,
  authorRules: 2000,
  channelRules: 500,
  blendParts: 6,
  searchChars: 200,
  /** Ceiling on a reason weight. Above this the other categories vanish. */
  maxWeight: 4,
} as const;

/**
 * Conservative structural check for catastrophic backtracking.
 *
 * There is no way to time-bound `RegExp.exec` on the JS main thread, so the
 * defence has to happen before compilation. The rule is simple and blunt: a
 * group that is quantified must not itself contain a quantifier or an
 * alternation. That covers the classic blowups — `(a+)+`, `(a|aa)*`,
 * `(x*){10,}` — without trying to decide whether two alternatives actually
 * overlap, which is not a judgement worth making in a validator.
 *
 * It is deliberately over-eager. Rejecting `(a|b)*`, which is in fact safe,
 * costs its author one edit; accepting one bad pattern costs every reader who
 * imports the spec a frozen feed.
 */
export function isProbablySafeRegex(source: string): boolean {
  if (source.length > LIMITS.regexChars) return false;
  // Back-references can turn a linear match into an exponential one.
  if (/\\[1-9]/.test(source)) return false;
  try {
    new RegExp(source);
  } catch {
    return false;
  }

  type Frame = { hasQuantifier: boolean; hasAlternation: boolean };
  const stack: Frame[] = [];
  let inClass = false;
  // `.*.*` and friends: an unbounded quantifier, one atom, another unbounded
  // quantifier. Tracking the atom count is what lets the intervening character
  // be seen without losing the memory of the first quantifier.
  let sawUnbounded = false;
  let atomsSinceUnbounded = 0;
  const atom = () => void atomsSinceUnbounded++;

  const note = (fn: (f: Frame) => void) => {
    for (const f of stack) fn(f);
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;

    if (ch === '\\') {
      i++; // skip the escaped character entirely
      atom();
      continue;
    }
    if (inClass) {
      if (ch === ']') inClass = false;
      continue;
    }
    if (ch === '[') {
      inClass = true;
      atom();
      continue;
    }

    if (ch === '(') {
      stack.push({ hasQuantifier: false, hasAlternation: false });
      atom();
      continue;
    }

    if (ch === ')') {
      const frame = stack.pop();
      const next = source[i + 1];
      const quantified = next === '*' || next === '+' || next === '{';
      if (frame && quantified && (frame.hasQuantifier || frame.hasAlternation)) return false;
      if (quantified) note((f) => void (f.hasQuantifier = true));
      atom();
      continue;
    }

    if (ch === '|') {
      note((f) => void (f.hasAlternation = true));
      atom();
      continue;
    }

    if (ch === '*' || ch === '+' || ch === '{') {
      note((f) => void (f.hasQuantifier = true));
      if (ch !== '{') {
        if (sawUnbounded && atomsSinceUnbounded <= 1) return false;
        sawUnbounded = true;
        atomsSinceUnbounded = 0;
      }
      continue;
    }

    atom();
  }

  return true;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function validateSource(
  source: unknown,
  path: string,
  issues: ValidationIssue[],
  depth = 0,
): Source | undefined {
  if (typeof source !== 'object' || source === null) {
    issues.push({ path, message: 'source must be an object' });
    return undefined;
  }
  const s = source as Record<string, unknown>;
  switch (s.kind) {
    case 'home':
      return { kind: 'home' };
    case 'following':
      return { kind: 'following' };
    case 'channel':
      if (typeof s.channelKey !== 'string' || !s.channelKey) {
        issues.push({ path: `${path}.channelKey`, message: 'required string' });
        return undefined;
      }
      return { kind: 'channel', channelKey: s.channelKey.slice(0, 64) };
    case 'list':
      if (typeof s.listId !== 'string' || !s.listId) {
        issues.push({ path: `${path}.listId`, message: 'required string' });
        return undefined;
      }
      return { kind: 'list', listId: s.listId.slice(0, 64) };
    case 'search': {
      if (typeof s.query !== 'string' || !s.query.trim()) {
        issues.push({ path: `${path}.query`, message: 'required non-empty string' });
        return undefined;
      }
      return { kind: 'search', query: s.query.slice(0, LIMITS.searchChars) };
    }
    case 'blend': {
      if (depth > 0) {
        issues.push({ path, message: 'blends cannot contain blends' });
        return undefined;
      }
      if (!Array.isArray(s.parts) || s.parts.length === 0) {
        issues.push({ path: `${path}.parts`, message: 'required non-empty array' });
        return undefined;
      }
      if (s.parts.length > LIMITS.blendParts) {
        issues.push({
          path: `${path}.parts`,
          message: `at most ${LIMITS.blendParts} parts`,
        });
        return undefined;
      }
      const parts: { source: Exclude<Source, { kind: 'blend' }>; weight: number }[] = [];
      s.parts.forEach((raw, i) => {
        const p = raw as Record<string, unknown>;
        const inner = validateSource(p.source, `${path}.parts[${i}].source`, issues, depth + 1);
        if (!inner || inner.kind === 'blend') return;
        const weight = isFiniteNumber(p.weight) ? clamp(p.weight, 0, 100) : 1;
        parts.push({ source: inner, weight });
      });
      if (parts.length === 0) return undefined;
      if (parts.every((p) => p.weight === 0)) {
        issues.push({ path: `${path}.parts`, message: 'at least one part needs a non-zero weight' });
        return undefined;
      }
      return { kind: 'blend', parts };
    }
    default:
      issues.push({ path: `${path}.kind`, message: `unknown source kind: ${String(s.kind)}` });
      return undefined;
  }
}

function validateKeywords(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
  warnings: ValidationIssue[],
): KeywordRule[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push({ path, message: 'must be an array' });
    return [];
  }
  const out: KeywordRule[] = [];
  for (const [i, item] of raw.slice(0, LIMITS.keywordRules).entries()) {
    const k = item as Record<string, unknown>;
    if (typeof k.pattern !== 'string' || !k.pattern) {
      warnings.push({ path: `${path}[${i}].pattern`, message: 'skipped: not a string' });
      continue;
    }
    const pattern = k.pattern.slice(0, LIMITS.keywordChars);
    const mode = (MATCH_MODES as readonly string[]).includes(k.mode as string)
      ? (k.mode as KeywordRule['mode'])
      : 'word';
    if (mode === 'regex' && !isProbablySafeRegex(pattern)) {
      warnings.push({
        path: `${path}[${i}]`,
        message: `skipped: "${pattern}" was rejected as an unsafe or invalid pattern`,
      });
      continue;
    }
    const rule: KeywordRule = { pattern, mode };
    if (k.caseSensitive === true) rule.caseSensitive = true;
    if (isFiniteNumber(k.expiresAt)) rule.expiresAt = k.expiresAt;
    if (typeof k.note === 'string') rule.note = k.note.slice(0, 140);
    out.push(rule);
  }
  if (Array.isArray(raw) && raw.length > LIMITS.keywordRules) {
    warnings.push({ path, message: `truncated to ${LIMITS.keywordRules} rules` });
  }
  return out;
}

function validateAuthors(raw: unknown, path: string, warnings: ValidationIssue[]): AuthorRule[] {
  if (!Array.isArray(raw)) return [];
  const out: AuthorRule[] = [];
  for (const item of raw.slice(0, LIMITS.authorRules)) {
    const a = item as Record<string, unknown>;
    if (!isFiniteNumber(a.fid) || a.fid <= 0) continue;
    const rule: AuthorRule = { fid: Math.floor(a.fid) };
    if (isFiniteNumber(a.expiresAt)) rule.expiresAt = a.expiresAt;
    if (typeof a.note === 'string') rule.note = a.note.slice(0, 140);
    out.push(rule);
  }
  if (raw.length > LIMITS.authorRules) {
    warnings.push({ path, message: `truncated to ${LIMITS.authorRules} rules` });
  }
  return out;
}

function validateSift(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
  warnings: ValidationIssue[],
): SiftRules {
  const base = emptySift();
  if (raw === undefined) return base;
  if (typeof raw !== 'object' || raw === null) {
    issues.push({ path, message: 'must be an object' });
    return base;
  }
  const s = raw as Record<string, unknown>;
  const strArray = (v: unknown, allowed?: readonly string[], cap: number = LIMITS.channelRules) =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === 'string')
          .filter((x) => !allowed || allowed.includes(x))
          .slice(0, cap)
      : [];

  return {
    mutedReasons: strArray(s.mutedReasons, REASON_TYPES) as SiftRules['mutedReasons'],
    mutedGroups: strArray(s.mutedGroups, REASON_GROUPS) as SiftRules['mutedGroups'],
    keywords: validateKeywords(s.keywords, `${path}.keywords`, issues, warnings),
    authors: validateAuthors(s.authors, `${path}.authors`, warnings),
    channels: strArray(s.channels),
    hideReplies: s.hideReplies === true,
    hideRecasts: s.hideRecasts === true,
    hideTextless: s.hideTextless === true,
    mutedEmbedKinds: strArray(s.mutedEmbedKinds, undefined, 32),
    ...(s.minAuthorQuality === 'low' || s.minAuthorQuality === 'medium' || s.minAuthorQuality === 'high'
      ? { minAuthorQuality: s.minAuthorQuality }
      : {}),
    ...(isFiniteNumber(s.minScore) ? { minScore: s.minScore } : {}),
  };
}

function validateSort(raw: unknown, warnings: ValidationIssue[]): SortSpec {
  const base = defaultSort();
  if (typeof raw !== 'object' || raw === null) return base;
  const s = raw as Record<string, unknown>;
  const mode = (SORT_MODES as readonly string[]).includes(s.mode as string)
    ? (s.mode as SortSpec['mode'])
    : base.mode;

  const weights: SortSpec['weights'] = {};
  if (typeof s.weights === 'object' && s.weights !== null) {
    for (const [k, v] of Object.entries(s.weights as Record<string, unknown>)) {
      if (!(REASON_GROUPS as readonly string[]).includes(k)) continue;
      if (!isFiniteNumber(v)) continue;
      const clamped = clamp(v, 0, LIMITS.maxWeight);
      if (clamped !== v) {
        warnings.push({ path: `sort.weights.${k}`, message: `clamped to ${clamped}` });
      }
      weights[k as keyof SortSpec['weights']] = clamped;
    }
  }

  const rawDiversity =
    typeof s.diversity === 'object' && s.diversity !== null
      ? (s.diversity as Record<string, unknown>)
      : {};
  const diversity: SortSpec['diversity'] = {};
  if (isFiniteNumber(rawDiversity.maxPerAuthor)) {
    diversity.maxPerAuthor = clamp(Math.floor(rawDiversity.maxPerAuthor), 1, 50);
  }
  if (isFiniteNumber(rawDiversity.maxPerChannel)) {
    diversity.maxPerChannel = clamp(Math.floor(rawDiversity.maxPerChannel), 1, 50);
  }
  if (isFiniteNumber(rawDiversity.window)) {
    diversity.window = clamp(Math.floor(rawDiversity.window), 5, 200);
  }

  return {
    mode,
    weights,
    recencyHalfLifeHours: isFiniteNumber(s.recencyHalfLifeHours)
      ? clamp(s.recencyHalfLifeHours, 0.25, 336)
      : base.recencyHalfLifeHours,
    affinityBoost: isFiniteNumber(s.affinityBoost) ? clamp(s.affinityBoost, 0, 1) : base.affinityBoost,
    diversity,
  };
}

export function validateFeedSpec(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (typeof input !== 'object' || input === null) {
    return { ok: false, issues: [{ path: '', message: 'spec must be an object' }] };
  }
  const raw = input as Record<string, unknown>;

  if (raw.version !== FEED_SPEC_VERSION) {
    return {
      ok: false,
      issues: [
        {
          path: 'version',
          message: `unsupported spec version ${String(raw.version)}; this build reads version ${FEED_SPEC_VERSION}`,
        },
      ],
    };
  }

  const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : '';
  if (!id) issues.push({ path: 'id', message: 'required string' });

  const name =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim().slice(0, LIMITS.nameChars)
      : '';
  if (!name) issues.push({ path: 'name', message: 'required non-empty string' });

  const source = validateSource(raw.source, 'source', issues);
  const sift = validateSift(raw.sift, 'sift', issues, warnings);
  const sort = validateSort(raw.sort, warnings);

  if (issues.length > 0 || !source) return { ok: false, issues };

  const spec: FeedSpec = {
    version: FEED_SPEC_VERSION,
    id,
    name,
    source,
    sift,
    sort,
  };

  // An icon is rendered as text, so cap it at a couple of code points rather
  // than accepting an arbitrary string that would blow out the tab bar.
  if (typeof raw.icon === 'string') {
    const glyphs = [...raw.icon.trim()];
    if (glyphs.length > 0) spec.icon = glyphs.slice(0, 2).join('');
  }
  if (typeof raw.description === 'string' && raw.description.trim()) {
    spec.description = raw.description.trim().slice(0, LIMITS.descriptionChars);
  }
  if (typeof raw.skin === 'object' && raw.skin !== null) {
    const sk = raw.skin as Record<string, unknown>;
    const skin: NonNullable<FeedSpec['skin']> = {};
    if ((DENSITIES as readonly string[]).includes(sk.density as string)) {
      skin.density = sk.density as NonNullable<FeedSpec['skin']>['density'];
    }
    if ((MEDIA_POLICIES as readonly string[]).includes(sk.media as string)) {
      skin.media = sk.media as NonNullable<FeedSpec['skin']>['media'];
    }
    if (sk.hideCounts === true) skin.hideCounts = true;
    if (sk.showWhyChips === true) skin.showWhyChips = true;
    if (sk.absoluteTimestamps === true) skin.absoluteTimestamps = true;
    if (typeof sk.themeId === 'string' && sk.themeId) skin.themeId = sk.themeId.slice(0, 64);
    if (Object.keys(skin).length > 0) spec.skin = skin;
  }

  return { ok: true, spec, warnings };
}
