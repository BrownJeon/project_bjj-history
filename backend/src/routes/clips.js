const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const fs = require('fs/promises');
const { QueryTypes } = require('sequelize');
const { sequelize, VideoClip, ClipUsageLog, Technique, TechniqueMastery } = require('../models');
const { wrap, safeParse, ok, fail } = require('../utils/respond');
const {
  USAGE_KINDS, MANUAL_KINDS, kstToday, clipTechNames, getUsageMap, attachClipUsage, emptyUsage,
} = require('../services/clipUsage');
const { setMasterySteps } = require('../services/masteryWrite');
const { toNFC, arrToNFC } = require('../utils/nfc');
const { queueThumbUpdate } = require('../services/thumbnailExtractor');
const { getFramesDir, getVideoDir } = require('../services/storage');
const multer = require('multer');
const { analyzeVideo, analyzeLocalFile, hasInstagramAuth } = require('../services/videoAnalysis');
const { runClaude } = require('../services/claudeCli');
const {
  normalizeRecommendation, parseRecommendationText, techNameList, recommendInputsChanged,
} = require('../utils/clipRecommend');

const videoUpload = multer({
  dest: '/tmp/',
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
  fileFilter: (_req, file, cb) => {
    cb(null, /^video\//.test(file.mimetype) || /\.(mp4|mov|avi|mkv|webm)$/i.test(file.originalname));
  },
});

const AI_URL_RE    = /youtube\.com|youtu\.be|instagram\.com/;
const YOUTUBE_RE   = /youtube\.com|youtu\.be/;
const INSTAGRAM_RE = /instagram\.com/;
const INSTAGRAM_ERR = 'Instagram 영상은 로그인 인증이 필요하여 AI 분석이 불가합니다. YouTube 영상을 등록해 주세요.';

// 클립별 분석 진행 상태 (인메모리) — { progress: 0-100 | -1(오류), stage: string }
const analyzeProgress = new Map();

function autoAnalyzeClip(clipId, url) {
  if (!url) return;
  if (INSTAGRAM_RE.test(url) && !hasInstagramAuth()) return; // 인증 수단 없으면 Instagram 스킵
  if (!YOUTUBE_RE.test(url) && !INSTAGRAM_RE.test(url)) return;
  const id = String(clipId);

  analyzeProgress.set(id, { progress: 5, stage: '분석 준비 중' });

  analyzeVideo(url, clipId, (progress, stage) => {
    analyzeProgress.set(id, { progress, stage });
  })
    .then(async result => {
      const updates = {};
      if (result.savedFrames?.length) updates.frames     = JSON.stringify(result.savedFrames);
      if (result.description) {
        updates.description = result.description;
        updates.ai_recommendation = null; // task-036: 추천 재료(description)가 바뀌었다 — 옛 추천 캐시를 비운다
      }
      if (result.savedVideo)          updates.video_file  = result.savedVideo;
      // 썸네일이 없으면 첫 번째 분석 프레임으로 대체
      if (result.savedFrames?.length) {
        const existing = await VideoClip.findByPk(clipId, { attributes: ['thumb_url'], raw: true });
        if (!existing?.thumb_url) updates.thumb_url = result.savedFrames[0];
      }
      if (Object.keys(updates).length)
        await VideoClip.update(updates, { where: { id: clipId } });
      console.log(`[auto-analyze] clip ${clipId} 분석 완료 (${result.method})`);
      analyzeProgress.delete(id);
    })
    .catch(e => {
      console.error(`[auto-analyze] clip ${clipId} 실패:`, e.message);
      analyzeProgress.set(id, { progress: -1, stage: e.message });
      setTimeout(() => analyzeProgress.delete(id), 60000); // 1분 후 오류 상태 제거
    });
}

function detectPlatform(url) {
  if (!url) return 'other';
  if (url.includes('youtu')) return 'youtube';
  if (url.includes('instagram')) return 'instagram';
  return 'other';
}

function normalize(row) {
  if (!row) return row;
  let techs = [];
  try {
    const p = JSON.parse(row.tech_name);
    if (Array.isArray(p)) techs = p.filter(Boolean);
    else if (p) techs = [String(p)];
  } catch {
    if (row.tech_name) techs = [row.tech_name];
  }
  return {
    ...row,
    tech_names: techs,
    tech_name: techs[0] || '',
    tags: safeParse(row.tags, []),
    positions: safeParse(row.position, []),
    video_file: row.video_file || '',
  };
}

// task-014: tech_name/position/tags 는 기술트리 연결·포지션 rename·태그 필터에서 문자열
// 동등비교의 키로 쓰인다. 저장 시점에 NFC로 통일해 두면(정본화) 그 비교들이 정규화 형태
// 차이로 조용히 어긋나지 않는다. 이미 NFC인 값에는 아무 영향이 없다(멱등).
function techNamesToJson(tech_names, tech_name) {
  const arr = Array.isArray(tech_names)
    ? tech_names.filter(Boolean)
    : (tech_name ? [String(tech_name).trim()] : []);
  return JSON.stringify(arrToNFC(arr));
}

router.get('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const rows = await VideoClip.findAll({
    where: { user_id: uid },
    order: [['pinned', 'DESC'], ['starred', 'DESC'], ['id', 'DESC']],
    raw: true,
  });
  // task-035: 응답 모양(배열) 유지 — 각 원소에 `usage` 만 추가. clip 수와 무관하게 2쿼리.
  res.json(await attachClipUsage(uid, rows.map(normalize)));
}));

