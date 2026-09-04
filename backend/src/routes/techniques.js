const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const fs = require('fs/promises');
const { Technique, VideoClip } = require('../models');
const { wrap, safeParse } = require('../utils/respond');
const { analyzeVideo } = require('../services/videoAnalysis');
const { getFramesDir, getVideoDir } = require('../services/storage');

// 기술명과 매칭되는 미분석 클립을 백그라운드에서 자동 AI 분석
async function triggerAutoAnalysis(techName, userId) {
  const { sequelize } = require('../config/db');
  // tech_name JSON 배열 안에 techName 포함된 미분석 클립 탐색
  const [clips] = await sequelize.query(
    `SELECT id, url FROM video_clips
     WHERE JSON_CONTAINS(tech_name, JSON_QUOTE(?))
       AND user_id = ?
       AND (description IS NULL OR description = '')
       AND (frames IS NULL OR frames = '[]')
     LIMIT 10`,
    { replacements: [techName, userId] }
  );

  const targets = clips.filter(c =>
    /(youtube\.com|youtu\.be|instagram\.com)/.test(c.url || '')
  );
  if (!targets.length) return;

  console.log(`[auto-analyze] 기술 "${techName}" → 미분석 클립 ${targets.length}개 자동 분석 시작`);

  for (const clip of targets) {
    analyzeVideo(clip.url, clip.id)
      .then(async result => {
        const updates = {};
        if (result.savedFrames?.length)
          updates.frames = JSON.stringify(result.savedFrames);
        if (result.description)
          updates.description = result.description;
        if (Object.keys(updates).length)
          await VideoClip.update(updates, { where: { id: clip.id } });
        console.log(`[auto-analyze] clip ${clip.id} 분석 완료 (${result.method})`);
      })
      .catch(e => console.error(`[auto-analyze] clip ${clip.id} 실패:`, e.message));
  }
}

// 기술명(name)과 일치하는 video_clips 자동 연결 — JSON_CONTAINS로 배열 검색
async function loadClipsByNames(names, userId) {
  if (!names.length) return new Map();
  const { sequelize } = require('../config/db');
  const m = new Map();
  for (const name of names) {
    const [rows] = await sequelize.query(
      `SELECT id, title, url, platform, description, starred,
              tech_name, thumb_url, video_file, frames
       FROM video_clips
       WHERE JSON_CONTAINS(tech_name, JSON_QUOTE(?))
         AND user_id = ?
       ORDER BY starred DESC, id DESC`,
      { replacements: [name, userId] }
    );
    if (rows.length) m.set(name, rows);
  }
  return m;
}

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

function posToJson(positions, pos) {
  const arr = Array.isArray(positions)
    ? positions.filter(Boolean)
    : (pos ? [String(pos).trim()] : []);
  return JSON.stringify(arr);
}

router.get('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const rows = await Technique.findAll({
    where: { user_id: uid },
    order: [['starred', 'DESC'], ['name', 'ASC']],
    raw: true,
  });
  const clipsByName = await loadClipsByNames(rows.map(r => r.name), uid);
  rows.forEach(r => {
    r.positions = parsePos(r.pos);
    r.pos       = r.positions[0] || '';
    r.tags  = safeParse(r.tags, []);
    r.clips = (clipsByName.get(r.name) || []).map(c => ({
      ...c,
      tech_names: safeParse(c.tech_name, []).map(x => typeof x === 'string' ? x : x.name || ''),
      frames:     safeParse(c.frames, []),
      video_file: c.video_file || '',
    }));
    r.links = r.clips.map(c => ({ url: c.url, desc: c.title }));
  });
  res.json(rows);
}));

router.post('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const { name, pos, positions, category, tags, note, starred } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '기술명을 입력해주세요' });
  const { Op } = require('sequelize');
  const dup = await Technique.findOne({
    where: {
      user_id: uid,
      name: require('sequelize').where(
        require('sequelize').fn('LOWER', require('sequelize').col('name')),
        name.trim().toLowerCase()
      ),
    },
  });
  if (dup) return res.json({ id: dup.id, existing: true });
  const r = await Technique.create({
    name: name.trim(),
    pos: posToJson(positions, pos),
    category: category || '',
    tags: JSON.stringify(tags || []),
    links: '[]',
    note: note || '',
    starred: starred ? 1 : 0,
    user_id: uid,
  });
  res.json({ id: r.id });
  // 응답 후 백그라운드 자동 분석
  triggerAutoAnalysis(name.trim(), uid).catch(() => {});
}));

