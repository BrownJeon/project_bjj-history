// 정본 포지션 목록 (task-030 — routes/techniques.js `GET /positions` 에서 추출).
//
// 🔴 **추출의 목적은 "한 벌만 두는 것"이다.** 관장(MCP `list_positions`)과 화면(`GET /api/techniques/positions`)이
//   서로 다른 목록을 보면, 관장이 제안한 시작 포지션이 관리 화면에는 없는 이름이 된다.
//   페르소나 원칙 4("새 이름을 만들지 않습니다")를 지킬 근거가 이 함수 하나뿐이다.
//
// 🔴 **로직은 한 줄도 바꾸지 않았다.** 라우트에 있던 코드를 그대로 옮기고 라우트가 이 함수를 부른다 —
//   응답이 바이트 단위로 같아야 한다(Reviewer 대조 항목 ④). 개선하고 싶은 게 보여도 이 task 에서는 하지 않는다.
//
// 배경(원래 라우트의 주석을 그대로 옮긴다 — 이 결정들이 왜 그런지가 사라지면 안 된다):
//
// task-014: 4개 카운터의 키를 전부 NFC로 통일한다.
//   안 하면 techniques.pos에 NFD "클로즈가드", video_clips.position에 NFC "클로즈가드"가
//   있을 때 서로 다른 키가 되어 화면에 "참고영상 0건"으로 나온다 — 실제로는 1건인데.
//   사용자는 이 숫자를 보고 "이 포지션 지워도 영향 없겠네"라고 판단하므로 조용한 오답이 위험하다.
//   목록에 내려주는 name도 NFC가 되므로, 프론트가 그 이름으로 호출하는 rename/삭제 API가
//   NFD로 저장된 행까지 정규화 비교로 함께 잡아낸다.
//
// task-016: 목록은 4개 저장소(기술·영상·드릴·스파링)에 쓰인 이름의 **합집합**이다.
//   예전에는 techCounter의 키만 내려줬다. 그래서 기술에는 없고 영상·드릴에만 쓰인 이름
//   (운영 실측 8종)이 관리 화면에 아예 뜨지 않아 **이름을 고칠 수도 지울 수도 없었다.**
//   rename/삭제 API는 4곳을 다 훑는데 목록이 그 이름을 안 내려주니 프론트가 호출할 방법이 없었던 것.
const { sequelize } = require('../config/db');
const { Technique, VideoClip } = require('../models');
const { toNFC } = require('../utils/nfc');

/** techniques.pos · video_clips.position 의 JSON 배열(또는 레거시 단일 문자열) 파싱. */
function parsePos(raw) {
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
 * 이 사용자가 실제로 쓰고 있는 포지션 목록 + 4개 저장소별 사용 횟수.
 * @returns {Promise<Array<{name, count, techCount, clipCount, drillCount, sparCount}>>}
 *          이름 오름차순(ko 로케일). 라우트 응답과 **같은 배열**이다.
 */
async function listPositions(uid) {
  const techCounter = new Map();
  const techRows = await Technique.findAll({ where: { user_id: uid }, attributes: ['pos'], raw: true });
  for (const row of techRows) {
    for (const p of parsePos(row.pos).map(toNFC)) techCounter.set(p, (techCounter.get(p) || 0) + 1);
  }

  const clipCounter = new Map();
  const clipRows = await VideoClip.findAll({ where: { user_id: uid }, attributes: ['position'], raw: true });
  for (const row of clipRows) {
    for (const p of parsePos(row.position).map(toNFC)) clipCounter.set(p, (clipCounter.get(p) || 0) + 1);
  }

  const drillCounter = new Map();
  const [drillRows] = await sequelize.query(
    `SELECT d.pos FROM drills d JOIN classes c ON d.class_id = c.id WHERE c.user_id = ? AND d.pos IS NOT NULL AND d.pos != ''`,
    { replacements: [uid] }
  );
  for (const row of drillRows) { const p = toNFC(row.pos); drillCounter.set(p, (drillCounter.get(p) || 0) + 1); }

  const sparCounter = new Map();
  const [sparRows] = await sequelize.query(
    `SELECT ss.positions FROM spar_sessions ss
     JOIN spar_days sd ON ss.spar_day_id = sd.id
     JOIN classes c ON sd.class_id = c.id
     WHERE c.user_id = ?`,
    { replacements: [uid] }
  );
  for (const row of sparRows) {
    let entries;
    try { entries = JSON.parse(row.positions || '[]'); } catch { entries = []; }
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (e?.name) { const p = toNFC(e.name); sparCounter.set(p, (sparCounter.get(p) || 0) + 1); }
    }
  }

  const allNames = new Set([
    ...techCounter.keys(), ...clipCounter.keys(), ...drillCounter.keys(), ...sparCounter.keys(),
  ]);
  return [...allNames]
    .map(name => ({
      name,
      count:      techCounter.get(name) || 0, // 기존 프론트 호환용 (기술 수)
      techCount:  techCounter.get(name)  || 0,
      clipCount:  clipCounter.get(name)  || 0,
      drillCount: drillCounter.get(name) || 0,
      sparCount:  sparCounter.get(name)  || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/** 이름만 (관장의 `list_positions` 가 쓰는 형태 — 정본 어휘 목록). */
async function positionNames(uid) {
  return (await listPositions(uid)).map(p => p.name);
}

module.exports = { listPositions, positionNames, parsePos };
