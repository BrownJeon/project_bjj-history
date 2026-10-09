// 긴 영상 분석 파이프라인 — task-007 Phase 1(S0~S6) + task-008 Phase 2(S7~S9) + task-009 Phase 3(S10)
// + task-048 S3.5(분석용으로 받은 영상을 서버에 보관 — 원래 S11 "완료/보관" 중 영상 보관 부분).
// S11 의 나머지(자막·전사 보관 등)는 구현하지 않았다.
const fs = require('fs/promises');
const fsSync = require('fs');
const { pipeline: streamPipeline } = require('stream/promises');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const { sequelize, LongVideo, LongVideoChapter } = require('../models');
const { runClaude } = require('./claudeCli');
const ytdlp = require('./ytdlp');
const chapterPlanner = require('./chapterPlanner');
const vttParser = require('./vttParser');
const storage = require('./storage');
const longVideoThumb = require('./longVideoThumb');
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

// S3 다운로드 진행률 → long_video_jobs.detail 기록기 (task-048 후속).
// 예전에는 yt-dlp 진행 줄마다 updateJob 을 await 없이 날렸다(6분 영상 실측 90~111줄/약 6초). 그게 풀(max 10)을
// 밀어내 다운로드 직후의 isJobCanceled 가 30초 획득 제한에 걸려 분석 전체가 "Operation timeout" 으로 죽었다
// (2026-10-08 e2e 재현). 규칙: (a) 동시에 1건만 — 앞 건이 끝나기 전엔 보내지 않는다 (b) 마지막 **성공** 기록 후
// minIntervalMs(2초) 미만이면 건너뛴다 (c) 실패는 지금처럼 무시 (d) 퍼센트 정규식·문구는 예전 그대로.
// 화면 폴링이 5초라 2초 간격이면 표시 차이는 없다. idle() 은 진행 중인 기록이 끝날 때까지 기다린다 —
// 다운로드가 끝난 뒤 늦게 도착한 진행 문구가 다음 단계(S3.5 등)의 detail 을 덮어쓰지 않게 한다.
function makeDownloadProgressReporter(jobId, { write = updateJob, minIntervalMs = 2000, now = Date.now } = {}) {
  let pending = null;
  let lastOkAt = -Infinity;
  function report(chunk) {
    const m = /(\d{1,3}\.\d)%/.exec(chunk);
    if (!m) return;
    if (pending) return;                              // (a)
    if (now() - lastOkAt < minIntervalMs) return;     // (b)
    pending = Promise.resolve()
      .then(() => write(jobId, { detail: `영상 다운로드 중 (${m[1]}%)` }))
      .then(() => { lastOkAt = now(); })
      .catch(() => {})                                // (c)
      .finally(() => { pending = null; });
  }
  report.idle = () => pending || Promise.resolve();
  return report;
}

async function cancelCleanup(jobId, videoId) {
  await sequelize.query(
    `UPDATE long_video_jobs SET status='canceled', detail='사용자 취소', heartbeat_at=NOW(), updated_at=NOW() WHERE id = ?`,
    { replacements: [jobId] }
  );
  await LongVideo.update({ status: 'canceled' }, { where: { id: videoId } }).catch(() => {});
}