router.get('/search', wrap(async (req, res) => {
  const q        = (req.query.q || '').trim();
  const techName = (req.query.tech_name || '').trim();
  const where = { user_id: req.user.id };
  if (q) {
    where[Op.or] = [
      { title:     { [Op.like]: `%${q}%` } },
      { url:       { [Op.like]: `%${q}%` } },
      { tech_name: { [Op.like]: `%${q}%` } },
    ];
  }
  if (techName) where.tech_name = techName;
  const rows = await VideoClip.findAll({
    where,
    attributes: ['id', 'title', 'url', 'platform', 'tech_name', 'starred'],
    order: [['starred', 'DESC'], ['id', 'DESC']],
    limit: 10,
    raw: true,
  });
  res.json(rows);
}));

router.post('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const { title, url, description, tech_name, tech_names, tags, starred, positions } = req.body;
  const r = await VideoClip.create({
    // task-014: title 은 이 앱에서 NFD가 실제로 발견된 유일한 필드 계열이다(long_videos.title,
    // yt-dlp 유래). 사용자가 그런 제목을 복사·붙여넣기 할 수도 있으므로 저장 시 NFC로 통일한다.
    title: toNFC(title),
    url,
    platform: detectPlatform(url),
    description: description || '',
    tech_name: techNamesToJson(tech_names, tech_name),
    position: JSON.stringify(arrToNFC(Array.isArray(positions) ? positions : [])),
    tags: JSON.stringify(arrToNFC(tags || [])),
    starred: starred ? 1 : 0,
    user_id: uid,
  });
  res.json({ id: r.id });
  if (url) queueThumbUpdate(r.id, url);
  autoAnalyzeClip(r.id, url);
}));

router.put('/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const { title, url, description, tech_name, tech_names, tags, starred, pinned, positions } = req.body;
  const old = await VideoClip.findOne({
    where: { id: req.params.id, user_id: uid }, attributes: ['url', 'description', 'tech_name'], raw: true,
  });
  if (!old) return res.status(404).json({ error: 'not found' });
  const urlChanged = old.url !== url;
  const data = {
    title: toNFC(title), // task-014 — POST와 동일
    url,
    platform: detectPlatform(url),
    description: description || '',
    tech_name: techNamesToJson(tech_names, tech_name),
    position: JSON.stringify(arrToNFC(Array.isArray(positions) ? positions : [])),
    tags: JSON.stringify(arrToNFC(tags || [])),
  };
  // task-036: 추천 재료(description·기술명)가 **실제로** 달라졌을 때만 옛 추천 캐시를 비운다.
  //           제목·태그·즐겨찾기만 바꾼 저장에서는 추천을 유지한다.
  if (recommendInputsChanged(old, data)) data.ai_recommendation = null;
  if (urlChanged) data.thumb_url = '';
  if (starred !== undefined) data.starred = starred ? 1 : 0;
  if (pinned !== undefined) data.pinned = pinned ? 1 : 0;
  await VideoClip.update(data, { where: { id: req.params.id, user_id: uid } });
  res.json({ ok: true });
  if (urlChanged && url) {
    queueThumbUpdate(req.params.id, url);
    autoAnalyzeClip(req.params.id, url);
  }
}));

