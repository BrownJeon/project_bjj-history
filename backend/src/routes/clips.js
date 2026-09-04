const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const fs = require('fs/promises');
const { VideoClip } = require('../models');
const { wrap, safeParse, ok, fail } = require('../utils/respond');
const { toNFC, arrToNFC } = require('../utils/nfc');
const { queueThumbUpdate } = require('../services/thumbnailExtractor');
const { getFramesDir, getVideoDir } = require('../services/storage');
const multer = require('multer');
const { analyzeVideo, analyzeLocalFile, hasInstagramAuth } = require('../services/videoAnalysis');
const { runClaude } = require('../services/claudeCli');

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
      if (result.description)         updates.description = result.description;
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
  res.json(rows.map(normalize));
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
  const old = await VideoClip.findOne({ where: { id: req.params.id, user_id: uid }, attributes: ['url'], raw: true });
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
      if (result.description)         updates.description = result.description;
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

// AI 연계기술 추천 — ai_recommendation 캐싱 포함
router.post('/:id/recommend', wrap(async (req, res) => {
  const uid = req.user.id;
  const clip = await VideoClip.findOne({
    where: { id: req.params.id, user_id: uid },
    attributes: ['id', 'tech_name', 'description', 'ai_recommendation'],
    raw: true,
  });
  if (!clip) return fail(res, 404, '클립을 찾을 수 없습니다');

  // 캐시된 값이 있으면 즉시 반환
  if (clip.ai_recommendation) {
    const cached = safeParse(clip.ai_recommendation, null);
    if (cached) return ok(res, cached);
  }

  // tech_names 파싱 (normalize 패턴)
  let techNames = [];
  try {
    const p = JSON.parse(clip.tech_name);
    if (Array.isArray(p)) techNames = p.filter(Boolean);
    else if (p) techNames = [String(p)];
  } catch {
    if (clip.tech_name) techNames = [clip.tech_name];
  }

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

  // JSON 블록 추출 및 파싱
  let parsed;
  try {
    const cleaned = raw.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end   = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('JSON 객체를 찾을 수 없습니다');
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return fail(res, 500, 'AI 추천 파싱 실패');
  }

  // 캐시 저장
  await VideoClip.update(
    { ai_recommendation: JSON.stringify(parsed) },
    { where: { id: req.params.id, user_id: uid } }
  );

  return ok(res, parsed);
}));

module.exports = router;
