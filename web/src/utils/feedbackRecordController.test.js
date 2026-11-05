import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedbackRecordController } from './feedbackRecordController.js';

const clone = value => structuredClone(value);
const turn = (id, answer = null) => ({ id, question: `질문 ${id}`, answer, draftAnswer: answer || '', skipped: false });
const dto = (overrides = {}) => ({
  id: 1, revision: 1, date: '2026-11-04', situation: '', technique: '', original: '원문',
  clipIds: [], clips: [], unavailableClipIds: [], turns: [], archives: [], cursor: 0, ready: false,
  summary: null, summaryStale: false, summarySourceHash: null, taskBinding: null,
  ai: { status: 'idle', kind: null, error: '', startedAt: null }, results: [], ...overrides,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function settle() { for (let i = 0; i < 12; i += 1) await Promise.resolve(); }
function setup(api) {
  let next = 0;
  const timers = new Map();
  const controller = createFeedbackRecordController({
    api, setTimer: fn => { timers.set(++next, fn); return next; }, clearTimer: id => timers.delete(id),
  });
  return { controller, timers, async tick() {
    const first = timers.entries().next().value;
    assert.ok(first, 'expected a scheduled poll');
    timers.delete(first[0]); first[1](); await settle();
  } };
}

function memoryStore(initial) {
  const store = { value: clone(initial), patches: [] };
  store.api = {
    getFeedback: async () => clone(store.value),
    patchFeedback: async (id, body) => {
      assert.equal(body.revision, store.value.revision);
      store.patches.push(clone(body));
      for (const key of ['date', 'situation', 'technique', 'original', 'clipIds', 'cursor']) {
        if (key in body) store.value[key] = clone(body[key]);
      }
      if ('draftAnswer' in body) store.value.turns[store.value.cursor].draftAnswer = body.draftAnswer;
      store.value.revision += 1;
      return clone(store.value);
    },
  };
  return store;
}

test('structured situation conflicts are resolved as a pair and preserve the legacy situation', async () => {
  const legacy = '과거에 자유 입력한 상황';
  let savedBody;
  let server = dto({ situation: legacy, situationOptions: null, situationOther: '', technique: '미등록 기술' });
  const { controller: c } = setup({
    getFeedback: async () => clone(server),
    patchFeedback: async (id, body) => {
      savedBody = clone(body);
      server = { ...server, revision: 3, situationOptions: body.situationOptions, situationOther: body.situationOther, technique: '등록 기술' };
      return clone(server);
    },
  });
  await c.open(1);
  c.setInputDraft({ situationSelection: { options: ['spar', 'other'], other: '내 상황' }, technique: { id: 8, name: '등록 기술' } });
  server = { ...server, revision: 2, situationOptions: ['class'], situationOther: '' };
  await c.reloadConflict();
  assert.deepEqual(c.getSnapshot().inputConflicts.situationSelection.server, { options: ['class'], other: '' });
  assert.equal(await c.save(), null);
  c.resolveInputConflict('situationSelection', 'local');
  await c.save();
  assert.deepEqual(savedBody, { revision: 2, situationOptions: ['other', 'spar'], situationOther: '내 상황', techniqueId: 8 });
  assert.equal(c.getSnapshot().record.situation, legacy);
  assert.equal(c.getSnapshot().inputDraft.technique, '등록 기술');
  assert.equal(c.getSnapshot().inputDirty, false);
  c.unmount();
});

test('reverting all situation choices keeps a legacy record nullable and causes no write', async () => {
  const legacy = '예전 자유 입력';
  const store = memoryStore(dto({ situation: legacy, situationOptions: null, turns: [turn('q1', '이전 답변')] }));
  const { controller: c } = setup(store.api);
  await c.open(1);
  c.setInputDraft({ situationSelection: { options: ['class', 'other'], other: '새 내용' } });
  c.setInputDraft({ situationSelection: { options: [], other: '' } });
  assert.equal(c.getSnapshot().inputDirty, false);
  assert.deepEqual(c.getSnapshot().inputDraft.situationSelection, { options: null, other: legacy });
  await c.save();
  assert.deepEqual(store.patches, []);
  assert.equal(c.getSnapshot().record.turns[0].answer, '이전 답변');
  c.unmount();
});

test('an invalid selected technique ID cannot be serialized as an intentional clear', async () => {
  const store = memoryStore(dto({ technique: '기존 기술' }));
  const { controller: c } = setup(store.api);
  await c.open(1);
  c.setInputDraft({ technique: { id: NaN, name: '잘못된 캐시 기술' } });
  assert.equal(await c.save(), null);
  assert.deepEqual(store.patches, []);
  assert.equal(c.getSnapshot().record.technique, '기존 기술');
  c.setInputDraft({ technique: { id: null, name: '' } });
  await c.save();
  assert.deepEqual(store.patches, [{ revision: 1, techniqueId: null }]);
  c.unmount();
});

test('older body and polling DTOs cannot undo an acknowledged star write', async () => {
  const pendingRead = deferred(), pendingSave = deferred();
  let reads = 0;
  const original = dto({ starred: false, ai: { status: 'pending' } });
  const { controller: c, tick } = setup({
    getFeedback: async () => ++reads === 2 ? pendingRead.promise : clone(original),
    patchFeedback: async () => pendingSave.promise,
  });
  await c.open(1);
  await tick();
  c.acceptStar({ id: 1, starred: true });
  pendingRead.resolve({ ...original, revision: 2 }); await settle();
  assert.equal(c.getSnapshot().record.starred, true);
  c.setInputDraft({ original: '수정 원문' });
  const saving = c.save();
  c.acceptStar({ id: 1, starred: false });
  pendingSave.resolve({ ...original, revision: 3, starred: true, original: '수정 원문' });
  await saving;
  assert.equal(c.getSnapshot().record.starred, false);
  assert.equal(c.getSnapshot().record.original, '수정 원문');
  c.unmount();
});

test('a failed result update keeps its draft and a changed result cannot be silently overwritten after reload', async () => {
  const initial = { id: 'r1', date: '2026-11-04', outcome: 'done', context: 'drill', note: '기존' };
  let server = dto({ results: [initial] });
  const calls = [];
  const { controller: c } = setup({
    getFeedback: async () => clone(server),
    updateFeedbackResult: async (id, resultId, body) => {
      calls.push({ id, resultId, body });
      if (calls.length === 1) throw Object.assign(new Error('충돌'), { status: 409 });
      return { ...server, revision: 3, results: [{ ...initial, ...body }], trainingStatus: 'training' };
    },
    deleteFeedbackResult: async (id, resultId, body) => {
      calls.push({ id, resultId, body });
      return { ...server, revision: 4, results: [], trainingStatus: null };
    },
  });
  await c.open(1);
  const { id, ...base } = initial;
  const values = { ...base, outcome: 'tried_failed', note: '새 메모' };
  c.setResultDraft({ id, base, values });
  assert.equal(c.close(), false);
  assert.equal(await c.updateResult(id, values, base), null);
  assert.deepEqual(c.getSnapshot().resultDraft.values, values);
  const updated = { ...base, note: '다른 창의 변경' };
  server = { ...server, revision: 2, results: [{ id, ...updated }] };
  await c.reloadConflict();
  assert.equal(await c.updateResult(id, values, base), null);
  assert.equal(calls.length, 1);
  assert.ok(await c.updateResult(id, values, updated));
  assert.equal(c.getSnapshot().resultDraft, null);
  assert.equal(c.getSnapshot().record.trainingStatus, 'training');
  assert.ok(await c.deleteResult(id, values));
  assert.deepEqual(calls.at(-1), { id: 1, resultId: id, body: { revision: 3 } });
  assert.deepEqual(c.getSnapshot().record.results, []);
  c.unmount();
});

test('result writes wait for pending summary without clearing a draft or locking question requests', async () => {
  const values = { date: '2026-11-04', outcome: 'done', context: 'drill', note: '연습 메모' };
  const stored = { id: 'r1', ...values };
  let server = dto({ ai: { status: 'pending', kind: 'summarize' }, results: [stored] });
  const writes = [];
  const { controller: c, tick } = setup({
    getFeedback: async () => clone(server),
    addFeedbackResult: async (id, body) => {
      writes.push({ id, body });
      server = { ...server, revision: server.revision + 1, results: [stored, { id: 'r2', ...values }] };
      return clone(server);
    },
    updateFeedbackResult: async () => { writes.push('update'); },
    deleteFeedbackResult: async () => { writes.push('delete'); },
  });
  await c.open(1);
  c.setResultDraft({ id: null, values });
  assert.equal(await c.addResult(values), null);
  assert.equal(await c.updateResult(stored.id, values, values), null);
  assert.equal(await c.deleteResult(stored.id, values), null);
  await c.saveAndClose();
  assert.deepEqual(writes, []);
  assert.equal(c.getSnapshot().open, true);
  assert.deepEqual(c.getSnapshot().resultDraft.values, values);

  server = { ...server, revision: 2, ai: { status: 'idle' } };
  await tick();
  assert.deepEqual(c.getSnapshot().resultDraft.values, values);
  assert.ok(await c.addResult(values));
  assert.equal(c.getSnapshot().resultDraft, null);
  server = { ...server, revision: 4, ai: { status: 'pending', kind: 'ask' } };
  await c.refresh();
  assert.ok(await c.addResult(values));
  assert.deepEqual(writes, [{ id: 1, body: { revision: 2, ...values } }, { id: 1, body: { revision: 4, ...values } }]);
  c.unmount();
});

test('resumed pending poll preserves local drafts and the entire evidence/task DTO', async () => {
  const summary = { correctionPoints: [{ sourceQuotes: [{ source: 'turn', turnId: 'a', quote: '옆으로' }] }], practiceMethods: [{ proposal: true }] };
  let calls = 0;
  const record = dto({ turns: [turn('a')], ai: { status: 'pending', kind: 'summarize' } });
  const { controller: c, tick, timers } = setup({ getFeedback: async () => {
    calls += 1;
    return clone(calls === 1 ? record : { ...record, revision: 2, summary, summarySourceHash: 'new', taskBinding: { sourceHash: 'old', taskId: 3 }, ai: { status: 'idle' } });
  } });
  await c.open(1);
  c.setInputDraft({ original: '작성 중 수정' }); c.setAnswerDraft('a', '아직 제출하지 않은 답');
  await tick();
  assert.equal(c.getSnapshot().inputDraft.original, '작성 중 수정');
  assert.equal(c.getSnapshot().answerDrafts.a, '아직 제출하지 않은 답');
  assert.deepEqual(c.getSnapshot().record.summary, summary);
  assert.equal(c.getSnapshot().record.summarySourceHash, 'new');
  assert.equal(c.getSnapshot().record.taskBinding.sourceHash, 'old');
  assert.equal(timers.size, 0);
  c.unmount();
});

test('late GET for another record is aborted and cannot replace the active record', async () => {
  const old = deferred(); let oldSignal;
  const { controller: c } = setup({ getFeedback: async (id, options) => {
    if (id === 1) { oldSignal = options.signal; return old.promise; }
    return dto({ id: 2, original: '두 번째 기록' });
  } });
  const pending = c.open(1);
  await c.open(2);
  assert.equal(oldSignal.aborted, true);
  old.resolve(dto({ original: '늦은 첫 기록', revision: 99 })); await pending;
  assert.equal(c.getSnapshot().record.id, 2);
  assert.equal(c.getSnapshot().inputDraft.original, '두 번째 기록');
  c.unmount();
});

test('mutation fences an in-flight poll even when the late response has a higher revision', async () => {
  const late = deferred(); let reads = 0, signal;
  const { controller: c, tick } = setup({
    getFeedback: async (id, options) => { reads += 1; if (reads === 2) { signal = options.signal; return late.promise; } return dto({ ai: { status: 'pending', kind: 'ask' } }); },
    patchFeedback: async (id, body) => dto({ ...body, id, revision: 2 }),
  });
  await c.open(1); await tick();
  c.setInputDraft({ original: '변경된 원문' }); await c.save();
  assert.equal(signal.aborted, true);
  late.resolve(dto({ revision: 100, original: '늦은 결과' })); await settle();
  assert.equal(c.getSnapshot().record.revision, 2);
  assert.equal(c.getSnapshot().record.original, '변경된 원문');
  c.unmount();
});

test('same-tick double save is locked and text typed during the save remains dirty', async () => {
  const pending = deferred(); let creates = 0, patchBody;
  const { controller: c } = setup({
    createFeedback: async () => { creates += 1; return pending.promise; },
    patchFeedback: async (id, body) => { patchBody = body; return dto({ ...body, revision: 2 }); },
  });
  await c.open(); c.setInputDraft({ original: '첫 입력' });
  const first = c.saveAndClose(); const ignored = c.save();
  c.setInputDraft({ original: '저장 중 추가 입력' });
  pending.resolve(dto({ original: '첫 입력' })); await first;
  assert.equal(await ignored, null); assert.equal(creates, 1);
  assert.equal(c.getSnapshot().inputDraft.original, '저장 중 추가 입력');
  assert.equal(c.getSnapshot().inputDirty, true); assert.equal(c.getSnapshot().open, true);
  await c.save();
  assert.equal(patchBody.original, '저장 중 추가 입력');
  assert.equal(patchBody.revision, 1);
  assert.equal(c.getSnapshot().inputDirty, false);
  c.unmount();
});

test('409 preserves drafts, blocks replay, and explicit reload adopts revision without overwriting edits', async () => {
  let server = dto({ turns: [turn('a')] }); let writes = 0;
  const { controller: c } = setup({
    getFeedback: async () => clone(server),
    patchFeedback: async () => { writes += 1; throw Object.assign(new Error('동시 수정'), { status: 409 }); },
  });
  await c.open(1); c.setInputDraft({ technique: '미저장 기술' }); c.setAnswerDraft('a', '미저장 답');
  await c.save();
  assert.equal(c.getSnapshot().conflict, true);
  assert.equal(c.getSnapshot().record.revision, 1);
  assert.equal(c.getSnapshot().answerDrafts.a, '미저장 답');
  await c.retry(); await c.save(); assert.equal(writes, 1);
  server = dto({ revision: 7, technique: '다른 창의 기술', turns: [turn('a')] });
  await c.reloadConflict();
  assert.equal(c.getSnapshot().conflict, false);
  assert.equal(c.getSnapshot().record.revision, 7);
  assert.equal(c.getSnapshot().inputDraft.technique, '미저장 기술');
  assert.equal(c.getSnapshot().answerDrafts.a, '미저장 답');
  c.unmount();
});

test('previous question persists the current draft first and moves with the returned revision', async () => {
  let server = dto({ turns: [turn('a', '기존 답'), turn('b')], cursor: 1 }); const calls = [];
  const { controller: c } = setup({
    getFeedback: async () => clone(server),
    patchFeedback: async (id, body) => {
      calls.push(clone(body)); assert.equal(body.revision, server.revision);
      if ('draftAnswer' in body) server.turns[server.cursor].draftAnswer = body.draftAnswer;
      if ('cursor' in body) server.cursor = body.cursor;
      server.revision += 1; return clone(server);
    },
  });
  await c.open(1); c.setAnswerDraft('b', '돌아와서 이어쓸 답'); await c.previous();
  assert.deepEqual(calls, [{ revision: 1, draftAnswer: '돌아와서 이어쓸 답' }, { revision: 2, cursor: 0 }]);
  assert.equal(c.getSnapshot().record.turns[1].draftAnswer, '돌아와서 이어쓸 답');
  assert.equal(c.getSnapshot().record.cursor, 0);
  c.unmount();
});

test('unchanged earlier answer reuses existing next turn without generating a question', async () => {
  let asked = 0;
  const before = dto({ turns: [turn('a', '같은 답'), turn('b', '후속 답'), turn('c')], cursor: 0 });
  const { controller: c } = setup({
    getFeedback: async () => clone(before),
    answerFeedback: async (id, body) => { assert.equal(body.answer, '같은 답'); return { ...before, revision: 2, cursor: 1 }; },
    askFeedback: async () => { asked += 1; },
  });
  await c.open(1); await c.answerAndContinue();
  assert.equal(c.getSnapshot().record.cursor, 1); assert.equal(asked, 0);
  assert.equal(c.getSnapshot().record.turns[1].answer, '후속 답');
  c.unmount();
});

test('changed answer uses backend archived branch and then starts a new pending generation', async () => {
  const before = dto({ turns: [turn('a', '옛 답'), turn('b', '옛 후속')], summary: { title: '옛 카드' } });
  const saved = dto({ revision: 3, turns: [turn('a', '수정 답')], archives: [{ id: 'archive', reason: '수정 전', turns: before.turns }], summary: before.summary, summaryStale: true });
  const { controller: c, timers } = setup({
    getFeedback: async () => clone(before),
    patchFeedback: async () => ({ ...before, revision: 2, turns: [{ ...before.turns[0], draftAnswer: '수정 답' }, before.turns[1]] }),
    answerFeedback: async () => clone(saved),
    askFeedback: async (id, body) => { assert.equal(body.revision, 3); return { ...saved, revision: 4, ai: { status: 'pending', kind: 'ask' } }; },
  });
  await c.open(1); c.setAnswerDraft('a', '수정 답'); await c.answerAndContinue();
  assert.equal(c.getSnapshot().record.archives[0].turns[1].answer, '옛 후속');
  assert.equal(c.getSnapshot().record.turns.length, 1);
  assert.equal(c.getSnapshot().record.summaryStale, true); assert.equal(timers.size, 1);
  c.unmount(); assert.equal(timers.size, 0);
});

test('generation network failure keeps the saved answer and retries GET, never submits it twice', async () => {
  let answers = 0, asks = 0, reads = 0;
  const answered = dto({ revision: 3, turns: [turn('a', '보존할 답')] });
  const { controller: c } = setup({
    getFeedback: async () => { reads += 1; return reads === 1 ? dto({ turns: [turn('a')] }) : clone(answered); },
    patchFeedback: async () => dto({ revision: 2, turns: [{ ...turn('a'), draftAnswer: '보존할 답' }] }),
    answerFeedback: async () => { answers += 1; return clone(answered); },
    askFeedback: async () => { asks += 1; throw new Error('network disconnected'); },
  });
  await c.open(1); c.setAnswerDraft('a', '보존할 답'); await c.answerAndContinue();
  assert.equal(c.getSnapshot().record.turns[0].answer, '보존할 답');
  assert.equal(c.getSnapshot().uncertainWrite, true);
  await c.retry();
  assert.equal(c.getSnapshot().uncertainWrite, false);
  assert.equal(c.getSnapshot().error, '');
  assert.equal(answers, 1); assert.equal(asks, 1); assert.equal(reads, 2);
  c.unmount();
});

test('lost create response never retries a non-idempotent create automatically', async () => {
  let creates = 0;
  const { controller: c } = setup({ createFeedback: async () => { creates += 1; throw new Error('lost acknowledgement'); } });
  await c.open(); c.setInputDraft({ original: '보존할 원문' }); await c.save(); await c.retry(); await c.save();
  assert.equal(creates, 1); assert.equal(c.getSnapshot().uncertainWrite, true);
  assert.equal(c.getSnapshot().inputDraft.original, '보존할 원문');
  c.unmount();
});

test('unmount cancels poll and ignores late GET; remount safely resumes pending status', async () => {
  const pending = deferred(); let reads = 0, signal;
  const record = dto({ ai: { status: 'pending', kind: 'ask' } });
  const { controller: c, tick, timers } = setup({ getFeedback: async (id, options) => {
    reads += 1; if (reads === 2) { signal = options.signal; return pending.promise; } return clone(record);
  } });
  await c.open(1); await tick(); c.unmount();
  assert.equal(signal.aborted, true); assert.equal(timers.size, 0);
  pending.resolve(dto({ revision: 99, original: 'unmounted result' })); await settle();
  assert.equal(c.getSnapshot().record.revision, 1);
  c.mount(); await settle(); assert.equal(timers.size, 1); c.unmount();
});

test('poll network errors keep persisted pending state and later refresh completes the summary', async () => {
  let reads = 0;
  const { controller: c, tick } = setup({ getFeedback: async () => {
    reads += 1;
    if (reads === 2) throw new Error('offline');
    return reads === 1 ? dto({ ai: { status: 'pending', kind: 'summarize' } }) : dto({ revision: 2, summary: { title: '통합 정리' } });
  } });
  await c.open(1); await tick();
  assert.equal(c.getSnapshot().pollError, 'offline');
  assert.equal(c.getSnapshot().record.ai.status, 'pending');
  await tick(); assert.equal(c.getSnapshot().record.summary.title, '통합 정리');
  assert.equal(c.getSnapshot().pollError, ''); c.unmount();
});

test('failed summary retries its actual kind and preserves unsent answer as draft only', async () => {
  let server = dto({ turns: [turn('a', '제출 답')], ai: { status: 'failed', kind: 'summarize', error: '실패' } });
  let summarized = 0, asked = 0;
  const { controller: c } = setup({
    getFeedback: async () => clone(server),
    patchFeedback: async (id, body) => {
      assert.equal(body.draftAnswer, '아직 제출 안 함');
      server.turns[0].draftAnswer = body.draftAnswer;
      server.revision += 1; return clone(server);
    },
    summarizeFeedback: async (id, body) => {
      summarized += 1; assert.equal(body.revision, 2);
      assert.equal(server.turns[0].answer, '제출 답');
      return { ...server, revision: 3, ai: { status: 'pending', kind: 'summarize' } };
    },
    askFeedback: async () => { asked += 1; },
  });
  await c.open(1); c.setAnswerDraft('a', '아직 제출 안 함'); await c.retry();
  assert.equal(summarized, 1); assert.equal(asked, 0);
  assert.equal(c.getSnapshot().answerDrafts.a, '아직 제출 안 함');
  assert.equal(c.getSnapshot().record.ai.status, 'pending'); c.unmount();
});

test('task response adopts feedback DTO but a task conflict is never replayed automatically', async () => {
  let called = 0, bodyReceived;
  const assigned = dto({ revision: 2, summary: { title: '요약' }, summarySourceHash: 'current', taskBinding: { sourceHash: 'current', taskId: 8 } });
  const { controller: c } = setup({
    getFeedback: async () => dto({ summarySourceHash: 'current', summary: { title: '요약' } }),
    setFeedbackTask: async (id, body) => {
      called += 1; bodyReceived = body;
      if (called === 2) throw Object.assign(new Error('현재 과제가 바뀜'), { status: 409 });
      return { feedback: clone(assigned), task: { id: 8, nodeId: 4, projectId: 2, open: true }, reused: false };
    },
  });
  await c.open(1); const result = await c.assignTask({ expectedTaskId: null, replace: false });
  assert.deepEqual(bodyReceived, { revision: 1, expectedTaskId: null, replace: false });
  assert.equal(result.task.id, 8); assert.equal(c.getSnapshot().record.taskBinding.taskId, 8);
  await c.assignTask({ expectedTaskId: 8, replace: true }); await c.retry();
  assert.equal(c.getSnapshot().conflict, true); assert.equal(called, 2); c.unmount();
});

test('unmount during a mutation preserves edits and remount reads authoritative state', async () => {
  let server = dto(); const pending = deferred();
  const { controller: c } = setup({
    getFeedback: async () => clone(server),
    patchFeedback: async () => pending.promise,
  });
  await c.open(1); c.setInputDraft({ original: '작성한 변경' }); const saving = c.save();
  c.unmount(); server = dto({ revision: 2, original: '서버에 반영된 변경' });
  pending.resolve(clone(server)); await saving;
  assert.equal(c.getSnapshot().record.revision, 1);
  c.mount(); await settle();
  assert.equal(c.getSnapshot().record.revision, 2);
  assert.equal(c.getSnapshot().inputDraft.original, '작성한 변경');
  assert.equal(c.getSnapshot().inputDirty, true); c.unmount();
});

test('an initial load cannot be interrupted by a save and remount restarts an aborted load', async () => {
  let reads = 0; const pending = deferred();
  const { controller: c } = setup({ getFeedback: async () => {
    reads += 1; return reads === 1 ? pending.promise : dto({ revision: 3 });
  } });
  const loading = c.open(1); assert.equal(await c.save(), null);
  c.unmount(); c.mount(); await settle();
  assert.equal(c.getSnapshot().record.revision, 3);
  pending.resolve(dto({ revision: 1 })); await loading;
  assert.equal(c.getSnapshot().record.revision, 3); c.unmount();
});

test('editing during previous-navigation is preserved and later save persists every active dirty draft', async () => {
  let server = dto({ turns: [turn('a', '제출답'), turn('b')], cursor: 1 });
  const firstPatch = deferred(); let patches = 0;
  const { controller: c } = setup({
    getFeedback: async () => clone(server),
    patchFeedback: async (id, body) => {
      patches += 1;
      assert.equal(body.revision, server.revision);
      if ('cursor' in body) server.cursor = body.cursor;
      if ('draftAnswer' in body) server.turns[server.cursor].draftAnswer = body.draftAnswer;
      server.revision += 1;
      return patches === 1 ? firstPatch.promise : clone(server);
    },
  });
  await c.open(1); c.setAnswerDraft('b', '처음 임시답'); const moving = c.previous();
  c.setAnswerDraft('b', '이동 중 추가 작성');
  firstPatch.resolve(clone(server)); await moving;
  assert.equal(c.getSnapshot().record.cursor, 0);
  assert.equal(c.getSnapshot().dirtyAnswers.b, true);
  assert.equal(c.getSnapshot().answerDrafts.b, '이동 중 추가 작성');
  await c.saveAndClose();
  assert.equal(server.turns[1].draftAnswer, '이동 중 추가 작성');
  assert.equal(server.cursor, 0);
  assert.equal(c.getSnapshot().open, false); c.unmount();
});

test('unmount during create preserves uncertain state and prevents a duplicate on remount', async () => {
  const pending = deferred(); let creates = 0;
  const { controller: c } = setup({ createFeedback: async () => { creates += 1; return pending.promise; } });
  await c.open(); c.setInputDraft({ original: '새 원문' }); const saving = c.save();
  assert.equal(await c.open(2), null, 'cannot switch records during a write');
  c.unmount(); c.mount();
  assert.equal(c.getSnapshot().uncertainWrite, true);
  assert.equal(await c.save(), null);
  pending.resolve(dto({ original: '새 원문' })); await saving;
  assert.equal(c.getSnapshot().record, null);
  assert.equal(c.getSnapshot().inputDraft.original, '새 원문');
  assert.equal(creates, 1); c.unmount();
});

test('latest later-question draft is archived before earlier-answer replacement and survives reopen', async () => {
  const store = memoryStore(dto({ turns: [turn('a', '옛 답'), turn('b')], cursor: 1 }));
  const delayed = deferred(); const normalPatch = store.api.patchFeedback; let patchCount = 0;
  store.api.patchFeedback = async (id, body) => {
    const result = await normalPatch(id, body); patchCount += 1;
    return patchCount === 1 ? delayed.promise : result;
  };
  store.api.answerFeedback = async (id, body) => {
    assert.equal(body.revision, store.value.revision);
    assert.equal(store.value.cursor, 0);
    assert.equal(store.value.turns[1].draftAnswer, '이동 중 더 작성한 최신 초안');
    store.value.archives = [{ id: 'old-path', reason: '답변 변경', turns: clone(store.value.turns) }];
    store.value.turns = [{ ...store.value.turns[0], answer: body.answer, draftAnswer: body.answer }];
    store.value.revision += 1; return clone(store.value);
  };
  store.api.askFeedback = async () => { store.value.ai = { status: 'pending', kind: 'ask' }; store.value.revision += 1; return clone(store.value); };
  const { controller: c } = setup(store.api);
  await c.open(1); c.setAnswerDraft('b', '최초 초안'); const moving = c.previous();
  c.setAnswerDraft('b', '이동 중 더 작성한 최신 초안'); await settle();
  delayed.resolve(clone(store.value)); await moving;
  c.setAnswerDraft('a', '수정 답'); await c.answerAndContinue();
  assert.equal(c.getSnapshot().record.archives[0].turns[1].draftAnswer, '이동 중 더 작성한 최신 초안');
  await c.saveAndClose(); assert.equal(c.getSnapshot().open, false);
  await c.open(1); assert.equal(c.getSnapshot().record.archives[0].turns[1].draftAnswer, '이동 중 더 작성한 최신 초안'); c.unmount();
});

for (const operation of ['ask', 'summarize']) {
  test(`${operation} refuses outdated input when text changes during its save`, async () => {
    const store = memoryStore(dto()); const pending = deferred(); let generated = 0, writes = 0;
    const normalPatch = store.api.patchFeedback;
    store.api.patchFeedback = async (id, body) => {
      const saved = await normalPatch(id, body); writes += 1; return writes === 1 ? pending.promise : saved;
    };
    store.api[operation === 'ask' ? 'askFeedback' : 'summarizeFeedback'] = async (id, body) => {
      generated += 1; assert.equal(store.value.original, '저장 중 더 작성한 원문');
      assert.equal(body.revision, store.value.revision);
      store.value.ai = { status: 'pending', kind: operation }; store.value.revision += 1; return clone(store.value);
    };
    const { controller: c } = setup(store.api);
    await c.open(1); c.setInputDraft({ original: '첫 수정' }); const requesting = c[operation]();
    await settle(); c.setInputDraft({ original: '저장 중 더 작성한 원문' }); pending.resolve(clone(store.value)); await requesting;
    assert.equal(generated, 0); assert.equal(c.getSnapshot().inputDirty, true);
    assert.match(c.getSnapshot().error, /최신/); assert.equal(c.getSnapshot().uncertainWrite, false);
    await c[operation](); assert.equal(generated, 1); assert.equal(c.getSnapshot().inputDirty, false); c.unmount();
  });
}

test('draft edits during all-draft persistence stop summary generation until explicitly saved again', async () => {
  const store = memoryStore(dto({ turns: [turn('a'), turn('b')] })); const first = deferred(); let patches = 0, summaries = 0;
  const normalPatch = store.api.patchFeedback;
  store.api.patchFeedback = async (id, body) => { const result = await normalPatch(id, body); patches += 1; return patches === 1 ? first.promise : result; };
  store.api.summarizeFeedback = async () => { summaries += 1; return clone(store.value); };
  const { controller: c } = setup(store.api);
  await c.open(1); c.setAnswerDraft('a', '초안 A'); c.setAnswerDraft('b', '초안 B'); const summarizing = c.summarize();
  await settle(); c.setAnswerDraft('a', '저장 중 A 최신수정'); first.resolve(clone(store.value)); await summarizing;
  assert.equal(summaries, 0); assert.equal(c.getSnapshot().answerDrafts.a, '저장 중 A 최신수정');
  assert.equal(c.getSnapshot().dirtyAnswers.a, true); assert.match(c.getSnapshot().error, /최신/);
  await c.summarize(); assert.equal(summaries, 1); assert.equal(store.value.turns[0].draftAnswer, '저장 중 A 최신수정'); c.unmount();
});

test('editing during answer submission stops a follow-up question and requires resubmission', async () => {
  const store = memoryStore(dto({ turns: [turn('a')] })); const first = deferred(); let answers = 0, asks = 0;
  store.api.answerFeedback = async (id, body) => {
    answers += 1; store.value.turns[0] = { ...store.value.turns[0], answer: body.answer, draftAnswer: body.answer };
    store.value.revision += 1; return answers === 1 ? first.promise : clone(store.value);
  };
  store.api.askFeedback = async () => { asks += 1; assert.equal(store.value.turns[0].answer, '답변 중 추가 수정'); return clone(store.value); };
  const { controller: c } = setup(store.api);
  await c.open(1); c.setAnswerDraft('a', '첫 답변'); const answering = c.answerAndContinue();
  await settle(); c.setAnswerDraft('a', '답변 중 추가 수정'); first.resolve(clone(store.value)); await answering;
  assert.equal(asks, 0); assert.equal(c.getSnapshot().dirtyAnswers.a, true); assert.match(c.getSnapshot().error, /최신/);
  await c.answerAndContinue(); assert.equal(answers, 2); assert.equal(asks, 1); c.unmount();
});

test('409 reload merges untouched remote fields and PATCH sends only locally changed fields', async () => {
  const store = memoryStore(dto({ technique: '이전 기술' })); const normalPatch = store.api.patchFeedback; let writes = 0;
  store.api.patchFeedback = async (id, body) => {
    writes += 1;
    if (writes === 1) { store.value.technique = '다른 창의 새 기술'; store.value.revision += 1; throw Object.assign(new Error('충돌'), { status: 409 }); }
    return normalPatch(id, body);
  };
  const { controller: c } = setup(store.api);
  await c.open(1); c.setInputDraft({ original: '이 창의 새 원문' }); await c.save(); await c.reloadConflict();
  assert.equal(c.getSnapshot().inputDraft.technique, '다른 창의 새 기술');
  assert.deepEqual(c.getSnapshot().inputConflicts, {});
  await c.save();
  assert.deepEqual(store.patches[0], { revision: 2, original: '이 창의 새 원문' });
  assert.equal(store.value.technique, '다른 창의 새 기술'); c.unmount();
});

test('same-field remote changes require explicit local/server resolution before any new write', async () => {
  const store = memoryStore(dto()); const { controller: c } = setup(store.api);
  await c.open(1); c.setInputDraft({ original: '로컬 변경' }); store.value.original = '원격 변경'; store.value.revision += 1;
  await c.reloadConflict();
  assert.deepEqual(c.getSnapshot().inputConflicts.original, { base: '원문', local: '로컬 변경', server: '원격 변경' });
  await c.save(); assert.equal(store.patches.length, 0);
  assert.equal(c.resolveInputConflict('original', 'local'), true); await c.save();
  assert.equal(store.value.original, '로컬 변경');
  c.setInputDraft({ original: '새 로컬 변경' }); store.value.original = '새 원격 변경'; store.value.revision += 1; await c.reloadConflict();
  c.resolveInputConflict('original', 'server'); await c.save();
  assert.equal(c.getSnapshot().inputDraft.original, '새 원격 변경'); assert.equal(store.patches.length, 1); c.unmount();
});

test('same-turn submitted/draft remote changes require explicit resolution and preserve local text', async () => {
  const store = memoryStore(dto({ turns: [turn('a', '기존 답')] })); const { controller: c } = setup(store.api);
  await c.open(1); c.setAnswerDraft('a', '로컬 초안');
  store.value.turns[0] = turn('a', '원격 제출 답'); store.value.revision += 1; await c.reloadConflict();
  assert.equal(c.getSnapshot().answerConflicts.a.server.answer, '원격 제출 답');
  assert.equal(c.getSnapshot().answerDrafts.a, '로컬 초안'); await c.save(); assert.equal(store.patches.length, 0);
  assert.equal(c.resolveAnswerConflict('a', 'local'), true); await c.save();
  assert.equal(store.value.turns[0].draftAnswer, '로컬 초안'); assert.equal(store.value.turns[0].answer, '원격 제출 답'); c.unmount();
});

test('a remotely archived dirty turn becomes an explicit orphan and can be recovered into an active question', async () => {
  const store = memoryStore(dto({ turns: [turn('a', '기존'), turn('b')], cursor: 1 })); const { controller: c } = setup(store.api);
  await c.open(1); c.setAnswerDraft('b', '잃으면 안 되는 초안');
  store.value.archives = [{ id: 'old', turns: clone(store.value.turns) }]; store.value.turns = [turn('c')]; store.value.cursor = 0; store.value.revision += 1;
  await c.reloadConflict();
  assert.equal(c.getSnapshot().orphanDrafts.b.value, '잃으면 안 되는 초안');
  assert.equal(c.getSnapshot().answerConflicts.b.removed, true);
  assert.equal(c.close(), false); assert.equal(await c.open(2), null); assert.equal(await c.saveAndClose(), null);
  assert.equal(c.resolveAnswerConflict('b', 'local'), false);
  assert.equal(c.recoverAnswerDraft('b', 'c'), true); await c.saveAndClose();
  assert.equal(store.value.turns[0].draftAnswer, '잃으면 안 되는 초안'); assert.equal(c.getSnapshot().open, false);
  await c.open(1); assert.equal(c.getSnapshot().answerDrafts.c, '잃으면 안 되는 초안'); c.unmount();
});

test('same-ID reopen preserves drafts; record replacement requires saved or explicitly discarded edits', async () => {
  const store = memoryStore(dto()); store.api.getFeedback = async id => ({ ...clone(store.value), id });
  const { controller: c } = setup(store.api);
  await c.open(1); c.setInputDraft({ original: '유지할 로컬 원문' });
  await c.open(1); assert.equal(c.getSnapshot().inputDraft.original, '유지할 로컬 원문');
  assert.equal(await c.open(2), null); assert.equal(c.getSnapshot().record.id, 1); assert.equal(c.close(), false);
  await c.discardAndOpen(2); assert.equal(c.getSnapshot().record.id, 2); assert.equal(c.getSnapshot().inputDirty, false);
  c.setInputDraft({ original: '저장 후 전환' }); await c.saveAndOpen(3);
  assert.equal(c.getSnapshot().record.id, 3); assert.equal(store.value.original, '저장 후 전환'); c.unmount();
});

test('assigning a task is blocked by unsaved input, local drafts and saved-but-unsubmitted drafts', async () => {
  const store = memoryStore(dto({ summary: { title: '저장된 요약' }, turns: [turn('a', '제출 답')] })); let tasks = 0;
  store.api.setFeedbackTask = async () => { tasks += 1; return { feedback: clone(store.value), task: { id: 8 } }; };
  const { controller: c } = setup(store.api);
  await c.open(1); c.setInputDraft({ original: '미저장 원문' }); await c.assignTask({ expectedTaskId: null, replace: false });
  assert.equal(tasks, 0); c.setInputDraft({ original: '원문' }); c.setAnswerDraft('a', '아직 제출 안 한 답');
  await c.assignTask({ expectedTaskId: null, replace: false }); assert.equal(tasks, 0);
  await c.save(); await c.assignTask({ expectedTaskId: null, replace: false }); assert.equal(tasks, 0);
  assert.match(c.getSnapshot().error, /제출/); c.unmount();
});

test('task assignment requires a valid current summary and completed AI job', async () => {
  for (const record of [dto(), dto({ summary: { title: '이전 카드' }, summaryStale: true }), dto({ summary: { title: '이전 카드' }, ai: { status: 'pending', kind: 'summarize' } })]) {
    let tasks = 0;
    const { controller: c } = setup({ getFeedback: async () => record, setFeedbackTask: async () => { tasks += 1; } });
    await c.open(1); await c.assignTask({ expectedTaskId: null, replace: false });
    assert.equal(tasks, 0); assert.match(c.getSnapshot().error, /최신 카드/); c.unmount();
  }
});

test('a failed existing-record GET cannot turn a later save into a new create', async () => {
  let created = 0;
  const { controller: c } = setup({
    getFeedback: async () => { throw new Error('read offline'); },
    createFeedback: async () => { created += 1; return dto(); },
  });
  await c.open(9); c.setInputDraft({ original: '작성한 초안' }); await c.save();
  assert.equal(created, 0); assert.equal(c.getSnapshot().inputDraft.original, '작성한 초안');
  assert.match(c.getSnapshot().error, /먼저 불러/); c.unmount();
});
