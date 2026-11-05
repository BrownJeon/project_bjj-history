import { todayKst } from './feedbackPeriod.js';
import { feedbackTechniqueName, situationSelectionOf } from './feedbackInput.js';

const fields = ['date', 'situation', 'situationSelection', 'technique', 'original', 'clipIds'];
const blankInput = () => ({ date: todayKst(), situation: '', situationSelection: { options: [], other: '' }, technique: '', original: '', clipIds: [] });
const inputOf = record => ({
  date: record.date ?? '', situation: record.situation ?? '', situationSelection: situationSelectionOf(record),
  technique: record.technique ?? '', original: record.original ?? '', clipIds: [...(record.clipIds || [])],
});
function toInputBody({ situationSelection, technique, ...body }) {
  if (situationSelection?.options != null) {
    body.situationOptions = situationSelection.options;
    body.situationOther = situationSelection.other;
  }
  if (typeof technique === 'string') body.technique = technique;
  else if (technique) {
    const { id } = technique;
    if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) throw localError('기술트리에서 등록 기술을 다시 선택해 주세요.');
    body.techniqueId = id;
  }
  return body;
}
const aborted = error => error?.name === 'AbortError' || error?.code === 'ERR_CANCELED';
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const copy = value => value == null ? value : structuredClone(value);
const turnState = turn => turn ? ({ answer: turn.answer, draftAnswer: turn.draftAnswer ?? turn.answer ?? '', skipped: Boolean(turn.skipped) }) : null;
const localError = message => Object.assign(new Error(message), { status: 400 });

export function isFeedbackResultWriteLocked(record) {
  return record?.ai?.status === 'pending' && record.ai.kind === 'summarize';
}

/**
 * API/state only. The UI owns presentation and confirmation; the server owns turns,
 * archived branches, summary validity, evidence metadata and optimistic revision.
 * API injection keeps race/cancellation regression tests independent of React/HTTP.
 */
