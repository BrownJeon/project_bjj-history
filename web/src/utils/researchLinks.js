// ═════════════════════════════════════════════════════════════════════════════
// 가져오기 · 링크 열기 · 분기 — **순수 함수만** (task-028)
//
// 🔴 이 파일에 React·axios·DOM 을 들이지 마라. QA 하네스가 HTTP 없이 직접 부른다
//    (`utils/weeklyTask.js` 와 같은 규약).
//
// 🔴 색 언어를 **새로 만들지 않는다**(`tokens.css` 미수정). 이미 확정된 규약이 있다:
//      · 앰버      = `/research` 에서는 "대처 없는 리액션" **전용** (task-026 Leader 결정)
//      · 중립 점선 = 미연결
//      · 블루 점선 = 리액션 제안 (task-027)
//    → 5개 출처를 **색으로** 가르면 저 셋 중 하나를 반드시 뺏는다. 그래서 출처 구분은
//      **아이콘 + 출처 이름 + 묶음 소제목**(구조)으로 한다. 색은 전부 중립이다.
//      색맹·저대비 화면에서도 구분이 남아야 한다는 task-026 의 규칙과 같은 이유다.
//
// 🔴 "끊김"(대상이 지워진 링크)을 **조용히 숨기지 않는다.** `research_links.ref_id` 에는
//    FK 가 없다(실측: `fk_rl_node` 하나뿐, node_id 만 CASCADE). 즉 클립·수업을 지우면
//    링크 행은 그대로 남고 가리키는 대상만 사라진다. 이건 결함이 아니라 **상태**다 —
//    미연결과 같은 문법으로 배지를 달고, 눌러도 아무 일이 없게 한다.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * 출처 정본 — 키는 dev-028a 의 `importSearch.SOURCES[].key` 와 같아야 한다.
 * `group` 이 화면 묶음이다: 서버는 6갈래(gameplan·chain 분리)를 주고 화면은 **5묶음**으로 보인다.
 * 🔴 라벨을 여기서 한 벌 더 만들지 않는다 — 서버가 `label` 을 주면 그것이 정본이고,
 *    여기 값은 서버가 라벨을 빠뜨렸을 때의 최후 수단이다(weeklyTask 의 FALLBACK_OPTIONS 와 같은 규칙).
 */
export const SOURCE_META = {
  class:     { group: 'class',  label: '수업기록',   icon: 'calendar', sub: null },
  technique: { group: 'tech',   label: '기술트리',   icon: 'grid',     sub: null },
  gameplan:  { group: 'sim',    label: '시뮬레이터', icon: 'target',   sub: '게임플랜' },
  chain:     { group: 'sim',    label: '시뮬레이터', icon: 'target',   sub: '체인' },
  clip:      { group: 'clip',   label: '참고영상',   icon: 'video',    sub: null },
  chapter:   { group: 'study',  label: '영상분석',   icon: 'brain',    sub: null },
  // url 은 검색 출처가 아니다(직접 입력). 링크 목록에는 나타날 수 있으므로 여기 둔다.
  url:       { group: 'url',    label: '주소',       icon: 'link',     sub: null },
};

/** 화면 묶음 5개 — 순서가 곧 화면 순서다. */
export const DISPLAY_GROUPS = [
  { key: 'class', label: '수업기록',   icon: 'calendar', sources: ['class'] },
  { key: 'tech',  label: '기술트리',   icon: 'grid',     sources: ['technique'] },
  { key: 'sim',   label: '시뮬레이터', icon: 'target',   sources: ['gameplan', 'chain'] },
  { key: 'clip',  label: '참고영상',   icon: 'video',    sources: ['clip'] },
  { key: 'study', label: '영상분석',   icon: 'brain',    sources: ['chapter'] },
];

export const sourceLabel = (key) => (SOURCE_META[key]?.label ?? String(key ?? ''));
export const sourceIcon  = (key) => (SOURCE_META[key]?.icon  ?? 'link');

