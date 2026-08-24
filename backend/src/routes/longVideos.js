// 긴 영상(강의·세미나·스파링) 분석 라우트 — task-007 Phase 1
// 전 라우트 WHERE user_id = req.user.id 소유권 필터 적용 필수
// (voice_jobs/class_video_jobs/chain_video_jobs가 user_id를 빠뜨려 소유권 필터가 없는
//  기존 버그를 이번 신규 도메인에서는 반복하지 않는다)
const express = require('express');
const router  = express.Router();
const fs = require('fs/promises');
const { sequelize, LongVideo, LongVideoChapter, Technique, VideoClip } = require('../models');
const { wrap, ok, fail, safeParse } = require('../utils/respond');
const pipeline = require('../services/longVideoPipeline');
const storage = require('../services/storage');

function jobSummary(job) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    detail: job.detail,
    error: job.error,
    resume_from: job.resume_from,
  };
}

// POST /api/long-videos — 등록 {url, kind, title} → {id, jobId}
// title: task-010 — 사용자가 직접 입력하면 등록 시 그 제목으로 저장되고 title_locked=1이 되어
// S1의 유튜브 제목 동기화 대상에서 제외된다(pipeline.registerVideo가 실제 로직 처리).
router.post('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const { url, kind, title } = req.body;
  if (!url || typeof url !== 'string' || !url.trim()) return fail(res, 400, 'url이 필요합니다');
  const result = await pipeline.registerVideo({ userId: uid, url: url.trim(), kind, title });
  return ok(res, result);
}));

// GET /api/long-videos — 목록 + 최신 잡 요약 + 매칭된 기술명(task-010, 검색/필터용)
router.get('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const videos = await LongVideo.findAll({ where: { user_id: uid }, order: [['id', 'DESC']], raw: true });
  if (!videos.length) return ok(res, []);

  const ids = videos.map(v => v.id);
  const [jobs] = await sequelize.query(
    `SELECT j.* FROM long_video_jobs j
     INNER JOIN (
       SELECT long_video_id, MAX(created_at) AS mx FROM long_video_jobs
       WHERE long_video_id IN (${ids.map(() => '?').join(',')}) AND user_id = ?
       GROUP BY long_video_id
     ) latest ON latest.long_video_id = j.long_video_id AND latest.mx = j.created_at
     WHERE j.user_id = ?`,
    { replacements: [...ids, uid, uid] }
  );
  const jobByVideo = new Map(jobs.map(j => [j.long_video_id, j]));

  // task-010: 목록 카드/필터에서 쓸 매칭된 기술명 — 승인 여부와 무관하게 매칭된(technique_id
  // 있는) 것만 포함한다. INNER JOIN + technique_id IS NOT NULL로 미승인 AI 추측(match_type='none')
  // 은 자동으로 제외된다(설계서 §2 그대로).
  const [techRows] = await sequelize.query(
    `SELECT DISTINCT lvt.long_video_id, t.name AS technique_name
     FROM long_video_techniques lvt
     INNER JOIN techniques t ON t.id = lvt.technique_id AND t.user_id = lvt.user_id
     WHERE lvt.long_video_id IN (${ids.map(() => '?').join(',')})
       AND lvt.user_id = ? AND lvt.technique_id IS NOT NULL
     ORDER BY t.name ASC`,
    { replacements: [...ids, uid] }
  );
  const techNamesByVideo = new Map();
  for (const r of techRows) {
    if (!techNamesByVideo.has(r.long_video_id)) techNamesByVideo.set(r.long_video_id, []);
    techNamesByVideo.get(r.long_video_id).push(r.technique_name);
  }

  return ok(res, videos.map(v => ({
    ...v,
    job: jobSummary(jobByVideo.get(v.id)),
    techniqueNames: techNamesByVideo.get(v.id) || [],
  })));
}));

// GET /api/long-videos/status — 진행중 잡만
router.get('/status', wrap(async (req, res) => {
  const uid = req.user.id;
  const [jobs] = await sequelize.query(
    `SELECT * FROM long_video_jobs WHERE user_id = ? AND status IN ('queued','running') ORDER BY created_at ASC`,
    { replacements: [uid] }
  );
  return ok(res, jobs);
}));