export function createFeedbackRecordController({ api, pollMs = 2000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let state = {
    open: false, requestedId: null, record: null, inputDraft: blankInput(), inputDirty: false,
    inputDirtyFields: {}, inputConflicts: {}, answerDrafts: {}, dirtyAnswers: {}, answerConflicts: {}, orphanDrafts: {}, loading: false, busy: false,
    error: '', conflict: false, uncertainWrite: false, pollError: '', resultDraft: null,
  };
  const listeners = new Set();
  let epoch = 0;
  let readSequence = 0;
  let activeId = null;
  let mounted = true;
  let timer = null;
  let readAbort = null;
  let lock = null;
  let inputBases = {};
  let answerBases = {};
  let draftQuestions = {};
  let lastFailure = null;
  let starSequence = 0;
  const starWrites = new Map();

  function publish(patch) {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  }
  function stopReads() {
    readSequence += 1;
    if (timer !== null) clearTimer(timer);
    timer = null;
    readAbort?.abort(); readAbort = null;
  }
  function current(ticket) { return mounted && ticket === epoch; }
  function schedulePoll() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (!mounted || !state.open || !activeId || lock || (state.record?.ai?.status !== 'pending' && !state.uncertainWrite)) return;
    timer = setTimer(() => { timer = null; readRecord({ polling: true }); }, pollMs);
  }
  function hasConflicts() { return Object.keys(state.inputConflicts).length > 0 || Object.keys(state.answerConflicts).length > 0; }
  function hasDirtyAnswers() { return Object.keys(state.dirtyAnswers).length > 0; }
  function hasUnsaved() { return state.inputDirty || hasDirtyAnswers() || hasConflicts() || Object.keys(state.orphanDrafts).length > 0 || state.resultDraft !== null; }
  function ensureReadyForGeneration() {
    if (hasUnsaved()) throw localError('저장 중 내용이 바뀌었거나 확인할 충돌이 있습니다. 최신 내용을 저장·확인한 뒤 다시 실행해 주세요.');
  }
  function accept(record, { savedInput, savedAnswer, observedStars = lock?.starSequence ?? starSequence } = {}) {
    if (!record || String(record.id) !== String(activeId)) return false;
    if (state.record?.id === record.id && Number(record.revision) < Number(state.record.revision)) return false;
    const star = starWrites.get(String(record.id));
    if (star && observedStars < star.sequence) record = { ...record, starred: star.starred };
    const remoteInput = inputOf(record), inputDraft = { ...state.inputDraft };
    const inputDirtyFields = { ...state.inputDirtyFields }, inputConflicts = { ...state.inputConflicts };
    for (const key of fields) {
      const ourSave = savedInput && Object.prototype.hasOwnProperty.call(savedInput, key);
      if (ourSave) {
        inputBases[key] = copy(remoteInput[key]);
        delete inputConflicts[key];
        if (equal(inputDraft[key], savedInput[key])) delete inputDirtyFields[key];
        else inputDirtyFields[key] = true;
      } else if (inputDirtyFields[key]) {
        const serverChanged = !equal(remoteInput[key], inputBases[key]);
        const serverSavedTechnique = key === 'technique' && serverChanged && feedbackTechniqueName(inputDraft[key]) === remoteInput[key];
        if (equal(inputDraft[key], remoteInput[key]) || serverSavedTechnique) {
          delete inputDirtyFields[key]; delete inputConflicts[key]; delete inputBases[key];
        } else if (serverChanged) {
          inputConflicts[key] = { base: copy(inputBases[key]), local: copy(inputDraft[key]), server: copy(remoteInput[key]) };
        } else delete inputConflicts[key];
      }
      if (!inputDirtyFields[key]) inputDraft[key] = copy(remoteInput[key]);
    }
    const dirtyAnswers = { ...state.dirtyAnswers }, answerConflicts = { ...state.answerConflicts }, orphanDrafts = { ...state.orphanDrafts };
    const drafts = { ...state.answerDrafts };
    for (const id of Object.keys(dirtyAnswers)) {
      const turn = (record.turns || []).find(item => item.id === id);
      const remote = turnState(turn), base = answerBases[id];
      if (!turn) {
        orphanDrafts[id] = { question: draftQuestions[id] || '', value: drafts[id], base: copy(base) };
        answerConflicts[id] = { base: copy(base), local: drafts[id], server: null, removed: true };
      } else if (savedAnswer?.id === id) {
        answerBases[id] = copy(remote); delete answerConflicts[id]; delete orphanDrafts[id];
        if (drafts[id] === savedAnswer.value) delete dirtyAnswers[id];
      } else if (!equal(remote, base)) {
        if (remote.answer === base?.answer && remote.skipped === base?.skipped && remote.draftAnswer === drafts[id]) {
          delete dirtyAnswers[id]; delete answerConflicts[id]; delete answerBases[id];
        } else answerConflicts[id] = { base: copy(base), local: drafts[id], server: copy(remote), removed: false };
      } else { delete answerConflicts[id]; delete orphanDrafts[id]; }
    }
    // A user may type back to the old value while a save is in flight, clearing
    // dirty locally; the acknowledged write must not erase that later edit.
    if (savedAnswer && !dirtyAnswers[savedAnswer.id] && drafts[savedAnswer.id] !== savedAnswer.value) {
      const remote = (record.turns || []).find(turn => turn.id === savedAnswer.id);
      if (remote) { dirtyAnswers[savedAnswer.id] = true; answerBases[savedAnswer.id] = turnState(remote); }
    }
    for (const turn of record.turns || []) {
      draftQuestions[turn.id] = turn.question;
      if (!dirtyAnswers[turn.id]) drafts[turn.id] = turn.draftAnswer ?? turn.answer ?? '';
    }
    publish({
      record, requestedId: record.id, inputDirty: Object.keys(inputDirtyFields).length > 0, inputDraft, inputDirtyFields, inputConflicts,
      answerDrafts: drafts, dirtyAnswers, answerConflicts, orphanDrafts, pollError: '',
    });
    return true;
  }

  async function readRecord({ polling = false, resolveConflict = false } = {}) {
    if (!mounted || activeId == null || lock) return null;
    stopReads();
    const ticket = epoch, sequence = ++readSequence, id = activeId, observedStars = starSequence;
    const abort = new AbortController(); readAbort = abort;
    if (!polling) publish({ loading: true, error: '' });
    try {
      const record = await api.getFeedback(id, { signal: abort.signal });
      if (!current(ticket) || sequence !== readSequence || String(activeId) !== String(id)) return null;
      const recoveredUncertainWrite = state.uncertainWrite;
      if (!accept(record, { observedStars })) { publish({ loading: false }); return null; }
      lastFailure = null;
      publish({
        loading: false, uncertainWrite: false,
        ...(recoveredUncertainWrite ? { error: '' } : {}),
        ...(resolveConflict ? { conflict: false, error: '' } : {}),
      });
      return record;
    } catch (error) {
      if (!current(ticket) || sequence !== readSequence || aborted(error)) return null;
      publish(polling ? { pollError: error.message || '진행 상태를 불러오지 못했습니다.' } : {
        loading: false, error: error.message || '피드백을 불러오지 못했습니다.',
      });
      return null;
    } finally {
      if (current(ticket) && sequence === readSequence) { readAbort = null; schedulePoll(); }
    }
  }

  async function mutate(work, retry) {
    if (!mounted || state.loading || lock || state.conflict || state.uncertainWrite || hasConflicts()) return null;
    stopReads();
    const token = { starSequence }, ticket = epoch;
    lock = token;
    publish({ busy: true, error: '', pollError: '' });
    try {
      const result = await work(ticket);
      if (!current(ticket)) return null;
      lastFailure = null;
      return result;
    } catch (error) {
      if (!current(ticket)) return null;
      const uncertainWrite = !error.status || error.status >= 500;
      lastFailure = uncertainWrite ? null : retry || null;
      publish({
        error: uncertainWrite
          ? `${error.message || '서버 연결을 확인해 주세요.'} 저장 여부를 다시 확인하기 전에는 중복 저장하지 않습니다.`
          : error.message || '저장하지 못했습니다. 입력은 보존되어 있습니다.',
        conflict: error.status === 409, uncertainWrite,
      });
      return null;
    } finally {
      if (lock === token) {
        lock = null;
        if (current(ticket)) { publish({ busy: false }); schedulePoll(); }
      }
    }
  }

  async function persistDraft(ticket, turnId = state.record?.turns?.[state.record.cursor]?.id) {
    let record = state.record;
    const index = record?.turns?.findIndex(turn => turn.id === turnId) ?? -1;
    const turn = record?.turns?.[index];
    if (!turn || !state.dirtyAnswers[turn.id]) return record;
    if (index !== record.cursor) {
      record = await api.patchFeedback(record.id, { revision: record.revision, cursor: index });
      if (!current(ticket)) return null;
      accept(record);
    }
    const value = state.answerDrafts[turn.id] ?? '';
    const saved = await api.patchFeedback(record.id, { revision: record.revision, draftAnswer: value });
    if (current(ticket)) accept(saved, { savedAnswer: { id: turn.id, value } });
    return current(ticket) ? saved : null;
  }

  async function persistAllDrafts(ticket) {
    const originalTurnId = state.record?.turns?.[state.record.cursor]?.id;
    const ids = (state.record?.turns || []).filter(turn => state.dirtyAnswers[turn.id]).map(turn => turn.id);
    for (const id of ids) {
      await persistDraft(ticket, id);
      if (!current(ticket)) return null;
    }
    const record = state.record;
    const originalIndex = record?.turns?.findIndex(turn => turn.id === originalTurnId) ?? -1;
    if (originalIndex >= 0 && originalIndex !== record.cursor) {
      const restored = await api.patchFeedback(record.id, { revision: record.revision, cursor: originalIndex });
      if (!current(ticket)) return null;
      accept(restored);
    }
    return state.record;
  }

  async function persistInput(ticket) {
    let record = state.record;
    if (!record && activeId != null) throw localError('저장된 피드백을 먼저 불러와 주세요. 새 기록을 중복 생성하지 않습니다.');
    if (record) record = await persistAllDrafts(ticket);
    if (!current(ticket)) return null;
    if (record && !state.inputDirty) return record;
    const savedInput = record
      ? Object.fromEntries(Object.keys(state.inputDirtyFields).map(key => [key, copy(state.inputDraft[key])]))
      : copy(state.inputDraft);
    const body = toInputBody(savedInput);
    const saved = record
      ? await api.patchFeedback(record.id, { revision: record.revision, ...body })
      : await api.createFeedback(body);
    if (!current(ticket)) return null;
    activeId = saved.id;
    accept(saved, { savedInput });
    return saved;
  }

  function requireRecord() {
    if (!state.record) throw Object.assign(new Error('피드백을 먼저 저장해 주세요.'), { status: 400 });
    return state.record;
  }

  function writeResult(write, clearDraft = false) {
    if (isFeedbackResultWriteLocked(state.record)) return Promise.resolve(null);
    return mutate(async ticket => {
      const draft = state.resultDraft;
      const record = requireRecord();
      const next = await write(record);
      if (!current(ticket) || !accept(next)) return null;
      if (clearDraft && state.resultDraft === draft) publish({ resultDraft: null });
      return next;
    });
  }

  function ensureResultMatches(record, resultId, expected) {
    const stored = record.results?.find(item => item.id === resultId);
    if (!stored || (expected && !Object.entries(expected).every(([key, value]) => (stored[key] ?? '') === value))) {
      throw localError('현재 연습 결과가 바뀌었습니다. 저장된 내용을 다시 확인해 주세요.');
    }
  }

  const controller = {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    mount() {
      mounted = true;
      if (state.open && activeId) readRecord();
      else schedulePoll();
    },
    unmount() {
      const writing = Boolean(lock);
      mounted = false; epoch += 1; stopReads(); lock = null;
      // Keep drafts for a StrictMode remount or an explicit later resume.
      publish({ busy: false, loading: false, ...(writing ? {
        uncertainWrite: true, error: '저장 중 연결이 닫혔습니다. 저장 여부를 확인한 뒤 이어가 주세요.',
      } : {}) });
    },
    async open(id = null, { discardLocal = false } = {}) {
      if (lock) return null;
      if (!discardLocal && String(id) === String(activeId) && state.open) return id == null ? null : readRecord();
      if (!discardLocal && (hasUnsaved() || state.uncertainWrite)) {
        publish({ error: '작성 중인 내용을 저장하거나 명시적으로 폐기한 뒤 다른 피드백을 열어 주세요.' });
        return null;
      }
      epoch += 1; stopReads(); lock = null; activeId = id; inputBases = {}; answerBases = {}; draftQuestions = {}; lastFailure = null;
      publish({
        open: true, requestedId: id, record: null, inputDraft: blankInput(), inputDirty: false,
        inputDirtyFields: {}, inputConflicts: {}, answerDrafts: {}, dirtyAnswers: {}, answerConflicts: {}, orphanDrafts: {}, loading: false, busy: false,
        error: '', conflict: false, uncertainWrite: false, pollError: '', resultDraft: null,
      });
      return id == null ? null : readRecord();
    },
    // Closing during a save is deferred by the caller; pending AI is already persisted.
    close() {
      if (lock || hasUnsaved() || state.uncertainWrite) return false;
      epoch += 1; stopReads(); publish({ open: false, loading: false });
      return true;
    },
    discardAndOpen(id = null) { return controller.open(id, { discardLocal: true }); },
    discardAndClose() {
      if (lock) return false;
      epoch += 1; stopReads(); activeId = null; inputBases = {}; answerBases = {}; draftQuestions = {}; lastFailure = null;
      publish({ open: false, requestedId: null, record: null, inputDraft: blankInput(), inputDirty: false, inputDirtyFields: {}, inputConflicts: {},
        answerDrafts: {}, dirtyAnswers: {}, answerConflicts: {}, orphanDrafts: {}, loading: false, busy: false, error: '', conflict: false, uncertainWrite: false, pollError: '', resultDraft: null });
      return true;
    },
    async saveAndOpen(id = null) {
      const saved = await controller.save();
      return saved && !hasUnsaved() ? controller.open(id) : null;
    },
    setInputDraft(patch) {
      const allowed = Object.fromEntries(Object.entries(patch).filter(([key]) => fields.includes(key)));
      if (allowed.clipIds) allowed.clipIds = [...allowed.clipIds];
      if (allowed.situationSelection?.options) {
        const selection = allowed.situationSelection;
        const saved = state.record && situationSelectionOf(state.record);
        allowed.situationSelection = !lock && saved?.options === null && !selection.options.length && !selection.other
          ? saved
          : { ...selection, options: selection.options.slice().sort() };
      }
      const inputDraft = { ...state.inputDraft, ...allowed }, inputDirtyFields = { ...state.inputDirtyFields }, inputConflicts = { ...state.inputConflicts };
      for (const key of Object.keys(allowed)) {
        const remote = state.record ? inputOf(state.record)[key] : state.inputDraft[key];
        if (!inputDirtyFields[key]) inputBases[key] = copy(remote);
        if (state.record && equal(allowed[key], remote)) { delete inputDirtyFields[key]; delete inputConflicts[key]; }
        else {
          inputDirtyFields[key] = true;
          if (inputConflicts[key]) inputConflicts[key] = { ...inputConflicts[key], local: copy(allowed[key]) };
        }
      }
      publish({ inputDraft, inputDirtyFields, inputConflicts, inputDirty: Object.keys(inputDirtyFields).length > 0 });
    },
    setAnswerDraft(turnId, value) {
      const turn = state.record?.turns?.find(item => item.id === turnId);
      if (!turn && !state.orphanDrafts[turnId]) return false;
      const dirtyAnswers = { ...state.dirtyAnswers }, answerConflicts = { ...state.answerConflicts }, orphanDrafts = { ...state.orphanDrafts };
      if (!dirtyAnswers[turnId]) answerBases[turnId] = turnState(turn);
      if (turn && value === (turn.draftAnswer ?? turn.answer ?? '')) { delete dirtyAnswers[turnId]; delete answerConflicts[turnId]; }
      else dirtyAnswers[turnId] = true;
      if (answerConflicts[turnId]) answerConflicts[turnId] = { ...answerConflicts[turnId], local: value };
      if (orphanDrafts[turnId]) orphanDrafts[turnId] = { ...orphanDrafts[turnId], value };
      publish({ answerDrafts: { ...state.answerDrafts, [turnId]: value }, dirtyAnswers, answerConflicts, orphanDrafts });
      return true;
    },
    resolveInputConflict(key, choice) {
      if (lock || !state.inputConflicts[key] || !['local', 'server'].includes(choice)) return false;
      const inputConflicts = { ...state.inputConflicts }, inputDirtyFields = { ...state.inputDirtyFields };
      const remote = copy(state.inputConflicts[key].server);
      const inputDraft = { ...state.inputDraft, ...(choice === 'server' ? { [key]: remote } : {}) };
      inputBases[key] = remote; delete inputConflicts[key];
      if (choice === 'server' || equal(inputDraft[key], remote)) delete inputDirtyFields[key];
      publish({ inputDraft, inputConflicts, inputDirtyFields, inputDirty: Object.keys(inputDirtyFields).length > 0 });
      return true;
    },
    resolveAnswerConflict(id, choice) {
      const conflict = state.answerConflicts[id];
      if (lock || !conflict || !['local', 'server', 'discard'].includes(choice)) return false;
      if (conflict.removed && choice === 'local') return false; // Recover into an explicitly selected active turn first.
      const answerConflicts = { ...state.answerConflicts }, dirtyAnswers = { ...state.dirtyAnswers }, answerDrafts = { ...state.answerDrafts }, orphanDrafts = { ...state.orphanDrafts };
      delete answerConflicts[id]; delete orphanDrafts[id];
      if (choice === 'local') answerBases[id] = copy(conflict.server);
      else {
        delete dirtyAnswers[id]; delete answerBases[id];
        if (conflict.server) answerDrafts[id] = conflict.server.draftAnswer;
        else delete answerDrafts[id];
      }
      publish({ answerConflicts, dirtyAnswers, answerDrafts, orphanDrafts });
      return true;
    },
    recoverAnswerDraft(id, targetTurnId, { append = false } = {}) {
      const orphan = state.orphanDrafts[id], target = state.record?.turns?.find(turn => turn.id === targetTurnId);
      if (lock || !orphan || !target) return false;
      const existing = state.answerDrafts[targetTurnId] || '';
      if (existing && !append) return false; // Never silently replace another draft during recovery.
      controller.setAnswerDraft(targetTurnId, existing ? `${existing}\n\n${orphan.value}` : orphan.value);
      controller.resolveAnswerConflict(id, 'discard');
      return true;
    },
    refresh: () => readRecord(),
    // Explicit reload adopts server revision but never silently replaces local edits.
    reloadConflict: () => readRecord({ resolveConflict: true }),
    save() { return mutate(persistInput, () => controller.save()); },
    async saveAndClose() {
      const saved = await controller.save();
      if (saved && !hasUnsaved()) controller.close();
      return saved;
    },
    moveTo(cursor) {
      return mutate(async ticket => {
        const saved = await persistDraft(ticket);
        if (!current(ticket)) return null;
        const record = saved || requireRecord();
        if (!Number.isInteger(cursor) || cursor < 0 || cursor >= (record.turns || []).length) throw Object.assign(new Error('이전 질문을 확인해 주세요.'), { status: 400 });
        if (cursor === record.cursor) return record;
        const next = await api.patchFeedback(record.id, { revision: record.revision, cursor });
        if (current(ticket)) accept(next);
        return next;
      }, () => controller.moveTo(cursor));
    },
    previous() { return controller.moveTo(Math.max(0, (state.record?.cursor || 0) - 1)); },
    answerAndContinue({ skip = false } = {}) {
      let answerReadyForGeneration = false;
      return mutate(async ticket => {
        let record = requireRecord();
        if (state.inputDirty) throw Object.assign(new Error('수정한 입력 내용을 먼저 저장해 주세요.'), { status: 400 });
        record = await persistAllDrafts(ticket);
        if (!current(ticket)) return null;
        ensureReadyForGeneration();
        const index = record.cursor;
        const turn = record.turns?.[index];
        if (!turn) throw Object.assign(new Error('답할 질문을 먼저 불러와 주세요.'), { status: 400 });
        const localAnswer = state.answerDrafts[turn.id] ?? turn.draftAnswer ?? '';
        const answer = skip ? '' : localAnswer;
        if (!skip && !answer.trim()) throw Object.assign(new Error('답변을 입력하거나 확인 대기로 남겨 주세요.'), { status: 400 });
        const saved = await api.answerFeedback(record.id, { revision: record.revision, turnId: turn.id, answer, skip });
        if (!current(ticket)) return null;
        accept(saved, { savedAnswer: { id: turn.id, value: localAnswer } });
        ensureReadyForGeneration();
        // Identical previous answers keep the existing path, including answered turns.
        if (saved.cursor > index) return saved;
        answerReadyForGeneration = true;
        const next = await api.askFeedback(saved.id, { revision: saved.revision });
        if (current(ticket)) accept(next);
        return next;
      }, () => answerReadyForGeneration ? controller.ask() : controller.answerAndContinue({ skip }));
    },
    ask({ more = false } = {}) {
      return mutate(async ticket => {
        const saved = await persistInput(ticket);
        if (!current(ticket)) return null;
        ensureReadyForGeneration();
        const next = await api.askFeedback(saved.id, { revision: saved.revision, ...(more ? { more: true } : {}) });
        if (current(ticket)) accept(next);
        return next;
      }, () => controller.ask({ more }));
    },
    summarize() {
      return mutate(async ticket => {
        const saved = await persistInput(ticket);
        if (!current(ticket)) return null;
        ensureReadyForGeneration();
        const next = await api.summarizeFeedback(saved.id, { revision: saved.revision });
        if (current(ticket)) accept(next);
        return next;
      }, () => controller.summarize());
    },
    addResult(body) {
      return writeResult(record => api.addFeedbackResult(record.id, { ...body, revision: record.revision }), true);
    },
    updateResult(resultId, body, expected) {
      return writeResult(record => {
        ensureResultMatches(record, resultId, expected);
        return api.updateFeedbackResult(record.id, resultId, { ...body, revision: record.revision });
      }, true);
    },
    deleteResult(resultId, expected) {
      return writeResult(record => {
        ensureResultMatches(record, resultId, expected);
        return api.deleteFeedbackResult(record.id, resultId, { revision: record.revision });
      });
    },
    setResultDraft(resultDraft) {
      if (state.open && !lock) publish({ resultDraft });
    },
    acceptStar({ id, starred }) {
      starWrites.set(String(id), { sequence: ++starSequence, starred });
      if (state.record && String(state.record.id) === String(id)) publish({ record: { ...state.record, starred } });
    },
    assignTask({ expectedTaskId, replace }) {
      return mutate(async ticket => {
        const record = requireRecord();
        ensureReadyForGeneration();
        if (!record.summary || record.summaryStale || record.ai?.status === 'pending') {
          throw localError('현재 내용으로 정리한 최신 카드가 필요합니다. 보완 내용을 확인하고 다시 정리해 주세요.');
        }
        if ((record.turns || []).some(turn => (turn.draftAnswer || '').trim() && turn.draftAnswer !== turn.answer)) {
          throw localError('작성한 보완 답변을 먼저 제출하고 다시 정리한 뒤 과제로 지정해 주세요.');
        }
        const result = await api.setFeedbackTask(record.id, { revision: record.revision, expectedTaskId, replace });
        if (current(ticket)) accept(result.feedback);
        return result;
      }); // A fresh current-task read/confirmation is required on conflict.
    },
    retry() {
      if (state.conflict) return Promise.resolve(null);
      if (lastFailure) return lastFailure();
      if (state.record?.ai?.status === 'failed') {
        return state.record.ai.kind === 'summarize' ? controller.summarize() : controller.ask();
      }
      return readRecord();
    },
  };
  return controller;
}