/**
 * 검색 응답 → 화면 5묶음. **순수 함수**.
 *
 * 🔴 `total`(매치 수)과 `available`(그 저장소의 전체 행 수)을 합치지 않는다 —
 *    `0/0` 은 "그 저장소에 기록이 없다"이고 `0/135` 는 "검색어가 안 걸렸다"다.
 *    화면이 다르게 말해야 하므로 묶음마다 `reason` 을 계산해 둔다.
 *
 * @param res dev-028a 계약: {q, qNorm, browse, limit, sources:[{source,label,linkType,total,available,truncated,items[]}], summary}
 * @returns {{groups: object[], matched:number, browse:boolean, searched:number, allStoresEmpty:boolean}}
 */
export function displayGroups(res) {
  const raw = Array.isArray(res?.sources) ? res.sources : [];
  const bySource = new Map(raw.map(g => [g.source, g]));
  const browse = res?.browse === true;

  const groups = DISPLAY_GROUPS.map(def => {
    const parts = def.sources.map(k => bySource.get(k)).filter(Boolean);
    // 서버가 그 출처를 아예 안 돌린 경우(?source= 필터) — 묶음 자체를 뺀다.
    if (parts.length === 0) return null;

    const items = [];
    for (const p of parts) for (const it of (Array.isArray(p.items) ? p.items : [])) items.push(it);

    const total     = parts.reduce((n, p) => n + (Number(p.total) || 0), 0);
    const available = parts.reduce((n, p) => n + (Number(p.available) || 0), 0);
    const truncated = parts.some(p => p.truncated === true);

    // 🔴 세 상태를 뭉개지 않는다.
    let reason = 'ok';
    if (total === 0) reason = available === 0 ? 'no-store' : 'no-match';

    return {
      key: def.key,
      label: parts[0].label || def.label,
      icon: def.icon,
      sources: def.sources,
      items, total, available, truncated, reason,
      // 자른 건수 — "더 있다"를 숫자로 말하기 위해서다.
      hiddenCount: Math.max(0, total - items.length),
    };
  }).filter(Boolean);

  return {
    groups,
    browse,
    matched: Number(res?.summary?.matched) || 0,
    searched: groups.length,
    // 모든 저장소가 비었다 = 검색어 문제가 아니라 **재료가 없다**.
    allStoresEmpty: groups.length > 0 && groups.every(g => g.available === 0),
  };
}

/**
 * 검색 결과 한 줄 → `POST /api/research/nodes/:id/links` 본문.
 * 🔴 화면이 매핑을 재조립하지 않는다 — 서버가 준 `linkType`·`refId` 를 **그대로** 싣는다.
 *    여기서 source→linkType 표를 다시 만들면 gameplan/chain 처럼 갈래와 종류가 다른 곳에서 갈린다.
 */
export function linkBodyOf(item) {
  return {
    linkType: item?.linkType ?? null,
    refId: item?.refId ?? null,
  };
}

/** 이미 붙어 있는지 — 같은 (linkType, refId) 쌍이면 같은 자료다. */
export function isAlreadyLinked(links, item) {
  const type = item?.linkType ?? null;
  const ref  = item?.refId ?? null;
  if (type == null || ref == null) return false;
  return (Array.isArray(links) ? links : [])
    .some(l => l.linkType === type && Number(l.refId) === Number(ref));
}

// ─────────────────────────────────────────────────────────────────────────────
// 저장된 링크
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 끊김 사유(dev-028a `attachLinkTargets` 의 `brokenReason`) → 사용자 문구.
 * 🔴 `missing` 은 "지워졌다"와 "더 이상 내 것이 아니다"를 **일부러 구분하지 않는다**
 *    (남의 id 존재 여부를 흘리지 않는 404 규칙). 화면도 구분해 말하지 않는다.
 */
export const BROKEN_TEXT = {
  missing:      '연결했던 대상이 지워졌습니다',
  no_ref:       '가리키는 대상이 없습니다',
  unknown_type: '이 앱이 더 이상 다루지 않는 종류입니다',
};