// GET /api/long-videos/:id — 상세 + chapters[] + techniques[]
router.get('/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const video = await LongVideo.findOne({ where: { id: req.params.id, user_id: uid }, raw: true });
  if (!video) return fail(res, 404, '영상을 찾을 수 없습니다');

  const chapters = await LongVideoChapter.findAll({
    where: { long_video_id: video.id, user_id: uid },
    order: [['idx', 'ASC']],
    raw: true,
  });
  // technique_name — 매칭된(또는 apply로 연동된) 기술의 실제 이름을 함께 내려줘 프론트가 별도
  // 조회 없이 "raw_name → technique_name" 매핑을 보여줄 수 있게 한다 (task-009 Phase 3).
  const [techniques] = await sequelize.query(
    `SELECT lvt.*, t.name AS technique_name
     FROM long_video_techniques lvt
     LEFT JOIN techniques t ON t.id = lvt.technique_id AND t.user_id = lvt.user_id
     WHERE lvt.long_video_id = ? AND lvt.user_id = ?
     ORDER BY lvt.at_sec ASC`,
    { replacements: [video.id, uid] }
  );
  const [[job]] = await sequelize.query(
    `SELECT * FROM long_video_jobs WHERE long_video_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`,
    { replacements: [video.id, uid] }
  );

  return ok(res, {
    ...video,
    key_points: safeParse(video.key_points, []), // S9 종합 출력 (task-008)
    job: jobSummary(job),
    chapters: chapters.map(c => ({
      ...c,
      frames: safeParse(c.frames, []),
      details: safeParse(c.details, null), // S8 구간분석 출력 (points/positions/techniques/visual_confidence)
    })),
    techniques,
  });
}));

