// 기술트리 결정적 매칭 — task-009 Phase 3, 설계서 §6 1~4단계
// AI 재호출 없음(Node 로직만). 5~6단계(미매칭 자동생성 금지, 승인 후 연동)는
// services/longVideoPipeline.js(S10)와 routes/longVideos.js(apply 엔드포인트)가 담당한다.
const { TECH_ALIASES } = require('./techAliases');

const FUZZY_THRESHOLD = 0.75;

// 1단계: 정규화 — NFC + 소문자 + 공백/하이픈/중점 제거 (설계서 §6)
// "가드패스" ≡ "가드 패스" 가 되도록. 중점은 · (U+00B7)와 한글 가운뎃점 ㆍ(U+318D)/・(U+30FB) 모두 커버.
function normalize(name) {
  return String(name || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\-·ㆍ・]+/g, '');
}

// 정규화된 별칭 맵을 1회만 만들어 재사용 (모듈 로드 시 1회 계산)
const NORMALIZED_ALIASES = new Map(
  Object.entries(TECH_ALIASES).map(([alias, canonical]) => [normalize(alias), canonical])
);

// 4단계 fuzzy용 토큰화 — 원문(공백 기준 단어 분리, 소문자화)에서 단어 집합을 만든다.
// normalize()는 공백을 아예 제거해버리므로 fuzzy 단계에는 쓸 수 없다(단어 경계 정보가 필요).
function tokenize(name) {
  return new Set(
    String(name || '')
      .trim()
      .toLowerCase()
      .split(/[\s\-·ㆍ・]+/)
      .filter(Boolean)
  );
}

function jaccard(setA, setB) {
  if (!setA.size && !setB.size) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union ? intersection / union : 0;
}

// candidates: [{id, name}] — 반드시 해당 사용자 소유로 이미 스코프된 목록을 넘길 것
// (이 함수 자체는 user_id를 모른다 — 호출측이 WHERE user_id = ? 로 필터링한 목록을 넘겨야 함)
//
// 동일 정규화명이 후보 중 2개 이상(예: 실제 DB에 "앵클락"이 중복 등록된 경우)이면 exact/alias
// 단계에서는 낮은 id를 결정적으로 채택한다 — 이름이 문자 그대로 같으므로 오매칭 리스크가 아니라
// 순수 데이터 중복 문제이고, 어느 쪽을 선택해도 "그 기술"이라는 사실 자체는 달라지지 않는다.
function pickLowestId(rows) {
  return rows.reduce((min, r) => (min == null || r.id < min.id ? r : min), null);
}

function matchTechnique(rawName, candidates) {
  const raw = String(rawName || '').trim();
  const norm = normalize(raw);
  const list = Array.isArray(candidates) ? candidates : [];

  if (!norm) {
    return { raw_name: raw, norm_name: norm, technique_id: null, match_type: 'none', matched_name: null };
  }

  // 정규화된 후보 이름 캐시 (같은 리스트로 여러 번 호출될 수 있으므로 매번 map 계산 — 리스트가
  // 작아(개인 기술 트리 수십 개 수준) 캐싱 없이도 비용이 무시할 만하다)
  const withNorm = list.map(c => ({ ...c, __norm: normalize(c.name) }));

  // 2단계: exact
  const exactMatches = withNorm.filter(c => c.__norm === norm);
  if (exactMatches.length) {
    const picked = pickLowestId(exactMatches);
    return { raw_name: raw, norm_name: norm, technique_id: picked.id, match_type: 'exact', matched_name: picked.name };
  }

  // 3단계: alias — 별칭 사전에서 canonical 이름을 찾은 뒤, 그 canonical이 실제로 이 사용자의
  // 기술 트리에 존재할 때만 매칭으로 인정한다(별칭이 가리키는 기술이 이 사용자에게 없으면 실패).
  const canonical = NORMALIZED_ALIASES.get(norm);
  if (canonical) {
    const canonicalNorm = normalize(canonical);
    const aliasMatches = withNorm.filter(c => c.__norm === canonicalNorm);
    if (aliasMatches.length) {
      const picked = pickLowestId(aliasMatches);
      return { raw_name: raw, norm_name: norm, technique_id: picked.id, match_type: 'alias', matched_name: picked.name };
    }
  }

  // 4단계: fuzzy — 토큰 자카드 유사도 ≥0.75 이고 후보가 유일할 때만.
  // 후보가 0개(전혀 안 비슷함) 또는 2개 이상(어느 쪽인지 모호함)이면 매칭 안 함 —
  // 오매칭보다 미매칭이 안전하다는 설계서 §6 원칙 그대로.
  const rawTokens = tokenize(raw);
  const fuzzyCandidates = [];
  for (const c of withNorm) {
    const score = jaccard(rawTokens, tokenize(c.name));
    if (score >= FUZZY_THRESHOLD) fuzzyCandidates.push(c);
  }
  // distinct technique_id 기준 유일성 판정 (동일 기술이 중복 등록된 경우는 여전히 "유일한 기술"로 취급)
  const distinctIds = new Set(fuzzyCandidates.map(c => c.id));
  if (distinctIds.size === 1) {
    const picked = fuzzyCandidates[0];
    return { raw_name: raw, norm_name: norm, technique_id: picked.id, match_type: 'fuzzy', matched_name: picked.name };
  }

  // 5단계: 미매칭 — 자동 생성하지 않는다 (설계서 §6 가장 중요한 안전장치)
  return { raw_name: raw, norm_name: norm, technique_id: null, match_type: 'none', matched_name: null };
}

module.exports = { normalize, tokenize, jaccard, matchTechnique, FUZZY_THRESHOLD };
