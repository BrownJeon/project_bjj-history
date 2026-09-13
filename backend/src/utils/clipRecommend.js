// 연계 기술 AI 추천(POST /api/clips/:id/recommend) 의 저장·응답 모양과 캐시 무효화 판정 — task-036
//
// [모양] { techniques: [{ name, reason }], combos: [{ title, steps: string[] }] }
//   - 서버 프롬프트(routes/clips.js)가 요구하는 모양 그대로다. 화면(ClipRecommendSection)은 이 키만 읽는다.
//   - AI 가 모양을 조금 어겨도(문자열 항목, 누락 키) 여기서 흡수해 화면이 비지 않게 한다.
//   - 🔴 두 배열이 모두 비면 null — 호출부는 저장하지 말고 500 으로 실패를 알린다(빈 추천을 캐시하면
//     `다시 추천` 전까지 영원히 빈 화면이 된다).
//
// [캐시 무효화] 추천의 재료는 영상의 description 과 기술명(tech_name) 뿐이다. 둘 중 하나가 실제로
//   달라졌을 때만 ai_recommendation 을 NULL 로 비운다(recommendInputsChanged).

const str = (v) => {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
};

function normalizeTechnique(t) {
  if (typeof t === 'string') { const name = t.trim(); return name ? { name, reason: '' } : null; }
  if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
  const name = str(t.name);
  if (!name) return null;
  return { name, reason: str(t.reason) };
}

function normalizeCombo(c) {
  if (typeof c === 'string') { const title = c.trim(); return title ? { title, steps: [] } : null; }
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const title = str(c.title);
  const steps = Array.isArray(c.steps) ? c.steps.map(str).filter(Boolean) : [];
  if (!title && !steps.length) return null;
  return { title, steps };
}

/**
 * AI 가 준 객체(또는 저장된 캐시)를 계약 모양으로 맞춘다.
 * @returns {{techniques: {name:string, reason:string}[], combos: {title:string, steps:string[]}[]} | null}
 *          두 배열이 모두 비면 null.
 */
function normalizeRecommendation(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const techniques = (Array.isArray(parsed.techniques) ? parsed.techniques : []).map(normalizeTechnique).filter(Boolean);
  const combos = (Array.isArray(parsed.combos) ? parsed.combos : []).map(normalizeCombo).filter(Boolean);
  if (!techniques.length && !combos.length) return null;
  return { techniques, combos };
}

/** Claude 원문에서 JSON 객체를 꺼낸다(코드펜스·앞뒤 설명 허용). 실패하면 null. */
function parseRecommendationText(raw) {
  try {
    const cleaned = String(raw ?? '').replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) return null;
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** video_clips.tech_name(JSON 배열 / 옛 단일 문자열) → 이름 배열(NFC). routes/clips.js normalize 와 같은 해석. */
function techNameList(techName) {
  let techs = [];
  try {
    const p = JSON.parse(techName);
    if (Array.isArray(p)) techs = p.filter(Boolean);
    else if (p) techs = [String(p)];
  } catch {
    if (techName) techs = [String(techName)];
  }
  return techs.map((n) => (typeof n === 'string' ? n.normalize('NFC') : n));
}

/**
 * 추천 재료가 실제로 달라졌는가 — PUT /api/clips/:id 에서 옛 행과 **저장될 값**을 비교한다.
 * description 은 null/'' 를 같게 본다. 기술명은 해석한 배열(NFC)을 순서까지 비교한다(프롬프트에 그 순서로 들어간다).
 */
function recommendInputsChanged(oldRow, next) {
  const oldDesc = oldRow?.description ?? '';
  const newDesc = next?.description ?? '';
  if (oldDesc !== newDesc) return true;
  return JSON.stringify(techNameList(oldRow?.tech_name)) !== JSON.stringify(techNameList(next?.tech_name));
}

module.exports = { normalizeRecommendation, parseRecommendationText, techNameList, recommendInputsChanged };
