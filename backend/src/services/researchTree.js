// 연구 트리 순수 함수 (task-026 · docs/recall-lab-spec.md §4.4)
//
// 🔴 이 파일에는 DB·HTTP·req/res 가 없다. **전부 순수 함수다.**
//   편의가 아니라 설계 요건이다 — 순환 검사·깊이 상한·자손 수집·2축 집계는 HTTP 만으로는
//   경계 조건을 다 찌를 수 없고, 그러면 QA 가 "코드를 봤더니 순환이 날 리 없더라"로 후퇴한다.
//   이 프로젝트에서 5회 연속 일어났던 일이다. labAnalytics 가 벨트맵을 주입 가능하게 만들어
//   QA 의 네거티브 컨트롤을 가능하게 한 것과 같은 이유다.
//
// [입력 규약] `nodes` 는 **DB 행 그대로**의 배열이다(snake_case):
//   { id, version_id, parent_node_id, kind, label, technique_id, sort_order }
//   라우트가 camelCase 로 바꾸기 **전**의 모양을 쓴다 — QA 가 SELECT 결과를 그대로 먹일 수 있게.
//
// [불변식] 모든 순회 함수는 **이미 깨진 데이터(순환 포함)에서도 멈춘다.**
//   방어 검사가 있는데 정작 검사 함수가 무한 루프에 빠지면 아무것도 지키지 못한다.
//
// [task-027] 리액션 자동 유입의 제안 계산이 여기 들어왔다(computeReactionSuggestions).
//   🔴 **제안만 만들고 아무것도 생성하지 않는다** — 순수 함수라 DB 를 건드릴 수단이 없다.
//   이름 정규화는 신규 매처를 만들지 않고 utils/techMatch 의 normalize 를 그대로 쓴다.
const { normalize } = require('../utils/techMatch');

/**
 * 노드 종류 7종 — 도장 용어(계약 A-3).
 * 🔴 ENUM 이 아니라 앱 화이트리스트다. task-027 에서 늘어날 여지가 있어 ALTER 없이 늘리려는 것.
 * 🔴 `kind` 와 깊이 사이에 어떤 제약도 없다. `포지션` 도 어느 깊이에나 온다
 *    (실제 수업 theme 이 "싱글엑스 가드 -> 50대50" 처럼 중간에 자리를 바꾼다).
 */
const KINDS = ['포지션', '그립', '세팅', '엔트리', '리액션', '대처', '피니시'];

/** 링크 종류 4종 (계약 A-1 `research_links.link_type`). */
const LINK_TYPES = ['clip', 'class', 'technique', 'url'];

/** 깊이 상한. 루트 노드가 깊이 1 이다. (계약 A-5-3) */
const MAX_DEPTH = 12;

const REACTION = '리액션';
const COUNTER  = '대처';

/** 형제 정렬 정본 — (sort_order ASC, id ASC). sort_order 동률은 id 로 결정적으로 갈린다. */
function bySiblingOrder(a, b) {
  const sa = Number(a.sort_order) || 0;
  const sb = Number(b.sort_order) || 0;
  if (sa !== sb) return sa - sb;
  return (Number(a.id) || 0) - (Number(b.id) || 0);
}

/**
 * 인덱스 한 벌 — byId(Map) · children(Map: parentKey → 정렬된 자식 배열) · roots(정렬된 루트 배열).
 * 아래 모든 함수가 이걸 재사용한다. 같은 노드 배열에 여러 질의를 할 때 매번 다시 만들지 않게.
 *
 * 🔴 부모 키는 `null` 과 `0` 과 `'12'` 를 섞지 않기 위해 항상 문자열 `'root'` / `String(id)` 로 만든다.
 *    드라이버가 INT 를 문자열로 주는 경로가 실재한다(labAnalytics 의 `success` 가 그랬다).
 */
function indexNodes(nodes) {
  const list  = Array.isArray(nodes) ? nodes : [];
  const byId  = new Map();
  const children = new Map();

  for (const n of list) {
    const id = Number(n.id);
    if (!Number.isInteger(id)) continue;
    byId.set(id, n);
  }
  for (const n of list) {
    const id = Number(n.id);
    if (!byId.has(id)) continue;
    const pRaw = n.parent_node_id;
    const p = (pRaw === null || pRaw === undefined || pRaw === '') ? null : Number(pRaw);
    // 🔴 부모 id 가 이 목록에 없으면 루트로 취급한다. 고아를 조용히 버리면 화면에서 노드가
    //    사라지고, 사라진 것과 없는 것을 사용자는 구분할 수 없다.
    const key = (p !== null && byId.has(p)) ? String(p) : 'root';
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(n);
  }
  for (const arr of children.values()) arr.sort(bySiblingOrder);

  return { byId, children, roots: children.get('root') || [] };
}

