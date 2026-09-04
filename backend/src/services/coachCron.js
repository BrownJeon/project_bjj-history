/**
 * 주간 코치 자동 생성 (매주 일요일 00:00, 서버 로컬 타임)
 * - findActiveUserIds     : 해당 기간에 훈련 데이터가 있는 사용자 id 목록
 * - generateWeeklyReport  : 지정 사용자·기간의 훈련 데이터로 리포트 생성
 * - generateWeeklyPlan    : 지정 사용자·기간의 훈련 데이터로 다음 주 플랜 생성
 * - runWeeklyCronOnce     : cron 콜백 본체 (수동 실행·검증용으로 export)
 * - scheduleWeeklyCron    : node-cron 등록
 */

const { Op } = require('sequelize');
const { CoachReport, Class, Technique, TechniqueChain } = require('../models');
const { runClaude } = require('./claudeCli');
const {
  collectTrainingData,
  computeDiagnosis,
  serializeForPrompt,
  daysAgo,
  todayStr,
} = require('./coachAnalytics');

// ── cron 대상 사용자 선정 (task-015 ①) ──────────────────────────────────────
// [설계 판단] 단일 CRON_USER_ID를 고치는 대신 "그 주에 훈련 데이터가 있는 사용자 전원"을 순회한다.
//
//  1) 고정 id는 실패 모드가 '조용한 정지'다. 실제로 .env의 CRON_USER_ID=1(admin, 수업 3건)이
//     실사용자 id=3(수업 29건)과 어긋나, 2026-08-02 이후 5주 넘게 주간 리포트가 한 건도
//     생성되지 않았다. 그런데 로그는 "훈련 데이터 없음, 스킵" — 정상 종료처럼 보여서
//     아무도 알아채지 못했다. 값 하나만 3으로 고치면 지금은 되지만 계정이 바뀌면 또 같은 방식으로 멈춘다.
//     이 앱은 task-002 이후 다계정이므로 "설정과 실제 사용자가 어긋날 수 있는" 상태가 상시 존재한다.
//
//  2) 비용은 '전체 사용자 수'가 아니라 '그 주에 실제로 훈련 기록을 남긴 사용자 수'에 비례한다.
//     현재 DB(users 4명) 기준 최근 7일 훈련 데이터 보유자는 1명(id=3)뿐이라,
//     정상 동작 시 Claude CLI 호출 수는 기존 설계(1명 × 2회 = 2회)와 동일하다.
//     훈련 안 한 주에는 0회다(기존에는 CRON_USER_ID 계정 기준으로 0회).
//
//  3) 그래도 상한이 없으면 계정이 늘었을 때 폭주할 수 있으므로 1회 실행당 사용자 수 상한을 둔다
//     (CRON_MAX_USERS, 기본 20 → 최악의 경우 40회 호출). claudeCli는 동시성 1의 직렬 큐라
//     순차 실행되고, 한 사용자가 실패해도 나머지 사용자는 계속 진행한다.
const MAX_CRON_USERS = Math.max(1, parseInt(process.env.CRON_MAX_USERS) || 20);

async function findActiveUserIds(periodStart, periodEnd) {
  // 기간 조건은 collectTrainingData와 '완전히 동일'하게 맞춘다 —
  // 여기서 뽑힌 사용자가 정작 수집 단계에서 빈 배열이 되는 불일치를 막기 위함.
  const rows = await Class.findAll({
    attributes: ['user_id'],
    where: {
      user_id: { [Op.ne]: null },
      [Op.or]: [
        { date:     { [Op.between]: [periodStart, periodEnd] } },
        { date_end: { [Op.between]: [periodStart, periodEnd] } },
      ],
    },
    group: ['user_id'],
    order: [['user_id', 'ASC']],
    raw: true,
  });
  return rows.map(r => r.user_id).filter(id => id != null);
}

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

// userId를 넘기지 않으면 collectTrainingData가 user_id 필터를 빼버려 '전 사용자 데이터'를
// 한 덩어리로 섞어버린다. 그런 리포트가 만들어지는 사고를 막기 위해 입구에서 막는다.
function assertUserId(userId, fnName) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error(`${fnName}: userId(양의 정수)가 필요합니다 (받은 값: ${JSON.stringify(userId)})`);
  }
}

async function generateWeeklyReport(userId, periodStart = daysAgo(6), periodEnd = todayStr()) {
  assertUserId(userId, 'generateWeeklyReport');

  const data = await collectTrainingData(periodStart, periodEnd, userId);
  if (!data.length) {
    console.log(`[cron/report] user=${userId} 훈련 데이터 없음, 스킵 (${periodStart} ~ ${periodEnd})`);
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
    content: JSON.stringify(json), user_id: userId,
  });
  console.log(`[cron/report] user=${userId} 생성 완료 id=${r.id} (${periodStart} ~ ${periodEnd})`);
  return r;
}

