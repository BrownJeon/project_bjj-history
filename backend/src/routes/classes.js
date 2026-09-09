const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize, Class, Drill, SparDay, SparSession, SparCause } = require('../models');
const { wrap, safeParse } = require('../utils/respond');
const { toNFC } = require('../utils/nfc');
const { SESSION_TYPE_PRESETS } = require('../utils/sessionTypes');
const { generateClassVideo } = require('../services/classVideoService');
const { getClassVideoDir, classVideoWebPath } = require('../services/storage');
const fs = require('fs/promises');

// 홈 카드의 수업 종류 3택. 목록의 정본은 utils/sessionTypes.js 한 곳뿐이고
// 프론트는 여기서 받아 쓴다 — 프론트가 같은 문자열을 다시 하드코딩하면 voice.js 의
// "프리셋은 덮어써도 된다" 판정과 조용히 어긋난다 (task-021).
// `/:id` 형태의 GET 라우트가 없어 경로 충돌은 없지만, 명시적으로 목록 라우트 옆에 둔다.
router.get('/session-types', wrap(async (_req, res) => {
  res.json(SESSION_TYPE_PRESETS);
}));

// 기존 drill_clips / spar_day_clips 조인은 더 이상 사용하지 않으므로 빈 배열로 반환
router.get('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const classes = await Class.findAll({
    where: { user_id: uid },
    order: [['date', 'DESC'], ['id', 'DESC']],
    raw: true,
  });

  for (const c of classes) {
    const drill = await Drill.findOne({
      where: { class_id: c.id },
      order: [['id', 'ASC']],
      raw: true,
    });
    if (drill) {
      drill.tech      = safeParse(drill.tech, []).map(x =>
        typeof x === 'string' ? x : (x.name || '')
      );
      drill.detail    = safeParse(drill.detail, []);
      drill.chain_ids = safeParse(drill.chain_ids, []);
      drill.clips     = [];
      drill.links     = [];
      if (drill.note && drill.note.trim()) {
        c.note = c.note ? `${c.note}\n\n${drill.note}` : drill.note;
      }
      drill.note = '';
      c.drill = drill;
    } else {
      c.drill = null;
    }
    c.feedback = c.feedback || '';

    const sparDays = await SparDay.findAll({
      where: { class_id: c.id },
      order: [['date', 'ASC'], ['id', 'ASC']],
      raw: true,
    });
    const allSessions = [];
    for (const sd of sparDays) {
      const sess = await SparSession.findAll({
        where: { spar_day_id: sd.id },
        order: [['id', 'ASC']],
        raw: true,
      });
      sess.forEach(s => {
        // 실패 원인 태그·리액션은 항목 객체 안에 산다(docs/recall-lab-spec.md §3.1).
        // 새 필드가 없는 기존 83개 항목은 여기서 기본값을 채워 내보낸다 — 저장된 데이터를
        // 바꾸는 마이그레이션은 하지 않는다(읽는 쪽에서 채우는 방식).
        s.success = safeParse(s.success, []).map(x => {
          const it = typeof x === 'string' ? { name: x, success: true } : (x || {});
          return {
            ...it,
            causes:   Array.isArray(it.causes) ? it.causes.map(n => parseInt(n)).filter(Number.isInteger) : [],
            reaction: typeof it.reaction === 'string' ? it.reaction : '',
          };
        });
        s.weak     = safeParse(s.weak, []);
        // cause_ids / reaction 컬럼은 정본이 아니다(모델 주석 참고) — 프론트가 실수로 읽어
        // 항목 안의 진짜 값과 어긋나지 않도록 응답에서 뺀다. 컬럼 자체는 그대로 둔다.
        // (같은 이유로 spar_days.links 를 빼고 있다 — 바로 아래 delete sd.links)
        delete s.cause_ids;
        delete s.reaction;
        s.opponent = s.opponent || '';
        const legacyScore = parseInt(s.position_score) || 0;
        s.positions = safeParse(s.positions, []).map(p =>
          typeof p === 'string'
            ? { name: p, score: legacyScore }
            : { name: p.name || '', score: parseInt(p.score) || 0 }
        );
        s.position_score = legacyScore;
      });
      sd.sessions = sess;
      sd.clips    = [];
      delete sd.links;   // 17일 전부 '[]' + 프론트 소비처 0 — 응답에서 제외 (컬럼은 유지, task-017)
      allSessions.push(...sess);
    }
    c.spar_days   = sparDays;
    c.sessions    = allSessions;
    c.spar_note   = sparDays.length > 0 ? (sparDays[0].day_note || '') : '';
    c.spar_day_id = sparDays.length > 0 ? sparDays[0].id : null;
    c.trained_dates = safeParse(c.trained_dates, []);
    c.clip_ids      = safeParse(c.clip_ids, []);
  }
  res.json(classes);
}));