/** 특정 부모의 자식 배열(정렬됨). parentId 는 null(루트) 또는 숫자. */
function childrenOf(idx, parentId) {
  const key = (parentId === null || parentId === undefined) ? 'root' : String(Number(parentId));
  return idx.children.get(key) || [];
}

/**
 * 자손 id 전체 (자기 자신 제외). BFS.
 * 🔴 노드 삭제가 이 함수에 의존한다 — `parent_node_id` 에 FK 가 없으므로 **앱이 자손을 수집해야 한다.**
 *    한 단계만 지우면 손자들이 고아가 된다. 이 task 에서 가장 놓치기 쉬운 지점이다.
 * 🔴 `seen` 이 순환에서도 종료를 보장한다.
 */
function collectDescendantIds(nodes, rootId, idx = indexNodes(nodes)) {
  const start = Number(rootId);
  if (!idx.byId.has(start)) return [];
  const out = [];
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    for (const c of childrenOf(idx, cur)) {
      const cid = Number(c.id);
      if (seen.has(cid)) continue;   // 순환 방어
      seen.add(cid);
      out.push(cid);
      queue.push(cid);
    }
  }
  return out;
}

/** 자기 자신 + 자손 id. 삭제 대상 집합이 이것이다. */
function collectSubtreeIds(nodes, rootId, idx = indexNodes(nodes)) {
  const start = Number(rootId);
  if (!idx.byId.has(start)) return [];
  return [start, ...collectDescendantIds(nodes, start, idx)];
}

/**
 * 노드의 깊이. **루트 = 1**. 노드를 못 찾으면 0.
 * 🔴 `guard` 가 순환에서 종료를 보장한다 — 이미 깨진 데이터에서도 이 함수는 멈춘다.
 */
function depthOf(nodes, nodeId, idx = indexNodes(nodes)) {
  let cur = idx.byId.get(Number(nodeId));
  if (!cur) return 0;
  let d = 1;
  const seen = new Set([Number(cur.id)]);
  while (true) {
    const pRaw = cur.parent_node_id;
    const p = (pRaw === null || pRaw === undefined || pRaw === '') ? null : Number(pRaw);
    if (p === null || !idx.byId.has(p) || seen.has(p)) return d;
    seen.add(p);
    cur = idx.byId.get(p);
    d++;
    if (d > MAX_DEPTH + 5) return d;   // 이중 안전장치
  }
}

/**
 * 서브트리 높이 — 자기 자신을 1 로 세는 **층 수**. 잎이면 1.
 * 부모 삽입·이동의 깊이 검사가 이 값을 쓴다.
 * 🔴 `N` 하나만 보고 깊이를 판정하면 깊은 서브트리를 상한 너머로 밀어 넣을 수 있다(계약 B-1).
 */
function subtreeHeight(nodes, nodeId, idx = indexNodes(nodes)) {
  const start = Number(nodeId);
  if (!idx.byId.has(start)) return 0;
  let height = 0;
  let level = [start];
  const seen = new Set([start]);
  while (level.length) {
    height++;
    if (height > MAX_DEPTH + 5) break;   // 순환 방어
    const next = [];
    for (const id of level) {
      for (const c of childrenOf(idx, id)) {
        const cid = Number(c.id);
        if (seen.has(cid)) continue;
        seen.add(cid);
        next.push(cid);
      }
    }
    level = next;
  }
  return height;
}

/**
 * 순환이 되는가 — `nodeId` 를 `newParentId` 아래로 옮기면 순환인가.
 * 자기 자신이거나 자기 자손이면 true.
 * 🔴 이게 없으면 트리 순회가 무한 루프로 서버를 멈춘다. 화면 버그가 아니라 가용성 문제다.
 */
function wouldCycle(nodes, nodeId, newParentId, idx = indexNodes(nodes)) {
  if (newParentId === null || newParentId === undefined) return false;
  const nid = Number(nodeId);
  const pid = Number(newParentId);
  if (nid === pid) return true;
  return collectDescendantIds(nodes, nid, idx).includes(pid);
}

