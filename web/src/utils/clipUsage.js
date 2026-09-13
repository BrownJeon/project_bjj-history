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

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 여러 clip 의 usage 합계 (기술 카드·기술 상세·기술연구 노드용).
 * last_used_on(task-037) = clip 들의 `usage.last_used_on` 중 최댓값. 'YYYY-MM-DD' 는 사전순 = 날짜순이라
 * **문자열 비교**로 고른다(Date 파싱 금지 — fmtMD 주석과 같은 이유). 모양이 어긋난 값은 건너뛴다. 없으면 null.
 */
export function sumUsage(clips) {
  const s = { view: 0, drill: 0, position_spar: 0, spar: 0, used: 0, last_used_on: null };
  for (const c of clips || []) {
    const u = usageOf(c);
    s.view += u.view; s.drill += u.drill; s.position_spar += u.position_spar; s.spar += u.spar; s.used += u.used;
    const d = u.last_used_on;
    if (typeof d === 'string' && YMD_RE.test(d) && (s.last_used_on === null || d > s.last_used_on)) s.last_used_on = d;
  }
  return s;
}

/**
 * 기술 하나의 사용 기록 상태 (task-037 — 기술연구 트리 노드·노드 시트).
 *
 * 🔴 셀 단위는 **기술(technique_id)** 이다. 노드가 아니다 — 같은 기술을 쓰는 노드는 같은 숫자를 본다.
 *    출처는 `useCache().techniques` 의 `t.clips[].usage` 이고 계산은 sumUsage 하나다(기술트리 카드와 같은 경로).
 *    노드에 수동으로 붙인 clip 링크(research_links)는 합산하지 않는다.
 *
 * 반환:
 *   null                                   — techniqueId 없음 / 캐시에서 기술을 못 찾음 → 표시하지 않는다
 *   { state: 'no_clips', clipCount: 0 }     — 그 기술이 붙은 참고영상이 없다(기록할 방법이 없음)
 *   { state: 'unused', clipCount, ...sum }  — 영상은 있는데 🥋 기록 0
 *   { state: 'used',   clipCount, ...sum }
 * techniqueId 는 숫자/문자열 혼용에 안전하게 Number() 로 비교한다.
 */
export function techniqueUsage(techniques, techniqueId) {
  if (!Array.isArray(techniques)) return null;
  if (typeof techniqueId !== 'number' && typeof techniqueId !== 'string') return null;   // null·undefined·boolean
  if (String(techniqueId).trim() === '') return null;                                   // Number('') === 0 함정
  const id = Number(techniqueId);
  if (!Number.isFinite(id)) return null;
  const t = techniques.find((x) => x != null && x.id != null && Number(x.id) === id);
  if (!t) return null;
  const clips = Array.isArray(t.clips) ? t.clips : [];
  if (clips.length === 0) return { state: 'no_clips', clipCount: 0 };
  const sum = sumUsage(clips);
  return { state: sum.used === 0 ? 'unused' : 'used', clipCount: clips.length, ...sum };
}
