// task-054 — techReferenceModel 순수 함수 테스트. 실행: node --test web/src/utils/techReferenceModel.test.mjs
// 🔴 실제 개인 기술 이름 대신 합성 이름(알파·브라보…)을 쓴다 — 특정 이름 분기가 없음을 확인하기 위해.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toSections, cardState, historyReducer, initHistory, createLatestGuard,
  normalizeDescription, reviewLabel, mistakesBasisLabel,
  UNKNOWN_CONDITION_TEXT, UNLINKED_LABEL, SELF_LABEL,
} from './techReferenceModel.js';

const card = (o = {}) => ({
  relationKey: o.relationKey ?? `rk-${o.slug || 'x'}`,
  slug: 'x', name: '합성', targetTechniqueId: null, targetTechniqueName: null,
  matchType: 'none', linkState: 'unlinked', isSelf: false, conditionText: null, ...o,
});
const resp = ({ reference = {}, ...rest } = {}) => ({
  technique: { id: 7, name: '합성 현재' },
  incoming: [], outgoing: [], related: [], linkStore: 'available', ...rest,
  reference: { slug: 'cur', matchType: 'exact', kind: 'technique', description: null, sourceUrl: null, ...reference },
});

test('0개: 빈 배열·누락·잘못된 타입 모두 빈 배열로 정규화', () => {
  const a = toSections(resp());
  assert.deepEqual([a.incoming, a.outgoing, a.related], [[], [], []]);
  const b = toSections({ technique: { id: 1 }, reference: {}, incoming: null, outgoing: 'x' });
  assert.deepEqual([b.incoming, b.outgoing, b.related], [[], [], []]);
  const c = toSections(undefined);
  assert.equal(c.description, null);
  assert.equal(c.descriptionState, 'missing');
  assert.equal(c.linkStore, 'unavailable');
});

test('1개·N개: 서버 순서 그대로, 정렬·중복 제거 없음', () => {
  const one = toSections(resp({ outgoing: [card({ slug: 'bravo', name: '브라보' })] }));
  assert.equal(one.outgoing.length, 1);
  assert.equal(one.outgoing[0].name, '브라보');

  const names = ['하', '가', '다', '나', '가'];
  const many = toSections(resp({
    incoming: names.map((n, i) => card({ slug: `s${i}`, name: n, relationKey: i === 4 ? 'rk-s1' : `rk-s${i}` })),
  }));
  assert.deepEqual(many.incoming.map((c) => c.name), names, '가나다 정렬하지 않는다');
  assert.equal(many.incoming.length, 5, '같은 이름이어도 지우지 않는다');
  const keys = many.incoming.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length, 'React key 는 유일해야 한다');
});

test('incoming/outgoing/related 는 서로 섞이지 않는다(방향 보존)', () => {
  const s = toSections(resp({
    incoming: [card({ slug: 'in1', name: '들어옴' })],
    outgoing: [card({ slug: 'out1', name: '나감' })],
    related: [card({ slug: 'rel1', name: '관련' })],
  }));
  assert.deepEqual(s.incoming.map((c) => c.name), ['들어옴']);
  assert.deepEqual(s.outgoing.map((c) => c.name), ['나감']);
  assert.deepEqual(s.related.map((c) => c.name), ['관련']);
});

test('unlinked 카드는 비활성 + "연결할 기술 미확인"', () => {
  const [c] = toSections(resp({ outgoing: [card({ linkState: 'unlinked', targetTechniqueId: null })] })).outgoing;
  const st = cardState(c);
  assert.equal(st.disabled, true);
  assert.equal(st.label, UNLINKED_LABEL);
});

test('linked 라고 해도 대상 ID 가 없으면 비활성(이동할 곳 없음)', () => {
  const [c] = toSections(resp({ outgoing: [card({ linkState: 'linked', targetTechniqueId: null })] })).outgoing;
  assert.equal(c.linkState, 'unlinked');
  assert.equal(cardState(c).disabled, true);
});

test('linked + 대상 ID → 활성, 라벨 없음', () => {
  const [c] = toSections(resp({ outgoing: [card({ linkState: 'linked', targetTechniqueId: '42', matchType: 'confirmed' })] })).outgoing;
  assert.equal(c.targetTechniqueId, 42);
  const st = cardState(c);
  assert.equal(st.disabled, false);
  assert.equal(st.label, null);
});

test('isSelf 카드는 이동 없음', () => {
  const [c] = toSections(resp({ related: [card({ isSelf: true, linkState: 'linked', targetTechniqueId: 7 })] })).related;
  const st = cardState(c);
  assert.equal(st.disabled, true);
  assert.equal(st.label, SELF_LABEL);
});