/**
 * 이동·생성의 트리 무결성 3검사 (계약 A-5). 통과하면 `{ ok: true, depth }`,
 * 아니면 `{ ok: false, code, message }` — 라우트는 code 를 보고 400 을 낸다.
 *
 * @param nodes        같은 version_id 의 노드 전체 (DB 행)
 * @param nodeId       옮길 노드 id. **신규 생성이면 null** (검사할 서브트리가 없다)
 * @param newParentId  새 부모 id 또는 null(루트)
 * @param opts.versionId 이 트리의 version_id — 부모가 다른 버전이면 거부
 * @param opts.subtreeHeightOverride 신규 생성 시 1
 */
function validatePlacement(nodes, nodeId, newParentId, opts = {}) {
  const idx = opts.idx || indexNodes(nodes);
  const pid = (newParentId === null || newParentId === undefined) ? null : Number(newParentId);

  let parent = null;
  if (pid !== null) {
    if (!Number.isInteger(pid)) {
      return { ok: false, code: 'parent_invalid', message: 'parentNodeId 가 올바르지 않습니다' };
    }
    parent = idx.byId.get(pid) || null;
    // 🔴 "부모가 이 버전의 노드 목록에 없다" = 없는 노드이거나 다른 버전의 노드다.
    //    둘을 구분해 알려주지 않는다(남의 노드 id 존재 여부를 흘리지 않는다 — lab.js 의 404 규칙과 같은 정신).
    if (!parent) {
      return { ok: false, code: 'parent_other_version', message: '부모 노드는 같은 버전 안에 있어야 합니다' };
    }
    if (opts.versionId !== undefined && Number(parent.version_id) !== Number(opts.versionId)) {
      return { ok: false, code: 'parent_other_version', message: '부모 노드는 같은 버전 안에 있어야 합니다' };
    }
  }

  if (nodeId !== null && nodeId !== undefined) {
    if (wouldCycle(nodes, nodeId, pid, idx)) {
      return { ok: false, code: 'cycle', message: '노드를 자기 자신이나 자기 자손 아래로 옮길 수 없습니다' };
    }
  }

  // 🔴 서브트리 **전체** 깊이로 판정한다. 옮기는 노드 하나만 보면 깊은 가지가 상한을 넘어간다.
  const height = (opts.subtreeHeightOverride != null)
    ? Number(opts.subtreeHeightOverride)
    : subtreeHeight(nodes, nodeId, idx);
  const parentDepth = (pid === null) ? 0 : depthOf(nodes, pid, idx);
  const newBottom = parentDepth + (height || 1);
  if (newBottom > MAX_DEPTH) {
    return {
      ok: false, code: 'too_deep',
      message: `트리 깊이는 ${MAX_DEPTH}단계까지입니다 (이 위치에 놓으면 ${newBottom}단계가 됩니다)`,
    };
  }
  return { ok: true, depth: parentDepth + 1, bottom: newBottom };
}

/**
 * ① 대처 채움률 (계약 B-2).
 *
 *   분모 = kind='리액션' 노드 수
 *   분자 = 그중 **직계 자식**에 kind='대처' 가 하나 이상 있는 노드 수
 *
 * 🔴 분모는 리액션 노드 수다. 전체 노드 수도, 대처 노드 수도 아니다.
 * 🔴 리액션 0개면 `ratio: null` — 화면은 `0/0` 이 아니라 "리액션 없음"을 쓴다. 표본 0은 0% 가 아니다.
 * 🔴 `uncoveredReactionNodeIds` 를 **여기서** 만들어 응답에 실어 보낸다. 프론트가 트리를 다시 훑어
 *    같은 판정을 두 번 하면 두 곳이 어긋날 때 원인 추적이 불가능해진다(task-025 "이중 필터 금지").
 */
function computeCoverage(nodes, idx = indexNodes(nodes)) {
  const list = Array.isArray(nodes) ? nodes : [];
  const reactions = list.filter((n) => n.kind === REACTION);
  const uncovered = [];
  let covered = 0;
  for (const r of reactions) {
    const hasCounter = childrenOf(idx, Number(r.id)).some((c) => c.kind === COUNTER);
    if (hasCounter) covered++;
    else uncovered.push(Number(r.id));
  }
  return {
    reactions: reactions.length,
    covered,
    ratio: reactions.length ? Number((covered / reactions.length).toFixed(4)) : null,
    uncoveredReactionNodeIds: uncovered,
  };
}

