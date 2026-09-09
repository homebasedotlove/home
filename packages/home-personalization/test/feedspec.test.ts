import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

import {
  makeFeedSpec,
  starterFeeds,
  emptySift,
  defaultSort,
} from '../src/feedspec/defaults';
import {
  validateFeedSpec,
  isProbablySafeRegex,
  LIMITS,
} from '../src/feedspec/validate';
import {
  b64urlDecode,
  b64urlEncode,
  compactSpec,
  decodeShare,
  encodeShare,
  parseShareUrl,
  shareUrl,
} from '../src/feedspec/serialize';

describe('base64url', () => {
  test('round-trips ascii, unicode, and emoji', () => {
    for (const s of [
      '',
      'a',
      'ab',
      'abc',
      'hello world',
      'ünïcødé',
      '日本語のテキスト',
      '🏠🌙 feed',
    ]) {
      assert.equal(
        b64urlDecode(b64urlEncode(s)),
        s,
        `failed on ${JSON.stringify(s)}`,
      );
    }
  });

  test('emits no padding and no url-unsafe characters', () => {
    const encoded = b64urlEncode('any carnal pleasure?');
    assert.equal(/^[A-Za-z0-9\-_]*$/.test(encoded), true, encoded);
  });

  test('rejects invalid input rather than returning mojibake', () => {
    assert.throws(() => b64urlDecode('!!!!'));
  });
});

describe('regex safety', () => {
  test('rejects the catastrophic shapes', () => {
    assert.equal(isProbablySafeRegex('(a+)+'), false);
    assert.equal(isProbablySafeRegex('(a|aa)*'), false);
    assert.equal(isProbablySafeRegex('(a*)*'), false);
    assert.equal(isProbablySafeRegex('((a)+)+'), false, 'nested groups');
    assert.equal(
      isProbablySafeRegex('(a|b)+'),
      false,
      'over-eager on purpose: quantified alternation',
    );
    assert.equal(isProbablySafeRegex('(x*){10,}'), false);
    assert.equal(isProbablySafeRegex('(a)\\1+'), false, 'back-references');
    assert.equal(isProbablySafeRegex('.*.*='), false);
    assert.equal(isProbablySafeRegex('['), false, 'uncompilable');
    assert.equal(
      isProbablySafeRegex('a'.repeat(LIMITS.regexChars + 1)),
      false,
      'over length',
    );
  });

  test('accepts ordinary patterns', () => {
    assert.equal(isProbablySafeRegex('^gm+$'), true);
    assert.equal(isProbablySafeRegex('\\$[A-Z]{2,6}\\b'), true);
    assert.equal(
      isProbablySafeRegex('(bull|bear) market'),
      true,
      'alternation without a quantifier',
    );
    assert.equal(isProbablySafeRegex('(?:gm|gn) everyone'), true);
    assert.equal(
      isProbablySafeRegex('(foo)?bar'),
      true,
      'a bounded ? is not a blowup',
    );
    assert.equal(
      isProbablySafeRegex('[*+]{2,3}'),
      true,
      'quantifier chars inside a class are literals',
    );
    assert.equal(
      isProbablySafeRegex('(a)*(b)*'),
      true,
      'sequential, not nested',
    );
  });
});

