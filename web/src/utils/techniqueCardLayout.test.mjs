import test from 'node:test';
import assert from 'node:assert/strict';
import { paddingForContentHeights } from './techniqueCardLayout.js';

test('ordinary rows retain 14px and one extra 26px tag line is absorbed by 1px padding', () => {
  assert.deepEqual(paddingForContentHeights(48, 48), { paddingBlock: 14, remainingHeight: 0 });
  assert.deepEqual(paddingForContentHeights(74, 48), { paddingBlock: 1, remainingHeight: 0 });
  assert.deepEqual(paddingForContentHeights(48, 74), { paddingBlock: 14, remainingHeight: 0 });
});

test('content that cannot fit is never clipped or assigned negative padding', () => {
  assert.deepEqual(paddingForContentHeights(100, 48), { paddingBlock: 0, remainingHeight: 24 });
  assert.deepEqual(paddingForContentHeights(76, 48), { paddingBlock: 0, remainingHeight: 0 });
});

test('fractional font metrics are preserved and invalid measurements are ignored', () => {
  assert.deepEqual(paddingForContentHeights(73.5, 48), { paddingBlock: 1.25, remainingHeight: 0 });
  assert.equal(paddingForContentHeights(Number.NaN, 48), null);
  assert.equal(paddingForContentHeights(48, Number.POSITIVE_INFINITY), null);
  assert.equal(paddingForContentHeights(-1, 48), null);
});