/**
 * ② 사다리 평균 (계약 B-2).
 *
 *   분모 = 노드들이 참조하는 **고유 technique_id 수** (NULL 제외)
 *   값   = 각 기술의 GET /api/mastery 의 `reached`
 *   평균 = 소수 1자리
 *
 * 🔴 노드 수로 나누지 마라. 사다리는 **기술 단위**다 — 같은 기술을 3개 노드가 쓰면 1로 센다.
 *    노드로 나누면 같은 기술을 여러 번 적은 프로젝트의 평균이 이유 없이 달라진다.
 * 🔴 자유 라벨 노드(technique_id null)는 분모에서 제외한다. 사다리를 갖지 않기 때문이다.
 * 🔴 고유 기술 0개면 `avgReached: null` — 화면은 `0.0/5` 가 아니라 "기록 없음".
 *
 * @param reachedByTechId Map<number, number> — 라우트가 loadLabData 를 **요청당 한 번** 부르고
 *                        computeMastery 로 만든 맵. 이 함수는 DB 를 모른다.
 */
function computeLadder(nodes, reachedByTechId) {
  const list = Array.isArray(nodes) ? nodes : [];
  const ids = uniqueTechniqueIds(list);
  if (!ids.length) return { techniques: 0, avgReached: null };
  const get = (tid) => {
    if (!reachedByTechId) return 0;
    const v = (typeof reachedByTechId.get === 'function')
      ? reachedByTechId.get(tid)
      : reachedByTechId[tid];
    // 맵에 없으면 0. FK 가 있어 참조가 끊긴 기술은 SET NULL 로 빠지므로 정상 경로에선 안 생긴다.
    return Number.isFinite(Number(v)) ? Number(v) : 0;
  };
  const sum = ids.reduce((acc, tid) => acc + get(tid), 0);
  return { techniques: ids.length, avgReached: Number((sum / ids.length).toFixed(1)) };
}

