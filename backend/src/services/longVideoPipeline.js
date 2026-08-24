// 긴 영상 분석 파이프라인 — task-007 Phase 1(S0~S6) + task-008 Phase 2(S7~S9) + task-009 Phase 3(S10)
// S11(완료/보관)은 Phase 4 소관, 이 파일에서 구현하지 않는다.
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const { sequelize, LongVideo, LongVideoChapter } = require('../models');
const { runClaude } = require('./claudeCli');
const ytdlp = require('./ytdlp');
const chapterPlanner = require('./chapterPlanner');
const vttParser = require('./vttParser');
const storage = require('./storage');
const { extractJSONObject } = require('../utils/extractJson');
const techMatch = require('../utils/techMatch');

const TMP_ROOT = '/tmp';
const MAX_DURATION_SEC = 3 * 60 * 60; // 3시간 초과 거절
const VISUAL_FRAME_COUNT = 15;
const SEGMENT_FRAME_COUNT = 3;

function tmpDirFor(jobId) {
  return path.join(TMP_ROOT, `bjj-lv-${jobId}`);
}

// utils/extractJson.js의 공용 extractJSONObject를 감싸는 얇은 래퍼(파싱 실패 시 null 관례 유지) —
// chapterPlanner.js의 safeExtractJson과 동일한 목적이나, 서로 다른 모듈이 서로를 참조하는 대신
// (pipeline.js가 chapterPlanner.js의 내부 유틸을 끌어오는 건 계층이 거꾸로다) 각자 얇게 감싼다.
// 실제 파싱 로직 자체는 utils/extractJson.js 한 곳에만 있다(중복 아님).
function safeExtractJson(raw) {
  try { return extractJSONObject(String(raw || '')); } catch { return null; }
}

// ── 잡 상태 헬퍼 (long_video_jobs — raw sequelize.query, 설계서 관례) ──────
async function updateJob(jobId, fields = {}) {
  const keys = Object.keys(fields);
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => fields[k]);
  const prefix = keys.length ? `${setClause}, ` : '';
  await sequelize.query(
    `UPDATE long_video_jobs SET ${prefix}heartbeat_at = NOW(), updated_at = NOW() WHERE id = ?`,
    { replacements: [...vals, jobId] }
  );
}

async function updateStage(jobId, stage, progress, detail) {
  await updateJob(jobId, { status: 'running', stage, progress, detail });
}

async function incrementAiCalls(jobId, by = 1) {
  if (!by) return;
  await sequelize.query(
    `UPDATE long_video_jobs SET ai_calls = ai_calls + ?, heartbeat_at = NOW(), updated_at = NOW() WHERE id = ?`,
    { replacements: [by, jobId] }
  );
}

async function completeJob(jobId, { detail = '완료', error = null } = {}) {
  await sequelize.query(
    `UPDATE long_video_jobs SET status='done', progress=100, detail=?, error=?, heartbeat_at=NOW(), updated_at=NOW() WHERE id = ?`,
    { replacements: [detail, error, jobId] }
  );
}

async function errorJob(jobId, message) {
  const msg = String(message ?? '').slice(0, 2000);
  await sequelize.query(
    `UPDATE long_video_jobs SET status='error', error=?, detail=?, heartbeat_at=NOW(), updated_at=NOW() WHERE id = ?`,
    { replacements: [msg, msg.slice(0, 500), jobId] }
  );
}

async function getJobById(jobId) {
  const [[job]] = await sequelize.query(`SELECT * FROM long_video_jobs WHERE id = ?`, { replacements: [jobId] });
  return job || null;
}

async function isJobCanceled(jobId) {
  const job = await getJobById(jobId);
  return job?.status === 'canceled';
}

async function cancelCleanup(jobId, videoId) {
  await sequelize.query(
    `UPDATE long_video_jobs SET status='canceled', detail='사용자 취소', heartbeat_at=NOW(), updated_at=NOW() WHERE id = ?`,
    { replacements: [jobId] }
  );
  await LongVideo.update({ status: 'canceled' }, { where: { id: videoId } }).catch(() => {});
}