/**
 * 링크 목록 정규화. **순수 함수**.
 *
 * 🔴 "끊김" 판정을 프론트가 **추측으로** 하지 않는다. 정본은 서버의 `broken` 하나다
 *    (`GET /nodes/:id/links` → `attachLinkTargets`). 여기서 `title` 유무 따위로 다시 재면
 *    두 곳이 갈리고, 어느 쪽이 맞는지 추적할 수 없다(task-026 "이중 필터 금지"와 같은 원칙).
 *
 * 🔴 서버가 `broken` 을 아예 안 실어 주는 옛 응답이면 `brokenKnown:false` 다.
 *    그때는 **끊김이라고 말하지 않는다** — 멀쩡한 링크에 "끊김"이 붙는 쪽이 더 나쁘다.
 */
export function normalizeLinks(links) {
  const list = Array.isArray(links) ? links : [];
  return list.map(l => {
    const type = l?.linkType ?? null;
    const meta = SOURCE_META[type] || { group: 'url', label: String(type ?? '자료'), icon: 'link', sub: null };
    const known = typeof l?.broken === 'boolean';
    const broken = known ? l.broken : false;
    const tgt = (l && typeof l.target === 'object' && l.target) ? l.target : null;

    return {
      id: l?.id ?? null,
      nodeId: l?.nodeId ?? null,
      linkType: type,
      refId: l?.refId ?? null,
      memo: l?.memo ?? '',
      label: meta.label,
      icon: meta.icon,
      sub: meta.sub,
      // url 링크는 가리키는 행이 없다 — 주소(memo)가 곧 제목이다.
      title: type === 'url' ? String(l?.memo ?? '') : String(tgt?.title ?? ''),
      subtitle: type === 'url' ? '' : String(tgt?.subtitle ?? ''),
      target: tgt,
      broken,
      brokenKnown: known,
      brokenReason: l?.brokenReason ?? null,
      brokenText: broken ? (BROKEN_TEXT[l?.brokenReason] || '연결 대상을 찾을 수 없습니다') : '',
    };
  });
}

/** 링크 목록 요약 — "자료 3개 · 끊김 1개". 🔴 끊김을 총계에서 빼지 않는다. */
export function linkSummary(links) {
  const list = Array.isArray(links) ? links : [];
  return { total: list.length, broken: list.filter(l => l.broken).length };
}

/**
 * 링크를 눌렀을 때 무엇을 여는가. **순수 함수** — 실제 열기는 화면이 한다.
 *
 * 🔴 끊긴 링크는 `{kind:'none'}` 이다. 눌러도 **아무 일이 없어야 한다** —
 *    존재하지 않는 id 로 모달을 열면 흰 화면이나 영원한 스피너가 남는다.
 *    "깨지지 않는다"는 안 여는 것으로 지키지, try/catch 로 지키는 게 아니다.
 *
 * @returns {{kind:'clip'|'class'|'route'|'url'|'none', refId?:number, route?:string, reason?:string}}
 */
export function openTargetOf(link) {
  if (!link) return { kind: 'none', reason: 'empty' };
  if (link.broken) return { kind: 'none', reason: 'broken' };

  const ref = link.refId == null ? null : Number(link.refId);

  switch (link.linkType) {
    case 'clip':
      return ref == null ? { kind: 'none', reason: 'no-ref' } : { kind: 'clip', refId: ref };
    case 'class':
      return ref == null ? { kind: 'none', reason: 'no-ref' } : { kind: 'class', refId: ref };
    case 'chapter': {
      // 🔴 챕터는 자기 id 가 아니라 **부모 영상 id** 로 연다(`/study/:longVideoId`).
      //    챕터 id 를 그대로 넣으면 조용히 **다른 영상**이 열린다 — 404 보다 나쁘다.
      //    그 값은 서버 `target.longVideoId` 가 정본이다. 없으면 **열지 않는다**(지어내지 않는다).
      const vid = link.target?.longVideoId ?? link.target?.long_video_id ?? null;
      if (vid == null) return { kind: 'none', reason: 'no-video' };
      return { kind: 'route', route: `/study/${Number(vid)}`, refId: ref };
    }
    // 기술트리·시뮬레이터는 전용 상세 라우트가 없다(둘 다 `/techplan` 안의 탭이다).
    // 🔴 있지도 않은 `/techniques/:id` 를 만들어 내지 않는다 — 404 로 간다.
    case 'technique':
      return { kind: 'route', route: '/techplan', refId: ref, tab: 'tech' };
    case 'gameplan':
    case 'chain':
      return { kind: 'route', route: '/techplan', refId: ref, tab: 'plan' };
    case 'url':
      return link.memo ? { kind: 'url', route: link.memo } : { kind: 'none', reason: 'no-url' };
    default:
      return { kind: 'none', reason: 'unknown-type' };
  }
}

