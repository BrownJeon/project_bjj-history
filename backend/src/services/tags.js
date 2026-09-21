// 정본 태그 목록 — services/positions.js 와 동일한 패턴(합집합 + NFC 정규화)이지만
// 저장소가 2곳뿐이다: techniques.tags · video_clips.tags (drills·spar_sessions에는 태그 컬럼이 없다).
const { Technique, VideoClip } = require('../models');
const { toNFC } = require('../utils/nfc');

/** techniques.tags · video_clips.tags 의 JSON 배열(또는 레거시 단일 문자열) 파싱. */
function parseTags(raw) {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.filter(Boolean);
    if (p) return [String(p)];
  } catch {
    return raw ? [raw] : [];
  }
  return [];
}

/**
 * 이 사용자가 실제로 쓰고 있는 태그 목록 + 2개 저장소별 사용 횟수.
 * @returns {Promise<Array<{name, techCount, clipCount}>>} 이름 오름차순(ko 로케일).
 */
async function listTags(uid) {
  const techCounter = new Map();
  const techRows = await Technique.findAll({ where: { user_id: uid }, attributes: ['tags'], raw: true });
  for (const row of techRows) {
    for (const t of parseTags(row.tags).map(toNFC)) techCounter.set(t, (techCounter.get(t) || 0) + 1);
  }

  const clipCounter = new Map();
  const clipRows = await VideoClip.findAll({ where: { user_id: uid }, attributes: ['tags'], raw: true });
  for (const row of clipRows) {
    for (const t of parseTags(row.tags).map(toNFC)) clipCounter.set(t, (clipCounter.get(t) || 0) + 1);
  }

  const allNames = new Set([...techCounter.keys(), ...clipCounter.keys()]);
  return [...allNames]
    .map(name => ({
      name,
      techCount: techCounter.get(name) || 0,
      clipCount: clipCounter.get(name) || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

module.exports = { listTags, parseTags };
