// legacy <select> 기본 옵션 — 자동완성/TagPicker 후보로 합쳐 사용
// README §"미리 정의된 추천 목록" 기반 확장 (Phase 3)

export const BASE_POSITIONS = [
  '클로즈드 가드', '오픈 가드', '하프 가드', '데라히바', '스파이더 가드',
  'X가드', '버터플라이 가드', '래소 가드',
  '사이드 컨트롤', '마운트', '백 마운트', '니온벨리', '터틀',
  '스탠딩', '하프가드 탑', '50/50',
  // 상위 카테고리 표기 (정본) + 관용 표기
  '가드', '패스', '백',
  '하프가드', '스탠딩 / 테이크다운',
];

export const BASE_TECHNIQUES = [
  '삼각조르기', '암바', '기무라', '길로틴', 'RNC', '옴플라타',
  '크로스초크', '에제키엘',
  '니슬라이스 패스', '스매시 패스', '롱스텝 패스', '레그드래그', '불파이터 패스',
  '힙범프 스윕', '시저스윕', '펜듈럼 스윕',
  '싱글렉', '더블렉', '스냅다운', '풋스윕',
  '백테이크', '시트벨트 그립', '바우앤애로우', '베림볼로',
  '언더훅 패스', '니쉴드 리텐션', '프레임 셋업',
  '가드 리커버리', '토홀드', '힐훅', '스트레이트 풋락',
];

export const BASE_WEAKNESSES = [
  '패스 디펜스', '그립 파이팅', '포스쳐 관리', '힙 무브먼트',
  '프레임 유지', '테이크다운 디펜스', '가드 리텐션', '스크램블',
  '체력 관리', '멘탈', '타이밍', '압박 유지',
  '서브미션 디펜스', '백 탈출', '마운트 탈출',
];

// ─── 기술 카테고리 — 기술트리 `techniques.category` 의 값 체계 (task-046 관장 제안 ② · task-047 적용) ─────────
// 🔴 이 상수가 한 벌이다. 스파링 기술 선택기(components/TechPicker)·기술 관리 화면(TechPlanPage 편집 모달)·
//    1회성 백필(backend/scripts/task-047-backfill-tech-categories.js)이 같은 값을 쓴다. 값을 바꾸면 셋 다 본다.
// 스파링 선택지 = 아래 6개. 가드는 "뭘 했나"가 아니라 "어디서 했나"라 카테고리로 두지 않는다(→ 포지션).
export const TECH_CATEGORIES = ['서브미션', '패스', '스윕', '컨트롤', '탈출', '테이크다운'];

export const TECH_CATEGORY_DESC = {
  '서브미션':   '탭을 받아내는 기술 — 조르기·꺾기 전부',
  '패스':       '상대 가드를 넘어 위를 잡는 것',
  '스윕':       '가드(아래)에서 뒤집고 올라가는 것',
  '컨트롤':     '백·마운트·사이드를 잡거나 지키는 것, 백테이크 포함',
  '탈출':       '서브미션·불리한 자리에서 빠져나오기, 가드 되찾기 포함',
  '테이크다운': '선 자세에서 넘기기',
  '포지션':     '가드·자리 이름 — 스파링 선택지엔 안 나오고 검색하면 보여요',
  '기타':       '묶음 이름 등 — 스파링 선택지엔 안 나오고 검색하면 보여요',
};

// 스파링 카테고리 목록에 안 나오는 값. 검색하면 「○○ · 제외」 이름표로 보이고 고를 수도 있다(task-047 결정 M1).
export const EXCLUDED_CATEGORIES = ['포지션', '기타'];

// 옛 값(task-046 이전 체계) → 지금 체계. **표시·분류에만** 쓴다 — DB 값을 몰래 바꾸지 않는다.
// 다른 사용자·백필 전 데이터도 스파링 선택기에서 제자리에 보이게 하려는 것.
export const LEGACY_CATEGORY_MAP = { '관절기': '서브미션', '초크': '서브미션', '포지셔닝': '포지션' };

/** DB category 값 → 선택기 그룹(6개 · 포지션 · 기타 · 미분류). 빈 값·모르는 값 = 미분류(검색으로만). */
export function categoryGroup(category) {
  const c = String(category ?? '').normalize('NFC').trim();
  if (!c) return '미분류';
  if (TECH_CATEGORIES.includes(c) || EXCLUDED_CATEGORIES.includes(c)) return c;
  return LEGACY_CATEGORY_MAP[c] || '미분류';
}

export const BELT_LEVELS = ['화이트', '블루', '퍼플', '브라운', '블랙'];

// 벨트 라벨 → BeltBar color 키 매핑
export const BELT_KEY_BY_LABEL = {
  '화이트': 'white', white: 'white', White: 'white',
  '블루':   'blue',  blue:  'blue',  Blue:  'blue',
  '퍼플':   'purple', purple: 'purple', Purple: 'purple',
  '브라운': 'brown', brown: 'brown', Brown: 'brown',
  '블랙':   'black', black: 'black', Black: 'black',
};

export function beltKey(label) {
  return BELT_KEY_BY_LABEL[(label || '').toString().trim()] || 'white';
}

// 중복 제거 + 빈 문자열 제거 + 등록 순서 유지
export function mergeUnique(...lists) {
  const set = new Set();
  for (const list of lists) {
    for (const v of (list || [])) {
      const s = (v || '').toString().trim();
      if (s) set.add(s);
    }
  }
  return Array.from(set);
}