/** 노드들이 참조하는 고유 technique_id 오름차순 배열 (NULL 제외). */
function uniqueTechniqueIds(nodes) {
  const set = new Set();
  for (const n of (Array.isArray(nodes) ? nodes : [])) {
    const t = n.technique_id;
    if (t === null || t === undefined || t === '') continue;
    const v = Number(t);
    if (Number.isInteger(v)) set.add(v);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * 리액션 자동 유입 — **제안 계산** (task-027 A).
 *
 * 스파링에서 막힌 리액션(labAnalytics.collectReactionItems 의 observations)을 받아
 * "이 트리의 어느 노드 밑에 어떤 리액션이 빠져 있는가"를 계산한다.
 *
 * 🔴 **이 함수는 아무것도 만들지 않는다. 만들 것을 *제안*할 뿐이다.**
 *    "승인 전 자동 생성 금지"가 이 프로젝트의 원칙이다(task-007~009, 기술트리 오염 방지).
 *    노드는 사용자가 채택할 때 `POST /api/research/nodes` 로 만들어진다. 순수 함수라 DB 를
 *    건드릴 수단 자체가 없다 — 그 원칙이 주석이 아니라 **구조**로 지켜진다.
 *
 * 🔴 **출처를 반드시 싣는다**(count · firstFailedAt · lastFailedAt · sources).
 *    근거 없이 나타난 제안은 사용자가 신뢰하지 않고, 신뢰하지 않는 제안은 안 쓰느니만 못하다.
 *
 * 🔴 **미매칭을 버리지 않는다.** 붙일 노드를 정할 수 없을 뿐이라 `unlinked` 로 따로 내보낸다
 *    (/api/holes 의 `linked:false` 와 같은 규약). 실측 미매칭 33.7% 를 조용히 지우면
 *    사용자는 "리액션을 적었는데 아무 데도 안 나온다"만 겪는다.
 *
 * 🔴 **이미 트리에 있는 리액션은 중복 제안하지 않는다.** 비교 키는 `techMatch.normalize()`
 *    (NFC + 소문자 + 공백·하이픈·중점 제거) — "팔 숨김" 과 "팔숨김" 은 같은 것이다.
 *    다만 조용히 지우지 않고 `skipped` 로 드러낸다(왜 안 보이는지 추적 가능하게).
 *
 * 🔴 **같은 기술을 참조하는 노드가 여러 개면 각 노드마다 제안한다.** 어디에 붙일지는 사람이 정한다.
 *    한 곳으로 임의로 몰면 사용자가 의도한 자리가 아닌 곳에 붙고, 그건 되돌리기 어렵다.
 *
 * @param nodes        활성 버전의 노드 전체 (DB 행 그대로)
 * @param observations labAnalytics.collectReactionItems(data).observations
 * @param opts.norm    정규화 함수 주입구(기본 techMatch.normalize). QA 네거티브 컨트롤용.
 */
function computeReactionSuggestions(nodes, observations, opts = {}) {
  const norm = opts.norm || normalize;
  const idx  = opts.idx || indexNodes(nodes);
  const list = Array.isArray(nodes) ? nodes : [];
  const obs  = Array.isArray(observations) ? observations : [];

  // ── 1. 리액션 문구를 (기술 × 정규화 문구) 로 묶는다 ──────────────────────
  //    🔴 묶는 키는 **정규화한 문구**다. 원본 표기는 최빈값을 골라 label 로 쓴다
  //       (/api/holes 의 displayName 과 같은 규칙 — 표기 흔들림 때문에 같은 리액션이 둘로 갈리지 않게).
  const bucketOf = (map, key) => {
    if (!map.has(key)) {
      map.set(key, { texts: new Map(), count: 0, first: null, last: null, sources: [] });
    }
    return map.get(key);
  };
  const addObs = (b, o) => {
    b.texts.set(o.reaction, (b.texts.get(o.reaction) || 0) + 1);
    b.count++;
    if (o.date) {
      if (!b.first || o.date < b.first) b.first = o.date;
      if (!b.last  || o.date > b.last)  b.last  = o.date;
    }
    b.sources.push({
      sparSessionId: o.sparSessionId,
      date: o.date,
      itemName: o.itemName,
      matchType: o.matchType,
      matchedName: o.matchedName ?? null,
      level: o.level ?? null,
    });
  };
  /** 최빈 원본 표기. 동률이면 첫 등장(Map 삽입순 + 안정 정렬). */
  const topText = (texts) => [...texts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  /** 최근 5건만 — 응답 비대 방지. 전체 수는 sourceCount 로 알린다. */
  const topSources = (sources) => sources
    .slice()
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || (b.sparSessionId - a.sparSessionId))
    .slice(0, 5);

  const byTech     = new Map();   // techniqueId -> Map(normReaction -> bucket)
  const unlinkedMap = new Map();  // "이름+구분자+리액션" 한 문자열 키 은 쓰지 않는다 — 중첩 Map 으로.
  const techNames  = new Map();   // techniqueId -> matchedName (표시용)

  for (const o of obs) {
    if (o.linked && o.techniqueId != null) {
      const tid = Number(o.techniqueId);
      if (!byTech.has(tid)) byTech.set(tid, new Map());
      addObs(bucketOf(byTech.get(tid), o.normReaction), o);
      if (o.matchedName && !techNames.has(tid)) techNames.set(tid, o.matchedName);
    } else {
      // ⚠️ 구분자 문자열 키로 합치지 않는다 — 구분자가 값에 들어오면 조용히 깨진다
      //    (labAnalytics.resolveBelts 가 같은 이유로 중첩 Map 을 쓴다).
      const itemKey = norm(o.itemName);
      if (!unlinkedMap.has(itemKey)) unlinkedMap.set(itemKey, new Map());
      const b = bucketOf(unlinkedMap.get(itemKey), o.normReaction);
      if (!b.itemNames) b.itemNames = new Map();
      b.itemNames.set(o.itemName, (b.itemNames.get(o.itemName) || 0) + 1);
      addObs(b, o);
    }
  }

  // ── 2. 기술을 참조하는 노드마다 "빠진 리액션"을 고른다 ────────────────────
  const suggestions = [];
  const skipped     = [];
  const techNodes = list.filter((n) => n.technique_id != null && n.technique_id !== '');

  for (const node of techNodes) {
    const tid = Number(node.technique_id);
    const buckets = byTech.get(tid);
    if (!buckets || !buckets.size) continue;

    // 🔴 중복 판정은 **그 노드의 직계 자식 리액션**만 본다. 트리 전체를 보면 다른 가지에 있는
    //    같은 이름 때문에 정작 여기가 비어 있는데도 제안이 사라진다.
    const existing = new Map();   // normLabel -> nodeId
    for (const c of childrenOf(idx, Number(node.id))) {
      if (c.kind !== REACTION) continue;
      const key = norm(c.label ?? '');
      if (key && !existing.has(key)) existing.set(key, Number(c.id));
    }

    for (const [normReaction, b] of buckets) {
      const label = topText(b.texts);
      const common = {
        parentNodeId: Number(node.id),
        parentLabel: node.label ?? '',
        techniqueId: tid,
        techniqueName: techNames.get(tid) ?? null,
        label,
        normLabel: normReaction,
        count: b.count,
      };
      if (existing.has(normReaction)) {
        skipped.push({ ...common, existingNodeId: existing.get(normReaction), reason: 'already_in_tree' });
        continue;
      }
      suggestions.push({
        ...common,
        kind: REACTION,
        firstFailedAt: b.first,
        lastFailedAt: b.last,
        sources: topSources(b.sources),
        sourceCount: b.sources.length,
      });
    }
  }

  // ── 3. 미매칭 — 붙일 자리를 정할 수 없을 뿐, 없는 것이 아니다 ─────────────
  const unlinked = [];
  for (const buckets of unlinkedMap.values()) {
    for (const [normReaction, b] of buckets) {
      unlinked.push({
        itemName: topText(b.itemNames),
        label: topText(b.texts),
        normLabel: normReaction,
        count: b.count,
        firstFailedAt: b.first,
        lastFailedAt: b.last,
        linked: false,
        sources: topSources(b.sources),
        sourceCount: b.sources.length,
      });
    }
  }

  // 결정적 정렬: 막힌 횟수 ↓ → 최근 ↓ → 이름 ↑ → 부모 노드 id ↑
  const byRank = (x, y) =>
    y.count - x.count ||
    String(y.lastFailedAt ?? '').localeCompare(String(x.lastFailedAt ?? '')) ||
    String(x.label).localeCompare(String(y.label)) ||
    ((x.parentNodeId ?? 0) - (y.parentNodeId ?? 0));

  suggestions.sort(byRank);
  unlinked.sort(byRank);
  skipped.sort((x, y) => y.count - x.count || String(x.label).localeCompare(String(y.label)) || x.parentNodeId - y.parentNodeId);

  // 고유 리액션 문구 수 — 기술 연결 여부와 무관하게 센다(표본 크기의 정직한 표현).
  const allNorms = new Set(obs.map((o) => o.normReaction).filter(Boolean));

  return {
    suggestions,
    unlinked,
    skipped,
    nodesWithTechnique: techNodes.length,
    reactionTexts: allNorms.size,
  };
}

/**
 * 평평한 배열을 트리로 조립 — **서버는 이걸 응답에 쓰지 않는다**(계약 B-3: nodes 는 평평한 배열).
 * 검증·디버깅·QA 용이다. 중첩 JSON 으로 응답하면 깊이 상한·순환 문제가 직렬화로 새어 나온다.
 */
function buildTree(nodes, idx = indexNodes(nodes)) {
  const seen = new Set();
  const walk = (parentId, depth) => {
    if (depth > MAX_DEPTH + 5) return [];   // 순환 방어
    return childrenOf(idx, parentId).flatMap((n) => {
      const id = Number(n.id);
      if (seen.has(id)) return [];
      seen.add(id);
      return [{ ...n, depth, children: walk(id, depth + 1) }];
    });
  };
  return walk(null, 1);
}

/** 트리 전체의 최대 깊이. 빈 트리는 0. */
function maxDepthOf(nodes, idx = indexNodes(nodes)) {
  let mx = 0;
  for (const n of (Array.isArray(nodes) ? nodes : [])) {
    const d = depthOf(nodes, n.id, idx);
    if (d > mx) mx = d;
  }
  return mx;
}

module.exports = {
  KINDS, LINK_TYPES, MAX_DEPTH,
  indexNodes, childrenOf, bySiblingOrder,
  collectDescendantIds, collectSubtreeIds,
  depthOf, subtreeHeight, maxDepthOf,
  wouldCycle, validatePlacement,
  computeCoverage, computeLadder, uniqueTechniqueIds,
  computeReactionSuggestions,
  buildTree,
};