/** 열 수 없는 이유 → 사용자 문구. 🔴 "끊김"과 "이 앱이 아직 못 연다"는 다른 말이다. */
export const NOOPEN_TEXT = {
  broken: null,           // 끊김은 배지로 이미 말했다 — 두 번 말하지 않는다
  'no-video': '어느 영상의 챕터인지 알 수 없어 열지 못합니다',
  'no-ref': '가리키는 대상이 없어 열지 못합니다',
  'no-url': '주소가 비어 있습니다',
  'unknown-type': '이 앱이 다루지 않는 종류입니다',
  empty: '',
};

// ─────────────────────────────────────────────────────────────────────────────
// 분기
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 분기하면 무엇이 복제되는가. **순수 함수** — 확인 문구가 추상어로 넘어가지 않게 숫자를 만든다.
 *
 * 🔴 노드 수는 **활성 버전의 노드 배열 길이**이고, 링크 수는 각 노드의 `linkCount` 합이다
 *    (계약 B-3 의 `nodeView.linkCount`). 여기서 다시 세지 않는다 — 서버 값이 정본이다.
 * 🔴 원본이 남는다는 사실을 문구가 반드시 말해야 한다. "복사"라는 말만으로는
 *    사용자가 원본이 사라지는지 알 수 없다.
 */
export function branchPreview(detail) {
  const nodes = Array.isArray(detail?.nodes) ? detail.nodes : [];
  const versions = Array.isArray(detail?.versions) ? detail.versions : [];
  const from = versions.find(v => v.id === detail?.activeVersionId) || null;
  const maxNo = versions.reduce((m, v) => Math.max(m, Number(v.versionNo) || 0), 0);
  return {
    fromVersionId: from ? from.id : null,
    // 🔴 서버의 기본 이름은 `v{원본번호} 분기` 다(dev-028a 계약). 화면이 "이름 없음"이라 말하지
    //    않도록 원본 번호를 함께 돌려준다 — 안내가 서버가 실제로 하는 일과 어긋나면 안 된다.
    fromVersionNo: from ? Number(from.versionNo) : null,
    fromLabel: from ? `v${from.versionNo}${from.name ? ` · ${from.name}` : ''}` : '',
    nodeCount: nodes.length,
    linkCount: nodes.reduce((n, x) => n + (Number(x.linkCount) || 0), 0),
    nextVersionNo: maxNo + 1,
    versionCount: versions.length,
  };
}

/**
 * 분기 응답에서 새 버전 id 를 찾는다. 서버가 상세를 돌려주든 `{version:{...}}` 을 돌려주든 동작한다.
 * 🔴 못 찾으면 `null` 이다 — 화면은 그때 "만들었지만 전환하지 못했다"를 말하고 다시 읽어야 한다.
 *    추측해서 아무 버전으로 전환하면 사용자는 자기가 어느 버전에 있는지 모른 채 편집한다.
 */
export function newVersionIdOf(res, before) {
  const known = new Set((Array.isArray(before) ? before : []).map(v => Number(v.id)));
  const cands = [
    res?.version?.id, res?.newVersionId, res?.versionId, res?.id,
  ].filter(v => v != null).map(Number).filter(v => !known.has(v));
  if (cands.length) return cands[0];

  const list = Array.isArray(res?.versions) ? res.versions : [];
  const fresh = list.map(v => Number(v.id)).filter(id => !known.has(id));
  if (fresh.length) return Math.max(...fresh);

  // 활성 버전이 이미 새 것으로 바뀌어 왔다면 그것도 단서다.
  const act = res?.activeVersionId == null ? null : Number(res.activeVersionId);
  if (act != null && !known.has(act)) return act;
  return null;
}
