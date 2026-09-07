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

/**
 * GET /api/research/nodes/:id/links
 * 응답: {nodeId, links[], total, brokenCount}
 * 🔴 링크 한 줄은 `{id, nodeId, linkType, refId, memo, broken, brokenReason, target}` 이다.
 *    `broken` 이 **정본**이다 — 프론트가 title 유무 따위로 다시 판정하지 마라(task-028 D).
 *    끊긴 링크도 목록에서 사라지지 않는다. 사라지면 사용자가 지울 수도 없다.
 */
export const listNodeLinks = (id) =>
  client.get(`/research/nodes/${id}/links`).then(r => r.data);

/** POST /api/research/links — {nodeId, linkType, refId?, memo?} (기존 경로) */
export const createLink = (body) =>
  client.post('/research/links', body).then(r => r.data);

export const patchLink = (id, body) =>
  client.patch(`/research/links/${id}`, body).then(r => r.data);

export const deleteLink = (id) =>
  client.delete(`/research/links/${id}`).then(r => r.data);

// ─────────────────────────────────────────────────────────────────────────────
// task-028 — 분기 · 가져오기 5곳 · 링크 열기
//
// 🔴 계약 정본은 `agent-vault/10-Flow/tasks/task-028-branch-import-links.md` 의
//    `### dev-028a` 절이다. 여기 주석은 요약이지 정본이 아니다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/research/versions/:id/branch — {name?}
 * **`:id` 는 분기의 원본이 될 버전 id** 다(프로젝트 id 가 아니다).
 *
 * 🔴 응답의 새 버전은 **이미 활성**이다(서버가 한 트랜잭션에서 나머지를 0 으로 내린다).
 *    프론트가 뒤이어 PATCH {isActive:true} 를 또 부르지 마라 — 같은 일을 두 번 하는 것이고,
 *    그 사이에 실패하면 활성이 0개인 상태가 화면에 남는다.
 * 🔴 응답: {branchedFrom, version, copied:{nodes, links, sourceNodes, sourceLinks, complete, …}, project}
 *    `copied.complete` 가 false 면 **덜 복제된 것**이다. 조용히 넘기지 말고 화면이 말해야 한다.
 */
export const branchVersion = (versionId, body) =>
  client.post(`/research/versions/${versionId}/branch`, body).then(r => r.data);

/**
 * GET /api/research/import-search?q=&source=&limit= — 5개 저장소(6갈래) 통합 검색.
 *
 * 🔴 `q` 가 비면 400 이 아니라 **둘러보기**다(`browse:true`) — 시트를 열자마자 빈 손이 되지 않게.
 * 🔴 응답 항목의 `linkType`·`refId` 를 **그대로** POST 본문에 실으면 연결된다.
 *    프론트가 source→linkType 표를 다시 만들지 마라(gameplan·chain 이 같은 라벨을 쓴다).
 * 🔴 그룹마다 `total`(매치 수)과 `available`(그 저장소 전체 행 수)이 따로 온다.
 *    `0/0`("기록 없음")과 `0/135`("검색어가 안 걸림")를 화면이 다르게 말해야 한다.
 */
export const importSearch = (q, opts = {}) =>
  client.get('/research/import-search', {
    params: {
      q: q ?? '',
      ...(opts.source ? { source: opts.source } : {}),
      ...(opts.limit ? { limit: opts.limit } : {}),
    },
  }).then(r => r.data);

/**
 * POST /api/research/nodes/:id/links — {linkType, refId?, memo?}
 * 노드 스코프 경로. 응답은 `attachLinkTargets` 를 거친 링크 1건이다(끊김 판정 포함).
 */
export const addNodeLink = (nodeId, body) =>
  client.post(`/research/nodes/${nodeId}/links`, body).then(r => r.data);

/**
 * DELETE /api/research/nodes/:id/links/:linkId
 * 🔴 노드 스코프로 지운다 — 서버가 "그 링크가 그 노드의 것인지"까지 확인한다.
 */
export const removeNodeLink = (nodeId, linkId) =>
  client.delete(`/research/nodes/${nodeId}/links/${linkId}`).then(r => r.data);

// ─────────────────────────────────────────────────────────────────────────────
// task-027 — 리액션 자동 유입 + 이번 주 과제
//
// 🔴 계약은 `agent-vault/10-Flow/tasks/task-027-reaction-inflow-and-weekly-task.md` 의
//    "백엔드 계약" 절이 정본이다(dev-027a 확정). 여기 주석은 그 요약이지 정본이 아니다.
//
// 🔴 제안 조회는 **쓰기를 하지 않는다.** 채택은 기존 createNode() 를 그대로 쓴다 —
//    "제안"과 "생성"이 코드 수준에서 갈라져 있어야 "채택 전에는 DB 에 안 생긴다"가
//    주석의 약속이 아니라 구조로 보장된다. 여기에 자동 생성 편의 함수를 만들지 마라.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/research/projects/:id/reaction-suggestions
 * 활성 버전 기준 제안 계산(쓰기 0건).
 * 응답: {projectId, versionId, empty, summary, suggestions[], unlinked[], skipped[]}
 * 🔴 `unlinked`(기술명 미매칭)를 화면에서 버리지 마라 — 집계에서 빼는 것과 표시하지 않는 것은 다르다.
 */
export const getReactionSuggestions = (projectId) =>
  client.get(`/research/projects/${projectId}/reaction-suggestions`).then(r => r.data);

/**
 * GET /api/research/task — 열린 과제 1개 + 최근 마감 5건 + **3택 정본 목록**.
 * 🔴 과제가 없으면 `{task:null, ...}` 이고 **404 가 아니다.** "아직 정하지 않았다"는 정상 상태다.
 * 🔴 3택 라벨을 프론트에 하드코딩하지 마라 — 정본은 응답의 `outcomeOptions[]` 다.
 */
export const getTask = () =>
  client.get('/research/task').then(r => r.data);

/**
 * POST /api/research/task — {nodeId, memo?}
 * 🔴 이미 열린 과제가 있으면 **409**. 이 앱의 axios 인터셉터는 비-2xx 의 본문을 버리고
 *    Error(message) 만 남기므로 **409 본문에 동봉된 현재 과제는 읽을 수 없다.**
 *    → 호출자는 바꾸기 전에 getTask() 로 현재 과제를 먼저 확인하고 물어야 한다.
 */
export const setTask = (body) =>
  client.post('/research/task', body).then(r => r.data);

/** PATCH /api/research/task/:id — {memo} 부분 갱신 */
export const patchTask = (id, body) =>
  client.patch(`/research/task/${id}`, body).then(r => r.data);

/**
 * POST /api/research/task/:id/close — {outcome} 3택 마감.
 * 🔴 `outcome` 은 ASCII 키(`not_tried`·`tried_failed`·`done`)다. 한글 라벨을 보내지 마라.
 * 응답의 `ladder.applied` 는 **항상 false** — 사다리 4·5단계는 스파링 기록 자동 판정이 정본이다.
 */
export const closeTask = (id, body) =>
  client.post(`/research/task/${id}/close`, body).then(r => r.data);

/** DELETE /api/research/task/:id — 지정 취소(열린 과제만) */
export const clearTask = (id) =>
  client.delete(`/research/task/${id}`).then(r => r.data);
