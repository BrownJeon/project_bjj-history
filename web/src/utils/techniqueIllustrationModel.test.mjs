import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIllustrationIndex, findIllustration, normalizeIllustrationName } from './techniqueIllustrationModel.js';

const item = (slug, names, extra = {}) => ({
  slug, names, url: `/technique-illustrations/set-01/${slug}.webp`, width: 512, height: 512, status: 'ready', ...extra,
});
const indexOf = (...items) => buildIllustrationIndex({ version: 1, items });

test('only explicit names and aliases match; NFC and repeated spaces are normalized', () => {
  const alpha = item('alpha', ['알파 기술', '알파 별칭']);
  const index = indexOf(alpha);
  assert.equal(findIllustration(index, '  알파   기술 '.normalize('NFD')), alpha);
  assert.equal(findIllustration(index, '알파 별칭'), alpha);
  assert.equal(findIllustration(index, '알파기술'), null, 'spacing is not a fuzzy alias');
  assert.equal(findIllustration(index, '알파'), null);
  assert.equal(normalizeIllustrationName(null), '');
  assert.equal(findIllustration(index, undefined), null);
});

test('ambiguous explicit names never choose the first or last image', () => {
  const index = indexOf(item('alpha', ['공통', '알파']), item('bravo', ['공통', '브라보']), item('charlie', ['공통']));
  assert.equal(findIllustration(index, '공통'), null);
  assert.equal(findIllustration(index, '알파').slug, 'alpha');
  assert.equal(findIllustration(index, '브라보').slug, 'bravo');
});

test('repeated aliases for the same asset remain usable, but cannot erase an earlier collision', () => {
  const a = item('alpha', ['  중복  이름', '중복 이름', '알파']);
  assert.equal(findIllustration(indexOf(a, item('alpha', ['중복 이름'])), '중복 이름').url, a.url);
  assert.equal(findIllustration(indexOf(a, item('bravo', ['알파']), a), '알파'), null);
});

test('pending, ambiguous and missing images are absent from the ready index', () => {
  const index = indexOf(item('pending', ['준비중'], { status: 'pending' }), item('ambiguous', ['불확실'], { status: 'ambiguous' }));
  assert.equal(findIllustration(index, '준비중'), null);
  assert.equal(findIllustration(index, '불확실'), null);
  assert.equal(findIllustration(index, '미등록'), null);
});

test('untrusted URLs, wrong slugs and invalid image metadata cannot be rendered', () => {
  const invalid = [
    { url: 'https://example.invalid/alpha.webp' },
    { url: '/technique-illustrations/set-01/bravo.webp' },
    { url: '/technique-illustrations/set-01/alpha.webp?redirect=1' },
    { slug: '../alpha' }, { width: 0, height: 0 }, { width: 512, height: 256 }, { names: null },
  ];
  for (const extra of invalid) assert.equal(findIllustration(indexOf(item('alpha', ['알파'], extra)), '알파'), null);
});

test('missing or unknown manifest versions fail closed', () => {
  for (const manifest of [null, {}, { version: 2, items: [item('alpha', ['알파'])] }, { version: 1, items: null }]) {
    assert.equal(findIllustration(buildIllustrationIndex(manifest), '알파'), null);
  }
});