router.post('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const { date, dateEnd, theme, note, feedback, trainedDates, drill, clipIds } = req.body;
  const id = await sequelize.transaction(async (t) => {
    const cls = await Class.create({
      date, date_end: dateEnd || null,
      theme: theme || '', note: note || '', feedback: feedback || '',
      trained_dates: JSON.stringify(trainedDates || []),
      clip_ids: JSON.stringify(clipIds || []),
      user_id: uid,
    }, { transaction: t });
    if (drill) {
      await Drill.create({
        class_id: cls.id,
        date, date_end: dateEnd || null,
        pos: drill.pos || '',
        tech:   JSON.stringify(drill.tech   || []),
        detail: JSON.stringify(drill.detail || []),
        stars: drill.stars || 0,
        links: '[]',
        note: '',
        chain_ids: JSON.stringify(drill.chainIds || []),
      }, { transaction: t });
    }
    return cls.id;
  });
  res.json({ id });
}));

router.put('/:id', wrap(async (req, res) => {
  const id = req.params.id;
  const uid = req.user.id;
  const { date, dateEnd, theme, note, feedback, trainedDates, drill, clipIds } = req.body;
  const owned = await Class.findOne({ where: { id, user_id: uid }, attributes: ['id'] });
  if (!owned) return res.status(404).json({ error: 'class not found' });
  await sequelize.transaction(async (t) => {
    await Class.update({
      date, date_end: dateEnd || null,
      theme: theme || '', note: note || '', feedback: feedback || '',
      trained_dates: JSON.stringify(trainedDates || []),
      clip_ids: JSON.stringify(clipIds || []),
    }, { where: { id }, transaction: t });

    const existDrill = await Drill.findOne({ where: { class_id: id }, transaction: t });
    if (drill) {
      const data = {
        date, date_end: dateEnd || null,
        pos: drill.pos || '',
        tech:   JSON.stringify(drill.tech   || []),
        detail: JSON.stringify(drill.detail || []),
        stars: drill.stars || 0,
        note: '',
        chain_ids: JSON.stringify(drill.chainIds || []),
      };
      if (existDrill) await existDrill.update(data, { transaction: t });
      else await Drill.create({ class_id: id, links: '[]', ...data }, { transaction: t });
    } else if (existDrill) {
      await Drill.destroy({ where: { class_id: id }, transaction: t });
    }
  });
  res.json({ ok: true });
}));

router.patch('/:id/toggle-date', wrap(async (req, res) => {
  const { date } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });
  const uid = req.user.id;
  const c = await Class.findOne({ where: { id: req.params.id, user_id: uid } });
  if (!c) return res.status(404).json({ error: 'not found' });
  const dates = safeParse(c.trained_dates, []);
  const idx = dates.indexOf(date);
  if (idx === -1) dates.push(date); else dates.splice(idx, 1);
  dates.sort();
  await c.update({ trained_dates: JSON.stringify(dates) });
  res.json({ ok: true, trained_dates: dates });
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = req.params.id;
  const uid = req.user.id;
  const owned = await Class.findOne({ where: { id, user_id: uid }, attributes: ['id'] });
  if (!owned) return res.status(404).json({ error: 'class not found' });
  await sequelize.transaction(async (t) => {
    const sparDays = await SparDay.findAll({ where: { class_id: id }, attributes: ['id'], raw: true, transaction: t });
    const sparDayIds = sparDays.map(s => s.id);
    if (sparDayIds.length) {
      await SparSession.destroy({ where: { spar_day_id: { [Op.in]: sparDayIds } }, transaction: t });
    }
    await SparDay.destroy({ where: { class_id: id }, transaction: t });
    await Drill.destroy({ where: { class_id: id }, transaction: t });
    await Class.destroy({ where: { id }, transaction: t });
  });
  res.json({ ok: true });
}));

// ─── 스파링 CRUD ───

// 리액션("상대가 어떻게 막았나요?") 한 줄의 상한. success 컬럼이 TEXT(64KB)라 한 라운드에
// 항목이 여러 개면 합계가 커진다 — 한 줄 입력에 필요한 길이를 넉넉히 넘기는 선에서 자른다.
const REACTION_MAX = 200;

