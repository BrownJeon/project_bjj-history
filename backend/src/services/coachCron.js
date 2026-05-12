/**
 * 주간 코치 자동 생성 (매주 일요일)
 * - generateWeeklyReport : 직전 7일 훈련 데이터로 리포트 생성
 * - generateWeeklyPlan   : 직전 7일 훈련 데이터로 다음 주 플랜 생성
 * - scheduleWeeklyCron   : node-cron 등록 (매주 일요일 06:00)
 */

const { CoachReport, Technique, TechniqueChain } = require('../models');
const { runClaude } = require('./claudeCli');
const {
  collectTrainingData,
  computeDiagnosis,
  serializeForPrompt,
  daysAgo,
  todayStr,
} = require('./coachAnalytics');

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

async function generateWeeklyReport() {
  const periodEnd   = todayStr();
  const periodStart = daysAgo(6); // 지난 7일 (일요일~토요일)

  const data = await collectTrainingData(periodStart, periodEnd);
  if (!data.length) {
    console.log('[cron/report] 훈련 데이터 없음, 스킵');
    return null;
  }

  const context = serializeForPrompt(data);
  const prompt = `당신은 주짓수(BJJ) 전문 코치입니다. 아래 기간의 훈련 기록을 종합해 서술형 코칭 리포트를 자연스러운 문체로 작성해주세요.

[리포트 구성]
- 하이라이트: 이번 기간 두드러진 성과·변화 (구체적 세션·날짜 인용)
- 반복 약점: 데이터에서 반복되는 약점 패턴과 원인 분석
- 개선된 점: 이전 대비 나아진 영역
- 권장 사항: 다음 기간 구체 훈련 드릴·체크 포인트

[응답 형식 — 중요]
- JSON 문자열 필드 내부에 \\n 으로 줄바꿈, \\n\\n 으로 문단 구분

[훈련 데이터 (기간: ${periodStart} ~ ${periodEnd})]
${context}

JSON 형식으로만 응답하세요:
{"highlights":"하이라이트 서술","weaknesses":"반복 약점 분석","improvements":"개선된 점 서술","recommendations":"다음 기간 권장 사항"}`;

  const raw  = await runClaude(prompt);
  const json = extractJSONObject(raw);
  const r = await CoachReport.create({
    type: 'report', period_start: periodStart, period_end: periodEnd,
    content: JSON.stringify(json),
  });
  console.log(`[cron/report] 생성 완료 id=${r.id} (${periodStart} ~ ${periodEnd})`);
  return r;
}

async function generateWeeklyPlan() {
  const periodEnd   = todayStr();
  const periodStart = daysAgo(6);

  const data = await collectTrainingData(periodStart, periodEnd);
  if (!data.length) {
    console.log('[cron/plan] 훈련 데이터 없음, 스킵');
    return null;
  }

  const diag = computeDiagnosis(data, periodStart, periodEnd);
  const techRows  = await Technique.findAll({ attributes: ['id', 'name'], order: [['name', 'ASC']], raw: true });
  const chainRows = await TechniqueChain.findAll({ attributes: ['id', 'name'], order: [['name', 'ASC']], raw: true });

  const prompt = `당신은 주짓수 코치입니다. 아래 진단 데이터를 바탕으로 다음 주 훈련 포커스 3개를 제안해주세요.

[진단 요약]
${JSON.stringify(diag, null, 2)}

[사용 가능한 자원]
- 등록된 기술 목록: ${techRows.map(t => t.name).join(', ') || '(없음)'}
- 등록된 체인 목록: ${chainRows.map(c => c.name).join(', ') || '(없음)'}

[작성 원칙]
- title: 짧고 구체적
- why: 진단 데이터 근거 1~2줄
- techniqueNames: 등록된 기술 목록에서 정확히 일치하는 이름만 (없으면 빈 배열)
- chainNames: 등록된 체인 목록에서 정확히 일치하는 이름만 (없으면 빈 배열)
- videoQueries: YouTube 영어 검색 키워드 1~2개
- drillSuggestion: 구체적 훈련 드릴 1~2줄

[응답 형식 — 중요]
- why, drillSuggestion 문자열 줄바꿈은 \\n

JSON 형식으로만 응답하세요:
{"focuses":[{"title":"...","why":"근거 1\\n근거 2","techniqueNames":["..."],"chainNames":["..."],"videoQueries":["..."],"drillSuggestion":"드릴 설명\\n- 체크 포인트"}]}`;

  const raw  = await runClaude(prompt);
  const json = extractJSONObject(raw);
  const focuses = (json.focuses || []).map(f => ({
    title: f.title || '',
    why: f.why || '',
    techniqueIds: (f.techniqueNames || []).map(n => techRows.find(t => t.name === n)?.id).filter(Boolean),
    chainIds:     (f.chainNames     || []).map(n => chainRows.find(c => c.name === n)?.id).filter(Boolean),
    techniqueNames: f.techniqueNames || [],
    chainNames:     f.chainNames     || [],
    videoLinks: (f.videoQueries || []).map(q => ({
      query: q,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
    })),
    drillSuggestion: f.drillSuggestion || '',
    done: false,
  }));

  const r = await CoachReport.create({
    type: 'plan', period_start: periodStart, period_end: periodEnd,
    content: JSON.stringify({ focuses }),
  });
  console.log(`[cron/plan] 생성 완료 id=${r.id} (${periodStart} ~ ${periodEnd})`);
  return r;
}

function scheduleWeeklyCron() {
  const cron = require('node-cron');
  // 매주 일요일 06:00 (서버 로컬 타임)
  cron.schedule('0 6 * * 0', async () => {
    console.log('[cron] 주간 자동 생성 시작 —', new Date().toISOString());
    try {
      await generateWeeklyReport();
    } catch (e) {
      console.error('[cron/report] 오류:', e.message);
    }
    try {
      await generateWeeklyPlan();
    } catch (e) {
      console.error('[cron/plan] 오류:', e.message);
    }
    console.log('[cron] 주간 자동 생성 완료 —', new Date().toISOString());
  });
  console.log('[cron] 주간 코치 자동 생성 등록 완료 (매주 일요일 06:00)');
}

module.exports = { scheduleWeeklyCron, generateWeeklyReport, generateWeeklyPlan };
