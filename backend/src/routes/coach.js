const express = require('express');
const router = express.Router();
const { Technique, TechniqueChain, Profile, BeltHistory, CoachReport } = require('../models');
const { runClaude } = require('../services/claudeCli');
const { wrap, safeParse } = require('../utils/respond');
const { extractJSONObject } = require('../utils/extractJson');
const {
  collectTrainingData, computeDiagnosis, serializeForPrompt,
  daysAgo, todayStr,
} = require('../services/coachAnalytics');

// ── 기간 상한·검증 (task-015 ④) ─────────────────────────────────────────────
// UI(CoachPage.jsx)가 보내는 최대 기간은 90일이지만, 이 라우트는 body의 periodStart/periodEnd를
// 검증 없이 그대로 받아 collectTrainingData에 넘겼다 — API를 직접 호출하면 전체 기간을 지정해
// 프롬프트 캡(24,000자)을 건드릴 수 있었다.
// 상한 180일 근거: Analyst 실측상 "역대 가장 빽빽한 90일"이 약 12,100자(캡의 50%)이므로
// 그 2배인 180일이면 최악의 경우에도 캡 근처에서 멈춘다. UI 최대치(90일)의 2배라 정상 사용은 막지 않는다.
const MAX_PERIOD_DAYS = Math.max(1, parseInt(process.env.COACH_MAX_PERIOD_DAYS) || 180);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 정규식만으로는 '2026-13-99' 같은 형식은 맞지만 존재하지 않는 날짜가 통과한다.
// Date로 왕복시켜 실제 달력상 존재하는 날짜인지까지 확인한다.
function isValidDateStr(v) {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function shiftDate(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

// body의 periodStart/periodEnd/days를 실제로 사용할 기간으로 정규화한다.
// - 둘 다 주어지면: 형식 검증 → (뒤집힘 교정 · 미래 종료일 절단 · 최대 길이 절단)
// - 하나라도 비어 있으면: days 기반(기존 동작) — days도 1~MAX_PERIOD_DAYS로 클램프
// 반환된 clamped=true 는 요청과 다른 기간이 적용됐다는 뜻이다(응답에 함께 실어 보낸다).
function resolvePeriod(body = {}) {
  const today = todayStr();
  let { periodStart, periodEnd, days } = body;
  let clamped = false;

  if (periodStart && periodEnd) {
    if (!isValidDateStr(periodStart) || !isValidDateStr(periodEnd)) {
      const err = new Error('기간 형식이 올바르지 않습니다 (YYYY-MM-DD)');
      err.status = 400;
      throw err;
    }
    if (periodStart > periodEnd) {
      [periodStart, periodEnd] = [periodEnd, periodStart];
      clamped = true;
    }
    if (periodEnd > today) { periodEnd = today; clamped = true; }
    if (periodStart > periodEnd) { periodStart = periodEnd; clamped = true; }
    const earliest = shiftDate(periodEnd, -(MAX_PERIOD_DAYS - 1));
    if (periodStart < earliest) { periodStart = earliest; clamped = true; }
  } else {
    let n = parseInt(days);
    if (!Number.isFinite(n) || n < 1) n = 30;
    if (n > MAX_PERIOD_DAYS) { n = MAX_PERIOD_DAYS; clamped = true; }
    periodEnd   = today;
    periodStart = daysAgo(n - 1);
  }

  if (clamped) {
    console.warn(`[coach] 요청 기간을 서버 상한(${MAX_PERIOD_DAYS}일)에 맞춰 조정: ${periodStart} ~ ${periodEnd}`);
  }
  return { periodStart, periodEnd, clamped };
}

// GET /diagnosis, POST /chat 처럼 days만 받는 경로용
function clampDays(raw, fallback = 30) {
  let n = parseInt(raw);
  if (!Number.isFinite(n) || n < 1) n = fallback;
  return Math.min(n, MAX_PERIOD_DAYS);
}

// ── 프롬프트 캡 초과 안내를 사용자 언어로 (task-015 ③) ────────────────────────
// claudeCli.assertPromptSize는 "프롬프트가 너무 깁니다 (25123자) — 24000자 이내로 줄여주세요"라는
// 개발자 관점 메시지를 던지고, 이게 그대로 사용자 토스트에 노출됐다(CoachPage.jsx의 showToast).
// 사용자는 "프롬프트"가 뭔지도, 뭘 해야 하는지도 모른다 — 실제 해결책인 "더 짧은 기간 선택"으로 바꿔 준다.
// 원래 메시지는 서버 로그에만 남긴다. (캡 상수 자체는 건드리지 않는다 — task-015 제약)
async function runCoachClaude(prompt, opts) {
  try {
    return await runClaude(prompt, opts);
  } catch (e) {
    const msg = (e && e.message) || '';
    if (msg.includes('프롬프트가 너무 깁니다')) {
      console.warn('[coach] 프롬프트 캡 초과 —', msg);
      const err = new Error('선택한 기간의 훈련 기록이 너무 많아 한 번에 분석할 수 없습니다. 더 짧은 기간(7일 또는 30일)을 선택한 뒤 다시 시도해주세요.');
      err.status = 400;
      throw err;
    }
    throw e;
  }
}

router.get('/diagnosis', wrap(async (req, res) => {
  const uid   = req.user.id;
  const days  = clampDays(req.query.days);
  const end   = todayStr();
  const start = daysAgo(days - 1);
  const data  = await collectTrainingData(start, end, uid);
  const diag  = computeDiagnosis(data, start, end);
  res.json({ period: { days, start, end }, ...diag });
}));

router.post('/report', wrap(async (req, res) => {
  const uid = req.user.id;
  const { periodStart, periodEnd, clamped } = resolvePeriod(req.body);
  const data = await collectTrainingData(periodStart, periodEnd, uid);
  if (!data.length) return res.status(400).json({ error: '해당 기간에 훈련 기록이 없습니다' });

  const context = serializeForPrompt(data);
  const prompt = `당신은 주짓수(BJJ) 전문 코치입니다. 아래 기간의 훈련 기록을 종합해 서술형 코칭 리포트를 자연스러운 문체로 작성해주세요.

[리포트 구성]
- 하이라이트: 이번 기간 두드러진 성과·변화 (구체적 세션·날짜 인용)
- 반복 약점: 데이터에서 반복되는 약점 패턴과 원인 분석
- 개선된 점: 이전 대비 나아진 영역
- 권장 사항: 다음 기간 구체 훈련 드릴·체크 포인트

[작성 원칙]
- 일반론이 아닌 훈련생 실제 기록에 기반
- 과장·미화 없이 사실 기반
- BJJ 전문 용어 적절히 사용

[응답 형식 — 중요]
- JSON 문자열 필드 내부에 \\n 으로 줄바꿈, \\n\\n 으로 문단 구분

[훈련 데이터 (기간: ${periodStart} ~ ${periodEnd})]
${context}

JSON 형식으로만 응답하세요:
{"highlights":"하이라이트 서술","weaknesses":"반복 약점 분석","improvements":"개선된 점 서술","recommendations":"다음 기간 권장 사항"}`;

  const raw = await runCoachClaude(prompt);
  const json = extractJSONObject(raw);
  const r = await CoachReport.create({
    type: 'report', period_start: periodStart, period_end: periodEnd,
    content: JSON.stringify(json), user_id: uid,
  });
  res.json({ id: r.id, periodStart, periodEnd, content: json, ...(clamped ? { clamped: true } : {}) });
}));

router.post('/plan', wrap(async (req, res) => {
  const uid = req.user.id;
  const { periodStart, periodEnd, clamped } = resolvePeriod(req.body);
  const data = await collectTrainingData(periodStart, periodEnd, uid);
  if (!data.length) return res.status(400).json({ error: '해당 기간에 훈련 기록이 없습니다' });
  const diag = computeDiagnosis(data, periodStart, periodEnd);

  const techRows  = await Technique.findAll({ where: { user_id: uid }, attributes: ['id', 'name'], order: [['name', 'ASC']], raw: true });
  const chainRows = await TechniqueChain.findAll({ where: { user_id: uid }, attributes: ['id', 'name'], order: [['name', 'ASC']], raw: true });
  const techNameList  = techRows.map(t => t.name).join(', ');
  const chainNameList = chainRows.map(c => c.name).join(', ');

  const prompt = `당신은 주짓수 코치입니다. 아래 진단 데이터를 바탕으로 다음 주 훈련 포커스 3개를 제안해주세요.

[진단 요약]
${JSON.stringify(diag, null, 2)}

[사용 가능한 자원]
- 등록된 기술 목록: ${techNameList || '(없음)'}
- 등록된 체인 목록: ${chainNameList || '(없음)'}

[작성 원칙]
- title: 짧고 구체적
- why: 진단 데이터 근거 1~2줄
- techniqueNames: 등록된 기술 목록에서 정확히 일치하는 이름만
- chainNames: 등록된 체인 목록에서 정확히 일치하는 이름만
- videoQueries: YouTube 영어 검색 키워드 1~2개
- drillSuggestion: 구체적 훈련 드릴 1~2줄

[응답 형식 — 중요]
- why, drillSuggestion 문자열 줄바꿈은 \\n

JSON 형식으로만 응답하세요:
{"focuses":[{"title":"...","why":"근거 1\\n근거 2","techniqueNames":["..."],"chainNames":["..."],"videoQueries":["..."],"drillSuggestion":"드릴 설명\\n- 체크 포인트"}]}`;

  const raw = await runCoachClaude(prompt);
  const json = extractJSONObject(raw);
  const focuses = (json.focuses || []).map(f => ({
    title: f.title || '',
    why: f.why || '',
    techniqueIds: (f.techniqueNames || []).map(n => techRows.find(t => t.name === n)?.id).filter(Boolean),
    chainIds:     (f.chainNames || []).map(n => chainRows.find(c => c.name === n)?.id).filter(Boolean),
    techniqueNames: f.techniqueNames || [],
    chainNames:     f.chainNames || [],
    videoLinks: (f.videoQueries || []).map(q => ({
      query: q,
      url:   `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
    })),
    drillSuggestion: f.drillSuggestion || '',
    done: false,
  }));
  const content = { focuses };
  const r = await CoachReport.create({
    type: 'plan', period_start: periodStart, period_end: periodEnd,
    content: JSON.stringify(content), user_id: uid,
  });
  res.json({ id: r.id, periodStart, periodEnd, content, ...(clamped ? { clamped: true } : {}) });
}));

router.post('/chat', wrap(async (req, res) => {
  const uid = req.user.id;
  const { question } = req.body;
  if (!question?.trim()) return res.status(400).json({ error: '질문을 입력해주세요' });
  const days  = clampDays(req.body.days);
  const end   = todayStr();
  const start = daysAgo(days - 1);
  const data  = await collectTrainingData(start, end, uid);
  const diag  = computeDiagnosis(data, start, end);
  const context = serializeForPrompt(data);

  const prof = await Profile.findOne({ where: { user_id: uid }, raw: true });
  const beltRow = await BeltHistory.findOne({ where: { user_id: uid }, order: [['achieved_date', 'DESC']], raw: true });
  const currentBelt = beltRow || { belt: '화이트', stripes: 0 };

  const prompt = `당신은 주짓수(BJJ) 전문 코치이자 훈련생의 개인 훈련 비서입니다.
훈련생이 쌓아온 기록을 바탕으로 구체적이고 실행 가능한 조언을 자연스러운 대화체로 제공해주세요.

[답변 원칙]
1. 제공된 훈련 데이터 범위 내에서만 답변
2. 일반론이 아닌 훈련생의 실제 기록에 기반
3. 구체적이고 실행 가능한 제안 위주
4. 과장 없이 다음 훈련에서 적용 가능한 방향
5. BJJ 전문 용어 적절히 사용
6. 질문과 무관한 내용은 추가하지 않음

[훈련생 프로필]
현재 벨트: ${currentBelt.belt} (스트라이프 ${currentBelt.stripes || 0})

[기간 요약]
범위: ${start} ~ ${end} (${days}일간)
수업 ${diag.summary.classes}회 · 수련 ${diag.summary.trainedDays}일
스파링 ${diag.summary.sessions}세션 · ${diag.summary.minutes}분 · 탭 ↓${diag.summary.tapGot} ↑${diag.summary.tapGave}

[훈련 기록]
${context}

[훈련생 질문]
${question.trim()}

[답변 형식]
- 자연스러운 대화체 평문 (JSON 래핑 금지)
- 문단 구분은 빈 줄, 강조는 줄바꿈, 항목은 한 줄에 하나`;

  const answer = await runCoachClaude(prompt);
  const content = { answer, diagSummary: diag.summary };
  const r = await CoachReport.create({
    type: 'chat', period_start: start, period_end: end,
    question: question.trim(), content: JSON.stringify(content), user_id: uid,
  });
  res.json({ id: r.id, question: question.trim(), answer, created_at: new Date().toISOString() });
}));

router.patch('/reports/:id/focus-done', wrap(async (req, res) => {
  const uid = req.user.id;
  const { focusIndex, done } = req.body;
  const row = await CoachReport.findOne({ where: { id: req.params.id, user_id: uid } });
  if (!row) return res.status(404).json({ error: 'not found' });
  const content = safeParse(row.content, {});
  if (!Array.isArray(content.focuses) || !content.focuses[focusIndex]) {
    return res.status(400).json({ error: 'invalid focus index' });
  }
  content.focuses[focusIndex].done = !!done;
  await row.update({ content: JSON.stringify(content) });
  res.json({ ok: true });
}));

router.get('/reports', wrap(async (req, res) => {
  const uid   = req.user.id;
  const type  = req.query.type  || 'report';
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const rows = await CoachReport.findAll({
    where: { type, user_id: uid },
    order: [['created_at', 'DESC']],
    limit,
    raw: true,
  });
  rows.forEach(r => { r.content = safeParse(r.content, {}); });
  res.json(rows);
}));

router.delete('/reports/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  await CoachReport.destroy({ where: { id: req.params.id, user_id: uid } });
  res.json({ ok: true });
}));

module.exports = router;
