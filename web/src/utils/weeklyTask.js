// ═════════════════════════════════════════════════════════════════════════════
// 이번 주 과제 · 리액션 제안 — **순수 함수만** (task-027)
//
// 세 화면(`/research` 노드 시트 · 홈 · 스파링 저장)이 같은 값을 보여야 하므로,
// 표시 문자열을 만드는 곳을 **여기 하나로 모은다.** 화면마다 따로 포맷하면
// "같은 과제인데 홈과 스파링에서 다르게 읽히는" 조용한 어긋남이 생긴다.
//
// 🔴 이 파일에 React·axios·DOM 을 들이지 마라. QA 하네스가 HTTP 없이 직접 부른다.
//
// 🔴 실측된 함정 3가지
//
//  1. **`toISOString()` 이 날짜를 하루 민다**(KST +9). `2026-06-24` → `2026-06-23`.
//     서버는 'YYYY-MM-DD' **문자열**을 준다 — 여기서는 문자열만 자른다. Date 를 거치지 않는다.
//     (이 파일에 `new Date` 가 하나도 없어야 한다. 있으면 그게 결함이다.)
//
//  2. **표본 0건은 `0/0` 이 아니라 "기록 없음"** 이다. 잴 게 없는 것과 재 봤더니 0인 것은 다르다.
//
//  3. **3택 라벨을 하드코딩하지 마라.** 정본은 `GET /api/research/task` 의 `outcomeOptions[]` 다
//     (계약 B). 서버가 라벨을 주는 이유가 두 곳이 갈리지 않게 하려는 것인데, 프론트가 또 적으면
//     그 장치가 무의미해진다. 아래 FALLBACK 은 **서버가 목록을 안 줬을 때만** 쓰는 최후 수단이고,
//     그 경우 화면은 "서버 목록이 아니다"를 알 수 있어야 하므로 normalizeOutcomeOptions 가
//     `fromServer` 를 함께 돌려준다.
// ═════════════════════════════════════════════════════════════════════════════

/** 계약 B 의 3택 ASCII 키. 값 자체는 서버 정본이고, 이건 순서·검증용이다. */
export const OUTCOME_VALUES = ['not_tried', 'tried_failed', 'done'];

/** 🔴 최후 수단. 서버가 outcomeOptions 를 주면 **절대 쓰이지 않는다.** */
const FALLBACK_OPTIONS = [
  { value: 'not_tried', label: '시도 못 함' },
  { value: 'tried_failed', label: '해봤는데 안 됨' },
  { value: 'done', label: '됐음' },
];

/**
 * 서버가 준 3택 목록을 그대로 쓰되, 없거나 망가졌으면 최후 수단으로 떨어진다.
 * @returns {{options: {value,label}[], fromServer: boolean}}
 */
export function normalizeOutcomeOptions(list) {
  const arr = Array.isArray(list) ? list : [];
  const ok = arr.filter(o => o && typeof o.value === 'string' && o.value);
  if (ok.length === 0) return { options: FALLBACK_OPTIONS, fromServer: false };
  return {
    options: ok.map(o => ({ value: o.value, label: String(o.label ?? o.value) })),
    fromServer: true,
  };
}