// ── 챕터 저장 (long_video_chapters — Sequelize 모델 경유, 설계서 관례) ────
// task-013 버그 A 수정(2026-09-04). 예전 구현은 새 챕터마다 독립적으로
// `existingEdited.find(첫 겹침)`을 골라서 (1) 최다 겹침이 아니라 배열에서 먼저 나온 것을 쓰고
// (2) 같은 편집본을 몇 번이든 재사용했다. 그래서 편집본 1개(0~300)를 재분석이 0~100/100~250/250~300
// 으로 재분할하면 **같은 제목이 3개 챕터에 복제**되고 셋 다 edited=1이 됐다(실측 재현 확인).
// routes/longVideos.js의 task-009 수정은 edited=1 집합을 줄였을 뿐 이 1:N 매칭 자체는 그대로였다.
//
// 매칭 규칙(3가지):
//  (1) 겹침이 큰 (편집본, 새 챕터) 쌍부터 그리디로 확정 — "먼저 나온 것"이 아니라 "가장 많이 겹치는 것"
//  (2) 편집본 하나는 최대 하나의 새 챕터에만 물려준다(확정 즉시 양쪽 소비 — 복제 차단).
//      routes/longVideos.js의 `existingByBounds.delete(key)`와 같은 발상
//  (3) 최소 겹침 기준: 겹침이 "둘 중 짧은 구간의 50%" 이상일 때만 물려준다.
//      1초만 스쳐도 제목을 물려받게 두면 경계가 밀린 남의 구간에 엉뚱한 제목 + edited=1이 박히고,
//      그 오염이 이후 재분석마다 계속 전파된다(edited=1은 다음 재분석에서 또 보존 대상이 된다).
//      분할(새 챕터가 편집본 안에 들어감)·병합(편집본이 새 챕터 안에 들어감)은 짧은 쪽 기준 100%라
//      항상 통과하므로, 이 기준이 거르는 건 "경계가 스치기만 한" 사실상 다른 구간뿐이다.
//      기준을 바꾸려면 아래 상수 하나만 조정하면 된다.
const MIN_OVERLAP_RATIO = 0.5;