test('conditionText null/공백 → "연결 조건 미확인", 있으면 그대로', () => {
  assert.equal(cardState(card({ conditionText: null })).conditionLabel, UNKNOWN_CONDITION_TEXT);
  assert.equal(cardState(card({ conditionText: '   ' })).conditionLabel, UNKNOWN_CONDITION_TEXT);
  assert.equal(cardState(card({ conditionText: '상대가 버틸 때' })).conditionLabel, '상대가 버틸 때');
});

test('알 수 없는 matchType·kind 는 안전한 값으로', () => {
  const s = toSections(resp({ reference: { matchType: 'weird', kind: 'zzz' }, outgoing: [card({ matchType: '??' })] }));
  assert.equal(s.matchType, 'none');
  assert.equal(s.kind, null);
  assert.equal(s.outgoing[0].matchType, 'none');
});

test('description null → missing, 요약 없는 설명도 missing(지어내지 않음)', () => {
  assert.equal(toSections(resp()).descriptionState, 'missing');
  const s = toSections(resp({ reference: { description: { summary: '  ', principles: ['p'] } } }));
  assert.equal(s.description, null);
  assert.equal(s.descriptionState, 'missing');
});

test('ambiguous → 설명이 와도 쓰지 않음', () => {
  const s = toSections(resp({ reference: { matchType: 'ambiguous', ambiguousSlugs: ['a', 'b'], description: { summary: '요약' } } }));
  assert.equal(s.description, null);
  assert.equal(s.descriptionState, 'ambiguous');
});

test('정상 설명 정규화 + 라벨', () => {
  const s = toSections(resp({ reference: { description: {
    summary: '요약', conditions: ['조건1', '', 3], principles: ['원리'], mistakes: ['실수'],
    mistakes_basis: 'coach_general', next: ['다음'], next_note: '메모', kind_note: null,
    review: { reviewer: 'gym-master', status: 'coach_draft', basis: 'source_notes' },
  } } }));
  assert.equal(s.descriptionState, 'ready');
  assert.deepEqual(s.description.conditions, ['조건1']);
  assert.equal(mistakesBasisLabel(s.description.mistakesBasis), '관장 일반 조언');
  assert.equal(mistakesBasisLabel('none'), null);
  assert.equal(reviewLabel(s.description.review), '관장 초안');
  assert.equal(reviewLabel({ status: 'coach_draft_existing' }), '관장 초안', '보존한 기존 관장 초안도 검토 상태가 알려져 있다');
  assert.equal(reviewLabel({ status: 'something' }), '검토 상태 미확인');
  assert.equal(normalizeDescription(null), null);
});

test('history: push/pop/자기 자신 push 무시/빈 pop', () => {
  let h = initHistory(1);
  assert.deepEqual(h, { activeId: 1, stack: [] });
  assert.equal(historyReducer(h, { type: 'pop' }), h, '빈 pop 은 그대로');
  assert.equal(historyReducer(h, { type: 'push', id: 1 }), h, '자기 자신 push 무시');
  assert.equal(historyReducer(h, { type: 'push', id: null }), h, '빈 id 무시');
  h = historyReducer(h, { type: 'push', id: 2 });
  h = historyReducer(h, { type: 'push', id: 3 });
  assert.deepEqual(h, { activeId: 3, stack: [1, 2] });
  h = historyReducer(h, { type: 'push', id: 1 }); // A→B→C→A 순환도 한 단계씩 되돌아갈 수 있다
  assert.deepEqual(h, { activeId: 1, stack: [1, 2, 3] });
  h = historyReducer(h, { type: 'pop' });
  assert.deepEqual(h, { activeId: 3, stack: [1, 2] });
  h = historyReducer(h, { type: 'pop' });
  h = historyReducer(h, { type: 'pop' });
  assert.deepEqual(h, { activeId: 1, stack: [] });
  assert.deepEqual(historyReducer(h, { type: 'reset', id: 9 }), { activeId: 9, stack: [] });
  assert.equal(historyReducer(h, { type: 'unknown' }), h);
});

test('latest guard: 늦게 도착한 이전 요청 응답은 거부', async () => {
  const g = createLatestGuard();
  const applied = [];
  const fake = (val, ms) => new Promise((r) => setTimeout(() => r(val), ms));
  const run = async (id, ms) => {
    const tk = g.begin('reference');
    const v = await fake(id, ms);
    if (g.isCurrent(tk)) applied.push(v);
  };
  await Promise.all([run('A', 30), run('B', 5)]); // A 가 먼저 시작했지만 늦게 도착
  assert.deepEqual(applied, ['B']);
});

test('latest guard: key 별로 독립, cancel 후 무효', () => {
  const g = createLatestGuard();
  const m = g.begin('mastery');
  const r = g.begin('reference');
  assert.equal(g.isCurrent(m), true, '다른 key 요청이 mastery 를 무효화하지 않는다');
  assert.equal(g.isCurrent(r), true);
  g.cancel('reference');
  assert.equal(g.isCurrent(r), false);
  assert.equal(g.isCurrent(null), false);
});
