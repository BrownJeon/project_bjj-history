// 스파링 기술 선택기(components/TechPicker)의 순수 로직 — 정규화·자모 검색·비슷한 이름·보류 판정·사용 횟수.
// task-046 1단계 데모에서 Reviewer 가 검증한 코드를 옮겨 왔다(데모 화면은 task-047 에서 삭제). 화면·DB 는 모른다.
//
// 🔴 카테고리는 **DB `techniques.category`** 를 읽는다(baseOptions.categoryGroup). 데모처럼 이름 → 카테고리
//    상수로 덮어쓰지 않는다 — 분류는 기술 관리 화면에서 사용자가 바꾸고, 처음 값은 1회성 백필이 채운다.
import { TECH_CATEGORIES, EXCLUDED_CATEGORIES, categoryGroup } from './baseOptions';

// ─── 이름 정규화 — backend/src/utils/techMatch.js normalize() 와 **같은 규칙** ─────────────────
// NFC + 소문자 + 공백/하이픈/중점(· ㆍ ・) 제거. "시저스스윕" ≡ "시저스 스윕".
// (기록의 "시저스윕"은 '스'가 하나 빠진 **다른 철자**라 정규화로는 안 붙는다 — `+` 의 "혹시 이거예요?"가 잡는다.)
export function normalize(name) {
  return String(name || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\-·ㆍ・]+/g, '');
}

// 한글 음절 → 자모. 검색은 이걸로 **부분 일치**를 본다 — 휴대폰에서 "기무라"를 치는 도중의 "김"·"기물"도
// "기무라"에 걸리게(ㄱㅣㅁ ⊂ ㄱㅣㅁㅜㄹㅏ). 겹모음·겹받침은 낱자로 푼다(입력 도중 모양과 맞추려고).
const CHO  = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅗㅏ','ㅗㅐ','ㅗㅣ','ㅛ','ㅜ','ㅜㅓ','ㅜㅔ','ㅜㅣ','ㅠ','ㅡ','ㅡㅣ','ㅣ'];
const JONG = ['','ㄱ','ㄲ','ㄱㅅ','ㄴ','ㄴㅈ','ㄴㅎ','ㄷ','ㄹ','ㄹㄱ','ㄹㅁ','ㄹㅂ','ㄹㅅ','ㄹㅌ','ㄹㅍ','ㄹㅎ',
              'ㅁ','ㅂ','ㅂㅅ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const COMPAT_SPLIT = {
  'ㅘ':'ㅗㅏ','ㅙ':'ㅗㅐ','ㅚ':'ㅗㅣ','ㅝ':'ㅜㅓ','ㅞ':'ㅜㅔ','ㅟ':'ㅜㅣ','ㅢ':'ㅡㅣ',
  'ㄳ':'ㄱㅅ','ㄵ':'ㄴㅈ','ㄶ':'ㄴㅎ','ㄺ':'ㄹㄱ','ㄻ':'ㄹㅁ','ㄼ':'ㄹㅂ','ㄽ':'ㄹㅅ','ㄾ':'ㄹㅌ','ㄿ':'ㄹㅍ','ㅀ':'ㄹㅎ','ㅄ':'ㅂㅅ',
};
export function jamo(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) {
      const i = c - 0xAC00;
      out += CHO[Math.floor(i / 588)] + JUNG[Math.floor((i % 588) / 28)] + JONG[i % 28];
    } else {
      out += COMPAT_SPLIT[ch] || ch;
    }
  }
  return out;
}

