import test from 'node:test';
import assert from 'node:assert/strict';
import { feedbackPeriod, shiftPeriodAnchor, todayKst, validatePeriod, isCalendarDate } from './feedbackPeriod.js';
import { filterClips, paginateClips, rankedClipTechniques } from './clipFilters.js';

test('calendar month includes future days and leap-day, without month-end rollover', () => {
  assert.deepEqual(feedbackPeriod('month', '2024-02-29'), { from: '2024-02-01', to: '2024-02-29', label: '2024년 2월' });
  assert.equal(feedbackPeriod('month', '2025-02-28').to, '2025-02-28');
  assert.equal(shiftPeriodAnchor('month', '2026-03-31', -1), '2026-02-01');
  assert.equal(shiftPeriodAnchor('month', '2026-12-31', 1), '2027-01-01');
});

test('week always runs Monday through Sunday across month/year boundaries', () => {
  assert.deepEqual(feedbackPeriod('week', '2026-11-01'), { from: '2026-10-26', to: '2026-11-01', label: '월요일부터 일요일' });
  assert.equal(feedbackPeriod('week', '2027-01-01').from, '2026-12-28');
  assert.equal(shiftPeriodAnchor('week', '2026-12-28', 1), '2027-01-04');
});

test('all omits date bounds; custom keeps inclusive date strings and rejects invalid/reversed dates', () => {
  assert.deepEqual(feedbackPeriod('all'), { from: '', to: '', label: '전체 기간' });
  assert.deepEqual(feedbackPeriod('custom', '2026-11-04', { from: '2024-02-29', to: '2024-02-29' }), {
    from: '2024-02-29', to: '2024-02-29', label: '직접선택',
  });
  assert.ok(validatePeriod('2026-11-05', '2026-11-04'));
  assert.equal(isCalendarDate('2025-02-29'), false);
  assert.equal(isCalendarDate('2026-04-31'), false);
  assert.equal(isCalendarDate('2026-4-3'), false);
  assert.throws(() => feedbackPeriod('custom', undefined, { from: '', to: '' }));
});

test('today is explicitly Korea date near UTC midnight regardless of host timezone', () => {
  assert.equal(todayKst(new Date('2026-11-03T15:01:00Z')), '2026-11-04');
  assert.equal(todayKst(new Date('2026-11-03T14:59:00Z')), '2026-11-03');
});

const clips = [
  { id: 1, title: '백 진입'.normalize('NFD'), tech_names: ['보우', '초크'], tags: ['깃'], usage: { view: 99, used: 0 }, pinned: true },
  { id: 2, title: '가드', tech_name: '암바', description: '팔 제어', starred: true, usage: { drill: 2, used: 2 } },
  { id: 3, title: '패스', tech_name: '보우', usage: { spar: 2, used: 2 } },
];

test('clip search keeps existing primary tech_name behavior and normalizes NFC, tags and description', () => {
  assert.deepEqual(filterClips(clips, { search: '백 진입' }).map(c => c.id), [1]);
  assert.deepEqual(filterClips(clips, { search: '초크' }).map(c => c.id), []);
  assert.deepEqual(filterClips(clips, { search: '깃' }).map(c => c.id), [1]);
  assert.deepEqual(filterClips(clips, { search: '팔 제어' }).map(c => c.id), [2]);
  assert.deepEqual(filterClips(clips, { techFilter: '보우', search: '패스' }).map(c => c.id), [3]);
  const differingNames = [{ id: 9, tech_name: '기존 원문', tech_names: ['보조 기술'] }];
  assert.deepEqual(filterClips(differingNames, { search: '기존 원문' }).map(c => c.id), [9]);
  assert.deepEqual(filterClips(differingNames, { search: '보조 기술' }).map(c => c.id), []);
  assert.deepEqual(filterClips(differingNames, { techFilter: '보조 기술' }).map(c => c.id), [9]);
});

test('clip filters exclude views from unused and preserve sort ties/input ordering', () => {
  assert.deepEqual(filterClips(clips, { filter: 'unused' }).map(c => c.id), [1]);
  assert.deepEqual(filterClips(clips, { filter: 'recent' }).map(c => c.id), [1, 3, 2]);
  assert.deepEqual(filterClips(clips, { filter: 'mostUsed' }).map(c => c.id), [2, 3, 1]);
  assert.deepEqual(filterClips(clips, { filter: 'star' }).map(c => c.id), [2]);
  assert.deepEqual(filterClips(clips, { filter: 'pinned' }).map(c => c.id), [1]);
  assert.deepEqual(clips.map(c => c.id), [1, 2, 3]);
  assert.deepEqual(rankedClipTechniques(clips), ['보우', '초크', '암바']);
});

test('paging runs after filters, handles 5+2/exactly5/empty and clamps shrinking results', () => {
  const seven = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, starred: i < 5 }));
  const first = paginateClips(seven, 1);
  const second = paginateClips(seven, 2);
  assert.equal(first.items.length, 5);
  assert.equal(first.pages, 2);
  assert.deepEqual([second.from, second.to, second.items.length], [6, 7, 2]);
  const filtered = paginateClips(filterClips(seven, { filter: 'star' }), 2);
  assert.deepEqual([filtered.page, filtered.pages, filtered.items.length], [1, 1, 5]);
  assert.deepEqual(paginateClips([], 99), { items: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
});