// ── 챕터 저장 (long_video_chapters — Sequelize 모델 경유, 설계서 관례) ────
// preserveEdited: 이전에 사용자가 직접 수정(edited=1)한 챕터와 시간대가 겹치면 제목을 보존한다
// (재분석 시 사용자 제목 미덮어씀 — PATCH /:id/chapters 로 생성된 edited=1 레코드가 있다면 적용된다)
async function saveChapters(videoId, userId, chapters, { preserveEdited = false } = {}) {
  await sequelize.transaction(async (t) => {
    let existingEdited = [];
    if (preserveEdited) {
      existingEdited = await LongVideoChapter.findAll({
        where: { long_video_id: videoId, edited: 1 },
        attributes: ['start_sec', 'end_sec', 'title'],
        raw: true,
        transaction: t,
      });
    }
    await LongVideoChapter.destroy({ where: { long_video_id: videoId }, transaction: t });
    for (const c of chapters) {
      const overlap = existingEdited.find(e => e.start_sec < c.end_sec && e.end_sec > c.start_sec);
      await LongVideoChapter.create({
        long_video_id: videoId,
        user_id: userId,
        idx: c.idx,
        start_sec: c.start_sec,
        end_sec: c.end_sec,
        title: overlap ? overlap.title : c.title,
        source: c.source,
        confidence: c.confidence,
        status: 'pending',
        edited: overlap ? 1 : 0,
      }, { transaction: t });
    }
  });
}

// ── S0: 등록 ────────────────────────────────────────────────────────────
const KIND_VALUES = new Set(['lecture', 'seminar', 'sparring']);

async function registerVideo({ userId, url, kind, title }) {
  const videoId = ytdlp.extractYoutubeId(url);
  if (!videoId) {
    const err = new Error('YouTube 영상 URL만 지원합니다');
    err.status = 400;
    throw err;
  }
  // 중복(user_id+video_id) → 기존 id 반환, 즉시 응답 (기존 title/title_locked 상태는 그대로 보존)
  const existing = await LongVideo.findOne({ where: { user_id: userId, video_id: videoId } });
  if (existing) {
    const [[job]] = await sequelize.query(
      `SELECT id FROM long_video_jobs WHERE long_video_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`,
      { replacements: [existing.id, userId] }
    );
    return { id: existing.id, jobId: job?.id || null, duplicate: true };
  }

  // task-010: 사용자가 등록 시 제목을 직접 입력하면 title_locked=1로 저장하고, 그 제목은
  // S1(runPipeline)의 유튜브 제목 동기화 조건에서 제외된다(아래 title_locked 조건 참고).
  // 비워두면(트림 후 빈 문자열) title_locked=0으로 남아 기존과 완전히 동일하게 유튜브 제목을 쓴다.
  const cleanTitle = String(title || '').trim().slice(0, 500);
  const video = await LongVideo.create({
    user_id: userId,
    url,
    video_id: videoId,
    title: cleanTitle,
    title_locked: cleanTitle ? 1 : 0,
    kind: KIND_VALUES.has(kind) ? kind : 'lecture',
    status: 'queued',
  });
  const jobId = await enqueueJob(video.id, userId);
  return { id: video.id, jobId, duplicate: false };
}

// 새 잡을 큐에 등록 (등록/재분석 공용)
async function enqueueJob(videoId, userId, { resumeFrom = null } = {}) {
  const jobId = crypto.randomUUID();
  await sequelize.query(
    `INSERT INTO long_video_jobs (id, long_video_id, user_id, status, stage, progress, detail, resume_from)
     VALUES (?, ?, ?, 'queued', ?, 0, '대기 중', ?)`,
    { replacements: [jobId, videoId, userId, resumeFrom || 'S1', resumeFrom] }
  );
  await LongVideo.update({ status: 'queued', error: null }, { where: { id: videoId, user_id: userId } });
  return jobId;
}

// ── ffmpeg 프레임 추출 공용 헬퍼 ───────────────────────────────────────
// videoAnalysis.js의 extractFrames()는 이 작업 범위 밖(수정 금지)이라 재사용하지 않고
// 긴 영상 전용으로 별도 구현한다 (640px 스케일).
function runProcess(cmd, args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { timeout: timeoutMs });
    let out = '', err = '';
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { err += d; });
    proc.on('error', e => reject(e));
    proc.on('close', (code, signal) => {
      if (signal) return reject(new Error(`${cmd} 강제 종료 (signal: ${signal})`));
      if (code !== 0) return reject(new Error((err.trim() || out.trim() || `${cmd} 종료 코드: ${code}`).slice(0, 300)));
      resolve(out);
    });
  });
}