async function generateWeeklyPlan(userId, periodStart = daysAgo(6), periodEnd = todayStr()) {
  assertUserId(userId, 'generateWeeklyPlan');

  const data = await collectTrainingData(periodStart, periodEnd, userId);
  if (!data.length) {
    console.log(`[cron/plan] user=${userId} 훈련 데이터 없음, 스킵 (${periodStart} ~ ${periodEnd})`);
    return null;
  }

  const diag = computeDiagnosis(data, periodStart, periodEnd);
  const techRows  = await Technique.findAll({ where: { user_id: userId }, attributes: ['id', 'name'], order: [['name', 'ASC']], raw: true });
  const chainRows = await TechniqueChain.findAll({ where: { user_id: userId }, attributes: ['id', 'name'], order: [['name', 'ASC']], raw: true });

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
    content: JSON.stringify({ focuses }), user_id: userId,
  });
  console.log(`[cron/plan] user=${userId} 생성 완료 id=${r.id} (${periodStart} ~ ${periodEnd})`);
  return r;
}

/**
 * cron 콜백 본체. 일요일을 기다리지 않고 수동으로 돌려볼 수 있도록 export 한다.
 * opts.periodStart / opts.periodEnd 로 기간을 지정할 수 있다(미지정 시 직전 7일).
 */
async function runWeeklyCronOnce(opts = {}) {
  const periodEnd   = opts.periodEnd   || todayStr();
  const periodStart = opts.periodStart || daysAgo(6);

  const allUserIds = await findActiveUserIds(periodStart, periodEnd);
  if (!allUserIds.length) {
    console.log(`[cron] ${periodStart} ~ ${periodEnd} 훈련 데이터가 있는 사용자 없음 — 생성 대상 0명`);
    return { periodStart, periodEnd, userIds: [], results: [] };
  }

  const userIds = allUserIds.slice(0, MAX_CRON_USERS);
  if (allUserIds.length > userIds.length) {
    console.warn(`[cron] 대상 사용자 ${allUserIds.length}명 중 상한(CRON_MAX_USERS=${MAX_CRON_USERS})까지 ${userIds.length}명만 처리합니다 — ${allUserIds.length - userIds.length}명 스킵`);
  }
  console.log(`[cron] 기간 ${periodStart} ~ ${periodEnd} · 대상 사용자 ${userIds.length}명 (user_id: ${userIds.join(', ')})`);

  const results = [];
  for (const userId of userIds) {
    const one = { userId, reportId: null, planId: null, errors: [] };
    try {
      const r = await generateWeeklyReport(userId, periodStart, periodEnd);
      one.reportId = r ? r.id : null;
    } catch (e) {
      one.errors.push(`report: ${e.message}`);
      console.error(`[cron/report] user=${userId} 오류:`, e.message);
    }
    try {
      const p = await generateWeeklyPlan(userId, periodStart, periodEnd);
      one.planId = p ? p.id : null;
    } catch (e) {
      one.errors.push(`plan: ${e.message}`);
      console.error(`[cron/plan] user=${userId} 오류:`, e.message);
    }
    results.push(one);
  }

  const reportCount = results.filter(r => r.reportId).length;
  const planCount   = results.filter(r => r.planId).length;
  const failCount   = results.filter(r => r.errors.length).length;
  console.log(`[cron] 요약 — 대상 ${userIds.length}명 / 리포트 ${reportCount}건 / 플랜 ${planCount}건 생성 / 오류 사용자 ${failCount}명`);
  return { periodStart, periodEnd, userIds, results };
}

function scheduleWeeklyCron() {
  const cron = require('node-cron');
  // '0 0 * * 0' = 매주 일요일 00:00 (서버 로컬 타임 = KST). 시각을 바꾸려면 사용자 결정이 필요하다.
  // 참고: coachAnalytics의 todayStr()/daysAgo()는 UTC 날짜 기준이라, 일요일 00:00 KST
  //       (= 토요일 15:00 UTC)에 돌면 기간이 "직전 일요일 ~ 토요일"(막 끝난 한 주)로 잡힌다.
  cron.schedule('0 0 * * 0', async () => {
    console.log('[cron] 주간 자동 생성 시작 —', new Date().toISOString());
    try {
      await runWeeklyCronOnce();
    } catch (e) {
      console.error('[cron] 주간 자동 생성 오류:', e.message);
    }
    console.log('[cron] 주간 자동 생성 완료 —', new Date().toISOString());
  });
  console.log('[cron] 주간 코치 자동 생성 등록 완료 (매주 일요일 00:00, 서버 로컬 타임)');
}

module.exports = {
  scheduleWeeklyCron,
  runWeeklyCronOnce,
  findActiveUserIds,
  generateWeeklyReport,
  generateWeeklyPlan,
};
