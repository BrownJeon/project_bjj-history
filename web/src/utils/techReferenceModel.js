// task-054 — 기술 상세의 관장 설명·앞뒤 연결·함께 보는 기술 화면 모델(순수 함수).
// 🔴 React/axios 를 import 하지 않는다 — node --test 로 단독 검증한다.
// 🔴 서버가 준 순서를 그대로 쓴다(정렬·중복 제거·방향 뒤집기 금지). 모르는 값은 '미확인'으로 둔다.

const MATCH_TYPES = new Set(['confirmed', 'exact', 'alias', 'ambiguous', 'none']);
const KINDS = new Set(['technique', 'position', 'concept']);

export const EMPTY_RELATION_TEXT = '아직 준비된 연결이 없어요.';
export const EMPTY_RELATED_TEXT = '아직 준비된 관련 기술이 없어요.';
export const UNKNOWN_CONDITION_TEXT = '연결 조건 미확인';
export const UNLINKED_LABEL = '연결할 기술 미확인';
export const SELF_LABEL = '지금 보고 있는 기술';

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const strOrNull = (v) => str(v) || null;
const strList = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

function normalizeId(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

/** 관계 카드 1개 정규화. key 는 relationKey 우선, 같은 key 가 반복돼도 카드를 지우지 않고 위치로 구분한다. */
function normalizeCard(raw, index, seen) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const targetTechniqueId = normalizeId(c.targetTechniqueId);
  const isSelf = c.isSelf === true;
  // 서버가 linked 라고 해도 대상 ID 가 없으면 이동할 곳이 없으므로 미연결로 본다.
  const linkState = c.linkState === 'linked' && targetTechniqueId != null ? 'linked' : 'unlinked';
  let key = str(c.relationKey) || `${str(c.slug) || 'unknown'}@${index}`;
  if (seen.has(key)) key = `${key}#${index}`;
  seen.add(key);
  return {
    key,
    relationKey: strOrNull(c.relationKey),
    slug: strOrNull(c.slug),
    name: str(c.name) || str(c.targetTechniqueName) || '이름 미확인',
    targetTechniqueId: linkState === 'linked' ? targetTechniqueId : null,
    targetTechniqueName: strOrNull(c.targetTechniqueName),
    matchType: MATCH_TYPES.has(c.matchType) ? c.matchType : 'none',
    linkState,
    isSelf,
    conditionText: strOrNull(c.conditionText),
  };
}

function normalizeCards(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.map((raw, i) => normalizeCard(raw, i, seen));
}

/** 설명 정규화. 요약이 없으면 null(=미준비). 내용을 지어내지 않는다. */
export function normalizeDescription(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const summary = str(raw.summary);
  if (!summary) return null;
  const review = raw.review && typeof raw.review === 'object' ? raw.review : {};
  return {
    summary,
    conditions: strList(raw.conditions),
    principles: strList(raw.principles),
    mistakes: strList(raw.mistakes),
    mistakesBasis: strOrNull(raw.mistakes_basis),
    next: strList(raw.next),
    nextNote: strOrNull(raw.next_note),
    kindNote: strOrNull(raw.kind_note),
    review: {
      reviewer: strOrNull(review.reviewer),
      status: strOrNull(review.status),
      basis: strOrNull(review.basis),
    },
  };
}

/**
 * 서버 응답 → 화면 섹션.
 * descriptionState: 'ready' | 'ambiguous' | 'missing'
 */
export function toSections(response) {
  const r = response && typeof response === 'object' ? response : {};
  const ref = r.reference && typeof r.reference === 'object' ? r.reference : {};
  const matchType = MATCH_TYPES.has(ref.matchType) ? ref.matchType : 'none';
  // 대응이 애매하면 설명이 와도 쓰지 않는다(엉뚱한 기술의 설명을 보여 주지 않기 위해).
  const description = matchType === 'ambiguous' ? null : normalizeDescription(ref.description);
  const descriptionState = description ? 'ready' : (matchType === 'ambiguous' ? 'ambiguous' : 'missing');
  return {
    techniqueId: normalizeId(r.technique?.id),
    matchType,
    kind: KINDS.has(ref.kind) ? ref.kind : null,
    sourceUrl: strOrNull(ref.sourceUrl),
    description,
    descriptionState,
    incoming: normalizeCards(r.incoming),
    outgoing: normalizeCards(r.outgoing),
    related: normalizeCards(r.related),
    linkStore: r.linkStore === 'available' ? 'available' : 'unavailable',
  };
}

/** 카드 표시 상태. disabled 면 이동 버튼을 누를 수 없다. */
export function cardState(card) {
  const c = card || {};
  const conditionLabel = str(c.conditionText) || UNKNOWN_CONDITION_TEXT;
  if (c.isSelf) return { label: SELF_LABEL, disabled: true, conditionLabel };
  if (c.linkState !== 'linked' || normalizeId(c.targetTechniqueId) == null) {
    return { label: UNLINKED_LABEL, disabled: true, conditionLabel };
  }
  return { label: null, disabled: false, conditionLabel };
}

/** 설명 검토 상태 라벨 — 알려진 값만 이름을 붙이고, 나머지는 '미확인'(검토 완료로 단정하지 않음). */
export function reviewLabel(review) {
  const status = str(review?.status);
  if (status === 'coach_draft' || status === 'coach_draft_existing') return '관장 초안';
  return '검토 상태 미확인';
}

/** 흔한 실수의 근거 라벨. coach_general = 출처가 아니라 관장 일반 조언. */
export function mistakesBasisLabel(basis) {
  if (basis === 'coach_general') return '관장 일반 조언';
  return null;
}

/**
 * 같은 모달 안 기술 이동 이력.
 * state = { activeId, stack: [이전 id...] }
 * - push: 현재 id 를 stack 에 쌓고 이동. 자기 자신·빈 id 는 무시.
 * - pop: 한 단계 되돌아감. stack 이 비면 그대로.
 * - reset: 새 루트로 초기화.
 */
export function initHistory(id) {
  return { activeId: normalizeId(id) ?? id ?? null, stack: [] };
}

export function historyReducer(state, action) {
  const s = state && Array.isArray(state.stack) ? state : initHistory(state?.activeId);
  const type = action?.type;
  if (type === 'reset') return initHistory(action.id);
  if (type === 'push') {
    const next = normalizeId(action.id);
    if (next == null || next === s.activeId) return s;
    return { activeId: next, stack: [...s.stack, s.activeId] };
  }
  if (type === 'pop') {
    if (!s.stack.length) return s;
    return { activeId: s.stack[s.stack.length - 1], stack: s.stack.slice(0, -1) };
  }
  return s;
}

/**
 * 늦은 응답 무시용 가드. key(예: 'mastery'·'reference')별로 마지막 요청만 유효하다.
 * const g = createLatestGuard(); const tk = g.begin('reference'); ... if (g.isCurrent(tk)) apply();
 */
export function createLatestGuard() {
  const latest = new Map();
  let seq = 0;
  return {
    begin(key = 'default') {
      seq += 1;
      latest.set(key, seq);
      return { key, seq };
    },
    isCurrent(token) {
      return !!token && latest.get(token.key) === token.seq;
    },
    cancel(key = 'default') {
      seq += 1;
      latest.set(key, seq);
    },
  };
}
