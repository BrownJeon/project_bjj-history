// 참고영상 사용 기록 표시 헬퍼 (task-035)
// 서버 응답 모양: clip.usage = { view, drill, position_spar, spar, used, last_used_on, last_viewed_on, recent[] }
// (backend/src/services/clipUsage.js getUsageMap)

export const USAGE_KIND_LABEL = {
  view: '게시물 조회',
  drill: '드릴',
  position_spar: '포지션 스파링',
  spar: '스파링',
};

// 수동 +1 버튼 순서 — 사다리 순서(드릴 → 포지션 스파링 → 스파링)와 같다
export const MANUAL_KINDS = ['drill', 'position_spar', 'spar'];

// masteryChecked/masteryUnchecked 의 step → 화면 라벨
export const MASTERY_STEP_LABEL = {
  drilled: '드릴',
  position_spar: '포지션 스파링',
};

export const EMPTY_USAGE = Object.freeze({
  view: 0, drill: 0, position_spar: 0, spar: 0, used: 0,
  last_used_on: null, last_viewed_on: null, recent: [],
});

/** usage 가 없거나 모양이 어긋나도 화면이 깨지지 않게 기본값을 채운다. */
export function usageOf(clip) {
  const u = clip && clip.usage;
  if (!u || typeof u !== 'object') return EMPTY_USAGE;
  return { ...EMPTY_USAGE, ...u, recent: Array.isArray(u.recent) ? u.recent : [] };
}

/**
 * 'YYYY-MM-DD' → 'M/D'. 🔴 new Date('YYYY-MM-DD') 로 파싱하지 않는다 — UTC 자정으로 해석돼
 * 서쪽 시간대에서는 하루 전으로 보인다. 서버가 이미 KST 날짜 문자열을 준다.
 */
export function fmtMD(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return '';
  return `${Number(m[2])}/${Number(m[3])}`;
}

/** 여러 clip 의 usage 합계 (기술 카드·기술 상세용). */
export function sumUsage(clips) {
  const s = { view: 0, drill: 0, position_spar: 0, spar: 0, used: 0 };
  for (const c of clips || []) {
    const u = usageOf(c);
    s.view += u.view; s.drill += u.drill; s.position_spar += u.position_spar; s.spar += u.spar; s.used += u.used;
  }
  return s;
}
