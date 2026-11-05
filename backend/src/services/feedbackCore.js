const { createHash, randomUUID } = require('crypto');
const { safeParse } = require('../utils/respond');
const situationLabels = Object.freeze({ class: '수업', spar: '스파링', video_review: '영상 복기', solo_practice: '개인 연습', technique_discussion: '기술 토론', other: '기타' });

class FeedbackError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function invalid(message) { throw new FeedbackError(400, message); }
function text(value, name, max, required = false) {
  if (typeof value !== 'string' || [...value].length > max || (required && !value.trim())) {
    invalid(`${name} 입력을 확인해주세요 (${max}자 이내)`);
  }
  return value;
}
function positive(value, name = 'id') {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) invalid(`${name} 값이 올바르지 않습니다`);
  return Number(value);
}
function date(value, name = '날짜') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${name} 형식을 확인해주세요`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < '1000-01-01') invalid(`${name} 값이 올바르지 않습니다`);
  return value;
}
function dateRange(input = {}) {
  const from = input.from == null || input.from === '' ? null : date(input.from, '시작일');
  const to = input.to == null || input.to === '' ? null : date(input.to, '종료일');
  if (from && to && from > to) invalid('시작일이 종료일보다 늦습니다');
  return { from, to };
}
function inRange(value, { from, to }) { return (!from || value >= from) && (!to || value <= to); }
function resultForm(input) {
  const resultDate = date(input.date);
  if (!['not_tried', 'tried_failed', 'done'].includes(input.outcome)) invalid('연습 결과를 확인해주세요');
  if (!['drill', 'position_spar', 'spar', 'other'].includes(input.context)) invalid('연습 상황을 확인해주세요');
  return { date: resultDate, outcome: input.outcome, context: input.context, note: text(input.note ?? '', '연습 메모', 6000) };
}
function situationForm(input) {
  if (!Object.hasOwn(input, 'situationOptions') && !Object.hasOwn(input, 'situationOther')) return null;
  if (!Array.isArray(input.situationOptions) || input.situationOptions.length > Object.keys(situationLabels).length || input.situationOptions.some(option => typeof option !== 'string' || !Object.hasOwn(situationLabels, option))) {
    invalid('피드백 상황 선택 항목을 확인해주세요');
  }
  const options = Object.keys(situationLabels).filter(option => input.situationOptions.includes(option));
  const hasOther = options.includes('other');
  const other = text(input.situationOther, '기타 상황', 200, hasOther);
  if (!hasOther && other !== '') invalid('기타를 선택한 경우에만 직접 입력할 수 있습니다');
  return { situation_options: JSON.stringify(options), situation_other: other };
}
function situationSelection(row) {
  const options = safeParse(row.situation_options, null);
  return { situationOptions: Array.isArray(options) ? options : null, situationOther: row.situation_other ?? '' };
}
function situationContext(row) {
  const { situationOptions, situationOther } = situationSelection(row);
  if (situationOptions === null) return row.situation;
  const selected = situationOptions.filter(option => Object.hasOwn(situationLabels, option)).map(option => option === 'other' && situationOther ? `기타: ${situationOther}` : situationLabels[option]);
  return [row.situation && `기존 상황: ${row.situation}`, `선택한 상황: ${selected.join(', ') || '없음'}`].filter(Boolean).join('\n');
}
function trainingStatus(results, taskBinding, currentTaskId) {
  if (results.some(entry => entry?.outcome === 'done')) return 'completed';
  if (results.length) return 'training';
  if (currentTaskId != null && Number(taskBinding?.taskId) === currentTaskId) return 'assigned';
  return null;
}
function practiceResults(row) {
  const results = safeParse(row.results, []);
  return Array.isArray(results) ? results : [];
}
function clipIds(value) {
  if (!Array.isArray(value) || value.length > 50) invalid('연결 영상은 50개 이내로 선택해주세요');
  return [...new Set(value.map(id => positive(id, '영상 id')))];
}
function form(input, partial = false) {
  const result = {};
  const fields = {
    date: value => date(value),
    situation: value => text(value, '상황', 2000),
    technique: value => text(value, '기술', 200),
    original: value => text(value, '피드백 내용', 12000, true),
    clipIds,
  };
  for (const [key, validate] of Object.entries(fields)) {
    if (Object.prototype.hasOwnProperty.call(input, key)) result[key] = validate(input[key]);
    else if (!partial) {
      if (key === 'date' || key === 'original') invalid(`${key} 값이 필요합니다`);
      result[key] = key === 'clipIds' ? [] : '';
    }
  }
  return result;
}
function emptyDialogue() { return { turns: [], archives: [], cursor: 0, ready: false }; }
function dialogue(row) {
  const value = safeParse(row.dialogue, null);
  if (!value || !Array.isArray(value.turns) || !Array.isArray(value.archives) || !Number.isInteger(value.cursor)) {
    throw new FeedbackError(500, '피드백 대화 기록을 읽지 못했습니다');
  }
  return value;
}
function evidence(state) { return state.turns.filter(turn => turn.answer !== null); }
function archive(state, turns, reason, now) {
  if (turns.length) state.archives.push({ id: randomUUID(), reason, createdAt: now.toISOString(), turns: structuredClone(turns) });
}
function normalizeClip(row) {
  let techNames = [];
  try {
    const parsed = JSON.parse(row.tech_name);
    if (Array.isArray(parsed)) techNames = parsed.filter(Boolean);
    else if (parsed) techNames = [String(parsed)];
  } catch { if (row.tech_name) techNames = [row.tech_name]; }
  return { ...row, tech_names: techNames, tech_name: techNames[0] || '', positions: safeParse(row.position, []), tags: safeParse(row.tags, []), video_file: row.video_file || '' };
}
function snapshot(row, clips) {
  return {
    date: row.date, situation: situationContext(row), technique: row.technique, original: row.original,
    turns: evidence(dialogue(row)).map(({ id, question, answer, skipped }) => ({ id, question, answer, skipped })),
    clipIds: safeParse(row.clip_ids, []),
    clips: clips.map(clip => ({ id: clip.id, title: clip.title, description: clip.description || '', techNames: clip.tech_names, positions: clip.positions, tags: clip.tags })),
    results: practiceResults(row),
  };
}
function snapshotHash(row, clips) { return createHash('sha256').update(JSON.stringify(snapshot(row, clips))).digest('hex'); }
function summarySourceHash(row) { return row.summary ? createHash('sha256').update(JSON.stringify([row.summary_hash, safeParse(row.summary, null)])).digest('hex') : null; }
function dto(row, clips, currentTaskId = null) {
  const state = dialogue(row);
  const ids = safeParse(row.clip_ids, []);
  const existing = new Set(clips.map(clip => Number(clip.id)));
  const summary = safeParse(row.summary, null);
  const taskBinding = safeParse(row.task_binding, null);
  const results = practiceResults(row);
  return {
    id: Number(row.id), date: row.date, situation: row.situation, technique: row.technique, original: row.original,
    starred: row.starred === true || row.starred === 1,
    ...situationSelection(row), trainingStatus: trainingStatus(results, taskBinding, currentTaskId),
    clipIds: ids, clips, unavailableClipIds: ids.filter(id => !existing.has(id)),
    turns: state.turns, archives: state.archives, cursor: state.cursor, ready: state.ready,
    taskBinding, summarySourceHash: summarySourceHash(row),
    summary, summaryStale: Boolean(summary && row.summary_hash !== snapshotHash(row, clips)), revision: row.revision,
    ai: { status: row.ai_status, kind: row.ai_kind, error: row.ai_error || '', startedAt: row.ai_started_at },
    results, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function editAnswer(state, input, now) {
  const index = state.turns.findIndex(turn => turn.id === input.turnId);
  if (index < 0) invalid('현재 대화의 질문을 선택해주세요');
  if (input.skip != null && typeof input.skip !== 'boolean') invalid('skip 값이 올바르지 않습니다');
  const answer = input.skip ? '' : text(input.answer, '답변', 6000, true);
  const turn = state.turns[index];
  if (turn.answer !== null && (turn.answer !== answer || turn.skipped !== Boolean(input.skip))) {
    archive(state, state.turns.slice(index), '이전 답변 수정 전 대화', now);
    state.turns = state.turns.slice(0, index + 1);
    state.ready = false;
  }
  Object.assign(state.turns[index], { answer, draftAnswer: answer, skipped: Boolean(input.skip) });
  state.cursor = index + 1 < state.turns.length ? index + 1 : index;
  return state;
}

module.exports = { FeedbackError, invalid, text, positive, date, dateRange, inRange, resultForm, situationForm, situationLabels, practiceResults, clipIds, form, emptyDialogue, dialogue, evidence, archive, normalizeClip, snapshot, snapshotHash, summarySourceHash, dto, editAnswer };
