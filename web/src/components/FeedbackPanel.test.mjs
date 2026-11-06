// Isolated React/DOM regression. Synthetic HTTP responses live only in this test.
// BJJ_UI_TEST_DEPS=<local web deps> BJJ_UI_TEST_JSDOM=<local jsdom deps> node <this file>
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const deps = resolve(process.env.BJJ_UI_TEST_DEPS || process.cwd());
const requireDeps = createRequire(join(deps, 'package.json'));
const requireDOM = createRequire(join(resolve(process.env.BJJ_UI_TEST_JSDOM || deps), 'package.json'));
const React = requireDeps('react'), { act } = React, h = React.createElement;
const { JSDOM } = requireDOM('jsdom'), { build } = requireDeps('esbuild');
const directory = await mkdtemp(join(deps, '.task051-ui-'));
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exports = [
  ['default as FeedbackPanel', 'components/FeedbackPanel.jsx'], ['default as CalendarPage', 'pages/CalendarPage.jsx'],
  ['default as FeedbackPage', 'pages/FeedbackPage.jsx'],
  ['default as RecallPage', 'pages/RecallPage.jsx'], ['FeedbackProvider, useFeedback', 'contexts/FeedbackContext.jsx'],
  ['CacheProvider', 'contexts/CacheContext.jsx'], ['UIProvider', 'contexts/UIContext.jsx'], ['default as client', 'api/client.js'], ['todayKst', 'utils/feedbackPeriod.js'],
];
await writeFile(join(directory, 'entry.jsx'), exports.map(([names, file]) => `export { ${names} } from ${JSON.stringify(join(source, file))};`).join('\n') + '\nexport {MemoryRouter} from "react-router-dom";');
await build({ entryPoints: [join(directory, 'entry.jsx')], outfile: join(directory, 'bundle.mjs'), bundle: true, format: 'esm', platform: 'browser', external: ['react', 'react-dom'], nodePaths: [join(deps, 'node_modules')], loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' }, logLevel: 'silent' });
after(() => rm(directory, { recursive: true, force: true }));
let modules;
const copy = value => structuredClone(value);
function record(overrides = {}) { return { id: 1, revision: 1, date: '2026-11-04', situation: '', technique: '', original: '원문', clipIds: [], clips: [], unavailableClipIds: [], turns: [], archives: [], cursor: 0, ready: false, summary: null, summaryStale: false, summarySourceHash: null, taskBinding: null, ai: { status: 'idle', kind: null, error: '' }, results: [], ...overrides }; }
const clips = Array.from({ length: 7 }, (_, index) => ({ id: index + 1, title: `등록 영상 ${index + 1}`, tech_name: '초크', tech_names: ['초크'], starred: index < 5, tags: [], positions: [], description: '', url: '', usage: { view: 7, drill: 2, position_spar: 1, spar: 0, used: 3, recent: [] } }));

async function environment(run, { custom, screen = null, initial = null, currentTask = null } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="mount"></div></body></html>', { url: 'http://127.0.0.1/' });
  const globals = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Node', 'MutationObserver', 'localStorage', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  if (!modules) modules = await import(pathToFileURL(join(directory, 'bundle.mjs')));
  const { createRoot } = requireDeps('react-dom/client');
  const store = { record: initial && copy(initial), task: currentTask && copy(currentTask), calls: [] };
  modules.client.defaults.adapter = async config => {
    const method = config.method.toUpperCase(), url = config.url, body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    const call = { method, url, body, params: config.params || {} }; store.calls.push(call);
    let value = custom ? await custom(call, store) : undefined;
    if (value === undefined) {
      if (url === '/clips') value = copy(clips);
      else if (url.match(/^\/clips\/\d+\/usage$/)) value = { usage: copy(clips[0].usage), created: false };
      else if (url === '/classes/session-types') value = ['기술 수업'];
      else if (url === '/research/task') value = { task: store.task };
      else if (url === '/holes') value = { holes: [], unlinked: [], empty: true, summary: { sparSessions: 0, failItems: 2 } };
      else if (url === '/recall/stale') value = { items: [], excludedHoleNames: [] };
      else if (url === '/recall/search') value = { total: 0, results: [] };
      else if (url === '/feedback/recap') value = { items: [], results: [], failures: [], summary: { feedbackCount: 0, failureCount: 0, resultCount: 0 } };
      else if (url === '/feedback' && method === 'GET') value = { items: store.record ? [copy(store.record)] : [], total: store.record ? 1 : 0, page: 1, limit: 5 };
      else if (url.match(/^\/feedback\/\d+$/) && method === 'GET') value = copy(store.record);
      else if (url.match(/^\/feedback\/\d+$/) && method === 'PATCH') {
        assert.equal(body.revision, store.record.revision);
        for (const key of ['date', 'situation', 'technique', 'original', 'clipIds', 'cursor']) if (key in body) store.record[key] = copy(body[key]);
        if ('draftAnswer' in body) store.record.turns[store.record.cursor].draftAnswer = body.draftAnswer;
        store.record.revision += 1; value = copy(store.record);
      } else if (url === '/settings/instagram-cookie') value = {};
      else value = [];
    }
    return { data: { success: true, data: value }, status: 200, statusText: 'OK', headers: {}, config };
  };
  let feedback;
  function Probe() { feedback = modules.useFeedback(); return screen ? h(modules[screen]) : h('button', { onClick: () => feedback.openFeedback() }, '피드백 열기'); }
  const root = createRoot(document.getElementById('mount'));
  const flush = async () => { for (let i = 0; i < 25; i += 1) await Promise.resolve(); await new Promise(done => setTimeout(done, 0)); };
  const update = async fn => act(async () => { await fn(); await flush(); });
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text && !node.closest('[inert]'));
  const click = async node => { assert.ok(node, 'click target exists'); await update(() => { node.focus(); node.click(); }); };
  const input = async (node, value) => update(() => {
    const prototype = node.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : node.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
    node.dispatchEvent(new window.Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
  try {
    await update(() => root.render(h(modules.MemoryRouter, null, h(modules.UIProvider, null, h(modules.CacheProvider, null, h(modules.FeedbackProvider, null, h(Probe), h(modules.FeedbackPanel)))))));
    await run({ get feedback() { return feedback; }, store, update, flush, button, click, input });
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
}

test('Calendar keeps calendar/list and existing ClassEditor, while independent feedback starts today and blank', async () => {
  await environment(async ({ button, click }) => {
    assert.ok(document.body.textContent.includes('캘린더')); assert.ok(document.body.textContent.includes('수업목록'));
    await click(button('+수업')); assert.ok([...document.querySelectorAll('[role="dialog"]')].some(node => node.textContent.includes('수업 추가')));
    await click(document.querySelector('[aria-label="닫기"]'));
    await click(button('+피드백'));
    assert.equal(document.querySelector('[data-testid="feedback-original"]').value, '');
    const date = document.querySelector('[data-testid="feedback-panel"] input[type="date"]');
    assert.equal(date.value, modules.todayKst());
    assert.equal(document.body.textContent.includes('포지션 · 선택'), false);
  }, { screen: 'CalendarPage' });
});

test('video picker pages five after filters, retains hidden selections and directly opens full-usage ClipDetailModal', async () => {
  await environment(async ({ button, click, update }) => {
    await click(button('피드백 열기'));
    const details = document.querySelector('[data-testid="feedback-panel"] details');
    await update(() => { details.open = true; details.dispatchEvent(new window.Event('toggle')); });
    assert.equal(document.querySelectorAll('[data-testid="video-results"] .fb-video-choice').length, 5);
    await click(document.querySelector('[data-testid="select-video-1"]')); await click(button('다음'));
    assert.equal(document.querySelectorAll('[data-testid="video-results"] .fb-video-choice').length, 2);
    await click(document.querySelector('[data-testid="select-video-6"]')); await click(button('즐겨찾기'));
    assert.equal(document.querySelectorAll('[data-testid="video-results"] .fb-video-choice').length, 5);
    assert.equal(document.querySelector('[data-testid="video-pagination"]'), null);
    assert.match(document.querySelector('[data-testid="video-selected-count"]').textContent, /2/);
    const preview = [...document.querySelectorAll('button')].find(node => node.textContent === '미리보기'); await click(preview);
    assert.ok([...document.querySelectorAll('[aria-label]')].find(node => node.getAttribute('aria-label') === '드릴 +1 (지금 2회)'));
    await update(() => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    assert.ok(document.querySelector('[data-testid="feedback-panel"]')); assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
    assert.match(document.querySelector('[data-testid="video-selected-count"]').textContent, /2/);
    assert.equal(document.activeElement, preview);
  });
});

test('input, one-at-a-time answer, integrated card and current-task assignment use real UI handlers', async () => {
  await environment(async ({ button, click, input, feedback, store, update }) => {
    await click(button('피드백 열기')); await input(document.querySelector('[data-testid="feedback-original"]'), '옆으로 눕는다');
    await update(() => document.querySelector('[data-testid="feedback-panel"] form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(document.querySelector('[data-testid="master-question"]').textContent, '다리깃은 무엇을 뜻하나요?');
    await input(document.querySelector('[data-testid="feedback-answer"]'), '바지 깃을 뜻해요'); await click(button('답하고 이어가기'));
    assert.ok(button('정리 카드 보기')); await click(button('이전 질문'));
    assert.equal(document.querySelector('[data-testid="feedback-answer"]').value, '바지 깃을 뜻해요');
    await click(button('답하고 이어가기')); await click(button('정리 카드 보기'));
    const card = document.querySelector('[data-testid="feedback-summary-card"]'); assert.ok(card);
    assert.match(card.textContent, /옆으로 눕고 바지 깃을 잡는다/); assert.match(card.textContent, /연습 제안/); assert.match(card.textContent, /바지 깃을 뜻해요/);
    await click(button('이번 주 과제로 정하기'));
    assert.match(document.body.textContent, /현재 과제로 설정됨/); assert.equal(store.task.id, 88);
  }, { custom(call, store) {
    if (call.url === '/feedback' && call.method === 'POST') { store.record = record({ ...call.body }); return copy(store.record); }
    if (call.url.endsWith('/ask')) {
      if (!store.record.turns.length) store.record.turns = [{ id: 'q1', question: '다리깃은 무엇을 뜻하나요?', answer: null, draftAnswer: '', skipped: false }];
      else store.record.ready = true;
      store.record.revision += 1; return copy(store.record);
    }
    if (call.url.endsWith('/answer')) { store.record.turns[0].answer = call.body.answer; store.record.turns[0].draftAnswer = call.body.answer; store.record.revision += 1; return copy(store.record); }
    if (call.url.endsWith('/summarize')) {
      store.record.summary = { title: '통합 교정', overview: '원문과 보완 답변을 통합', correctionPoints: [{ title: '측면 전환', detail: '옆으로 눕고 바지 깃을 잡는다', evidenceTurnIds: ['q1'], sourceQuotes: [{ source: 'turn', turnId: 'q1', quote: '바지 깃을 뜻해요' }] }], practiceMethods: [{ title: '연습 제안 · 측면 전환', proposal: true, steps: ['옆으로 전환'], check: '바지 깃 확인' }], unresolved: [] };
      store.record.summarySourceHash = 'test-source'; store.record.revision += 1; return copy(store.record);
    }
    if (call.url.endsWith('/task') && call.method === 'POST') {
      assert.equal(call.body.expectedTaskId, null); assert.equal(call.body.replace, false);
      store.task = { id: 88, nodeId: 9, node: { label: '측면 전환' }, open: true }; store.record.taskBinding = { taskId: 88, sourceHash: 'test-source' }; store.record.revision += 1;
      return { feedback: copy(store.record), task: { id: 88, nodeId: 9, projectId: 7, open: true }, reused: false };
    }
    return undefined;
  } });
});

test('same-field conflicts show both values and require explicit choice before partial PATCH', async () => {
  await environment(async ({ feedback, store, update, button, click }) => {
    await update(() => feedback.openFeedback(1)); await update(() => feedback.controller.setInputDraft({ original: '내가 수정한 원문' }));
    store.record.original = '다른 창에서 수정한 원문'; store.record.revision += 1;
    await update(() => feedback.controller.reloadConflict());
    assert.match(document.body.textContent, /내가 수정한 원문/); assert.match(document.body.textContent, /다른 창에서 수정한 원문/);
    assert.equal(button('임시저장').disabled, true); await click(button('내 입력 사용')); await click(button('임시저장'));
    const patch = store.calls.find(call => call.method === 'PATCH' && call.url === '/feedback/1');
    assert.deepEqual(patch.body, { revision: 2, original: '내가 수정한 원문' });
    assert.equal(document.querySelector('[data-testid="feedback-panel"]'), null);
  }, { initial: record() });
});

test('feedback list retains the search, past technique filter, page and opener when the overlay closes', async () => {
  await environment(async ({ button, click, input, store, update, feedback }) => {
    const search = document.querySelector('[aria-label="피드백 검색"]');
    await input(search, '이전 메모');
    await click(button('완료'));
    await click(button('기술 선택 ▼'));
    await click(button('미등록 이전 기술'));
    await click(button('2'));
    const lastRead = store.calls.filter(call => call.method === 'GET' && call.url === '/feedback').at(-1);
    assert.deepEqual(lastRead.params, {
      search: '이전 메모', filter: 'completed', technique: '미등록 이전 기술', page: 2, limit: 10, includeTechniqueOptions: 1,
    });
    const opener = document.querySelector('[aria-label="미등록 이전 기술 피드백 보기"]');
    await click(opener);
    assert.equal(document.querySelector('[data-testid="feedback-panel"] input[placeholder="어떤 상황이었나요?"]'), null);
    assert.match(document.body.textContent, /구 자유 입력/);
    const firstSituation = document.querySelector('.fb-check input');
    await click(firstSituation);
    assert.equal(feedback.controller.getSnapshot().inputDirty, true);
    await click(firstSituation);
    assert.equal(feedback.controller.getSnapshot().inputDirty, false);
    assert.deepEqual(feedback.controller.getSnapshot().inputDraft.situationSelection, { options: null, other: '구 자유 입력' });
    assert.equal(store.calls.some(call => call.method === 'PATCH'), false);
    await update(() => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    assert.equal(document.querySelector('[data-testid="feedback-panel"]'), null);
    assert.equal(document.querySelector('[aria-label="피드백 검색"]'), search);
    assert.equal(search.value, '이전 메모');
    assert.equal(document.activeElement, opener);
    assert.equal(button('완료').getAttribute('aria-pressed'), 'true');
    assert.ok(button('미등록 이전 기술 ▼'));
    assert.equal(store.calls.filter(call => call.method === 'GET' && call.url === '/feedback').at(-1).params.page, 2);
  }, { screen: 'FeedbackPage', initial: record({ technique: '미등록 이전 기술', situation: '구 자유 입력', trainingStatus: 'completed' }), custom(call, store) {
    if (call.method === 'GET' && call.url === '/feedback') return { items: [copy(store.record)], total: 21, page: call.params.page, limit: 10, techniqueOptions: ['미등록 이전 기술'] };
    return undefined;
  } });
});

test('structured situation stays separate from the original legacy situation on list, detail and recap', async () => {
  const legacy = '두 줄로 남긴 상황\n추가 내용';
  const initial = record({
    situation: legacy,
    situationOptions: ['class', 'other'],
    situationOther: '새 체크 설명',
    summary: { title: '기존 상황을 보존한 카드', overview: '', correctionPoints: [], practiceMethods: [], unresolved: [] },
  });
  function assertBoth(container) {
    assert.match(container.textContent, /수업/);
    assert.match(container.textContent, /새 체크 설명/);
    assert.equal(container.querySelector('.fb-legacy-situation').textContent, `기존 자유 입력 상황 · ${legacy}`);
  }
  await environment(async ({ click }) => {
    assertBoth(document.querySelector('.fb-library-card'));
    await click(document.querySelector('[aria-label="기존 상황을 보존한 카드 피드백 보기"]'));
    assertBoth(document.querySelector('[data-testid="feedback-summary-card"]'));
  }, { screen: 'FeedbackPage', initial });
  await environment(async () => {
    assertBoth(document.querySelector('[data-testid="feedback-list"] .fb-list-button'));
  }, { screen: 'RecallPage', initial, custom(call, store) {
    if (call.url === '/feedback/recap') return { items: [copy(store.record)], results: [], failures: [], summary: { feedbackCount: 1, resultCount: 0, failureCount: 0 } };
    return undefined;
  } });
});

test('registered technique and multi-situation choices survive the picker and star stays separate from opening a card', async () => {
  await environment(async ({ button, click, input, store }) => {
    await click(button('+ 추가'));
    const check = text => [...document.querySelectorAll('.fb-check')].find(label => label.textContent.trim() === text).querySelector('input');
    await click(check('수업'));
    await click(check('기타'));
    await input(document.querySelector('[placeholder="어떤 상황이었나요?"]'), '복기 모임');
    await click(button('기술명 검색·선택'));
    await input(document.querySelector('[placeholder="기술명 검색…"]'), '암');
    assert.equal(button('암바 오류 ID'), undefined);
    await click(button('암바'));
    assert.equal(check('수업').checked, true);
    assert.equal(check('기타').checked, true);
    assert.equal(document.querySelector('[placeholder="어떤 상황이었나요?"]').value, '복기 모임');
    await input(document.querySelector('[data-testid="feedback-original"]'), '새 원문');
    await click(button('임시저장'));
    const created = store.calls.find(call => call.method === 'POST' && call.url === '/feedback');
    assert.equal(created.body.techniqueId, 17);
    assert.equal('technique' in created.body, false);
    assert.deepEqual(created.body.situationOptions, ['class', 'other']);
    assert.equal(created.body.situationOther, '복기 모임');
    const star = document.querySelector('[aria-label="암바 즐겨찾기"]');
    await click(star);
    assert.equal(star.getAttribute('aria-pressed'), 'true');
    assert.equal(document.querySelector('[data-testid="feedback-panel"]'), null);
    assert.deepEqual(store.calls.find(call => call.method === 'PUT' && call.url === '/feedback/1/star').body, { starred: true });
  }, { screen: 'FeedbackPage', custom(call, store) {
    if (call.method === 'GET' && call.url === '/techniques') return [{ id: 17, name: '암바' }, { id: 18, name: '스윕' }, { id: 'invalid', name: '암바 오류 ID' }];
    if (call.method === 'POST' && call.url === '/feedback') {
      store.record = record({ ...call.body, technique: '암바', starred: false });
      return copy(store.record);
    }
    if (call.method === 'PUT' && call.url === '/feedback/1/star') {
      store.record.starred = call.body.starred;
      return { id: 1, starred: store.record.starred };
    }
    return undefined;
  } });
});

test('result inline editor preserves the draft on 409 and deletes only the confirmed result', async () => {
  const first = { id: 'result-1', date: '2026-11-04', outcome: 'done', context: 'drill', note: '성공 메모' };
  const second = { id: 'result-2', date: '2026-11-05', outcome: 'not_tried', context: 'spar', note: '다른 메모' };
  const summary = { title: '정리 카드', overview: '', correctionPoints: [], practiceMethods: [], unresolved: [] };
  let failedOnce = false;
  await environment(async ({ feedback, store, update, input, button, click }) => {
    await update(() => feedback.openFeedback(1));
    await click(button('수정'));
    const editNote = () => document.querySelector('.fb-result-edit textarea');
    assert.equal(editNote().value, '성공 메모');
    await input(editNote(), '편집 중 새 메모');
    await input(document.querySelector('.fb-result-edit select'), 'tried_failed');
    await click(button('수정 내용 저장'));
    assert.equal(editNote().value, '편집 중 새 메모');
    await click(button('서버 내용 확인'));
    assert.equal(editNote().value, '편집 중 새 메모');
    await click(button('수정 내용 저장'));
    assert.equal(editNote(), null);
    assert.match(document.querySelector('[data-testid="feedback-summary-card"]').textContent, /훈련중/);
    assert.equal(store.record.results[0].id, first.id);
    await click(button('삭제'));
    await click(button('취소'));
    assert.equal(store.calls.filter(call => call.method === 'DELETE').length, 0);
    await click(button('삭제'));
    await click(button('삭제 확인'));
    const deletion = store.calls.find(call => call.method === 'DELETE');
    assert.equal(deletion.url, '/feedback/1/results/result-1');
    assert.deepEqual(deletion.body, { revision: 3 });
    assert.deepEqual(store.record.results, [second]);
    assert.match(document.body.textContent, /다른 메모/);
  }, { initial: record({ summary, trainingStatus: 'completed', results: [first, second] }), custom(call, store) {
    if (call.method === 'PATCH' && call.url === '/feedback/1/results/result-1') {
      if (!failedOnce) {
        failedOnce = true;
        store.record.revision = 2;
        throw { response: { status: 409, data: { message: '다른 창에서 변경되었습니다.' } } };
      }
      assert.deepEqual(call.body, { revision: 2, date: first.date, outcome: 'tried_failed', context: 'drill', note: '편집 중 새 메모' });
      const { revision, ...values } = call.body;
      store.record = { ...store.record, revision: revision + 1, summaryStale: true, trainingStatus: 'training', results: [{ ...first, ...values }, second] };
      return copy(store.record);
    }
    if (call.method === 'DELETE' && call.url === '/feedback/1/results/result-1') {
      store.record = { ...store.record, revision: 4, results: [second] };
      return copy(store.record);
    }
    return undefined;
  } });
});

test('summary pending locks result writes, and creating can be canceled without touching other drafts', async () => {
  const saved = { id: 'result-1', date: '2026-11-04', outcome: 'done', context: 'drill', note: '저장된 결과' };
  const turn = { id: 'a', question: '질문', answer: null, draftAnswer: '', skipped: false };
  const summary = { title: '정리 카드', overview: '', correctionPoints: [], practiceMethods: [] };
  await environment(async ({ feedback, store, update, input, button, click }) => {
    const { controller } = feedback;
    const note = () => document.querySelector('.fb-section form textarea');
    await update(() => feedback.openFeedback(1));
    assert.equal(button('연습 결과 저장').disabled, true);
    assert.equal(button('수정').disabled, true);
    assert.equal(button('삭제').disabled, true);
    assert.match(document.body.textContent, /정리가 끝나면 연습 결과를 저장하거나 수정·삭제할 수 있습니다/);
    assert.equal(note().disabled, false);
    await update(() => {
      controller.setInputDraft({ original: '내가 수정한 원문' });
      controller.setAnswerDraft(turn.id, '작성 중인 답변');
    });
    await input(note(), '취소할 연습 메모');
    await input(note().form.querySelector('select'), 'tried_failed');
    await update(() => note().form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    await click(document.querySelector('[aria-label="닫기"]'));
    assert.match(document.body.textContent, /작성 중인 연습 결과가 있습니다/);
    assert.equal(button('저장하고 닫기'), undefined);
    await click(button('계속 편집'));
    assert.equal(note().value, '취소할 연습 메모');
    await click(button('작성 취소'));
    const current = controller.getSnapshot();
    assert.equal(current.open, true);
    assert.equal(current.resultDraft, null);
    assert.equal(current.inputDraft.original, '내가 수정한 원문');
    assert.equal(current.answerDrafts[turn.id], '작성 중인 답변');
    assert.equal(note().value, '');
    assert.equal(note().form.querySelector('select').value, 'not_tried');
    assert.equal(store.calls.filter(call => call.url.includes('/results')).length, 0);
    assert.deepEqual(store.record.results, [saved]);

    store.record = { ...store.record, revision: 2, ai: { status: 'idle' } };
    await update(() => controller.refresh());
    assert.equal(button('연습 결과 저장').disabled, false);
    assert.equal(button('수정').disabled, false);
    assert.equal(button('삭제').disabled, false);
  }, { initial: record({ summary, turns: [turn], ai: { status: 'pending', kind: 'summarize' }, results: [saved] }) });
});

test('pending summary 409 keeps a result edit and a refreshed deletion dialog blocks confirmation', async () => {
  const saved = { id: 'result-1', date: '2026-11-04', outcome: 'done', context: 'drill', note: '저장된 결과' };
  const summary = { title: '정리 카드', overview: '', correctionPoints: [], practiceMethods: [] };
  await environment(async ({ feedback, store, update, input, button, click }) => {
    const { controller } = feedback;
    await update(() => feedback.openFeedback(1));
    await click(button('수정'));
    const editNote = () => document.querySelector('.fb-result-edit textarea');
    await input(editNote(), '수정 중인 메모');
    await click(button('수정 내용 저장'));
    assert.match(document.body.textContent, /피드백 정리가 끝난 뒤 연습 결과를 변경해주세요/);
    await click(button('서버 내용 확인'));
    assert.equal(editNote().value, '수정 중인 메모');
    assert.equal(button('수정 내용 저장').disabled, true);
    store.record = { ...store.record, revision: 3, ai: { status: 'idle' } };
    await update(() => controller.refresh());
    assert.equal(editNote().value, '수정 중인 메모');
    assert.equal(button('수정 내용 저장').disabled, false);
    await click(button('취소'));
    await click(button('삭제'));
    store.record = { ...store.record, revision: 4, ai: { status: 'pending', kind: 'summarize' } };
    await update(() => controller.refresh());
    assert.match(button('삭제 확인').closest('[role="dialog"]').textContent, /정리가 끝나면 연습 결과를 저장하거나 수정·삭제할 수 있습니다/);
    assert.equal(button('삭제 확인').disabled, true);
    await click(button('취소'));
    assert.equal(store.calls.filter(call => call.method === 'DELETE').length, 0);
  }, { initial: record({ summary, results: [saved] }), custom(call, store) {
    if (call.method === 'PATCH' && call.url === '/feedback/1/results/result-1') {
      store.record = { ...store.record, revision: 2, ai: { status: 'pending', kind: 'summarize' } };
      throw { response: { status: 409, data: { message: '피드백 정리가 끝난 뒤 연습 결과를 변경해주세요' } } };
    }
    return undefined;
  } });
});

test('unknown create preserves input and requires explicit owned-list selection without retrying POST', async () => {
  await environment(async ({ button, click, input, store, update }) => {
    await click(button('피드백 열기')); await input(document.querySelector('[data-testid="feedback-original"]'), '응답이 유실된 원문'); await click(button('임시저장'));
    assert.match(document.body.textContent, /먼저 저장된 기록/); assert.equal(store.calls.filter(call => call.method === 'POST' && call.url === '/feedback').length, 1);
    await click(button('전체 기록 조회'));
    const list = [...document.querySelectorAll('.fb-list-button')].find(node => node.textContent.includes('기록 #5')); await click(list);
    await click(button('선택한 저장 기록 이어쓰기'));
    assert.equal(document.querySelector('[data-testid="feedback-original"]').value, '응답이 유실된 원문');
    assert.equal(store.calls.filter(call => call.method === 'POST' && call.url === '/feedback').length, 1);
    const query = store.calls.filter(call => call.method === 'GET' && call.url === '/feedback').at(-1);
    assert.equal(query.params.from, undefined); assert.equal(query.params.to, undefined);
  }, { custom(call, store) {
    if (call.method === 'POST' && call.url === '/feedback') { store.record = record({ id: 5, ...call.body }); throw new Error('response lost'); }
    return undefined;
  } });
});

test('Recall applies one range to feedback/holes/stale/positions/search and rejects reversed custom range', async () => {
  await environment(async ({ button, click, input, store, update }) => {
    const relevant = ['/feedback/recap', '/holes', '/recall/stale', '/techniques/positions'];
    const first = store.calls.filter(call => relevant.includes(call.url)); assert.equal(first.length, 4);
    const from = first[0].params.from, to = first[0].params.to; assert.ok(from.endsWith('-01'));
    for (const call of first) assert.deepEqual([call.params.from, call.params.to], [from, to]);
    await click(button('전체')); const all = store.calls.filter(call => relevant.includes(call.url)).slice(-4);
    for (const call of all) assert.equal(call.params.from, undefined);
    await click(button('직접선택'));
    const fields = [...document.querySelectorAll('input[type="date"]')]; await input(fields[0], '2026-11-20'); await input(fields[1], '2026-11-01');
    await click(button('기간 적용')); assert.match(document.body.textContent, /종료일은 시작일보다/); assert.match(document.querySelector('[data-testid="period-range"]').textContent, /전체 기간/);
    await input(fields[0], '2026-10-26'); await input(fields[1], '2026-11-01'); await click(button('기간 적용'));
    for (const call of store.calls.filter(call => relevant.includes(call.url)).slice(-4)) assert.deepEqual([call.params.from, call.params.to], ['2026-10-26', '2026-11-01']);
    await click(button('검색')); const search = store.calls.filter(call => call.url === '/recall/search').at(-1);
    assert.deepEqual([search.params.from, search.params.to], ['2026-10-26', '2026-11-01']);
  }, { screen: 'RecallPage' });
});

test('recall returns focus to the saved feedback card after refreshing the same period', async () => {
  await environment(async ({ click, store }) => {
    const opener = document.querySelector('[data-testid="feedback-list"] .fb-list-button');
    await click(opener);
    assert.equal(store.calls.filter(call => call.url === '/feedback/recap').length, 2);
    assert.ok(opener.isConnected);
    await click(document.querySelector('[role="dialog"] [aria-label="닫기"]'));
    assert.equal(document.activeElement, opener);
  }, { screen: 'RecallPage', initial: record(), custom(call, store) {
    if (call.url !== '/feedback/recap') return undefined;
    return {
      from: call.params.from ?? null, to: call.params.to ?? null,
      items: [copy(store.record)], results: [], failures: [],
      summary: { feedbackCount: 1, resultCount: 0, failureCount: 0 },
    };
  } });
});

test('recall clears previously loaded counts when refreshing the same period fails', async () => {
  let failRefresh = false;
  await environment(async ({ click }) => {
    const opener = document.querySelector('[data-testid="feedback-list"] .fb-list-button');
    assert.equal(document.querySelector('[data-testid="recall-summary"] strong').textContent, '1');
    failRefresh = true;
    await click(opener);
    assert.match(document.body.textContent, /피드백 집계를 불러오지 못했습니다/);
    assert.equal(document.querySelector('[data-testid="recall-summary"] strong').textContent, '—');
  }, { screen: 'RecallPage', initial: record(), custom(call, store) {
    if (call.url !== '/feedback/recap') return undefined;
    if (failRefresh) throw new Error('피드백 집계 요청 실패');
    return {
      from: call.params.from ?? null, to: call.params.to ?? null,
      items: [copy(store.record)], results: [], failures: [],
      summary: { feedbackCount: 1, resultCount: 0, failureCount: 0 },
    };
  } });
});

test('orphan draft UI recovers into an explicitly selected question and survives save/reopen', async () => {
  await environment(async ({ feedback, store, update, button, click, input }) => {
    await update(() => feedback.openFeedback(1)); await update(() => feedback.controller.setAnswerDraft('b', '복구해야 하는 내 초안'));
    store.record.archives = [{ id: 'archived', reason: '다른 창에서 변경', turns: copy(store.record.turns) }];
    store.record.turns = [{ id: 'c', question: '새 현재 질문', answer: null, draftAnswer: '', skipped: false }]; store.record.cursor = 0; store.record.revision += 1;
    await update(() => feedback.controller.reloadConflict());
    assert.match(document.body.textContent, /복구해야 하는 내 초안/); assert.match(document.body.textContent, /질문 ID · b/);
    assert.equal(button('보완 중 저장하고 닫기').disabled, true);
    await input(document.querySelector('select'), 'c'); await click(button('초안 복구'));
    assert.equal(document.querySelector('[data-testid="feedback-answer"]').value, '복구해야 하는 내 초안');
    await click(button('보완 중 저장하고 닫기')); assert.equal(document.querySelector('[data-testid="feedback-panel"]'), null);
    await update(() => feedback.openFeedback(1));
    assert.equal(document.querySelector('[data-testid="feedback-answer"]').value, '복구해야 하는 내 초안');
  }, { initial: record({ turns: [{ id: 'a', question: '첫 질문', answer: '기존 답', draftAnswer: '기존 답', skipped: false }, { id: 'b', question: '후속 질문', answer: null, draftAnswer: '', skipped: false }], cursor: 1 }) });
});

test('weekly task replacement shows the actual current task and sends its ID only after confirmation', async () => {
  const summary = { title: '통합 카드', overview: '', correctionPoints: [{ title: '첫 교정점', detail: '교정 내용', evidenceTurnIds: [], sourceQuotes: [] }], practiceMethods: [{ title: '연습 제안 · 첫 연습', steps: ['연습'], check: '확인', proposal: true }], unresolved: [] };
  await environment(async ({ feedback, store, update, button, click }) => {
    await update(() => feedback.openFeedback(1)); await click(button('이번 주 과제로 정하기'));
    assert.match(document.body.textContent, /실제 진행 중인 과제/);
    assert.equal(store.calls.filter(call => call.method === 'POST' && call.url.endsWith('/task')).length, 0);
    await click(button('기존 과제 유지'));
    assert.equal(store.calls.filter(call => call.method === 'POST' && call.url.endsWith('/task')).length, 0);
    await click(button('이번 주 과제로 정하기')); await click(button('이 과제로 바꾸기'));
    const taskCall = store.calls.find(call => call.method === 'POST' && call.url.endsWith('/task'));
    assert.equal(taskCall.body.expectedTaskId, 200); assert.equal(taskCall.body.replace, true);
    assert.match(document.body.textContent, /현재 과제로 설정됨/);
  }, { initial: record({ summary, summarySourceHash: 'current' }), currentTask: { id: 200, nodeId: 7, node: { label: '실제 진행 중인 과제' }, open: true }, custom(call, store) {
    if (call.method === 'POST' && call.url.endsWith('/task')) {
      store.task = { id: 201, nodeId: 8, node: { label: '새 과제' }, open: true };
      store.record.taskBinding = { taskId: 201, sourceHash: 'current' }; store.record.revision += 1;
      return { feedback: copy(store.record), task: { id: 201, nodeId: 8, projectId: 9 }, reused: false };
    }
    return undefined;
  } });
});