// 수동 AI 분석 트리거 (기존 클립 재분석용)
router.post('/:id/analyze', wrap(async (req, res) => {
  const clip = await VideoClip.findOne({ where: { id: req.params.id, user_id: req.user.id }, attributes: ['id', 'url'], raw: true });
  if (!clip) return res.status(404).json({ error: 'not found' });
  if (!clip.url || !AI_URL_RE.test(clip.url))
    return res.status(400).json({ error: 'YouTube URL이 아닙니다' });
  if (INSTAGRAM_RE.test(clip.url) && !hasInstagramAuth())
    return res.status(400).json({ error: INSTAGRAM_ERR });
  res.json({ ok: true, message: '분석 시작됨 (백그라운드)' });
  autoAnalyzeClip(clip.id, clip.url);
}));

router.get('/analyze-status', wrap(async (_req, res) => {
  const status = {};
  analyzeProgress.forEach((v, k) => { status[k] = v; });
  res.json(status);
}));

// 영상 파일 직접 업로드 → 분석 (Instagram 등 URL 다운로드 불가 영상용)
router.post('/:id/upload-video', videoUpload.single('video'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '영상 파일이 없습니다' });
  const clipId = req.params.id;
  const clip   = await VideoClip.findOne({ where: { id: clipId, user_id: req.user.id }, attributes: ['id'], raw: true });
  if (!clip) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(404).json({ error: '클립을 찾을 수 없습니다' });
  }

  const id = String(clipId);
  analyzeProgress.set(id, { progress: 5, stage: '업로드 완료, 분석 준비 중' });
  res.json({ ok: true, message: '업로드 완료, 분석 시작됨 (백그라운드)' });

  // fire-and-forget
  analyzeLocalFile(req.file.path, clipId, (progress, stage) => {
    analyzeProgress.set(id, { progress, stage });
  })
    .then(async result => {
      const updates = {};
      if (result.savedFrames?.length) updates.frames      = JSON.stringify(result.savedFrames);
      if (result.description) {
        updates.description = result.description;
        updates.ai_recommendation = null; // task-036: 추천 재료(description)가 바뀌었다 — 옛 추천 캐시를 비운다
      }
      if (result.savedVideo)          updates.video_file  = result.savedVideo;
      // 썸네일이 없으면 첫 번째 분석 프레임으로 대체
      if (result.savedFrames?.length) {
        const existing = await VideoClip.findByPk(clipId, { attributes: ['thumb_url'], raw: true });
        if (!existing?.thumb_url) updates.thumb_url = result.savedFrames[0];
      }
      if (Object.keys(updates).length)
        await VideoClip.update(updates, { where: { id: clipId } });
      console.log(`[upload-analyze] clip ${clipId} 분석 완료 (${result.method})`);
      analyzeProgress.delete(id);
    })
    .catch(e => {
      console.error(`[upload-analyze] clip ${clipId} 실패:`, e.message);
      analyzeProgress.set(id, { progress: -1, stage: e.message });
      setTimeout(() => analyzeProgress.delete(id), 60000);
    });
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = req.params.id;
  const uid = req.user.id;
  await VideoClip.destroy({ where: { id, user_id: uid } });
  res.json({ ok: true });
  // 연관 파일 삭제 (캡처 프레임 + 저장 영상) — 백그라운드
  Promise.all([
    fs.rm(getFramesDir(id), { recursive: true, force: true }).catch(() => {}),
    fs.rm(getVideoDir(id),  { recursive: true, force: true }).catch(() => {}),
  ]).catch(() => {});
}));

router.patch('/:id/star', wrap(async (req, res) => {
  const c = await VideoClip.findOne({ where: { id: req.params.id, user_id: req.user.id } });
  if (!c) return res.status(404).json({ error: 'not found' });
  const next = c.starred ? 0 : 1;
  await c.update({ starred: next });
  res.json({ starred: next });
}));

router.patch('/:id/pin', wrap(async (req, res) => {
  const c = await VideoClip.findOne({ where: { id: req.params.id, user_id: req.user.id } });
  if (!c) return res.status(404).json({ error: 'not found' });
  const next = c.pinned ? 0 : 1;
  await c.update({ pinned: next });
  res.json({ pinned: next });
}));

