import client from './client';

// ─────────────────────────────────────────────────────────────────────────────
// 연구 화면 API (task-026, backend/src/routes/research.js — dev-026a 소유)
//
// 🔴 lab(`/api/holes`·`/api/mastery/:id`)과 달리 이 라우터는 **도메인 접두사가 있다.**
//    routes/index.js 가 `router.use('/research', ...)` 로 마운트한다.
//    lab 을 흉내내 접두사를 떼면 조용히 404 가 된다.
//
// 🔴 날짜(`createdAt`)는 서버가 만든 'YYYY-MM-DD' **문자열**이다.
//    new Date(...) 로 왕복시키지 마라 — toISOString() 이 KST(+9)를 UTC 로 밀어 하루가 어긋난다.
//
// 🔴 노드 수정은 **PATCH 부분 갱신**이다. 본문에 넣은 필드만 바뀌고 나머지는 남는다.
//    task-017 의 destroy+reinsert(안 보낸 필드가 사라짐)를 구조적으로 막는 유일한 장치이므로,
//    "전체 노드를 통째로 보내면 안전하다"는 쪽으로 되돌리지 마라.
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/research/projects — 목록 + 진척 2축 + warnOverload */
export const listProjects = () =>
  client.get('/research/projects').then(r => r.data);

/** POST /api/research/projects — 생성. 서버가 같은 트랜잭션에서 v1 을 만든다. */
export const createProject = (body) =>
  client.post('/research/projects', body).then(r => r.data);

/** GET /api/research/projects/:id — 프로젝트 + versions[] + 활성 버전 트리(평평한 배열) + 2축 */
export const getProject = (id) =>
  client.get(`/research/projects/${id}`).then(r => r.data);

/** PATCH /api/research/projects/:id — {title?, startPos?, goal?} 부분 수정 */
export const patchProject = (id, body) =>
  client.patch(`/research/projects/${id}`, body).then(r => r.data);

/** DELETE /api/research/projects/:id — 연쇄 삭제. {deletedVersions, deletedNodes, deletedLinks} */
export const deleteProject = (id) =>
  client.delete(`/research/projects/${id}`).then(r => r.data);

/** PATCH /api/research/versions/:id — {name?} 또는 {isActive:true} 전환 */
export const patchVersion = (id, body) =>
  client.patch(`/research/versions/${id}`, body).then(r => r.data);

/** DELETE /api/research/versions/:id — 🔴 마지막 남은 버전은 서버가 400 으로 거부한다. */
export const deleteVersion = (id) =>
  client.delete(`/research/versions/${id}`).then(r => r.data);

/** POST /api/research/nodes — {versionId, parentNodeId?, kind, label, techniqueId?, note?} */
export const createNode = (body) =>
  client.post('/research/nodes', body).then(r => r.data);

/** PATCH /api/research/nodes/:id — 🔴 본문에 담은 필드만 갱신된다(부분 갱신). */
export const patchNode = (id, body) =>
  client.patch(`/research/nodes/${id}`, body).then(r => r.data);

/** DELETE /api/research/nodes/:id — 자손까지 함께 지운다. 확인 문구에 반드시 명시할 것. */
export const deleteNode = (id) =>
  client.delete(`/research/nodes/${id}`).then(r => r.data);

/**
 * PATCH /api/research/nodes/:id/move — {parentNodeId, sortOrder}
 * `sortOrder` 는 **형제들 사이에서 원하는 최종 위치(0-based)** 로 보낸다.
 * 🔴 호출 뒤에는 반드시 getProject 로 다시 읽어 **서버가 정한 순서**를 그린다.
 *    프론트가 낙관적으로 자기 순서를 그리면 서버 규칙과 어긋났을 때 알 방법이 없다.
 */
export const moveNode = (id, body) =>
  client.patch(`/research/nodes/${id}/move`, body).then(r => r.data);

/** POST /api/research/nodes/:id/insert-parent — target 위쪽에 노드를 끼워 넣는다(B-1). */
export const insertParent = (id, body) =>
  client.post(`/research/nodes/${id}/insert-parent`, body).then(r => r.data);

/** GET /api/research/nodes/:id/links */
export const listNodeLinks = (id) =>
  client.get(`/research/nodes/${id}/links`).then(r => r.data);

/** POST /api/research/links — {nodeId, linkType, refId?, memo?} */
export const createLink = (body) =>
  client.post('/research/links', body).then(r => r.data);

export const patchLink = (id, body) =>
  client.patch(`/research/links/${id}`, body).then(r => r.data);

export const deleteLink = (id) =>
  client.delete(`/research/links/${id}`).then(r => r.data);