// 편집본(edited=1) ↔ 새 챕터 매칭. 반환값: Map(새 챕터 배열 인덱스 → 편집본 레코드)
function matchEditedChapters(chapters, existingEdited) {
  const pairs = [];
  for (let ci = 0; ci < chapters.length; ci++) {
    const c = chapters[ci];
    const cDur = c.end_sec - c.start_sec;
    if (!(cDur > 0)) continue;
    for (let ei = 0; ei < existingEdited.length; ei++) {
      const e = existingEdited[ei];
      const eDur = e.end_sec - e.start_sec;
      if (!(eDur > 0)) continue;
      const overlap = Math.min(e.end_sec, c.end_sec) - Math.max(e.start_sec, c.start_sec);
      if (overlap <= 0) continue;
      if (overlap < Math.min(cDur, eDur) * MIN_OVERLAP_RATIO) continue; // (3) 최소 겹침 기준
      pairs.push({ ci, ei, overlap });
    }
  }
  // (1) 겹침 내림차순. 동률일 때의 타이브레이크(task-013 LOW-2, Reviewer 지적 반영):
  //   - 새 챕터 쪽은 배열 순서(a.ci)로 확정한다 — 이 배열은 호출자가 idx 순으로 만든 것이라 의미가 있다.
  //   - 편집본 쪽은 **배열 순서를 쓰지 않는다**. saveChapters가 ORDER BY 없이 조회하므로 DB가 돌려주는
  //     행 순서는 보장되지 않고, 실제로 배열을 뒤집으면 동률 승자가 뒤바뀌는 것이 재현됐다.
  //     그래서 인덱스 대신 편집본 자신의 구간(start_sec, end_sec)과 제목으로 비교한다
  //     → existingEdited가 어떤 순서로 들어와도 결과가 같다(호출자 정렬에 의존하지 않는 함수 계약).
  pairs.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    if (a.ci !== b.ci) return a.ci - b.ci;
    const ea = existingEdited[a.ei], eb = existingEdited[b.ei];
    const ta = String(ea.title ?? ''), tb = String(eb.title ?? '');
    return (ea.start_sec - eb.start_sec) || (ea.end_sec - eb.end_sec) || (ta < tb ? -1 : ta > tb ? 1 : 0);
  });
  const matched = new Map();
  const usedEdited = new Set();
  for (const p of pairs) {
    if (matched.has(p.ci) || usedEdited.has(p.ei)) continue; // (2) 양쪽 1회만 소비
    matched.set(p.ci, existingEdited[p.ei]);
    usedEdited.add(p.ei);
  }
  return matched;
}

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
    const matched = matchEditedChapters(chapters, existingEdited);
    await LongVideoChapter.destroy({ where: { long_video_id: videoId }, transaction: t });
    for (const [i, c] of chapters.entries()) {
      const keep = matched.get(i) || null;
      await LongVideoChapter.create({
        long_video_id: videoId,
        user_id: userId,
        idx: c.idx,
        start_sec: c.start_sec,
        end_sec: c.end_sec,
        title: keep ? keep.title : c.title,
        source: c.source,
        confidence: c.confidence,
        status: 'pending',
        edited: keep ? 1 : 0,
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

// ── S3.5: 영상 서버 보관 (task-048) ─────────────────────────────────────
// 다운로드한 분석용 영상(tmpDir, ext4)을 storage.getLongVideoDir(NAS)에 video.mp4 로 남긴다.
// 원칙: (1) 임시 이름으로 복사한 뒤 rename 으로 교체 — 어떤 실패에서도 기존 video.mp4 는 그대로다
//       (재분석이 이미 저장된 영상을 망치면 안 된다). (2) 운영상 실패(공간 부족·복사·재포장·rename)는
//       던지지 않고 { saved:false, reason } 으로 돌려준다 — 호출측이 video_path 를 건드리지 않고 분석을
//       계속한다. 인자 오류(userId 없음 등)만 던진다(storage 의 userId 필수 규칙과 같다).
const PERSIST_FREE_MARGIN_BYTES = 1024 * 1024 * 1024; // 저장한 뒤에도 NAS 에 1GB 는 남긴다
const PERSIST_REMUX_TIMEOUT_MS = 10 * 60 * 1000;      // -c copy 재포장(3시간 영상도 I/O 만)
const PERSIST_CANCEL_POLL_MS = 3000;                  // ytdlp.spawnWithWatchdog 의 취소 확인 주기와 같다
const PERSIST_TMP_PREFIX = 'video.mp4.tmp-';
const PERSIST_STALE_TMP_MS = 10 * 60 * 1000;          // 이보다 오래 손대지 않은 임시 파일만 죽은 잔재로 보고 지운다

// 대상 폴더는 아직 없을 수 있어 존재하는 가장 가까운 상위 폴더 기준으로 잰다. 확인 자체 실패 → null
// (ytdlp.checkFreeDiskSpace 와 같이 "확인 실패는 통과" — 시그니처가 달라 그 함수는 건드리지 않았다)
async function freeBytesNear(dir) {
  let cur = path.resolve(dir);
  for (;;) {
    try {
      const st = await fs.statfs(cur);
      return st.bavail * st.bsize;
    } catch (e) {
      const parent = path.dirname(cur);
      if (e.code !== 'ENOENT' || parent === cur) return null;
      cur = parent;
    }
  }
}

// 스트림 복사 + 취소 감시. 취소되면 복사를 끊고 err.canceled=true 로 던진다(부분 파일 정리는 호출측).
async function copyWithCancel(src, dst, cancelCheck, pollMs = PERSIST_CANCEL_POLL_MS) {
  const ac = new AbortController();
  let canceled = false;
  const timer = cancelCheck
    ? setInterval(async () => {
        try { if (!canceled && await cancelCheck()) { canceled = true; ac.abort(); } } catch { /* ignore */ }
      }, pollMs)
    : null;
  try {
    await streamPipeline(fsSync.createReadStream(src), fsSync.createWriteStream(dst), { signal: ac.signal });
  } catch (e) {
    if (canceled) {
      const err = new Error('사용자가 작업을 취소했습니다');
      err.canceled = true;
      throw err;
    }
    throw e;
  } finally {
    clearInterval(timer);
  }
}

/**
 * 분석용 영상을 서버에 보관한다.
 * @param {string} srcPath   다운로드된 영상(보통 tmpDir/src.mp4)
 * @param {number} userId    필수 — 없으면 던진다
 * @param {number} videoId   long_videos.id — 없으면 던진다
 * @param {object} [opts]    { jobId, cancelCheck } — targetDir·marginBytes·copyFn·cancelPollMs 는 단위 테스트 주입용
 * @returns {Promise<{saved:true, webPath, filePath, bytes, remuxed} | {saved:false, reason, canceled?}>}
 */
async function persistVideo(srcPath, userId, videoId, opts = {}) {
  if (userId == null) throw new Error('persistVideo: userId가 필요합니다');
  if (videoId == null) throw new Error('persistVideo: videoId가 필요합니다');
  if (!srcPath) throw new Error('persistVideo: srcPath가 필요합니다');
  const {
    jobId = `${process.pid}-${Date.now()}`,
    cancelCheck = null,
    targetDir = storage.getLongVideoDir(userId, videoId),
    marginBytes = PERSIST_FREE_MARGIN_BYTES,
    copyFn = copyWithCancel,
    cancelPollMs = PERSIST_CANCEL_POLL_MS,
  } = opts;
  const webPath = storage.longVideoWebPath(userId, videoId);
  const finalPath = path.join(targetDir, 'video.mp4');
  // 시도마다 고유한 임시 이름(같은 jobId 가 겹쳐 돌아도 서로의 파일에 쓰지 않는다). 접두사는 유지 — 정리·하네스가 본다.
  const tmpPath = path.join(targetDir, `${PERSIST_TMP_PREFIX}${jobId}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);

  let source = srcPath;
  let remuxPath = null;
  let renamed = false;
  let createdDir = false;
  try {
    const srcStat = await fs.stat(srcPath).catch(() => null);
    if (!srcStat?.isFile() || srcStat.size <= 0) return { saved: false, reason: '원본 영상 파일이 없거나 비어 있습니다' };

    // mp4 가 아니면(yt-dlp 단일 포맷 폴백이 webm 등을 줄 때) 같은 코덱 그대로 mp4 로 재포장을 시도한다.
    // 재포장은 ffmpeg 기본값이면 moov 를 끝에 쓰므로 +faststart 로 앞에 둔다(스트리밍 시작 지연 방지).
    if (path.extname(srcPath).toLowerCase() !== '.mp4') {
      remuxPath = path.join(path.dirname(srcPath), `persist-remux-${jobId}.mp4`);
      try {
        await runProcess('ffmpeg', ['-y', '-v', 'error', '-i', srcPath, '-map', '0:v:0', '-map', '0:a:0?',
          '-c', 'copy', '-movflags', '+faststart', remuxPath], PERSIST_REMUX_TIMEOUT_MS);
      } catch (e) {
        return { saved: false, reason: `mp4 재포장 실패(${path.extname(srcPath)}): ${e.message}` };
      }
      source = remuxPath;
    }
    const bytes = (await fs.stat(source)).size;
    if (bytes <= 0) return { saved: false, reason: '재포장 결과가 비어 있습니다' };

    if (cancelCheck && await cancelCheck()) return { saved: false, canceled: true, reason: '사용자 취소' };

    const free = await freeBytesNear(targetDir);
    if (free == null) {
      console.error('[long-video] S3.5 저장소 여유 공간 확인 실패(통과 처리):', targetDir);
    } else if (free < bytes + marginBytes) {
      return { saved: false, reason: `저장소 여유 공간 부족 (여유 ${free} < 필요 ${bytes + marginBytes} bytes)` };
    }

    createdDir = !fsSync.existsSync(targetDir);
    storage.ensureDir(targetDir);
    // 이전 임시 파일 정리 — 이 폴더의 임시 파일은 같은 잡이 겹쳐 도는 다른 시도(원자적 claim 없는 워커·부팅 시
    // running→queued 복귀, REV-048-3)의 **살아 있는** 파일일 수 있으므로 mtime 이 PERSIST_STALE_TMP_MS 보다 오래된
    // 것만 지운다(살아 있는 복사는 쓰는 동안 mtime 이 계속 갱신된다). 방금 죽은 잔재는 다음 실행의 정리나 DELETE
    // (폴더 통삭제)가 회수한다. 접두사가 다른 파일과 video.mp4 는 건드리지 않는다. stat/rm 실패는 무시.
    for (const name of await fs.readdir(targetDir).catch(() => [])) {
      if (!name.startsWith(PERSIST_TMP_PREFIX)) continue;
      const p = path.join(targetDir, name);
      const st = await fs.stat(p).catch(() => null);
      if (st && Date.now() - st.mtimeMs > PERSIST_STALE_TMP_MS) await fs.rm(p, { force: true }).catch(() => {});
    }

    await copyFn(source, tmpPath, cancelCheck, cancelPollMs);
    const copied = await fs.stat(tmpPath);
    if (copied.size !== bytes) throw new Error(`복사 크기 불일치 (${copied.size} != ${bytes})`);
    if (cancelCheck && await cancelCheck()) return { saved: false, canceled: true, reason: '사용자 취소' };
    await fs.rename(tmpPath, finalPath); // 같은 폴더 안 rename — 기존 video.mp4 를 원자적으로 교체
    renamed = true;
    return { saved: true, webPath, filePath: finalPath, bytes, remuxed: !!remuxPath };
  } catch (e) {
    if (e?.canceled) return { saved: false, canceled: true, reason: '사용자 취소' };
    return { saved: false, reason: e?.message || String(e) };
  } finally {
    if (!renamed) {
      await fs.rm(tmpPath, { force: true }).catch(() => {});
      // 이번 실행이 만든 폴더가 비어 있으면 지운다(비어 있지 않으면 rmdir 이 실패 — 기존 파일은 안전)
      if (createdDir) await fs.rmdir(targetDir).catch(() => {});
    }
    if (remuxPath) await fs.rm(remuxPath, { force: true }).catch(() => {});
  }
}

// S3.5 결과 → 사용자에게 보일 경고(long_videos.error, done 상태면 상세 화면이 amber 카드로 보여 준다) — REV-048-1 M-1.
// 경고는 "이 영상은 아직 유튜브에만 의존한다"는 상태일 때만 만든다:
//   - 이번 실행 시작 때 video_path 가 있었다(hadVideoPath) → 이전 저장본·경로가 그대로 남으므로 경고 없음
//   - 사용자 취소·분석 중 삭제 → 경고 없음(취소는 done 으로 끝나지도 않는다)
//   - 저장·기록 모두 성공 → 경고 없음
//   - 그 밖(저장 실패, 또는 파일은 저장됐지만 video_path 기록 실패) → 경고
// outcome 이 없으면(S3.5 에 닿지 않음) 판단할 근거가 없으므로 경고 없음. 순수 함수 — DB·파일을 보지 않는다.
const SAVE_WARNING_REASON_MAX = 120;
function buildVideoSaveWarning({ hadVideoPath = false, outcome = null } = {}) {
  if (hadVideoPath || !outcome) return null;
  if (outcome.canceled || outcome.deleted) return null;
  if (outcome.saved && outcome.recorded) return null;
  // 사유는 서버 내부 경로를 마지막 이름만 남기고 한 줄·120자로 줄인다
  const reason = String(outcome.reason || '알 수 없는 오류')
    .replace(/\/(?:[^\s'"/]+\/)+([^\s'"/]+)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SAVE_WARNING_REASON_MAX);
  return `영상을 서버에 저장하지 못했습니다(${reason}) — 유튜브에서 영상이 삭제되면 재생할 수 없습니다. 재분석하면 다시 저장을 시도합니다.`;
}

// ── S1.5: 썸네일 서버 보관 (task-050) ───────────────────────────────────
// S1 메타의 썸네일 주소를 받아 영상 폴더(storage.getLongVideoDir)에 thumb.<ext> 로 남기고 thumb_url 을 서버 경로로 바꾼다.
// 비치명: 실패는 로그만 남기고 thumb_url 은 S1 이 쓴 값 그대로(첫 분석이면 유튜브 주소, 이미 서버 경로면 그 경로) —
// 사용자 경고 카드는 만들지 않는다. 다운로드(S3)보다 앞이라 S3 가 실패해 '목차만 제공'으로 끝나도 썸네일은 남는다.
// 분석 도중 DELETE 된 영상: S3.5 와 같은 행 확인 패턴 — 저장 전에 행이 없으면 받지 않고, rename 뒤(commit)에 행이
// 없으면 라우트의 폴더 정리가 이미 지나간 것이므로 여기서 폴더를 지운다. 반환값은 하네스·로그 판단용.
async function saveThumbnailStep(jobId, userId, videoId, thumbUrl, { persist = longVideoThumb.persistThumbnail } = {}) {
  if (!thumbUrl) return { skipped: true };
  const where = { id: videoId, user_id: userId };
  try {
    if (!(await LongVideo.count({ where }))) return { saved: false, deleted: true };
    let deleted = false;
    const r = await persist(thumbUrl, userId, videoId, {
      commit: async (webPath) => {
        if (!(await LongVideo.count({ where }))) {
          deleted = true;
          throw new Error('분석 도중 영상이 삭제되었습니다');
        }
        await LongVideo.update({ thumb_url: webPath }, { where });
      },
    });
    if (deleted) {
      await fs.rm(storage.getLongVideoDir(userId, videoId), { recursive: true, force: true }).catch(() => {});
      return { saved: false, deleted: true };
    }
    if (r.saved && r.recorded) {
      console.log(`[long-video] job ${jobId} 썸네일 저장 완료(S1.5): ${r.filePath} (${r.bytes} bytes)`);
    } else if (r.saved) {
      console.error(`[long-video] job ${jobId} 썸네일 thumb_url 기록 실패(S1.5, 파일은 저장됨: ${r.filePath}, 분석은 계속):`, r.reason);
    } else {
      console.error(`[long-video] job ${jobId} 썸네일 저장 건너뜀(S1.5, 분석은 계속):`, r.reason);
    }
    return r;
  } catch (e) {
    console.error(`[long-video] job ${jobId} 썸네일 저장 실패(S1.5, 분석은 계속):`, e.message);
    return { saved: false, reason: e.message };
  }
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
  // task-048 REV-048-1 M-1: 이번 실행 시작 때 저장본이 있었는지 + S3.5 결과 → 최종 완료 시 경고 판단
  const hadVideoPath = !!video.video_path;
  let saveOutcome = null;
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
    // task-050: thumb_url 이 이미 서버 보관본(/uploads/...)이면 유튜브 주소로 되돌리지 않는다 — 최신 썸네일은
    // 아래 S1.5 가 같은 파일을 원자 교체해 반영하고, S1.5 가 실패해도 서버 썸네일은 그대로 남는다.
    await LongVideo.update({
      title: video.title_locked ? video.title : (meta.title || video.title),
      channel: meta.channel || video.channel,
      duration_sec: meta.durationSec,
      thumb_url: longVideoThumb.isServerThumbUrl(video.thumb_url) ? video.thumb_url : (meta.thumbUrl || video.thumb_url),
    }, { where: { id: video.id } });

    if (await isJobCanceled(jobId)) { await cancelCleanup(jobId, video.id); return; }

    // ── S1.5: 썸네일 서버 보관 (task-050, 비치명 — 위 saveThumbnailStep 주석 참고) ──
    await saveThumbnailStep(jobId, job.user_id, video.id, meta.thumbUrl);

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
    const downloadProgress = makeDownloadProgressReporter(jobId);
    try {
      videoPath = await ytdlp.downloadVideo(video.url, tmpDir, {
        onProgress: downloadProgress,
        cancelCheck: () => isJobCanceled(jobId),
      });
    } catch (e) {
      await downloadProgress.idle();
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
    await downloadProgress.idle(); // 늦게 끝난 진행 기록이 S3.5 의 detail 을 덮지 않게

    if (await isJobCanceled(jobId)) { await cancelCleanup(jobId, video.id); return; }

    // ── S3.5: 영상 서버 보관 (task-048) ────────────────────────────
    // 분석(S4~S10)이 실패해도 영상은 남도록 다운로드 직후에 둔다. 저장이 안 돼도(공간·NAS 장애·재포장
    // 실패) 분석은 계속하고 video_path 는 건드리지 않는다 — 처음이면 NULL 그대로(화면은 유튜브 iframe),
    // 재분석이면 예전 저장본·경로 그대로다.
    await updateStage(jobId, 'S3.5', 45, '영상 서버에 저장 중');
    try {
      const where = { id: video.id, user_id: job.user_id };
      // 분석 도중 DELETE 된 영상이면 저장하지 않는다 — 라우트의 폴더 정리가 이미 지나가 고아 파일이 된다
      if (await LongVideo.count({ where })) {
        const saved = await persistVideo(videoPath, job.user_id, video.id, {
          jobId,
          cancelCheck: () => isJobCanceled(jobId),
        });
        if (saved.saved) {
          // rename 뒤에도 행이 있는지 다시 본다. 있으면 이후의 DELETE 가 폴더를 지운다(커밋 → 폴더 정리 순).
          // 없으면 그 정리가 이미 지나갔으므로 여기서 지운다.
          if (await LongVideo.count({ where })) {
            // REV-048-1 L-5: 파일은 이미 저장됐으므로 기록 실패는 "저장 실패"와 따로 남긴다(경고 대상 — video_path 가 NULL)
            try {
              await LongVideo.update({ video_path: saved.webPath }, { where });
              saveOutcome = { saved: true, recorded: true };
              console.log(`[long-video] job ${jobId} 영상 저장 완료(S3.5): ${saved.filePath} (${saved.bytes} bytes${saved.remuxed ? ', mp4 재포장' : ''})`);
            } catch (pathErr) {
              saveOutcome = { saved: true, recorded: false, reason: `video_path 기록 실패: ${pathErr.message}` };
              console.error(`[long-video] job ${jobId} video_path 기록 실패(파일은 저장됨: ${saved.filePath}, 분석은 계속):`, pathErr.message);
            }
          } else {
            saveOutcome = { saved: false, deleted: true };
            await fs.rm(storage.getLongVideoDir(job.user_id, video.id), { recursive: true, force: true }).catch(() => {});
          }
        } else {
          saveOutcome = { saved: false, canceled: !!saved.canceled, reason: saved.reason };
          if (!saved.canceled) console.error(`[long-video] job ${jobId} 영상 저장 건너뜀(S3.5, 분석은 계속):`, saved.reason);
        }
      } else {
        saveOutcome = { saved: false, deleted: true };
      }
    } catch (e) {
      saveOutcome = { saved: false, reason: e.message };
      console.error(`[long-video] job ${jobId} 영상 저장 실패(S3.5, 분석은 계속):`, e.message);
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

    // 저장 실패로 아직 유튜브에만 의존하면 done 이어도 경고를 남긴다(상세 화면의 amber 카드). 없으면 예전처럼 null.
    const saveWarning = buildVideoSaveWarning({ hadVideoPath, outcome: saveOutcome });
    await LongVideo.update({ status: 'done', error: saveWarning }, { where: { id: video.id } });
    await completeJob(jobId, {
      detail: `구간 분석 완료 (${doneCount}/${totalCount} 성공${failedCount > 0 ? `, ${failedCount}건 실패` : ''})`,
    });
  } catch (e) {
    console.error(`[long-video] job ${jobId} 처리 중 예외:`, e);
    await errorJob(jobId, e.message || String(e)).catch(() => {});
    await LongVideo.update({ status: 'error', error: e.message || String(e) }, { where: { id: video.id } }).catch(() => {});
  } finally {
    // 잡별 임시 디렉토리는 성공/실패/취소/예외 모든 경로에서 반드시 정리한다
    // (S7 프레임은 storage.getLongVideoFramesDir, S3.5 영상은 storage.getLongVideoDir 의 영구 저장
    //  위치에 있어 여기서 지워지지 않는다)
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  registerVideo,
  enqueueJob,
  runPipeline,
  saveChapters,
  matchEditedChapters, // task-013: DB 없이 매칭 규칙만 단위 검증할 수 있도록 노출
  persistVideo,        // task-048: S3.5 저장 규칙(원자 교체·실패 시 보존)을 단위 검증할 수 있도록 노출
  buildVideoSaveWarning, // task-048 REV-048-1 M-1: 저장 실패 경고 규칙(순수 함수)
  makeDownloadProgressReporter, // task-048 후속: S3 진행 기록 스로틀(동시 1건·2초)을 단위 검증할 수 있도록 노출
  saveThumbnailStep,   // task-050: S1.5 썸네일 보관(행 확인·삭제 가드)을 검증할 수 있도록 노출
  getJobById,
  isJobCanceled,
  matchChapterTechniques,
};