router.post('/:id/refresh-thumb', wrap(async (req, res) => {
  const c = await VideoClip.findOne({ where: { id: req.params.id, user_id: req.user.id }, attributes: ['url'], raw: true });
  if (!c) return res.status(404).json({ error: 'not found' });
  queueThumbUpdate(req.params.id, c.url);
  res.json({ ok: true, queued: true });
}));

// ─────────────────────────────────────────────────────────────────────────────
// 참고영상 사용 기록 (task-035) — 👁 봤음(자동·하루 1회) / 🥋 써봤음(드릴·포지션 스파링·스파링)
//
// 🔴 드릴 +1 → 사다리 2단계(drilled), 포지션 스파링 +1 → 3단계(position_spar) 를 **꺼져 있을 때만** 켠다.
//    스파링 +1 은 숙련도를 건드리지 않는다(4단계는 spar_sessions 에서 자동 파생 — 사용자 결정 3).
// 🔴 기술 매칭은 **이름 글자 그대로 일치**만(clipUsage.clipTechNames 주석). matchTechnique(퍼지)·
//    techAliases 를 쓰지 않는다 — 오매칭으로 숙련도가 켜지는 것보다 안 켜지는 편이 안전하다(task-020b).
// 🔴 기록 insert 와 숙련도 변경은 **한 트랜잭션**. 부분 반영(기록만 남고 체크 안 됨/그 반대) 금지.
// 🔴 clip 행을 SELECT … FOR UPDATE 로 잡고 시작한다 — 같은 clip 에 대한 동시 요청(StrictMode 이중
//    effect 로 view 가 거의 동시에 2번 오는 경우 포함)을 직렬화해서 "view 하루 1회"가 경합으로 깨지지 않게.
// ─────────────────────────────────────────────────────────────────────────────
const KIND_STEP  = { drill: 'drilled', position_spar: 'position_spar' };
const isIdParam  = (v) => /^[1-9]\d{0,9}$/.test(String(v || ''));
const CLIP_404   = '클립을 찾을 수 없습니다';

function lockClip(uid, clipId, transaction, attributes = ['id']) {
  return VideoClip.findOne({
    where: { id: clipId, user_id: uid }, attributes, raw: true,
    transaction, lock: transaction.LOCK.UPDATE,
  });
}

async function usageOf(uid, clipId) {
  const map = await getUsageMap(uid, [clipId]);
  return map[clipId] || emptyUsage();
}

/**
 * POST /api/clips/:id/usage  body { kind: 'view'|'drill'|'position_spar'|'spar' }
 * → { created, log: {id, kind, used_on}|null, usage, masteryChecked: [{id, name, step}] }
 */