router.put('/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const { name, pos, positions, category, tags, note, starred } = req.body;
  const old = await Technique.findOne({ where: { id: req.params.id, user_id: uid } });
  if (!old) return res.status(404).json({ error: 'not found' });
  await Technique.update(
    {
      name,
      pos: posToJson(positions, pos),
      category: category || '',
      tags: JSON.stringify(tags || []),
      note: note || '',
      starred: starred ? 1 : 0,
    },
    { where: { id: req.params.id, user_id: uid } }
  );
  // 기술명 변경 시 video_clips.tech_name 동기화 (해당 유저 클립만)
  if (old.name && name && old.name !== name) {
    await VideoClip.update({ tech_name: name }, { where: { tech_name: old.name, user_id: uid } });
  }
  res.json({ ok: true });
  // 응답 후 백그라운드 자동 분석 (기술명 기준)
  triggerAutoAnalysis(name.trim(), uid).catch(() => {});
}));

router.delete('/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const tech = await Technique.findOne({ where: { id: req.params.id, user_id: uid }, attributes: ['name'], raw: true });
  if (!tech) return res.status(404).json({ error: 'not found' });
  await Technique.destroy({ where: { id: req.params.id, user_id: uid } });
  res.json({ ok: true });

  // 이 기술에 연결된 클립 중 이 기술만 가진 클립은 파일+DB 삭제, 다중 기술 클립은 tech_name에서만 제거
  try {
    const { sequelize } = require('../config/db');
    const [clips] = await sequelize.query(
      `SELECT id, tech_name FROM video_clips WHERE JSON_CONTAINS(tech_name, JSON_QUOTE(?)) AND user_id = ?`,
      { replacements: [tech.name, uid] }
    );
    for (const clip of clips) {
      let names = [];
      try { names = JSON.parse(clip.tech_name || '[]'); } catch { names = []; }
      if (!Array.isArray(names)) names = names ? [names] : [];
      const remaining = names.filter(n => n !== tech.name);
      if (remaining.length === 0) {
        // 이 기술만 연결 → 클립 DB + 파일 전체 삭제
        await VideoClip.destroy({ where: { id: clip.id } });
        Promise.all([
          fs.rm(getFramesDir(clip.id), { recursive: true, force: true }).catch(() => {}),
          fs.rm(getVideoDir(clip.id),  { recursive: true, force: true }).catch(() => {}),
        ]).catch(() => {});
      } else {
        // 다중 기술 → tech_name 배열에서만 제거
        await VideoClip.update(
          { tech_name: JSON.stringify(remaining) },
          { where: { id: clip.id } }
        );
      }
    }
  } catch (e) {
    console.error('[technique delete] 클립 cascade 실패:', e.message);
  }
}));

