// 하단 내비 "클릭 토글" 상태 기계.
//
// 🔴 이 파일은 React·DOM에 의존하지 않는 순수 로직만 담는다.
//    localStorage를 인자로 주입받으므로 Node에서 가짜 저장소로 직접 실행·검증할 수 있다
//    (QA 하네스 03-toggle-logic.js). 여기에 컴포넌트/훅을 추가하지 마라 — 테스트 가능성이 설계 요건이다.
//
// 동작은 기존 Layout.jsx의 handleTechTabClick과 동일하다:
//   앞이면 뒤로 · 뒤면 앞으로 · 둘 다 아니면(다른 탭에서 넘어옴) 항상 앞 → last 저장 → 토스트 1회 → navigate
//   (2026-09-14 사용자 결정으로 "짝 밖 → last" 를 "짝 밖 → 앞" 으로 바꿨다 — nextTarget 주석 참고)

// ─── localStorage 안전 접근 (프라이빗 모드에서 throw) ────────────────────────
// 읽기는 "값이 없다"와 "저장소를 못 읽었다"를 구분해야 한다 — 둘 다 null 로 뭉뚱그리면
// 저장소가 막힌 환경에서 토스트 1회 플래그가 영원히 서지 않는다(applyToggle 참고).
function tryRead(storage, key) {
  try {
    if (!storage) return { value: null, ok: false };
    return { value: storage.getItem(key), ok: true };
  } catch {
    return { value: null, ok: false };
  }
}

export function readKey(storage, key) {
  return tryRead(storage, key).value;
}