function lev(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 자모 편집거리 유사도(0~1). 바우앤애로우↔보우 앤 애로우 0.92 · 옴플라타↔오모플라타 0.9 · 니어네이키트 쵸크↔리어네이키드 초크 0.81 */
function jamoSim(aNorm, bNorm) {
  const ja = jamo(aNorm), jb = jamo(bNorm);
  const m = Math.max(ja.length, jb.length);
  if (m < 4) return 0;            // 너무 짧으면 우연히 비슷해진다
  return 1 - lev(ja, jb) / m;
}
export const SIMILAR_MIN = 0.75;

/** `+` 칸의 "혹시 이거예요?" 점수 — 한쪽이 다른 쪽을 품거나(롱스탭 패스 ⊃ 롱스탭) 자모가 비슷하면. 묻기만 한다(자동 연결 안 함). */
export function similarity(aNorm, bNorm) {
  if (!aNorm || !bNorm || aNorm === bNorm) return 0;
  const [s, l] = aNorm.length <= bNorm.length ? [aNorm, bNorm] : [bNorm, aNorm];
  if (s.length >= 2 && l.includes(s)) return 0.9;
  return jamoSim(aNorm, bNorm);
}

// ─── 관장 보류 4종 — 트리 행이 아니다. `+` 에서 **트리 등록 금지**(등록되면 보류가 저절로 결정된다) → "이 기록에만".
// 근거: backend/src/utils/techAliases.js 끝의 "검토했으나 의도적으로 추가하지 않은 별칭 4종"(task-020b) —
//   백 쵸크(리어네이키드 초크·보우 앤 애로우로 갈림) · 암락(암바·기무라로 갈림) · 다스 쵸크·닌자 쵸크(canonical 없음).
//   사용자 결정이 나면 이 목록과 techAliases.js 를 **같이** 고친다.
export const HOLD_NAMES = ['백 쵸크', '암락', '다스 쵸크', '닌자 쵸크'];
const HOLD_NORMS = HOLD_NAMES.map(normalize);
/** 똑같거나 자모가 거의 같으면(백 초크 ↔ 백 쵸크) 보류로 본다. 품는 관계는 보지 않는다(백 쵸크 탈출 ≠ 백 쵸크). */
export function holdOf(norm) {
  const i = HOLD_NORMS.findIndex(h => h === norm || jamoSim(h, norm) >= SIMILAR_MIN);
  return i >= 0 ? HOLD_NAMES[i] : null;
}

// ─── 데이터 가공 ─────────────────────────────────────────────────────────
/** 스파링 기록 전체의 사용 횟수(성공+실패) — 정규화 이름 기준. 문자열 항목은 성공으로 센다(SparEditor 기존값 매핑과 같은 해석). */
export function buildUsage(classes) {
  const map = new Map();
  for (const c of classes || []) {
    for (const sd of c.spar_days || []) {
      for (const s of sd.sessions || []) {
        for (const t of Array.isArray(s.success) ? s.success : []) {
          const key = normalize(typeof t === 'string' ? t : t?.name);
          if (!key) continue;
          const u = map.get(key) || { succ: 0, fail: 0 };
          if (t && typeof t === 'object' && t.success === false) u.fail++; else u.succ++;
          map.set(key, u);
        }
      }
    }
  }
  return map;
}

/**
 * 트리 기술 → 선택기 목록. 그룹 = DB category(옛 값은 새 체계로 읽기만 — baseOptions.categoryGroup).
 * 동명 중복(앵클락 2행)은 낮은 id 하나만 — 서버 matchTechnique 의 pickLowestId 와 같은 기준.
 * 그 낮은 id 행의 category 를 쓴다(중복 행끼리 category 가 다르면 한쪽만 보인다 — 기술 관리 화면에서 맞추면 된다).
 */
export function buildPool(techniques, usageMap) {
  const byKey = new Map();
  const sorted = [...(techniques || [])].sort((a, b) => (a.id || 0) - (b.id || 0));
  for (const t of sorted) {
    const key = normalize(t.name);
    if (!key) continue;
    if (byKey.has(key)) { byKey.get(key).rows++; continue; }
    const group = categoryGroup(t.category);
    const u = usageMap?.get(key) || { succ: 0, fail: 0 };
    byKey.set(key, {
      id: t.id, name: t.name, key, group, rows: 1, jamo: jamo(key),
      selectable: TECH_CATEGORIES.includes(group), excluded: EXCLUDED_CATEGORIES.includes(group),
      succ: u.succ, fail: u.fail, count: u.succ + u.fail,
    });
  }
  return [...byKey.values()];
}

/** 카테고리 버튼에 붙는 개수 — 6개 카테고리별 선택 가능 기술 수 */
export function countByCategory(pool) {
  const m = Object.fromEntries(TECH_CATEGORIES.map(k => [k, 0]));
  for (const t of pool || []) if (t.selectable) m[t.group]++;
  return m;
}

export const byUsage = (a, b) => (b.count - a.count) || a.name.localeCompare(b.name, 'ko');

/** 검색 결과 이름표 — 6개 카테고리 · 미분류 그대로, 포지션·기타는 「· 제외」 */
export function groupLabel(t) {
  return t.excluded ? `${t.group} · 제외` : t.group;
}

/** 검색 — 띄어쓰기 무시, **고른 카테고리 밖까지**. 순서: 똑같은 이름 → 고른 카테고리 → 다른 카테고리 → 미분류 → 제외. */
export function searchPool(pool, query, cat) {
  const qn = normalize(query);
  if (!qn) return { qn, results: [], exact: null };
  const qj = jamo(qn);
  const rank = t => (t.group === cat ? 0 : t.selectable ? 1 : t.excluded ? 3 : 2);
  const results = pool
    .filter(t => t.jamo.includes(qj))
    .sort((a, b) => ((b.key === qn) - (a.key === qn)) || (rank(a) - rank(b)) || byUsage(a, b));
  return { qn, results, exact: pool.find(t => t.key === qn) || null };
}

/** `+` 칸의 "혹시 이거예요?" 후보 — 위 4개까지 */
export function similarTo(pool, qn) {
  if (!qn) return [];
  return pool.map(t => ({ t, s: similarity(qn, t.key) })).filter(x => x.s >= SIMILAR_MIN)
    .sort((a, b) => b.s - a.s || byUsage(a.t, b.t)).slice(0, 4).map(x => x.t);
}
