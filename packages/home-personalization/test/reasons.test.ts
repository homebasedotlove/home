import { describe, test } from 'vitest';
import assert from 'node:assert/strict';

import {
  allReasons,
  describeReason,
  explainReason,
  GROUP_LABELS,
  REASON_GROUPS,
  REASON_TYPES,
  reasonGroup,
  reasonsInGroup,
} from '../src/reasons';

describe('the reason taxonomy', () => {
  test('every reason has copy, a chip and a group', () => {
    for (const type of REASON_TYPES) {
      const d = describeReason(type);
      assert.ok(d, type);
      assert.ok(d.because.length > 0 && d.chip.length > 0);
      assert.ok((REASON_GROUPS as readonly string[]).includes(d.group));
    }
  });

  test('allReasons lists each reason exactly once', () => {
    const all = allReasons();
    assert.equal(all.length, REASON_TYPES.length);
    assert.equal(new Set(all.map((d) => d.type)).size, REASON_TYPES.length);
  });

  test('the groups partition the reasons, and every group has a label', () => {
    const seen = new Set<string>();
    for (const group of REASON_GROUPS) {
      assert.ok(GROUP_LABELS[group], `no label for ${group}`);
      for (const d of reasonsInGroup(group)) {
        assert.equal(d.group, group);
        assert.equal(seen.has(d.type), false, `${d.type} in two groups`);
        seen.add(d.type);
      }
    }
    assert.equal(seen.size, REASON_TYPES.length, 'no reason is groupless');
  });

  test('promoted is the one group that cannot be boosted', () => {
    for (const d of allReasons()) {
      assert.equal(d.boostable, d.group !== 'promoted', d.type);
    }
  });

  test('explanations admit ignorance rather than invent', () => {
    assert.match(explainReason(undefined), /don't know/);
    assert.match(explainReason('brand-new-reason'), /brand-new-reason/);
    assert.equal(reasonGroup('brand-new-reason'), undefined);
    assert.match(explainReason('popular'), /^You're seeing this because/);
  });
});