// 사용 중인 고유 포지션 목록 + 기술·참고영상·드릴·스파링 연결 수 반환
router.get('/positions', wrap(async (req, res) => {
  const uid = req.user.id;
  const { sequelize } = require('../config/db');

  const techCounter = new Map();
  const techRows = await Technique.findAll({ where: { user_id: uid }, attributes: ['pos'], raw: true });
  for (const row of techRows) {
    for (const p of parsePos(row.pos)) techCounter.set(p, (techCounter.get(p) || 0) + 1);
  }

  const clipCounter = new Map();
  const clipRows = await VideoClip.findAll({ where: { user_id: uid }, attributes: ['position'], raw: true });
  for (const row of clipRows) {
    for (const p of parsePos(row.position)) clipCounter.set(p, (clipCounter.get(p) || 0) + 1);
  }

  const drillCounter = new Map();
  const [drillRows] = await sequelize.query(
    `SELECT d.pos FROM drills d JOIN classes c ON d.class_id = c.id WHERE c.user_id = ? AND d.pos IS NOT NULL AND d.pos != ''`,
    { replacements: [uid] }
  );
  for (const row of drillRows) drillCounter.set(row.pos, (drillCounter.get(row.pos) || 0) + 1);

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
      if (e?.name) sparCounter.set(e.name, (sparCounter.get(e.name) || 0) + 1);
    }
  }

  // 목록 자체는 기존과 동일하게 "기술에 실제로 쓰인 포지션"만 노출한다.
  // 영상/드릴/스파링 카운트는 그 태그를 수정·삭제할 때 영향 범위를 보여주는 부가정보일 뿐,
  // 기술에는 없고 다른 테이블에만 있는 이름까지 목록에 끌어오지 않는다.
  const result = [...techCounter.keys()]
    .map(name => ({
      name,
      count:      techCounter.get(name) || 0, // 기존 프론트 호환용 (기술 수)
      techCount:  techCounter.get(name)  || 0,
      clipCount:  clipCounter.get(name)  || 0,
      drillCount: drillCounter.get(name) || 0,
      sparCount:  sparCounter.get(name)  || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  res.json(result);
}));

// 포지션 이름 변경 — 기술뿐 아니라 참고영상·수업드릴·스파링 기록에 남아있는 같은 이름도 함께 갱신
//
// drills.pos는 varchar(50)이고 DB가 STRICT_TRANS_TABLES라 51자 이상 이름은 잘리는 게 아니라
// "Data too long for column 'pos'" 에러로 실패한다. 4개 저장소를 트랜잭션 없이 순차 갱신하면
// 3번째(drills)에서 터졌을 때 techniques/clips만 새 이름으로 바뀐 채 남아 같은 포지션이
// 테이블마다 다른 이름으로 영구히 갈라진다(재시도해도 복구 불가).
// → (1) 이름 길이를 미리 검증해 400으로 막고, (2) 4단계 전체를 하나의 트랜잭션으로 묶는다.
//   (classes.js의 다중 테이블 쓰기와 동일한 sequelize.transaction() 컨벤션)
const POSITION_NAME_MAX = 50; // drills.pos = varchar(50)

// spar_sessions.positions는 [{name, score}] 구조라 techniques/clips처럼 new Set()으로 중복 제거할 수 없다.
// 기존에 있는 이름으로 rename(=병합)하면 한 라운드 안에 같은 name이 2개 남는데,
// coachAnalytics.computeDiagnosis()가 항목마다 sum/count를 누적해 포지션 평균을 내므로
// (backend/src/services/coachAnalytics.js:100-106) 라운드 1개가 2개로 잡혀 평균·카운트가 왜곡된다.
// → name 기준으로 한 항목만 남기고 score는 "양수 score들의 평균(정수 반올림)"으로 합친다.
//   · 평균을 쓰는 이유: 최댓값으로 합치면 병합할 때마다 그 포지션 점수가 위로만 편향된다.
//     평균은 사용자가 실제로 기록한 값들의 가운데라 상향·하향 어느 쪽으로도 치우치지 않는다.
//   · score 0은 "미채점"이라 평균 계산에서 제외한다(coachAnalytics도 score > 0만 집계한다).
//     합칠 양수 점수가 하나도 없으면 0을 유지한다.
//   · 저장값은 나중에 parseInt로 다시 읽히므로 소수(2.5)를 남기면 조용히 2로 잘린다 → 정수로 반올림.
//   · name이 없는(레거시 문자열 등) 항목은 병합 근거가 없어 원래 순서 그대로 보존한다.
function mergeSparPositions(entries) {
  const slotByName = new Map();
  const merged = [];
  for (const e of entries) {
    const name = (e && typeof e === 'object') ? e.name : null;
    if (!name) { merged.push(e); continue; }
    let slot = slotByName.get(name);
    if (!slot) {
      slot = { entry: { ...e }, scores: [] };
      slotByName.set(name, slot);
      merged.push(slot.entry); // 참조를 먼저 넣고 아래에서 score만 확정한다(원래 순서 유지)
    }
    const score = parseInt(e.score) || 0;
    if (score > 0) slot.scores.push(score);
  }
  for (const slot of slotByName.values()) {
    if (!slot.scores.length && !('score' in slot.entry)) continue;
    slot.entry.score = slot.scores.length
      ? Math.round(slot.scores.reduce((a, b) => a + b, 0) / slot.scores.length)
      : 0;
  }
  return merged;
}

router.put('/positions/:name', wrap(async (req, res) => {
  const uid = req.user.id;
  const oldName = decodeURIComponent(req.params.name);
  const newName = (req.body?.newName || '').trim();
  if (!newName) return res.status(400).json({ error: '새 포지션명을 입력해주세요' });
  if (newName.length > POSITION_NAME_MAX) {
    return res.status(400).json({
      error: `포지션명은 ${POSITION_NAME_MAX}자 이내로 입력해주세요 (현재 ${newName.length}자)`,
    });
  }
  if (newName === oldName) return res.json({ ok: true, updatedCount: 0 });

  const { sequelize } = require('../config/db');
  const { SparSession, Drill } = require('../models');

  // 4개 저장소를 하나의 트랜잭션으로 묶는다 — 중간 단계에서 실패하면 전부 롤백되어
  // 같은 포지션이 테이블마다 다른 이름으로 갈라진 상태를 남기지 않는다.
  const updatedCount = await sequelize.transaction(async (t) => {
    let count = 0;

    // 1) 기술(techniques.pos)
    const techRows = await Technique.findAll({
      where: { user_id: uid }, attributes: ['id', 'pos'], raw: true, transaction: t,
    });
    for (const row of techRows) {
      const positions = parsePos(row.pos);
      if (!positions.includes(oldName)) continue;
      const next = [...new Set(positions.map(p => (p === oldName ? newName : p)))];
      await Technique.update(
        { pos: JSON.stringify(next) },
        { where: { id: row.id, user_id: uid }, transaction: t }
      );
      count++;
    }

    // 2) 참고영상(video_clips.position)
    const clipRows = await VideoClip.findAll({
      where: { user_id: uid }, attributes: ['id', 'position'], raw: true, transaction: t,
    });
    for (const row of clipRows) {
      const positions = parsePos(row.position);
      if (!positions.includes(oldName)) continue;
      const next = [...new Set(positions.map(p => (p === oldName ? newName : p)))];
      await VideoClip.update(
        { position: JSON.stringify(next) },
        { where: { id: row.id, user_id: uid }, transaction: t }
      );
      count++;
    }

    // 3) 수업 드릴(drills.pos) — Drill은 user_id가 없어 classes를 통해 스코프
    const [drillRows] = await sequelize.query(
      `SELECT d.id FROM drills d JOIN classes c ON d.class_id = c.id WHERE c.user_id = ? AND d.pos = ?`,
      { replacements: [uid, oldName], transaction: t }
    );
    if (drillRows.length) {
      await Drill.update({ pos: newName }, { where: { id: drillRows.map(r => r.id) }, transaction: t });
      count += drillRows.length;
    }

    // 4) 스파링 라운드(spar_sessions.positions, [{name, score}] 구조) — spar_days→classes로 스코프
    const [sparRows] = await sequelize.query(
      `SELECT ss.id, ss.positions FROM spar_sessions ss
       JOIN spar_days sd ON ss.spar_day_id = sd.id
       JOIN classes c ON sd.class_id = c.id
       WHERE c.user_id = ?`,
      { replacements: [uid], transaction: t }
    );
    for (const row of sparRows) {
      let entries;
      try { entries = JSON.parse(row.positions || '[]'); } catch { entries = []; }
      if (!Array.isArray(entries) || !entries.some(e => e?.name === oldName)) continue;
      const renamed = entries.map(e => (e?.name === oldName ? { ...e, name: newName } : e));
      const next = mergeSparPositions(renamed); // 병합으로 생긴 동일 name 중복 제거 + score 합산
      await SparSession.update(
        { positions: JSON.stringify(next) },
        { where: { id: row.id }, transaction: t }
      );
      count++;
    }

    return count;
  });

  res.json({ ok: true, updatedCount });
}));

// 특정 포지션 값을 모든 기술의 pos 배열에서 제거
router.delete('/positions/:name', wrap(async (req, res) => {
  const uid = req.user.id;
  const targetName = decodeURIComponent(req.params.name);
  const rows = await Technique.findAll({ where: { user_id: uid }, attributes: ['id', 'pos'], raw: true });
  let updatedCount = 0;
  for (const row of rows) {
    const positions = parsePos(row.pos);
    if (!positions.includes(targetName)) continue;
    const next = positions.filter(p => p !== targetName);
    await Technique.update({ pos: JSON.stringify(next) }, { where: { id: row.id, user_id: uid } });
    updatedCount++;
  }
  res.json({ ok: true, updatedCount });
}));

router.patch('/:id/star', wrap(async (req, res) => {
  const t = await Technique.findOne({ where: { id: req.params.id, user_id: req.user.id } });
  if (!t) return res.status(404).json({ error: 'not found' });
  const next = t.starred ? 0 : 1;
  await t.update({ starred: next });
  res.json({ starred: next });
}));

module.exports = router;