// PATCH /api/long-videos/:id/chapters — 전체 배열 교체 (정렬·겹침 검증 후 트랜잭션)
router.patch('/:id/chapters', wrap(async (req, res) => {
  const uid = req.user.id;
  const video = await LongVideo.findOne({ where: { id: req.params.id, user_id: uid }, attributes: ['id'], raw: true });
  if (!video) return fail(res, 404, '영상을 찾을 수 없습니다');

  const input = Array.isArray(req.body.chapters) ? req.body.chapters : null;
  if (!input || !input.length) return fail(res, 400, 'chapters 배열이 필요합니다');

  const normalized = input
    .map(c => ({
      start_sec: Number(c.start_sec),
      end_sec:   Number(c.end_sec),
      title:     String(c.title || '').slice(0, 255),
      source:    ['youtube', 'ai', 'visual', 'single'].includes(c.source) ? c.source : 'single',
      confidence: Math.max(0, Math.min(100, Math.round(Number(c.confidence) || 100))),
    }))
    .filter(c => Number.isFinite(c.start_sec) && Number.isFinite(c.end_sec) && c.end_sec > c.start_sec)
    .sort((a, b) => a.start_sec - b.start_sec);

  if (!normalized.length) return fail(res, 400, '유효한 챕터가 없습니다');
  for (let i = 1; i < normalized.length; i++) {
    if (normalized[i].start_sec < normalized[i - 1].end_sec) {
      return fail(res, 400, `챕터 ${i}번과 ${i + 1}번이 겹칩니다`);
    }
  }

  // task-009 Phase 3 수정(2026-08-23, Reviewer가 실측으로 발견한 HIGH 결함 대응) — 예전 구현은
  // 매 저장마다 챕터 전체를 destroy()+create()해서, 시간 경계가 하나도 안 바뀐 챕터까지
  // status/details/frames/summary(S7~S9 분석 결과)를 통째로 날렸다. Phase 1엔 그 데이터 자체가
  // 없어 무해했고 Phase 2엔 편집 UI가 없어 도달 불가능했지만, Phase 3의 ChapterEditor.jsx가 실제로
  // 이 라우트를 호출하게 되면서 "제목 하나만 고쳤는데 전체 챕터 분석이 초기화"되는 실사용 데이터
  // 손실로 이어짐(Reviewer가 실제 영상으로 재현). 이제는 기존 챕터와 (start_sec,end_sec)이 정확히
  // 같은 행만 "안 바뀐 챕터"로 보고 같은 id를 유지한 채 title/source/confidence만 갱신한다(=
  // status/details/frames/summary/error는 손대지 않음, 부수적으로 long_video_techniques의
  // chapter_id FK도 안 끊어짐). 경계가 실제로 바뀐(병합·분할·시간이동) 챕터만 기존 행을 지우고
  // 분석결과가 없는 새 행으로 만든다 — 그 행이 가리키던 기술 매칭도 함께 정리(고아 방지).
  //
  // edited 플래그도 예전처럼 전체 일괄 1이 아니라 "실제로 바뀐 챕터"만 1로 찍는다. 부수 효과:
  // task-007 Reviewer가 Low로 남기고 Phase 3에서 재검토가 필요하다고 명시했던 문제(재분석 시
  // saveChapters의 preserveEdited가 경계가 넓어진 edited=1 챕터 하나를 겹치는 새 챕터 여럿에
  // 중복 매칭시켜 같은 제목이 여러 챕터에 복제되는 현상)도 같이 해소된다 — 안 바뀐 챕터는 원래
  // edited 값을 그대로 유지하므로(대개 0), "제목 하나만 고친" 저장이 나머지 챕터를 전부
  // edited=1로 오염시키지 않는다.
  const existing = await LongVideoChapter.findAll({
    where: { long_video_id: video.id, user_id: uid },
    raw: true,
  });
  const existingByBounds = new Map(existing.map(c => [`${c.start_sec}|${c.end_sec}`, c]));

  const plan = normalized.map(c => {
    const key = `${c.start_sec}|${c.end_sec}`;
    const match = existingByBounds.get(key);
    if (match) {
      existingByBounds.delete(key); // 기존 챕터 하나는 최대 1개의 신규 행에만 매칭(중복 소비 방지)
      const titleChanged = match.title !== c.title;
      return {
        keepId: match.id,
        start_sec: c.start_sec, end_sec: c.end_sec,
        title: c.title, source: c.source, confidence: c.confidence,
        edited: titleChanged ? 1 : match.edited,
      };
    }
    return {
      keepId: null,
      start_sec: c.start_sec, end_sec: c.end_sec,
      title: c.title, source: c.source, confidence: c.confidence,
      edited: 1,
    };
  });

  // 매칭 안 된(=경계가 바뀌었거나 병합·삭제된) 기존 챕터 — 그 챕터를 가리키던 기술 매칭 행도 정리
  const removedChapterIds = [...existingByBounds.values()].map(c => c.id);

  await sequelize.transaction(async (t) => {
    if (removedChapterIds.length) {
      await sequelize.query(
        `DELETE FROM long_video_techniques WHERE chapter_id IN (${removedChapterIds.map(() => '?').join(',')})`,
        { replacements: removedChapterIds, transaction: t }
      );
      await LongVideoChapter.destroy({ where: { id: removedChapterIds }, transaction: t });
    }
    let idx = 0;
    for (const r of plan) {
      if (r.keepId) {
        await LongVideoChapter.update({
          idx, start_sec: r.start_sec, end_sec: r.end_sec,
          title: r.title, source: r.source, confidence: r.confidence, edited: r.edited,
        }, { where: { id: r.keepId }, transaction: t });
      } else {
        await LongVideoChapter.create({
          long_video_id: video.id,
          user_id: uid,
          idx,
          start_sec: r.start_sec,
          end_sec: r.end_sec,
          title: r.title,
          source: r.source,
          confidence: r.confidence,
          status: 'pending',
          edited: 1,
        }, { transaction: t });
      }
      idx++;
    }
  });

  return ok(res, { ok: true, count: plan.length });
}));

// POST /api/long-videos/:id/reanalyze — 재분석 (S1부터 전체 재수행)
router.post('/:id/reanalyze', wrap(async (req, res) => {
  const uid = req.user.id;
  const video = await LongVideo.findOne({ where: { id: req.params.id, user_id: uid }, attributes: ['id'], raw: true });
  if (!video) return fail(res, 404, '영상을 찾을 수 없습니다');

  const [[activeJob]] = await sequelize.query(
    `SELECT id FROM long_video_jobs WHERE long_video_id = ? AND user_id = ? AND status IN ('queued','running') LIMIT 1`,
    { replacements: [video.id, uid] }
  );
  if (activeJob) return fail(res, 409, '이미 분석이 진행 중입니다');

  const jobId = await pipeline.enqueueJob(video.id, uid);
  return ok(res, { jobId });
}));