export function writeKey(storage, key, value) {
  try {
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** 브라우저 localStorage (없거나 접근 불가면 null) */
export function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

// ─── 짝 설정 ────────────────────────────────────────────────────────────────
// 🔴 lastKey / toastKey 는 짝마다 반드시 서로 다르다(격리). 그리고 tech 짝은
//    사용자 브라우저에 이미 값이 들어 있는 **기존 키를 그대로** 쓴다 — 바꾸면
//    마지막에 보던 화면 기억이 날아가고 안 뜨던 토스트가 다시 뜬다.
export const TOGGLE_PAIRS = {
  // 2번째 탭 — 수업(앞) ↔ 복기(뒤)
  recall: {
    key: 'recall',
    front: { to: '/calendar', label: '수업', icon: 'calendar' },
    back: { to: '/recall', label: '복기', icon: 'search' },
    // /calendar 에는 하위 라우트가 없다(편집기는 CalendarPage 내부 상태) → 정확히 일치만 본다
    matchFront: (p) => p === '/calendar',
    matchBack: (p) => p === '/recall',
    lastKey: 'bjj-recall-last',
    toastKey: 'bjj-recall-toggle-toast-seen',
    toastMsg: '탭을 다시 누르면 수업 ↔ 복기 화면이 전환돼요',
  },

  // 4번째 탭 — 기술(앞) ↔ 영상분석(뒤). 🔴 기존 탭 — 회귀 0이 최우선
  tech: {
    key: 'tech',
    front: { to: '/techplan', label: '기술', icon: 'book' },
    back: { to: '/study', label: '영상분석', icon: 'video' },
    matchFront: (p) => p === '/techplan',
    matchBack: (p) => p === '/study' || p.startsWith('/study/'),
    lastKey: 'bjj-tech-last', // 🔴 기존 키 — 절대 바꾸지 마라
    toastKey: 'bjj-tech-toggle-toast-seen', // 🔴 기존 키 — 절대 바꾸지 마라
    toastMsg: '탭을 다시 누르면 기술 ↔ 영상분석 화면이 전환돼요',
  },

  // 5번째 탭 — 연구(앞) ↔ 분석(뒤). 🔴 연구가 앞이다(최초 진입 = /research)
  research: {
    key: 'research',
    front: { to: '/research', label: '연구', icon: 'target' },
    back: { to: '/coach', label: '분석', icon: 'brain' },
    matchFront: (p) => p === '/research',
    matchBack: (p) => p === '/coach',
    lastKey: 'bjj-research-last',
    toastKey: 'bjj-research-toggle-toast-seen',
    toastMsg: '탭을 다시 누르면 연구 ↔ 분석 화면이 전환돼요',
  },
};

// ─── 상태 판정 ──────────────────────────────────────────────────────────────
/**
 * 현재 경로가 이 짝의 어느 쪽인지. 짝 밖이면 null.
 * @returns {'front'|'back'|null}
 */
export function resolveSide(pair, pathname) {
  const p = typeof pathname === 'string' ? pathname : '';
  if (pair.matchBack(p)) return 'back';
  if (pair.matchFront(p)) return 'front';
  return null;
}

/** 탭에 지금 표시할 쪽 (뒤에 있을 때만 뒤, 그 외 = 짝 밖 포함 = 앞) */
export function visibleSide(pair, pathname) {
  return resolveSide(pair, pathname) === 'back' ? pair.back : pair.front;
}

/** 이 짝이 활성 상태인가(= 현재 경로가 짝 안) */
export function isPairActive(pair, pathname) {
  return resolveSide(pair, pathname) !== null;
}

// ─── 토글 실행 ──────────────────────────────────────────────────────────────
/**
 * 탭 클릭 시 어디로 갈지 결정한다 (저장소를 읽지 않는다).
 * 앞 → 뒤 · 뒤 → 앞 · **짝 밖(다른 탭에서 넘어옴) → 항상 앞**.
 *
 * 🔴 2026-09-14 사용자 결정: "다른 메뉴를 갔다가 이동시 무조건 앞에 메뉴로" — 예) 홈 → 수업 → 복기 → 홈 → 수업 탭
 *    이면 복기가 아니라 **수업**. 예전(task-023)에는 짝 밖에서 누르면 마지막에 보던 쪽(lastKey)으로 갔다.
 *    `storage` 인자는 호출부 호환을 위해 남겨 두고, lastKey 는 applyToggle 이 계속 기록만 한다(더는 이동에 쓰지 않음).
 */
// eslint-disable-next-line no-unused-vars
export function nextTarget(pair, pathname, storage) {
  const side = resolveSide(pair, pathname);
  if (side === 'front') return pair.back.to;
  if (side === 'back') return pair.front.to;
  return pair.front.to;
}

// ─── 토스트 1회 메모 (저장소가 막힌 환경 전용) ──────────────────────────────
// 🔴 모듈 전역 상태로 두지 마라. 순수성이 깨지고 QA 하네스가 한 프로세스에서 여러 시나리오를
//    돌릴 때 플래그가 시나리오 간에 샌다. 메모는 반드시 호출자가 소유하고 인자로 넘긴다
//    (Layout.jsx 의 useRef = 마운트 1개, 하네스는 시나리오마다 새 메모).
/** 호출자 수명 동안 "이미 띄운 토스트"를 기억할 빈 메모 */
export function createToggleMemo() {
  return { shownToasts: {} };
}

function memoHasToast(memo, key) {
  return !!(memo && memo.shownToasts && memo.shownToasts[key]);
}

function memoAddToast(memo, key) {
  if (memo && memo.shownToasts) memo.shownToasts[key] = true;
}

/**
 * 탭 클릭 부작용까지 수행한다: last 저장 + 토스트 1회 플래그.
 * 순수하게 유지하기 위해 navigate/showToast는 하지 않고 결과만 돌려준다.
 *
 * memo 는 호출자가 소유하는 메모(createToggleMemo). 🔴 저장소 접근이 실패했을 때만 관여한다 —
 * 저장소가 정상이면 메모는 끝까지 비어 있고 localStorage 가 단일 소스다. 저장소가 막혀
 * 플래그를 남길 수 없을 때만 메모가 옛 React state(toastShown) 역할을 대신해
 * "마운트당 토스트 1회"를 지킨다(넘기지 않으면 그 환경에서 클릭마다 토스트가 뜬다).
 *
 * @returns {{ target: string, toast: string|null }}
 */
export function applyToggle(pair, pathname, storage, memo) {
  const target = nextTarget(pair, pathname, storage);
  writeKey(storage, pair.lastKey, target);

  let toast = null;
  const seen = tryRead(storage, pair.toastKey);
  if (seen.value !== '1') {
    if (!memoHasToast(memo, pair.toastKey)) toast = pair.toastMsg;
    const wrote = writeKey(storage, pair.toastKey, '1');
    // 읽기나 쓰기 중 하나라도 실패했다면 플래그가 저장소에 남지 못한다 → 메모가 기억한다.
    if (!seen.ok || !wrote) memoAddToast(memo, pair.toastKey);
  }
  return { target, toast };
}

// ─── 코치 리포트 초록 점 ────────────────────────────────────────────────────
export const COACH_SEEN_KEY = 'bjj-coach-seen-at';

/**
 * 최신 코치 리포트가 사용자가 마지막으로 /coach를 본 시각보다 새로운가.
 * 판정 불가(값 없음·파싱 실패)는 전부 false로 떨어뜨려 점을 앰버로 유지한다 —
 * 내비는 어떤 경우에도 깨지지 않아야 한다.
 */
export function hasUnseenReport(latestCreatedAt, seenAt) {
  if (!latestCreatedAt) return false;
  const created = Date.parse(latestCreatedAt);
  if (Number.isNaN(created)) return false;
  if (!seenAt) return true; // 한 번도 본 적 없음 → 새 리포트로 본다
  const seen = Date.parse(seenAt);
  if (Number.isNaN(seen)) return true; // 워터마크가 깨졌으면 안 본 것으로 취급
  return created > seen;
}
