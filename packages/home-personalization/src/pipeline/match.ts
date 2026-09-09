/**
 * Keyword matching.
 *
 * Word-boundary matching is done by hand rather than with `\b` or lookbehind.
 * `\b` is ASCII-only, so it silently fails on the Japanese, Cyrillic, and
 * emoji-adjacent text people actually post; lookbehind is not reliably
 * available on the JS engines this has to run on. Scanning occurrences and
 * inspecting the neighbouring code points is a few more lines and is correct
 * everywhere.
 */

import type { KeywordRule } from '../feedspec/types';

/** Letters, numbers, underscore — the characters that continue a word. */
const WORD_CHAR = /[\p{L}\p{N}_]/u;

function isWordChar(str: string, index: number): boolean {
  if (index < 0 || index >= str.length) return false;
  // Read a full code point so astral characters are not split into surrogates.
  const cp = str.codePointAt(index);
  if (cp === undefined) return false;
  return WORD_CHAR.test(String.fromCodePoint(cp));
}

function matchesWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    const beforeIsWord = at > 0 && isWordChar(haystack, at - 1);
    const afterIndex = at + needle.length;
    const afterIsWord = isWordChar(haystack, afterIndex);
    if (!beforeIsWord && !afterIsWord) return true;
    from = at + 1;
  }
}

/**
 * A rule compiled once per pipeline run. Building a RegExp per item per rule
 * is the difference between a smooth feed and a dropped frame on every scroll.
 */
export type CompiledRule = {
  rule: KeywordRule;
  test: (text: string) => boolean;
};

export function compileKeywordRule(
  rule: KeywordRule,
  now: number,
): CompiledRule | undefined {
  if (rule.expiresAt !== undefined && rule.expiresAt <= now) return undefined;
  const pattern = rule.caseSensitive
    ? rule.pattern
    : rule.pattern.toLowerCase();
  const prep = (text: string) =>
    rule.caseSensitive ? text : text.toLowerCase();

  if (rule.mode === 'regex') {
    let re: RegExp;
    try {
      re = new RegExp(rule.pattern, rule.caseSensitive ? 'u' : 'iu');
    } catch {
      // Validation should have caught this; if a rule reached the pipeline
      // uncompilable, drop the rule rather than the reader's whole feed.
      return undefined;
    }
    return { rule, test: (text) => re.test(text) };
  }

  if (rule.mode === 'word') {
    return { rule, test: (text) => matchesWord(prep(text), pattern) };
  }

  return { rule, test: (text) => prep(text).includes(pattern) };
}

export function compileKeywordRules(
  rules: KeywordRule[],
  now: number,
): CompiledRule[] {
  const out: CompiledRule[] = [];
  for (const rule of rules) {
    const compiled = compileKeywordRule(rule, now);
    if (compiled) out.push(compiled);
  }
  return out;
}

/** First rule that matches, or undefined. Used to name the rule in a receipt. */
export function firstMatch(
  compiled: CompiledRule[],
  text: string,
): CompiledRule | undefined {
  for (const c of compiled) {
    if (c.test(text)) return c;
  }
  return undefined;
}

/** True once the rule's expiry has passed. Drives the "expired mutes" review UI. */
export function isExpired(rule: { expiresAt?: number }, now: number): boolean {
  return rule.expiresAt !== undefined && rule.expiresAt <= now;
}