// S4: 챕터 미확정일 때 시각 판단용 15장 균등 추출 (임시 디렉토리 — 판단 후 파기)
async function extractVisualFrames(videoPath, outDir, durationSec) {
  const dur = durationSec > 0 ? durationSec : 30;
  const count = VISUAL_FRAME_COUNT;
  const interval = (dur * 0.9) / count;
  const start = dur * 0.05;
  const frames = [];
  for (let i = 0; i < count; i++) {
    const t = start + interval * i;
    const out = path.join(outDir, `visual-frame-${i + 1}.jpg`);
    try {
      await runProcess('ffmpeg', ['-y', '-ss', t.toFixed(2), '-i', videoPath, '-vf', 'scale=640:-2', '-frames:v', '1', '-q:v', '3', out], 30000);
      frames.push({ t: Math.round(t), path: out });
    } catch (e) {
      console.error(`[long-video] 프레임 ${i + 1} 추출 실패:`, e.message);
    }
  }
  return frames;
}

// S7: 챕터당 3장 — 영구 저장 위치(storage.getLongVideoFramesDir)에 직접 추출한다(임시 아님).
// 한 챕터의 프레임 추출이 실패해도 예외를 던지지 않고 부분/빈 배열을 반환 — 그 챕터만 스킵되게
// 호출측(runPipeline)에서 처리한다.
async function extractChapterFrames(videoPath, framesDir, chapter) {
  storage.ensureDir(framesDir);
  const dur = Math.max(1, chapter.end_sec - chapter.start_sec);
  const offsets = [0.25, 0.5, 0.75].map(f => chapter.start_sec + dur * f);
  const frames = [];
  for (let i = 0; i < offsets.length; i++) {
    const t = offsets[i];
    const filename = `ch${chapter.idx}-${i + 1}.jpg`;
    const out = path.join(framesDir, filename);
    try {
      await runProcess('ffmpeg', ['-y', '-ss', t.toFixed(2), '-i', videoPath, '-vf', 'scale=640:-2', '-frames:v', '1', '-q:v', '3', out], 30000);
      frames.push({ t: Math.round(t), path: out, filename });
    } catch (e) {
      console.error(`[long-video] 챕터 ${chapter.idx} 프레임 ${i + 1} 추출 실패:`, e.message);
    }
  }
  return frames;
}

// S8: 구간분석(map) 프롬프트 — 설계서 §3-D 출력 스키마 그대로.
// title 필드는 응답에 포함되지만 챕터 제목은 S1~S6에서 이미 확정된 것을 유지하고 여기서는
// 덮어쓰지 않는다(사용자가 직접 수정한 제목이나 유튜브 원 제목을 잃지 않기 위함).
function buildSegmentPrompt(videoTitle, chapter, frames, subtitleText) {
  const frameList = frames.map((f, i) => `${i + 1}. ${f.path}`).join('\n');
  const subtitleBlock = subtitleText
    ? `\n[이 구간 자막 — 보조 단서. 자동 생성이라 BJJ 용어를 자주 틀립니다(예: 암바→안바). 화면과 상충하면 반드시 화면을 우선하세요]\n${subtitleText.slice(0, 2000)}\n`
    : '\n[이 구간 자막]\n(없음 — 프레임 이미지만으로 분석)\n';

  return `당신은 주짓수(BJJ) 전문가입니다. 아래는 "${videoTitle}" 영상의 한 구간(${chapterPlanner.fmtMmSs(chapter.start_sec)}~${chapterPlanner.fmtMmSs(chapter.end_sec)}, 챕터: "${chapter.title}")에서 추출한 프레임 ${frames.length}장입니다.

[분석 방향]
- 프레임에서 실제로 보이는 포지션·기술·전환만 서술 (추측 금지)
- 확신이 없으면 해당 항목은 빈 배열로 응답
- 자막은 보조 단서로만 사용. 화면과 자막이 상충하면 반드시 화면을 우선
- BJJ 전문 용어 사용

[프레임 이미지 파일 경로 — Read 툴로 순서대로 읽어주세요]
${frameList}
${subtitleBlock}
다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{"title":"12자 이내","summary":"2~4문장","points":["핵심 포인트"],"positions":["포지션명"],"techniques":[{"name":"기술명","at":"mm:ss","confidence":0.0}],"visual_confidence":0.0}`;
}