// POST /api/long-videos/:id/cancel — 진행 중인 잡 취소
router.post('/:id/cancel', wrap(async (req, res) => {
  const uid = req.user.id;
  const video = await LongVideo.findOne({ where: { id: req.params.id, user_id: uid }, attributes: ['id'], raw: true });
  if (!video) return fail(res, 404, '영상을 찾을 수 없습니다');

  const [[job]] = await sequelize.query(
    `SELECT id FROM long_video_jobs WHERE long_video_id = ? AND user_id = ? AND status IN ('queued','running')
     ORDER BY created_at DESC LIMIT 1`,
    { replacements: [video.id, uid] }
  );
  if (!job) return fail(res, 400, '진행 중인 작업이 없습니다');

  await sequelize.query(
    `UPDATE long_video_jobs SET status='canceled', detail='사용자 취소', updated_at=NOW() WHERE id = ?`,
    { replacements: [job.id] }
  );
  return ok(res, { ok: true });
}));

// DELETE /api/long-videos/:id
router.delete('/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const video = await LongVideo.findOne({ where: { id: req.params.id, user_id: uid }, attributes: ['id'], raw: true });
  if (!video) return fail(res, 404, '영상을 찾을 수 없습니다');

  await sequelize.transaction(async (t) => {
    await LongVideoChapter.destroy({ where: { long_video_id: video.id, user_id: uid }, transaction: t });
    await sequelize.query(`DELETE FROM long_video_jobs WHERE long_video_id = ? AND user_id = ?`, { replacements: [video.id, uid], transaction: t });
    await sequelize.query(`DELETE FROM long_video_techniques WHERE long_video_id = ? AND user_id = ?`, { replacements: [video.id, uid], transaction: t });
    await LongVideo.destroy({ where: { id: video.id, user_id: uid }, transaction: t });
  });
  ok(res, { ok: true });
  // S7(task-008)이 챕터 프레임을 영구 저장하므로, DB 삭제 후 그 디렉토리도 정리한다
  // (실패해도 API 응답에는 영향 없음 — 백그라운드로 베스트에포트 정리)
  fs.rm(storage.getLongVideoFramesDir(uid, video.id), { recursive: true, force: true }).catch(() => {});
}));

