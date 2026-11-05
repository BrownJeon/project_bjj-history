import client from './client';

// 복기 화면 전용 API (task-025, backend/src/routes/recall.js — dev-025a 소유)
//
// 🔴 날짜 파라미터(from/to)는 'YYYY-MM-DD' **문자열 그대로** 넘긴다.
//    Date 로 왕복시키면 toISOString() 이 KST(+9)를 UTC 로 밀어 하루가 어긋난다.
//    <input type="date"> 의 value 가 이미 'YYYY-MM-DD' 문자열이라 그대로 쓰면 된다.

/** 빈 문자열·null·undefined 를 쿼리에서 빼서 "필터 없음"과 "빈 값 필터"를 섞지 않는다. */
function clean(params) {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '') continue;
    out[k] = v;
  }
  return out;
}

/** GET /api/recall/search?q&pos&from&to — 수업기록 통합 검색. */
export const searchRecall = ({ q, pos, from, to } = {}) =>
  client.get('/recall/search', { params: clean({ q, pos, from, to }) }).then(r => r.data);

/** GET /api/recall/stale?limit — 잊기 직전(구멍 제외). */
export const getStale = (limit, { from, to } = {}) =>
  client.get('/recall/stale', { params: clean({ limit, from, to }) }).then(r => r.data);

/**
 * POST /api/recall/summarize — AI 복기 카드.
 * 🔴 사용자가 버튼을 눌렀을 때만 호출한다(비싸다). 수십 초 걸린다 — client.js 타임아웃 300초.
 */
export const summarizeRecall = ({ q, pos, from, to, classIds } = {}) =>
  client.post('/recall/summarize', clean({ q, pos, from, to, classIds })).then(r => r.data);