// S9: 종합(reduce) 프롬프트 — 원본 자막이 아니라 챕터 요약들만 입력(프롬프트가 챕터 수에 선형이 되게)
function buildSynthesisPrompt(videoTitle, chapters) {
  const block = chapters
    .map((c, i) => `${i + 1}. [${chapterPlanner.fmtMmSs(c.start_sec)}~${chapterPlanner.fmtMmSs(c.end_sec)}] ${c.title}: ${c.summary || '(요약 없음)'}`)
    .join('\n');
  return `당신은 주짓수(BJJ) 전문가입니다. 아래는 "${videoTitle}" 영상을 챕터별로 분석한 요약입니다. 전체 영상을 종합해주세요.

[챕터별 요약]
${block}

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{"summary":"전체 영상 종합 요약 3~5문장","key_points":["핵심 포인트1","핵심 포인트2","핵심 포인트3"]}`;
}

// S10: 기술 매칭 (Node only, AI 재호출 없음) — task-009 Phase 3, 설계서 §6
// S9(종합) 이후, 챕터별 details.techniques[](Phase 2가 이미 채워둠)를 순회하며 techMatch.js로
// 결정적 매칭해 long_video_techniques에 저장한다. 미매칭은 match_type='none'으로만 남기고
// 이 함수는 techniques 테이블에 아무것도 쓰지 않는다(자동 생성 금지 — 설계서 §6 5번, 가장 중요한
// 안전장치). 승인 시 실제 연동은 routes/longVideos.js의 apply 엔드포인트가 사용자 명시적 호출로만 한다.
//
// 재분석 시 orphan 방지: S6의 saveChapters()는 매 파이프라인 실행마다 long_video_chapters를
// destroy()+create()로 통째로 교체하므로 chapter_id가 실행마다 전부 새로 생긴다. 그 결과
// UNIQUE(long_video_id, chapter_id, norm_name)만으로는 "재실행해도 중복/잔재 없음"이 보장되지
// 않는다(예전 실행의 chapter_id를 가진 행이 그대로 남아 고아가 됨 — 부모 챕터는 이미 지워졌는데
// 기술 매칭 행만 DB에 남는 문제). 그래서 이 실행의 모든 매칭을 다시 쓰기 직전에 이 영상의 기존
// long_video_techniques를 전부 지우고 새로 채운다(트랜잭션으로 원자적 교체) — UNIQUE 제약은 그
// 안에서 동일 챕터·동일 정규화명이 두 번 들어오는 경우(예: 같은 기술이 챕터 내에서 다른 시각에
// 두 번 추출된 경우)의 최종 안전장치로 남긴다(ON DUPLICATE KEY UPDATE).
async function matchChapterTechniques(videoId, userId) {
  const techniqueRows = await sequelize.query(
    `SELECT id, name FROM techniques WHERE user_id = ?`,
    { replacements: [userId], type: sequelize.QueryTypes.SELECT }
  );

  const chapters = await LongVideoChapter.findAll({
    where: { long_video_id: videoId, status: 'done' },
    attributes: ['id', 'details'],
    raw: true,
  });

  const entries = [];
  for (const ch of chapters) {
    let details = null;
    try { details = JSON.parse(ch.details || 'null'); } catch { details = null; }
    const techs = Array.isArray(details?.techniques) ? details.techniques : [];
    for (const t of techs) {
      const rawName = String(t?.name || '').trim().slice(0, 255);
      if (!rawName) continue;
      const matched = techMatch.matchTechnique(rawName, techniqueRows);
      const atSec = chapterPlanner.parseMmSs(t.at);
      const confidence = Math.max(0, Math.min(1, Number(t.confidence) || 0));
      entries.push({
        chapterId: ch.id,
        rawName,
        normName: matched.norm_name,
        techniqueId: matched.technique_id,
        matchType: matched.match_type,
        confidence: confidence.toFixed(2),
        atSec,
      });
    }
  }

  await sequelize.transaction(async (t) => {
    await sequelize.query(`DELETE FROM long_video_techniques WHERE long_video_id = ?`, {
      replacements: [videoId], transaction: t,
    });
    for (const e of entries) {
      await sequelize.query(
        `INSERT INTO long_video_techniques
           (long_video_id, chapter_id, user_id, raw_name, norm_name, technique_id, match_type, confidence, at_sec)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           raw_name = VALUES(raw_name), technique_id = VALUES(technique_id),
           match_type = VALUES(match_type), confidence = VALUES(confidence), at_sec = VALUES(at_sec)`,
        {
          replacements: [videoId, e.chapterId, userId, e.rawName, e.normName, e.techniqueId, e.matchType, e.confidence, e.atSec],
          transaction: t,
        }
      );
    }
  });

  return entries.length;
}