// POST /api/long-videos/:id/techniques/:tid/apply — task-009 Phase 3, 설계서 §6-6
// 승인 시에만 실질 연동한다: 해당 챕터를 video_clips 행으로 만들어 그 기술의 참고영상에 노출시킨다.
// match_type='none'(미매칭) 항목도 body.technique_id를 함께 보내면 적용 가능하다 — 프론트가
// 먼저 POST /api/techniques(기존, 중복검사 보유)로 새 기술을 만들고 그 id를 넘기는 방식
// ("새 기술로 추가" 경로, 설계서 §6-5). 이 라우트 자체는 techniques 테이블에 아무것도 만들지
// 않는다 — 자동 생성 금지 원칙은 여기서도 지켜진다.
router.post('/:id/techniques/:tid/apply', wrap(async (req, res) => {
  const uid = req.user.id;
  const video = await LongVideo.findOne({ where: { id: req.params.id, user_id: uid }, raw: true });
  if (!video) return fail(res, 404, '영상을 찾을 수 없습니다');

  const [[tech]] = await sequelize.query(
    `SELECT * FROM long_video_techniques WHERE id = ? AND long_video_id = ? AND user_id = ?`,
    { replacements: [req.params.tid, video.id, uid] }
  );
  if (!tech) return fail(res, 404, '기술을 찾을 수 없습니다');

  // 설계서 §6-5: confidence < 0.7은 승인 API 자체가 거부한다(프론트 버튼 비활성화와는 별개의
  // 서버측 방어 — 프론트를 우회해 직접 API를 호출해도 막혀야 함). DECIMAL(3,2) 컬럼이 드라이버에
  // 따라 문자열로 반환될 수 있어(설계서 §8 리스크 7) Number()로 강제 변환 후 비교한다.
  const confidence = Number(tech.confidence);
  if (!(confidence >= 0.7)) {
    return fail(res, 400, `확신도가 낮아 연동할 수 없습니다 (${Number.isFinite(confidence) ? confidence.toFixed(2) : '0.00'} < 0.70)`);
  }

  // 연동 대상 기술 결정 — 이미 매칭돼 있으면(exact/alias/fuzzy) 그대로 쓰고, match_type='none'이면
  // body.technique_id(새로 만들었거나 사용자가 직접 고른 기존 기술)가 반드시 있어야 한다.
  let targetTechniqueId = tech.technique_id;
  if (req.body?.technique_id != null) {
    const overrideId = Number(req.body.technique_id);
    if (!Number.isInteger(overrideId)) return fail(res, 400, 'technique_id가 올바르지 않습니다');
    const t = await Technique.findOne({ where: { id: overrideId, user_id: uid }, attributes: ['id'], raw: true });
    if (!t) return fail(res, 404, '지정한 기술을 찾을 수 없습니다');
    targetTechniqueId = t.id;
  }
  if (!targetTechniqueId) {
    return fail(res, 400, '매칭된 기술이 없습니다 — 먼저 새 기술로 추가한 뒤(POST /api/techniques) 그 id로 다시 시도해주세요');
  }

  const targetTechnique = await Technique.findOne({ where: { id: targetTechniqueId, user_id: uid }, attributes: ['id', 'name'], raw: true });
  if (!targetTechnique) return fail(res, 404, '기술을 찾을 수 없습니다');

  const chapter = await LongVideoChapter.findOne({ where: { id: tech.chapter_id, long_video_id: video.id, user_id: uid }, raw: true });
  if (!chapter) return fail(res, 404, '챕터를 찾을 수 없습니다');

  const startSec = Math.max(0, Math.floor(chapter.start_sec || 0));
  const clipUrl = video.url.includes('?') ? `${video.url}&t=${startSec}s` : `${video.url}?t=${startSec}s`;

  // 중복 연동 방지 — long_video_techniques 테이블엔 "이미 연동됐는지"를 표시할 별도 컬럼이 없다
  // (설계서 §1 스키마 그대로, Phase 3 범위에서 스키마 변경은 하지 않음). 대신 이 챕터+기술 조합이
  // 만들어내는 clipUrl은 챕터 시작초로 결정적으로 재현되므로, 같은 user_id+url의 클립이 이미 있으면
  // 새로 만들지 않고 그 클립을 재사용한다 — 같은 tid를 두 번 승인해도(더블탭·네트워크 재시도 등)
  // video_clips가 중복 생성되지 않는다.
  const existingClip = await VideoClip.findOne({ where: { user_id: uid, url: clipUrl }, attributes: ['id'], raw: true });
  let clipId;
  if (existingClip) {
    clipId = existingClip.id;
  } else {
    let frames = [];
    try { frames = JSON.parse(chapter.frames || '[]'); } catch { frames = []; }
    const thumbUrl = frames[0]?.path || video.thumb_url || '';

    // 반드시 VideoClip.create()를 직접 호출한다 — routes/clips.js의 POST/PUT 라우트를 거치면
    // autoAnalyzeClip()이 즉시 발동해 구 파이프라인이 이 유튜브 URL을 다시 분석하려 든다. 이미
    // 챕터 단위로 프레임·요약·기술을 다 뽑아뒀으므로 그 재분석은 불필요할 뿐 아니라(중복 작업),
    // 이 라우트를 거치지 않고 모델을 직접 써야 그 자동 트리거 자체를 원천 우회할 수 있다
    // (설계서 §6-6이 명시적으로 경고한 지점).
    const clip = await VideoClip.create({
      title: `${chapter.title || video.title || '긴 영상'} — ${targetTechnique.name}`.slice(0, 255),
      url: clipUrl,
      platform: 'youtube',
      description: chapter.summary || '',
      tech_name: JSON.stringify([targetTechnique.name]),
      thumb_url: thumbUrl,
      user_id: uid,
    });
    clipId = clip.id;
  }

  // long_video_techniques 행에도 연동 결과를 남긴다 — match_type='none'이었던 항목도 이제
  // technique_id가 채워져(match_type은 원래 값 그대로 보존) 프론트가 "이미 연동됨"을 판단할 수 있다.
  await sequelize.query(
    `UPDATE long_video_techniques SET technique_id = ? WHERE id = ?`,
    { replacements: [targetTechniqueId, tech.id] }
  );

  return ok(res, {
    ok: true,
    clipId,
    techniqueId: targetTechniqueId,
    techniqueName: targetTechnique.name,
    alreadyLinked: !!existingClip,
  });
}));

module.exports = router;