describe('validation', () => {
  test('accepts a well-formed spec', () => {
    const r = validateFeedSpec(starterFeeds()[2]);
    assert.equal(r.ok, true);
  });

  test('refuses an unknown version instead of guessing', () => {
    const r = validateFeedSpec({ ...starterFeeds()[0], version: 99 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.issues[0]!.message, /unsupported spec version/);
  });

  test('requires id, name and a known source kind', () => {
    const r = validateFeedSpec({ version: 1, source: { kind: 'nope' } });
    assert.equal(r.ok, false);
    if (!r.ok) {
      const paths = r.issues.map((i) => i.path);
      assert.ok(paths.includes('id'));
      assert.ok(paths.includes('name'));
      assert.ok(paths.includes('source.kind'));
    }
  });

  test('drops an unsafe imported regex but keeps the rest of the spec', () => {
    const r = validateFeedSpec({
      version: 1,
      id: 'x',
      name: 'X',
      source: { kind: 'home' },
      sift: {
        keywords: [
          { pattern: '(a+)+b', mode: 'regex' },
          { pattern: 'airdrop', mode: 'word' },
        ],
      },
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(
        r.spec.sift.keywords.map((k) => k.pattern),
        ['airdrop'],
      );
      assert.equal(r.warnings.length, 1);
      assert.match(r.warnings[0]!.message, /unsafe or invalid/);
    }
  });

  test('clamps hostile numbers rather than trusting them', () => {
    const r = validateFeedSpec({
      version: 1,
      id: 'x',
      name: 'X',
      source: { kind: 'home' },
      sort: {
        mode: 'weighted',
        weights: { direct: 9999, discovery: -5, bogus: 3 },
        recencyHalfLifeHours: 1e9,
        affinityBoost: 12,
        diversity: { maxPerAuthor: 9999, window: 1 },
      },
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.spec.sort.weights.direct, LIMITS.maxWeight);
      assert.equal(r.spec.sort.weights.discovery, 0);
      assert.equal(
        'bogus' in r.spec.sort.weights,
        false,
        'unknown groups are dropped',
      );
      assert.ok(r.spec.sort.recencyHalfLifeHours <= 336);
      assert.equal(r.spec.sort.affinityBoost, 1);
      assert.equal(r.spec.sort.diversity.maxPerAuthor, 50);
      assert.equal(r.spec.sort.diversity.window, 5);
    }
  });

  test('truncates long strings and multi-glyph icons', () => {
    const r = validateFeedSpec({
      version: 1,
      id: 'x',
      name: 'n'.repeat(500),
      icon: '🏠🌙⭐️🎉',
      description: 'd'.repeat(1000),
      source: { kind: 'search', query: 'q'.repeat(500) },
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.spec.name.length, LIMITS.nameChars);
      assert.equal([...r.spec.icon!].length, 2);
      assert.equal(r.spec.description!.length, LIMITS.descriptionChars);
      assert.equal(
        (r.spec.source as { query: string }).query.length,
        LIMITS.searchChars,
      );
    }
  });

  test('rejects nested blends and all-zero weights', () => {
    const nested = validateFeedSpec({
      version: 1,
      id: 'x',
      name: 'X',
      source: {
        kind: 'blend',
        parts: [{ source: { kind: 'blend', parts: [] }, weight: 1 }],
      },
    });
    assert.equal(nested.ok, false);

    const zeroed = validateFeedSpec({
      version: 1,
      id: 'x',
      name: 'X',
      source: {
        kind: 'blend',
        parts: [{ source: { kind: 'home' }, weight: 0 }],
      },
    });
    assert.equal(zeroed.ok, false);
  });

  test('rejects unknown reason names in mutes', () => {
    const r = validateFeedSpec({
      version: 1,
      id: 'x',
      name: 'X',
      source: { kind: 'home' },
      sift: {
        mutedReasons: ['popular', 'made-up-reason'],
        mutedGroups: ['promoted', 'nope'],
      },
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.spec.sift.mutedReasons, ['popular']);
      assert.deepEqual(r.spec.sift.mutedGroups, ['promoted']);
    }
  });
});

describe('share links', () => {
  test('round-trip preserves every field the reader set', () => {
    const spec = makeFeedSpec(
      'design',
      'Design',
      { kind: 'channel', channelKey: 'design' },
      {
        icon: '🎨',
        description: 'design channel, quiet',
        sift: {
          ...emptySift(),
          mutedGroups: ['promoted'],
          keywords: [{ pattern: 'hiring', mode: 'word' }],
        },
        sort: {
          ...defaultSort(),
          mode: 'weighted',
          weights: { direct: 2 },
          recencyHalfLifeHours: 24,
          affinityBoost: 0.3,
          diversity: { maxPerAuthor: 2, window: 10 },
        },
        skin: { density: 'compact', hideCounts: true },
      },
    );
    const decoded = decodeShare(encodeShare(spec));
    assert.equal(decoded.ok, true);
    if (decoded.ok) assert.deepEqual(decoded.spec, spec);
  });

  test('compaction drops defaults so links stay short and readable', () => {
    const plain = makeFeedSpec('h', 'Home', { kind: 'home' });
    const compacted = compactSpec(plain);
    assert.equal('sift' in compacted, false);
    assert.equal('sort' in compacted, false);
    assert.ok(encodeShare(plain).length < 120);
  });

  test('url form round-trips and rejects junk', () => {
    const spec = starterFeeds()[1]!;
    const parsed = parseShareUrl(shareUrl(spec, 'https://home.app/'));
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.spec.id, spec.id);

    assert.equal(parseShareUrl('https://home.app/about').ok, false);
    assert.equal(decodeShare('not-valid-base64-json').ok, false);
  });

  test('a tampered link fails validation rather than being trusted', () => {
    const evil = b64urlEncode(
      JSON.stringify({
        version: 1,
        id: 'x',
        name: 'X',
        source: { kind: 'home' },
        sort: { weights: { direct: 1e9 } },
      }),
    );
    const r = decodeShare(evil);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.spec.sort.weights.direct, LIMITS.maxWeight);
  });
});

describe('share urls with awkward origins', () => {
  test('a payload is read from the last marker, not the first', () => {
    const spec = starterFeeds()[0]!;
    // An origin whose own path contains the marker.
    const url = shareUrl(spec, 'https://example.com/f/app');
    const parsed = parseShareUrl(url);
    assert.equal(
      parsed.ok,
      true,
      'a link this module just produced must parse',
    );
    if (parsed.ok) assert.equal(parsed.spec.id, spec.id);
  });

  test('trailing path or query after the payload does not break it', () => {
    const spec = starterFeeds()[1]!;
    const encoded = encodeShare(spec);
    for (const url of [
      `https://home.app/f/${encoded}?ref=cast`,
      `https://home.app/f/${encoded}/preview`,
      `https://home.app/f/${encoded}#top`,
    ]) {
      const parsed = parseShareUrl(url);
      assert.equal(parsed.ok, true, url);
      if (parsed.ok) assert.equal(parsed.spec.id, spec.id);
    }
  });
});