// ── 메인 파이프라인 (S1~S9) ────────────────────────────────────────────
// resume_from은 부팅 시 crash 복구 신호(운영 가시성)로만 쓰고, 실제 실행은 항상 S1부터 전체를
// 다시 수행한다 — 다운로드된 임시 파일은 재시작으로 소실되므로 중간 단계 재개보다 안전하고
// 단순하다. S2.5(챕터 후보 선저장)는 이번 실행 안에서 항상 다운로드보다 먼저 수행되므로,
// 크래시 재발이라는 드문 경우 AI 호출이 다소 낭비될 수 있는 정도의 트레이드오프로 수용한다.
async function runPipeline(job) {
  const jobId = job.id;
  const video = await LongVideo.findOne({ where: { id: job.long_video_id, user_id: job.user_id } });
  if (!video) { await errorJob(jobId, '영상 레코드를 찾을 수 없습니다'); return; }

  await LongVideo.update({ status: 'running', error: null }, { where: { id: video.id } });

  const tmpDir = tmpDirFor(jobId);
  try {
    await fs.mkdir(tmpDir, { recursive: true });

    // ── S1: 메타 (유일한 치명적 단계) ──────────────────────────────
    await updateStage(jobId, 'S1', 5, '메타데이터 조회 중');
    let meta;
    try {
      meta = await ytdlp.fetchMeta(video.url);
    } catch (e) {
      const msg = `메타데이터 조회 실패: ${e.message}`;
      await errorJob(jobId, msg);
      await LongVideo.update({ status: 'error', error: msg }, { where: { id: video.id } });
      return;
    }

    if (meta.durationSec > MAX_DURATION_SEC) {
      const msg = '3시간을 초과하는 영상은 지원하지 않습니다';
      await errorJob(jobId, msg);
      await LongVideo.update({ status: 'error', error: msg, duration_sec: meta.durationSec, title: meta.title }, { where: { id: video.id } });
      return;
    }

    // task-010: title_locked=1(사용자가 등록 시 제목을 직접 입력)이면 이 실행(최초 등록이든
    // 재분석이든)에서 유튜브 제목으로 절대 덮어쓰지 않는다. title_locked=0(기존과 동일한 경우 —
    // 사용자가 제목을 안 넣고 등록)이면 지금까지와 완전히 동일하게 매번 유튜브 제목으로 재동기화한다.
    await LongVideo.update({
      title: video.title_locked ? video.title : (meta.title || video.title),
      channel: meta.channel || video.channel,
      duration_sec: meta.durationSec,
      thumb_url: meta.thumbUrl || video.thumb_url,
    }, { where: { id: video.id } });

    if (await isJobCanceled(jobId)) { await cancelCleanup(jobId, video.id); return; }

    // 우선순위 1: 유튜브 제작자 챕터
    let candidateChapters = meta.chapters?.length
      ? chapterPlanner.planFromMetaChapters(meta.chapters, meta.durationSec)
      : null;

    // ── S2: 자막 조회 — task-008부터 챕터 소스와 무관하게 항상 시도한다.
    // (Phase 1은 우선순위 1이 이미 챕터를 확보하면 자막 조회 자체를 건너뛰었지만, Phase 2의
    //  S8 구간분석이 챕터 소스에 관계없이 자막을 보조 입력으로 재사용하므로 텍스트 확보는
    //  항상 하고, "챕터 판단용 Claude 호출"만 우선순위 1 미확보 시로 한정한다.)
    await updateStage(jobId, 'S2', 15, '자막 조회 중');
    let vttText = '';
    const vttPath = await ytdlp.fetchSubtitleVtt(video.url, tmpDir).catch(e => {
      console.error(`[long-video] job ${jobId} 자막 조회 예외:`, e.message);
      return null;
    });
    if (vttPath) {
      vttText = await fs.readFile(vttPath, 'utf-8').catch(() => '');
    }

    // 우선순위 2: 자막 의미 분할 (우선순위 1이 이미 챕터를 확보했으면 스킵)
    if (!candidateChapters && vttText) {
      const planned = await chapterPlanner.planFromSubtitleWindows(vttText, meta.durationSec, { runClaudeFn: runClaude });
      if (planned?.callsUsed) await incrementAiCalls(jobId, planned.callsUsed);
      if (planned?.chapters?.length) candidateChapters = planned.chapters;
    }

    if (await isJobCanceled(jobId)) { await cancelCleanup(jobId, video.id); return; }

    // ── S2.5: 챕터 후보 선저장 (다운로드 전! 핵심 안전장치) ─────────
    // preserveEdited: 이 호출이 재분석의 "첫 저장"일 수 있으므로 여기서도 지정해야
    // 사용자가 직접 수정(edited=1)한 챕터 제목이 S6까지 보존된다 (S2.5가 먼저 덮어쓰면
    // edited=1 행 자체가 사라져 S6에서 더 이상 찾을 수 없게 되는 순서 버그를 방지)
    if (candidateChapters?.length) {
      await saveChapters(video.id, job.user_id, candidateChapters, { preserveEdited: true });
      await LongVideo.update({ chapter_source: candidateChapters[0].source }, { where: { id: video.id } });
    }
    await updateStage(jobId, 'S2.5', 25, candidateChapters?.length ? '챕터 후보 저장 완료' : '챕터 후보 없음 — 다운로드 후 시각 판단 예정');

    if (await isJobCanceled(jobId)) { await cancelCleanup(jobId, video.id); return; }

    // ── S3: 다운로드 (항상 수행 — 설계서 §2, 챕터 소스 무관) ───────
    await updateStage(jobId, 'S3', 35, '영상 다운로드 중');
    const hasEnoughDisk = await ytdlp.checkFreeDiskSpace(TMP_ROOT);
    if (!hasEnoughDisk) {
      await updateJob(jobId, { status: 'queued', resume_from: 'S3', detail: '디스크 여유 공간 부족(3GB 미만) — 여유 확보 후 자동 재시도' });
      return { requeueDelayMs: 60000 };
    }

    let videoPath = null;
    try {
      videoPath = await ytdlp.downloadVideo(video.url, tmpDir, {
        onProgress: (chunk) => {
          const m = /(\d{1,3}\.\d)%/.exec(chunk);
          if (m) updateJob(jobId, { detail: `영상 다운로드 중 (${m[1]}%)` }).catch(() => {});
        },
        cancelCheck: () => isJobCanceled(jobId),
      });
    } catch (e) {
      // 취소로 인한 reject(ytdlp.js의 cancelCheck → spawnWithWatchdog)를 다운로드 실패와
      // 구분해야 한다 — 그렇지 않으면 /cancel이 이미 세팅한 status='canceled'를 덮어써버린다
      if (await isJobCanceled(jobId)) { await cancelCleanup(jobId, video.id); return; }
      console.error(`[long-video] job ${jobId} 다운로드 실패:`, e.message);
      if (candidateChapters?.length) {
        // S2.5에서 이미 챕터 후보를 저장해뒀으므로 목차만 남기고 done + 경고로 마무리
        const warn = `영상 다운로드 실패 — 목차만 제공됩니다: ${e.message}`;
        await LongVideo.update({ status: 'done', error: warn }, { where: { id: video.id } });
        await completeJob(jobId, { detail: '다운로드 실패 — 목차만 제공', error: warn });
      } else {
        const msg = `영상 다운로드 실패: ${e.message}`;
        await LongVideo.update({ status: 'error', error: msg }, { where: { id: video.id } });
        await errorJob(jobId, msg);
      }
      return;
    }

    if (await isJobCanceled(jobId)) { await cancelCleanup(jobId, video.id); return; }

    // ── S4/S5: 챕터 미확정 시에만 — 프레임 15장 + 시각 챕터 판단 ────
    if (!candidateChapters?.length) {
      await updateStage(jobId, 'S4', 55, '프레임 추출 중');
      let frames = [];
      try {
        frames = await extractVisualFrames(videoPath, tmpDir, meta.durationSec);
      } catch (e) {
        console.error(`[long-video] job ${jobId} 프레임 추출 실패:`, e.message);
      }

      if (frames.length) {
        if (await isJobCanceled(jobId)) { await cancelCleanup(jobId, video.id); return; }
        await updateStage(jobId, 'S5', 65, '시각 기반 챕터 판단 중');
        const visualResult = await chapterPlanner.planFromVisualFrames(frames, meta.durationSec, { runClaudeFn: runClaude });
        if (visualResult?.callsUsed) await incrementAiCalls(jobId, visualResult.callsUsed);
        if (visualResult?.chapters?.length) candidateChapters = visualResult.chapters;
      }
    }

    // ── S6: 챕터 확정 (Phase 1 종료점이었으나 Phase 2부터 S7~S9로 계속 진행) ──
    await updateStage(jobId, 'S6', 75, '챕터 확정 중');
    const finalChapters = candidateChapters?.length
      ? candidateChapters
      : chapterPlanner.singleChapterFallback(meta.durationSec);

    await saveChapters(video.id, job.user_id, finalChapters, { preserveEdited: true });
    await LongVideo.update({
      chapter_source: finalChapters[0]?.source || 'single',
    }, { where: { id: video.id } });

    if (await isJobCanceled(jobId)) { await cancelCleanup(jobId, video.id); return; }

    // ── S7~S8: 챕터별 프레임 추출 + 구간분석(map) ──────────────────
    // S6에서 saveChapters()가 테이블을 통째로 교체했으므로 반드시 재조회한다(이전 참조는 stale).
    await updateStage(jobId, 'S7', 80, '챕터별 프레임 추출 · 분석 중');
    const chapterRows = await LongVideoChapter.findAll({
      where: { long_video_id: video.id },
      order: [['idx', 'ASC']],
    });
    const subtitleCues = vttText ? vttParser.parseVtt(vttText) : [];
    const total = chapterRows.length || 1;

    for (let i = 0; i < chapterRows.length; i++) {
      if (await isJobCanceled(jobId)) { await cancelCleanup(jobId, video.id); return; }
      const chapterRow = chapterRows[i];
      const progress = Math.min(94, 80 + Math.round(((i + 1) / total) * 14));
      await updateJob(jobId, { detail: `구간 ${i + 1}/${total} 분석 중`, progress });
      // 프론트가 "이 챕터가 지금 분석 중"임을 구분할 수 있도록 실시간으로 표시(StudyChapterCard)
      await chapterRow.update({ status: 'running' }).catch(() => {});

      try {
        // S7: 프레임 3장 (영구 저장 위치) — 한 챕터의 추출 실패는 그 챕터만 스킵
        const framesDir = storage.getLongVideoFramesDir(job.user_id, video.id);
        const frames = await extractChapterFrames(videoPath, framesDir, chapterRow);
        if (!frames.length) {
          await chapterRow.update({ status: 'error', error: '프레임 추출 실패로 이 구간 분석을 건너뜀' });
          continue;
        }
        const webFrames = frames.map(f => ({
          t: f.t,
          path: storage.longVideoFrameWebPath(job.user_id, video.id, f.filename),
        }));

        // S8: 구간분석(map) — 챕터별 Claude 호출, 240s, retry 1회(총 2회 시도), batch 레인
        const subtitleText = subtitleCues.length
          ? subtitleCues
              .filter(c => c.end > chapterRow.start_sec && c.start < chapterRow.end_sec)
              .map(c => c.text)
              .join(' ')
              .trim()
          : '';
        const prompt = buildSegmentPrompt(video.title, chapterRow, frames, subtitleText);

        let raw;
        try {
          raw = await runClaude(prompt, { tools: 'Read', timeoutMs: 240000, priority: 'batch', maxRetries: 2 });
        } finally {
          // 성공/실패 관계없이 시도 자체는 1회의 논리적 AI 호출로 집계한다(내부 재시도는
          // runClaude의 maxRetries가 흡수 — ai_calls는 "구간 분석 몇 건을 시도했는지" 집계용)
          await incrementAiCalls(jobId, 1);
        }

        const parsed = safeExtractJson(raw);
        if (!parsed) {
          await chapterRow.update({ status: 'error', error: 'AI 응답 파싱 실패', frames: JSON.stringify(webFrames) });
          continue;
        }

        await chapterRow.update({
          status: 'done',
          error: null,
          summary: String(parsed.summary || '').slice(0, 2000),
          details: JSON.stringify({
            points: Array.isArray(parsed.points) ? parsed.points.slice(0, 20) : [],
            positions: Array.isArray(parsed.positions) ? parsed.positions.slice(0, 20) : [],
            techniques: Array.isArray(parsed.techniques) ? parsed.techniques.slice(0, 20) : [],
            visual_confidence: Math.max(0, Math.min(1, Number(parsed.visual_confidence) || 0)),
          }),
          frames: JSON.stringify(webFrames),
        });
      } catch (e) {
        // 이 챕터만 error 처리하고 나머지 챕터는 계속 진행 — 전체 파이프라인은 죽이지 않는다
        console.error(`[long-video] job ${jobId} 챕터 ${chapterRow.idx} 분석 실패(스킵하고 계속):`, e.message);
        await chapterRow.update({ status: 'error', error: (e.message || String(e)).slice(0, 500) }).catch(() => {});
      }
    }

    if (await isJobCanceled(jobId)) { await cancelCleanup(jobId, video.id); return; }

    // ── S9: 종합(reduce) — 원본 자막이 아니라 챕터 요약만 입력 ──────
    await updateStage(jobId, 'S9', 97, '전체 영상 종합 중');
    try {
      const doneChapters = await LongVideoChapter.findAll({
        where: { long_video_id: video.id, status: 'done' },
        order: [['idx', 'ASC']],
        raw: true,
      });
      if (doneChapters.length) {
        const prompt = buildSynthesisPrompt(video.title, doneChapters);
        const raw = await runClaude(prompt, { timeoutMs: 300000, priority: 'batch' });
        await incrementAiCalls(jobId, 1);
        const parsed = safeExtractJson(raw);
        if (parsed) {
          await LongVideo.update({
            summary: String(parsed.summary || '').slice(0, 5000),
            key_points: JSON.stringify(Array.isArray(parsed.key_points) ? parsed.key_points.slice(0, 20) : []),
          }, { where: { id: video.id } });
        }
      }
    } catch (e) {
      // 실패해도 챕터별 요약은 이미 저장돼 있으므로 종합 없이 done 처리 (설계서 그대로)
      console.error(`[long-video] job ${jobId} 종합(S9) 실패 — 챕터별 요약은 유지, 종합 없이 완료 처리:`, e.message);
    }

    if (await isJobCanceled(jobId)) { await cancelCleanup(jobId, video.id); return; }

    // ── S10: 기술 매칭 (Node only, AI 호출 없음) ────────────────────
    await updateStage(jobId, 'S10', 99, '기술트리 매칭 중');
    try {
      const matchedCount = await matchChapterTechniques(video.id, job.user_id);
      console.log(`[long-video] job ${jobId} 기술 매칭(S10) 완료 — ${matchedCount}건`);
    } catch (e) {
      // 매칭 실패해도 챕터별 요약·종합은 이미 저장돼 있으므로 매칭 없이 done 처리
      console.error(`[long-video] job ${jobId} 기술 매칭(S10) 실패 — 매칭 없이 완료 처리:`, e.message);
    }

    const [[counts]] = await sequelize.query(
      `SELECT COUNT(*) AS total, SUM(status='done') AS done, SUM(status='error') AS failed
       FROM long_video_chapters WHERE long_video_id = ?`,
      { replacements: [video.id] }
    );
    const doneCount = Number(counts?.done || 0);
    const failedCount = Number(counts?.failed || 0);
    const totalCount = Number(counts?.total || finalChapters.length);

    await LongVideo.update({ status: 'done', error: null }, { where: { id: video.id } });
    await completeJob(jobId, {
      detail: `구간 분석 완료 (${doneCount}/${totalCount} 성공${failedCount > 0 ? `, ${failedCount}건 실패` : ''})`,
    });
  } catch (e) {
    console.error(`[long-video] job ${jobId} 처리 중 예외:`, e);
    await errorJob(jobId, e.message || String(e)).catch(() => {});
    await LongVideo.update({ status: 'error', error: e.message || String(e) }, { where: { id: video.id } }).catch(() => {});
  } finally {
    // 잡별 임시 디렉토리는 성공/실패/취소/예외 모든 경로에서 반드시 정리한다
    // (S7 프레임은 storage.getLongVideoFramesDir의 영구 저장 위치에 있어 여기서 지워지지 않는다)
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  registerVideo,
  enqueueJob,
  runPipeline,
  saveChapters,
  getJobById,
  isJobCanceled,
  matchChapterTechniques,
};