/** 'YYYY-MM-DD' → 'M/D'. 🔴 문자열만 자른다 — Date 로 왕복시키면 KST 에서 하루 밀린다. */
export function fmtMD(v) {
  const s = String(v || '').slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${Number(m[2])}/${Number(m[3])}`;
}

/** 'YYYY-MM-DD' → 'YYYY.MM.DD'. 같은 이유로 문자열 치환만 한다. */
export function fmtDay(v) {
  const s = String(v || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.replace(/-/g, '.') : '';
}

/**
 * 과제 한 줄 요약 — **세 화면이 전부 이걸 쓴다.**
 * task 가 null 이면 `{ has:false }` 를 돌려준다(빈 상태를 화면이 각자 판단하지 않게).
 */
export function taskSummary(task) {
  if (!task || task.nodeId == null) {
    return { has: false, title: '', sub: '', open: false, linked: false };
  }
  const node = task.node || {};
  const proj = task.project || {};
  const title = String(node.label || '').trim() || '(이름 없음)';
  const bits = [];
  if (proj.title) bits.push(proj.title);
  if (node.kind) bits.push(node.kind);
  // 🔴 미매칭(미연결)을 조용히 감추지 않는다 — 상태이지 결함이 아니다(task-026 과 같은 규칙).
  if (node.linked && node.techniqueName) bits.push(node.techniqueName);
  return {
    has: true,
    id: task.id ?? null,
    nodeId: task.nodeId,
    projectId: proj.id ?? null,
    title,
    sub: bits.join(' · '),
    kind: node.kind || '',
    linked: node.linked === true,
    open: task.open !== false && !task.closedAt,
    outcome: task.outcome || null,
    outcomeLabel: task.outcomeLabel || null,
    memo: task.memo || '',
    daysOpen: Number.isFinite(task.daysOpen) ? task.daysOpen : null,
    createdAt: task.createdAt || null,
    closedAt: task.closedAt || null,
  };
}

/** "3일째" / "오늘 정함" — daysOpen 이 없으면 빈 문자열(추정해서 만들지 않는다). */
export function openForText(daysOpen) {
  if (!Number.isFinite(daysOpen) || daysOpen < 0) return '';
  return daysOpen === 0 ? '오늘 정함' : `${daysOpen}일째`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 리액션 제안
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 출처 한 줄 — "매트 ×3 · 최근 6/24".
 * 🔴 근거 없이 나타나면 사용자가 신뢰하지 않는다. count 가 없으면 빈 문자열이 아니라
 *    "기록 없음" 을 돌려준다 — 표본 0을 `×0` 으로 쓰지 않기 위해서다.
 */
export function sourceText(s) {
  const n = Number(s?.count);
  if (!Number.isFinite(n) || n <= 0) return '기록 없음';
  const last = fmtMD(s?.lastFailedAt);
  return last ? `매트 ×${n} · 최근 ${last}` : `매트 ×${n}`;
}

/**
 * 무시 목록의 키. 🔴 **노드 + 정규화 라벨** 두 축이다 —
 * 같은 문구라도 붙을 자리(부모 노드)가 다르면 다른 제안이므로 한쪽을 무시했다고
 * 다른 쪽까지 사라지면 안 된다.
 */
export function dismissKey(s) {
  const parent = s?.parentNodeId == null ? 'u' : String(s.parentNodeId);
  const norm = String(s?.normLabel || s?.label || '').trim();
  return `${parent}:${norm}`;
}

const DISMISS_LS = 'bjj-research-suggest-dismissed';

/**
 * 🔴 무시는 **이 브라우저에만** 남는다 — dev-027a 계약에 무시 저장 엔드포인트가 없다(계약 A).
 *    서버에 없다는 사실을 감추지 않기 위해 화면은 "무시함 N개 · 다시 보기"를 항상 함께 그린다.
 *    저장소가 막힌 브라우저에서도 화면이 죽지 않아야 하므로 읽기/쓰기 전부 try/catch 다
 *    (task-023 에서 저장소 실패를 "값 없음"과 뭉개 회귀가 났다 — 여기서는 실패를 실패로 둔다).
 */
export function readDismissed(projectId, storage) {
  const st = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!st) return {};
  try {
    const all = JSON.parse(st.getItem(DISMISS_LS) || '{}');
    const mine = all && all[String(projectId)];
    return (mine && typeof mine === 'object') ? mine : {};
  } catch { return {}; }
}

/** 무시 추가/해제. 실패해도 throw 하지 않고 **적용된 결과 맵**을 돌려준다(호출자가 그대로 그린다). */
export function writeDismissed(projectId, key, on, storage) {
  const st = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const cur = readDismissed(projectId, st);
  const next = { ...cur };
  if (on) next[key] = 1; else delete next[key];
  if (!st) return next;
  try {
    const all = JSON.parse(st.getItem(DISMISS_LS) || '{}');
    const base = (all && typeof all === 'object') ? all : {};
    if (Object.keys(next).length === 0) delete base[String(projectId)];
    else base[String(projectId)] = next;
    st.setItem(DISMISS_LS, JSON.stringify(base));
  } catch { /* 저장 실패해도 이번 화면에서는 반영된다 */ }
  return next;
}

/**
 * 제안 응답 → 화면이 쓸 형태. **순수 함수**(QA 하네스가 직접 부른다).
 *
 * 🔴 여기서 `unlinked` 를 버리지 않는다. 매칭 실패는 "없는 것"이 아니라 **다른 상태**다
 *    (task-024 가 unlinked 를 threshold 무관 전량 반환하도록 설계한 이유 그대로).
 * 🔴 아무것도 보여 줄 게 없으면 `visible:false` 를 돌려준다 — 화면은 그때 **아무것도 그리지 않는다.**
 *    빈 블록("제안 0개")을 그리는 것은 지시에서 명시적으로 금지됐다.
 */
export function splitSuggestions(res, dismissedMap) {
  const d = dismissedMap || {};
  const sug = Array.isArray(res?.suggestions) ? res.suggestions : [];
  const unl = Array.isArray(res?.unlinked) ? res.unlinked : [];
  const skp = Array.isArray(res?.skipped) ? res.skipped : [];

  const isOut = (s) => !!d[dismissKey(s)];
  const live = sug.filter(s => !isOut(s));
  const liveUnlinked = unl.filter(s => !isOut(s));
  const hiddenCount = sug.filter(isOut).length + unl.filter(isOut).length;

  return {
    live,
    unlinked: liveUnlinked,
    skipped: skp,
    hiddenCount,
    // 숨긴 것까지 0이고 이미-트리 목록도 없으면 이 구역은 통째로 그리지 않는다.
    visible: live.length > 0 || liveUnlinked.length > 0 || hiddenCount > 0 || skp.length > 0,
  };
}
