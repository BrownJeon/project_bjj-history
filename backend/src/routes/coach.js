const express = require('express');
const router = express.Router();
const { Technique, TechniqueChain, Profile, BeltHistory, CoachReport } = require('../models');
const { runClaude } = require('../services/claudeCli');
const { wrap, safeParse } = require('../utils/respond');
const {
  collectTrainingData, computeDiagnosis, serializeForPrompt,
  daysAgo, todayStr,
} = require('../services/coachAnalytics');

function extractJSONObject(text) {
  const cleaned = text.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON 객체를 찾을 수 없습니다');
  let jsonStr = cleaned.slice(start, end + 1);
  jsonStr = jsonStr.replace(/"(?:[^"\\]|\\.)*"/g, m =>
    m.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n')
  );
  return JSON.parse(jsonStr);
}

router.get('/diagnosis', wrap(async (req, res) => {
  const uid   = req.user.id;
  const days  = parseInt(req.query.days) || 30;
  const end   = todayStr();
  const start = daysAgo(days - 1);
  const data  = await collectTrainingData(start, end, uid);
  const diag  = computeDiagnosis(data, start, end);
  res.json({ period: { days, start, end }, ...diag });
}));

router.post('/report', wrap(async (req, res) => {
  const uid = req.user.id;
  let { periodStart, periodEnd, days } = req.body;
  if (!periodStart || !periodEnd) {
    const n = parseInt(days) || 30;
    periodEnd   = todayStr();
    periodStart = daysAgo(n - 1);
  }
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

  const raw = await runClaude(prompt);
  const json = extractJSONObject(raw);
  const r = await CoachReport.create({
    type: 'report', period_start: periodStart, period_end: periodEnd,
    content: JSON.stringify(json), user_id: uid,
  });
  res.json({ id: r.id, periodStart, periodEnd, content: json });
}));

router.post('/plan', wrap(async (req, res) => {
  const uid = req.user.id;
  let { periodStart, periodEnd, days } = req.body;
  if (!periodStart || !periodEnd) {
    const n = parseInt(days) || 30;
    periodEnd   = todayStr();
    periodStart = daysAgo(n - 1);
  }
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

  const raw = await runClaude(prompt);
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
  res.json({ id: r.id, periodStart, periodEnd, content });
}));

router.post('/chat', wrap(async (req, res) => {
  const uid = req.user.id;
  const { question } = req.body;
  if (!question?.trim()) return res.status(400).json({ error: '질문을 입력해주세요' });
  const days  = parseInt(req.body.days) || 30;
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

  const answer = await runClaude(prompt);
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
