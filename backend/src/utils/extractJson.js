// Claude 응답에서 JSON 객체를 추출하는 공용 유틸.
// 기존에 voiceAnalysis.js/enhance-memo.js/coach.js 3곳에 동일한 구현이 중복돼 있었다
// (task-008에서 4번째 중복을 만들지 않기 위해 여기로 승격 — 원본은 voiceAnalysis.js:33-43).
function extractJSONObject(text) {
  const cleaned = text.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON 객체를 찾을 수 없습니다');
  let jsonStr = cleaned.slice(start, end + 1);
  // 따옴표로 묶인 문자열 안의 원본 개행만 이스케이프 (JSON.parse 실패 방지)
  jsonStr = jsonStr.replace(/"(?:[^"\\]|\\.)*"/g, m =>
    m.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n')
  );
  return JSON.parse(jsonStr);
}

module.exports = { extractJSONObject };
