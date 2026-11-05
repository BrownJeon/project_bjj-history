import client from './client';

// 복기·연구 집계 API (task-024, backend/src/routes/lab.js)
//
// 🔴 경로에 도메인 접두사가 없다. lab 라우터는 routes/index.js 에서 `/` 에 마운트되므로
//    실제 경로는 /api/holes · /api/mastery/:techId 다. "정리"하려고 /lab 을 붙이면
//    조용히 404 가 된다 — 바꾸려면 backend/src/routes/index.js 와 함께 바꿔야 한다.

/** GET /api/holes — 실패 집계. min 은 구멍 threshold(기본 2, 1~99). */
export const getHoles = (min, { from, to } = {}) =>
  client.get('/holes', { params: {
    ...(min == null ? {} : { min }), ...(from ? { from } : {}), ...(to ? { to } : {}),
  } }).then(r => r.data);

/** GET /api/mastery/:techId — 사다리 5단계. */
export const getMastery = (techId) =>
  client.get(`/mastery/${techId}`).then(r => r.data);

/**
 * PATCH /api/mastery/:techId — 2·3단계 수동 체크.
 * 🔴 응답이 GET 과 **같은 형태**로 온다. 갱신 후 getMastery 를 다시 부르지 마라.
 */
export const patchMastery = (techId, body) =>
  client.patch(`/mastery/${techId}`, body).then(r => r.data);