// 기술명 한 개의 상한. 100 은 임의의 숫자가 아니라 **기술명의 정본 컬럼에서 가져온 값**이다 —
// `techniques.name` 이 varchar(100) 이므로, 여기 적히는 기술명이 그보다 길 이유가 없다.
// 바꿔야 할 일이 생기면 이 숫자가 아니라 techniques.name 컬럼을 먼저 보라(둘은 같이 움직여야 한다).
//
// 왜 상한이 필요한가: success 는 항목 배열을 통째로 JSON 으로 넣는 TEXT(utf8mb3) 컬럼이라
// **한 항목만 길어도 라운드 전체의 저장이 통째로 실패**한다(트랜잭션이 롤백돼 그날 기록을 잃는다).
// reaction 은 task-022 때 이미 잘리고 있었는데 name 만 무제한이었다 — 그 비대칭을 없앤다.
// (실측: 한글 21,827자 / ASCII 65,481자에서 `Data too long for column 'success'` 500.
//  기존 54행 83항목의 name 최대 길이는 11자라 이 상한으로 잘리는 기존 데이터는 없다.)
const NAME_MAX = 100;

/**
 * success 배열 항목 정규화 (task-022).
 * 기존 `{name, success}` 는 **그대로 보존**하고 `causes`/`reaction` 두 필드만 덧붙인다.
 *
 * 🔴 `causes` 는 이 사용자가 실제로 가진 태그 id 만 남긴다. 남의 계정 태그 id 나 없는 id 를
 *   본문에 실어 보내도 기록에 붙지 않는다 — 화면에서 이름을 못 찾아 끊긴 참조가 되는 것을 막는다.
 *   비활성(active=0) 태그는 남긴다: 과거에 고른 원인을 나중에 비활성화했다고 지우면 기록이 바뀐다.
 */
function normalizeSuccessItems(list, validCauseIds) {
  return (Array.isArray(list) ? list : []).map(x => {
    const it = typeof x === 'string' ? { name: x, success: true } : (x || {});
    const causes = [...new Set(
      (Array.isArray(it.causes) ? it.causes : [])
        .map(n => parseInt(n, 10))
        .filter(n => Number.isInteger(n) && validCauseIds.has(n))
    )];
    const reaction = toNFC(String(it.reaction ?? '')).trim().slice(0, REACTION_MAX);
    // reaction 과 정확히 같은 방식(NFC 정규화 → trim → 상한 절단). 스프레드 뒤에 와야
    // 원본 it.name 을 덮어쓴다 — 순서를 바꾸면 상한이 조용히 무력해진다.
    const name = toNFC(String(it.name ?? '')).trim().slice(0, NAME_MAX);
    return { ...it, name, causes, reaction };
  });
}

/** 이 사용자가 가진 태그 id 집합(비활성 포함). 저장 1회당 1쿼리. */
async function ownedCauseIds(userId, transaction) {
  const rows = await SparCause.findAll({
    where: { user_id: userId }, attributes: ['id'], raw: true, transaction,
  });
  return new Set(rows.map(r => r.id));
}

async function insertSessions(sparDayId, sessions, transaction, validCauseIds = new Set()) {
  for (const s of sessions || []) {
    await SparSession.create({
      spar_day_id: sparDayId,
      level: s.level || '',
      opponent: s.opponent || '',
      tap_got: s.tapGot || 0,
      tap_gave: s.tapGave || 0,
      time_min: s.time || null,
      success: JSON.stringify(normalizeSuccessItems(s.success, validCauseIds)),
      weak: JSON.stringify(s.weak || []),
      note: s.note || '',
      positions: JSON.stringify(s.positions || []),
      position_score: parseInt(s.positionScore) || 0,
      outcome: s.outcome || null,
    }, { transaction });
  }
}

router.post('/:id/spar', wrap(async (req, res) => {
  const classId = req.params.id;
  const cls = await Class.findOne({ where: { id: classId, user_id: req.user.id } });
  if (!cls) return res.status(404).json({ error: 'class not found' });
  const { date, dayNote, sessions } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });
  const sparDayId = await sequelize.transaction(async (t) => {
    const sd = await SparDay.create({ class_id: classId, date, day_note: dayNote || '' }, { transaction: t });
    await insertSessions(sd.id, sessions, t, await ownedCauseIds(req.user.id, t));
    return sd.id;
  });
  res.json({ id: sparDayId });
}));

