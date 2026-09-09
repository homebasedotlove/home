/**
 * Share links.
 *
 * A feed you built is worth more if you can hand it to someone. `encodeShare`
 * turns a spec into a URL-safe string; `decodeShare` turns it back and runs it
 * through the same validation an untrusted import gets.
 *
 * Base64 is implemented here rather than pulled from `Buffer`, `btoa`, or a
 * dependency: this package has to run unchanged on Hermes, in a browser, and
 * in Node, and those three disagree about which of those exist.
 */

import type { FeedSpec } from './types';
import { defaultSort, emptySift } from './defaults';
import type { ValidationResult } from './validate';
import { validateFeedSpec } from './validate';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Bytes(str: string): number[] {
  const out: number[] = [];
  for (const ch of str) {
    let cp = ch.codePointAt(0)!;
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(
        0xe0 | (cp >> 12),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return out;
}

function utf8String(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b0 = bytes[i]!;
    let cp: number;
    let len: number;
    if (b0 < 0x80) {
      cp = b0;
      len = 1;
    } else if ((b0 & 0xe0) === 0xc0) {
      cp = b0 & 0x1f;
      len = 2;
    } else if ((b0 & 0xf0) === 0xe0) {
      cp = b0 & 0x0f;
      len = 3;
    } else {
      cp = b0 & 0x07;
      len = 4;
    }
    if (i + len > bytes.length) throw new Error('truncated utf-8 sequence');
    for (let k = 1; k < len; k++) {
      const b = bytes[i + k]!;
      if ((b & 0xc0) !== 0x80)
        throw new Error('invalid utf-8 continuation byte');
      cp = (cp << 6) | (b & 0x3f);
    }
    out += String.fromCodePoint(cp);
    i += len;
  }
  return out;
}

/** base64url without padding. */
export function b64urlEncode(str: string): string {
  const bytes = utf8Bytes(str);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64[b2 & 0x3f];
  }
  return out;
}

export function b64urlDecode(str: string): string {
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of str) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error(`invalid base64url character: ${ch}`);
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  return utf8String(bytes);
}

/**
 * Drop every field that equals its default. Links stay short, and a spec that
 * only changes one thing reads as one line of JSON when someone inspects it —
 * which people do, and should be rewarded for.
 */
export function compactSpec(spec: FeedSpec): Record<string, unknown> {
  const sift = emptySift();
  const sort = defaultSort();
  const out: Record<string, unknown> = {
    version: spec.version,
    id: spec.id,
    name: spec.name,
    source: spec.source,
  };
  if (spec.icon) out.icon = spec.icon;
  if (spec.description) out.description = spec.description;

  const siftOut: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(spec.sift)) {
    const def = (sift as Record<string, unknown>)[k];
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'boolean' && v === def) continue;
    if (v === undefined) continue;
    siftOut[k] = v;
  }
  if (Object.keys(siftOut).length > 0) out.sift = siftOut;

  const sortOut: Record<string, unknown> = {};
  if (spec.sort.mode !== sort.mode) sortOut.mode = spec.sort.mode;
  if (Object.keys(spec.sort.weights).length > 0)
    sortOut.weights = spec.sort.weights;
  if (spec.sort.recencyHalfLifeHours !== sort.recencyHalfLifeHours) {
    sortOut.recencyHalfLifeHours = spec.sort.recencyHalfLifeHours;
  }
  if (spec.sort.affinityBoost !== sort.affinityBoost) {
    sortOut.affinityBoost = spec.sort.affinityBoost;
  }
  if (JSON.stringify(spec.sort.diversity) !== JSON.stringify(sort.diversity)) {
    sortOut.diversity = spec.sort.diversity;
  }
  if (Object.keys(sortOut).length > 0) out.sort = sortOut;

  if (spec.skin && Object.keys(spec.skin).length > 0) out.skin = spec.skin;
  return out;
}

export function encodeShare(spec: FeedSpec): string {
  return b64urlEncode(JSON.stringify(compactSpec(spec)));
}

export type DecodeResult =
  ValidationResult | { ok: false; issues: [{ path: string; message: string }] };

export function decodeShare(encoded: string): DecodeResult {
  let json: unknown;
  try {
    json = JSON.parse(b64urlDecode(encoded.trim()));
  } catch (e) {
    return {
      ok: false,
      issues: [
        {
          path: '',
          message: `not a readable feed link: ${(e as Error).message}`,
        },
      ],
    };
  }
  return validateFeedSpec(json);
}

/**
 * Deep-link form. Kept separate from `encodeShare` so the transport can change
 * without touching the encoding.
 */
export function shareUrl(
  spec: FeedSpec,
  origin = 'https://home.example',
): string {
  return `${origin.replace(/\/$/, '')}/f/${encodeShare(spec)}`;
}

export function parseShareUrl(url: string): DecodeResult {
  const m = /\/f\/([A-Za-z0-9\-_]+)/.exec(url);
  if (!m || !m[1]) {
    return {
      ok: false,
      issues: [{ path: '', message: 'no feed payload found in that link' }],
    };
  }
  return decodeShare(m[1]);
}