router.post('/:id/usage', wrap(async (req, res) => {
  const uid = req.user.id;
  if (!isIdParam(req.params.id)) return fail(res, 404, CLIP_404);
  const clipId = Number(req.params.id);
  const kind = (req.body || {}).kind;

  const out = await sequelize.transaction(async (transaction) => {
    const clip = await lockClip(uid, clipId, transaction, ['id', 'tech_name']);
    if (!clip) return { status: 404, message: CLIP_404 };
    if (typeof kind !== 'string' || !USAGE_KINDS.includes(kind)) {
      return { status: 400, message: `kind 는 ${USAGE_KINDS.join('·')} 중 하나여야 합니다` };
    }
    const usedOn = kstToday();

    // 👁 봤음 — 같은 날 이미 있으면 넣지 않는다(clip 행 잠금 뒤라 최신 커밋 기준으로 본다).
    if (kind === 'view') {
      const dup = await ClipUsageLog.findOne({
        where: { user_id: uid, clip_id: clipId, kind: 'view', used_on: usedOn },
        attributes: ['id'], raw: true, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (dup) return { created: false, log: null, masteryChecked: [] };
    }

    // 🥋 드릴 / 포지션 스파링 — 이름 정확 일치 기술의 해당 단계를 꺼져 있을 때만 켠다.
    const masteryChecked = [];
    let masteryIds = null;
    const step = KIND_STEP[kind];
    if (step) {
      masteryIds = [];
      const names = new Set(clipTechNames(clip.tech_name));
      if (names.size) {
        const techs = await Technique.findAll({
          where: { user_id: uid }, attributes: ['id', 'name'], raw: true, transaction,
        });
        const matched = techs
          .filter((t) => typeof t.name === 'string' && names.has(t.name.normalize('NFC')))
          .sort((a, b) => a.id - b.id);
        if (matched.length) {
          const rows = await TechniqueMastery.findAll({
            where: { user_id: uid, technique_id: matched.map((t) => t.id) }, raw: true, transaction,
          });
          const byTech = new Map(rows.map((r) => [r.technique_id, r]));
          for (const t of matched) {
            const cur = byTech.get(t.id);
            if (cur && cur[step]) continue;   // 이미 켜져 있다 — 건드리지도, 기록하지도 않는다
            await setMasterySteps(uid, t.id, { [step]: true }, { transaction });
            masteryIds.push(t.id);
            masteryChecked.push({ id: t.id, name: t.name, step });
          }
        }
      }
    }

    const row = await ClipUsageLog.create({
      user_id: uid, clip_id: clipId, kind, used_on: usedOn,
      mastery_tech_ids: masteryIds ? JSON.stringify(masteryIds) : null,
    }, { transaction });
    return { created: true, log: { id: row.id, kind, used_on: usedOn }, masteryChecked };
  });

  if (out.status) return fail(res, out.status, out.message);
  ok(res, { ...out, usage: await usageOf(uid, clipId) });
}));

/**
 * DELETE /api/clips/:id/usage/:logId — "방금 기록 취소"
 * → { usage, masteryUnchecked: [{id, name, step}] }
 * 🔴 그 clip 에서 **내 최신 수동 기록**만 지울 수 있다(아니면 409) — 과거 기록 임의 삭제 방지.
 * 🔴 기록이 켰던 단계는, 같은 kind 의 다른 기록이 그 기술 이름을 가진 내 clip 에 **하나도 없을 때만** 끈다.
 */
router.delete('/:id/usage/:logId', wrap(async (req, res) => {
  const uid = req.user.id;
  if (!isIdParam(req.params.id)) return fail(res, 404, CLIP_404);
  if (!isIdParam(req.params.logId)) return fail(res, 404, '기록을 찾을 수 없습니다');
  const clipId = Number(req.params.id);
  const logId  = Number(req.params.logId);

  const out = await sequelize.transaction(async (transaction) => {
    const clip = await lockClip(uid, clipId, transaction);
    if (!clip) return { status: 404, message: CLIP_404 };

    const log = await ClipUsageLog.findOne({
      where: { id: logId, clip_id: clipId, user_id: uid, kind: MANUAL_KINDS },
      raw: true, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!log) return { status: 404, message: '기록을 찾을 수 없습니다' };

    const latest = await ClipUsageLog.findOne({
      where: { clip_id: clipId, user_id: uid, kind: MANUAL_KINDS },
      attributes: ['id'], order: [['id', 'DESC']], raw: true, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!latest || latest.id !== log.id) {
      return { status: 409, message: '가장 최근 기록만 취소할 수 있습니다' };
    }

    await ClipUsageLog.destroy({ where: { id: log.id, user_id: uid }, transaction });

    const masteryUnchecked = [];
    const step = KIND_STEP[log.kind];
    const techIds = step
      ? [...new Set((safeParse(log.mastery_tech_ids, []) || []).map(Number).filter(Number.isInteger))]
      : [];
    if (techIds.length) {
      const techs = await Technique.findAll({
        where: { user_id: uid, id: techIds }, attributes: ['id', 'name'], raw: true, transaction,
      });
      if (techs.length) {
        // 삭제 **후** 남은 같은 kind 기록들이 달린 내 clip 의 기술 이름 — 한 번에 모은다.
        const remain = await sequelize.query(
          `SELECT c.tech_name
             FROM clip_usage_logs l
             JOIN video_clips c ON c.id = l.clip_id
            WHERE l.user_id = ? AND l.kind = ? AND c.user_id = ?`,
          { replacements: [uid, log.kind, uid], type: QueryTypes.SELECT, transaction }
        );
        const remainNames = new Set();
        for (const r of remain) for (const n of clipTechNames(r.tech_name)) remainNames.add(n);

        const rows = await TechniqueMastery.findAll({
          where: { user_id: uid, technique_id: techs.map((t) => t.id) }, raw: true, transaction,
        });
        const byTech = new Map(rows.map((r) => [r.technique_id, r]));
        for (const t of techs.sort((a, b) => a.id - b.id)) {
          if (typeof t.name === 'string' && remainNames.has(t.name.normalize('NFC'))) continue;
          const cur = byTech.get(t.id);
          if (!cur || !cur[step]) continue;   // 이미 꺼져 있다(사용자가 /recall 에서 직접 해제 등)
          await setMasterySteps(uid, t.id, { [step]: false }, { transaction });
          masteryUnchecked.push({ id: t.id, name: t.name, step });
        }
      }
    }
    return { masteryUnchecked };
  });

  if (out.status) return fail(res, out.status, out.message);
  ok(res, { usage: await usageOf(uid, clipId), masteryUnchecked: out.masteryUnchecked });
}));

// ─────────────────────────────────────────────────────────────────────────────
// AI 연계기술 추천 — ai_recommendation 캐싱 포함 (task-036 정상화)
//
// body { refresh: true } → 캐시를 무시하고 다시 만들어 덮어쓴다(`🔄 다시 추천`). 없으면 캐시 우선.
// 🔴 저장·응답 모양은 utils/clipRecommend.normalizeRecommendation 로 맞춘다
//    { techniques:[{name,reason}], combos:[{title,steps[]}] }. 둘 다 비면 저장하지 않고 500.
// 🔴 캐시 무효화: description·기술명이 바뀌는 경로(PUT, AI 분석 저장)가 ai_recommendation=NULL 로 비운다.
//    Claude 호출(수십 초) 중에 재료가 바뀌었으면 옛 재료로 만든 추천을 덮어 저장하지 않는다(조건부 UPDATE).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/recommend', wrap(async (req, res) => {
  const uid = req.user.id;
  const refresh = (req.body || {}).refresh === true;
  const clip = await VideoClip.findOne({
    where: { id: req.params.id, user_id: uid },
    attributes: ['id', 'tech_name', 'description', 'ai_recommendation'],
    raw: true,
  });
  if (!clip) return fail(res, 404, '클립을 찾을 수 없습니다');

  // 캐시된 값이 있으면 즉시 반환 — 모양이 깨진 옛 캐시는 없는 것으로 보고 새로 만든다
  if (!refresh && clip.ai_recommendation) {
    const cached = normalizeRecommendation(safeParse(clip.ai_recommendation, null));
    if (cached) return ok(res, cached);
  }

  const techNames = techNameList(clip.tech_name);

  const prompt = `당신은 BJJ(브라질리언 주짓수) 전문 코치입니다.
아래 영상 기술을 분석하여 연계 가능한 기술과 콤비네이션을 추천해주세요.

기술명: ${techNames.join(', ')}
영상 분석 내용: ${clip.description || '(설명 없음)'}

반드시 다음 JSON 형식으로만 답변하세요 (다른 텍스트 없이):
{
  "techniques": [
    { "name": "기술명", "reason": "이 기술과 연계되는 이유" }
  ],
  "combos": [
    { "title": "콤비네이션 제목", "steps": ["단계1", "단계2", "단계3"] }
  ]
}

techniques는 3~5개, combos는 2~3개 추천.`;

  const raw = await runClaude(prompt);

  // JSON 블록 추출 → 계약 모양으로 정규화. 모양이 비면(파싱 실패 포함) 저장하지 않는다.
  const rec = normalizeRecommendation(parseRecommendationText(raw));
  if (!rec) return fail(res, 500, 'AI 추천 파싱 실패');

  // 캐시 저장 — 읽을 때의 description·tech_name 이 그대로일 때만(생성 중 PUT/분석으로 바뀌었으면 건너뜀)
  const [saved] = await VideoClip.update(
    { ai_recommendation: JSON.stringify(rec) },
    { where: { id: clip.id, user_id: uid, description: clip.description, tech_name: clip.tech_name } }
  );
  if (!saved) console.warn(`[recommend] clip ${clip.id} 추천 생성 중 재료가 바뀌어 캐시 저장을 건너뜀`);

  return ok(res, rec);
}));

module.exports = router;