router.put('/:id/spar/:sparDayId', wrap(async (req, res) => {
  const { id, sparDayId } = req.params;
  // 소유권 확인 — 바로 위 POST /:id/spar 는 하고 있는데 여기와 아래 DELETE 만 빠져 있었다.
  // 태그 id 검증에 req.user.id 가 필요해 이 줄들을 손대는 김에 POST 와 같은 기준으로 맞춘다.
  const cls = await Class.findOne({ where: { id, user_id: req.user.id }, attributes: ['id'] });
  if (!cls) return res.status(404).json({ error: 'class not found' });
  const sd = await SparDay.findOne({ where: { id: sparDayId, class_id: id } });
  if (!sd) return res.status(404).json({ error: 'spar_day not found' });
  const { date, dayNote, sessions } = req.body;
  await sequelize.transaction(async (t) => {
    await sd.update({ date, day_note: dayNote || '' }, { transaction: t });
    await SparSession.destroy({ where: { spar_day_id: sparDayId }, transaction: t });
    await insertSessions(sparDayId, sessions, t, await ownedCauseIds(req.user.id, t));
  });
  res.json({ ok: true });
}));

router.delete('/:id/spar/:sparDayId', wrap(async (req, res) => {
  const { id, sparDayId } = req.params;
  const cls = await Class.findOne({ where: { id, user_id: req.user.id }, attributes: ['id'] });
  if (!cls) return res.status(404).json({ error: 'class not found' });
  const sd = await SparDay.findOne({ where: { id: sparDayId, class_id: id } });
  if (!sd) return res.status(404).json({ error: 'spar_day not found' });
  await sequelize.transaction(async (t) => {
    await SparSession.destroy({ where: { spar_day_id: sparDayId }, transaction: t });
    await SparDay.destroy({ where: { id: sparDayId }, transaction: t });
  });
  res.json({ ok: true });
}));

// ─── 수업 AI 영상 생성 ───────────────────────────────────────────────────────

router.post('/:id/generate-video', wrap(async (req, res) => {
  const classId = req.params.id;
  const cls = await Class.findOne({ where: { id: classId, user_id: req.user.id } });
  if (!cls) return res.status(404).json({ error: 'class not found' });

  // 이미 pending 잡이 있으면 그것 반환
  const [[existing]] = await sequelize.query(
    `SELECT id, status, progress FROM class_video_jobs WHERE class_id=? AND status='pending' LIMIT 1`,
    { replacements: [classId] },
  );
  if (existing) return res.json({ jobId: existing.id, status: 'pending', progress: existing.progress });

  const jobId = crypto.randomUUID();
  await sequelize.query(
    `INSERT INTO class_video_jobs (id, class_id, status, progress) VALUES (?, ?, 'pending', '영상 생성 준비 중...')`,
    { replacements: [jobId, classId] },
  );

  // fire-and-forget
  generateClassVideo(classId, jobId).catch(e =>
    console.error('[classes] generateClassVideo unhandled:', e.message),
  );

  res.json({ jobId, status: 'pending', progress: '영상 생성 준비 중...' });
}));

router.get('/:id/video-status', wrap(async (req, res) => {
  const classId = req.params.id;
  // 소유권 확인 — class_video_jobs 에는 user_id 가 없어 classes 로만 판별할 수 있다.
  // 바로 위 POST /:id/generate-video 와 같은 기준(404 로 존재 자체를 숨긴다, task-031).
  const cls = await Class.findOne({ where: { id: classId, user_id: req.user.id }, attributes: ['id'] });
  if (!cls) return res.status(404).json({ error: 'class not found' });

  // 최신 잡 조회
  const [[job]] = await sequelize.query(
    `SELECT id, status, progress, video_url, error, image_count, clip_count
     FROM class_video_jobs WHERE class_id=? ORDER BY created_at DESC LIMIT 1`,
    { replacements: [classId] },
  );

  if (!job) return res.json({ status: 'none' });

  return res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress || '',
    videoUrl: job.video_url || null,
    imageCount: job.image_count || 0,
    clipCount: job.clip_count || 0,
    error: job.error || null,
  });
}));

router.delete('/:id/generated-video', wrap(async (req, res) => {
  const classId = req.params.id;
  // 🔴 파괴적 라우트 — 소유권 확인이 fs.rm 보다 반드시 앞에 와야 한다(task-031).
  // getClassVideoDir 은 classId 만으로 경로를 만들고 class_video_jobs 에도 user_id 가 없어,
  // 이 확인이 없으면 인증만 된 사용자가 남의 수업 영상과 잡 행을 지울 수 있었다.
  const cls = await Class.findOne({ where: { id: classId, user_id: req.user.id }, attributes: ['id'] });
  if (!cls) return res.status(404).json({ error: 'class not found' });

  const videoDir = getClassVideoDir(classId);
  await fs.rm(videoDir, { recursive: true }).catch(() => {});
  await sequelize.query(
    `DELETE FROM class_video_jobs WHERE class_id=?`,
    { replacements: [classId] },
  );
  res.json({ ok: true });
}));

module.exports = router;
