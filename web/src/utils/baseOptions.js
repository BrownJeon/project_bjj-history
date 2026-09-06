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

// 칩 전용 핵심 기술 15개 — 고정 개수, 기록이 쌓여도 변하지 않음
export const KEY_TECHNIQUES = [
  '삼각조르기', '암바', '기무라', '길로틴', 'RNC',
  '힙범프 스윕', '시저스윕', '펜듈럼 스윕',
  '싱글렉', '더블렉', '백테이크', '바우앤애로우',
  '가드 리커버리', '옴플라타', '크로스초크',
];

export const BASE_CATEGORIES = [
  '관절기', '초크', '스윕', '테이크다운', '포지셔닝',
];

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
