// 긴 영상 분석 백그라운드 워커 — task-007 Phase 1 (동시성 1)
const fs = require('fs/promises');
const { sequelize } = require('../models');
const { runPipeline } = require('./longVideoPipeline');

const POLL_INTERVAL_MS = 4000;

let processing = false;
let timer = null;
// 디스크 여유공간 부족으로 requeue된 잡은 잠시 건너뛰어 큐 전체가 굶주리지 않게 한다
// (동시성 1이라 이 잡이 계속 맨 앞이면 다른 유저의 잡이 영영 처리되지 못할 수 있음)
const backoffUntil = new Map(); // jobId -> epoch ms

// 부팅 시: 처리 중 중단된 잡을 재개 큐로 되돌린다 (기존 error 처리 패턴과 다르게)
async function resumeInterruptedJobs() {
  await sequelize.query(
    `UPDATE long_video_jobs SET status='queued', resume_from=stage,
       detail='서버 재시작 — 재개 대기', heartbeat_at=NOW(), updated_at=NOW()
     WHERE status='running'`
  );
  await sequelize.query(
    `UPDATE long_videos SET status='queued', error=NULL
     WHERE status='running'`
  ).catch(() => {});
}

// 부팅 시: 재시작으로 finally가 실행되지 못해 남은 임시 디렉토리를 정리한다
async function cleanupStaleTempDirs() {
  try {
    const entries = await fs.readdir('/tmp');
    await Promise.all(
      entries
        .filter(e => e.startsWith('bjj-lv-'))
        .map(e => fs.rm(`/tmp/${e}`, { recursive: true, force: true }).catch(() => {}))
    );
  } catch (e) {
    console.error('[long-video-worker] 임시 디렉토리 정리 실패:', e.message);
  }
}

async function pickNextJob() {
  const [jobs] = await sequelize.query(
    `SELECT * FROM long_video_jobs WHERE status='queued' ORDER BY created_at ASC`
  );
  const now = Date.now();
  return jobs.find(j => {
    const until = backoffUntil.get(j.id);
    return !until || until <= now;
  }) || null;
}

async function tick() {
  if (processing) return;
  let job;
  try {
    job = await pickNextJob();
  } catch (e) {
    console.error('[long-video-worker] 잡 조회 실패:', e.message);
    return;
  }
  if (!job) return;

  processing = true;
  try {
    console.log(`[long-video-worker] job ${job.id} 처리 시작 (video=${job.long_video_id}, resume_from=${job.resume_from || '-'})`);
    const result = await runPipeline(job);
    if (result?.requeueDelayMs) {
      backoffUntil.set(job.id, Date.now() + result.requeueDelayMs);
    } else {
      backoffUntil.delete(job.id);
    }
    console.log(`[long-video-worker] job ${job.id} 처리 종료`);
  } catch (e) {
    console.error(`[long-video-worker] job ${job.id} 처리 중 예외:`, e);
  } finally {
    processing = false;
  }
}

function start() {
  resumeInterruptedJobs()
    .then(() => console.log('[long-video-worker] 재개 대기 처리 완료 (running → queued)'))
    .catch(e => console.error('[long-video-worker] 재개 처리 실패:', e.message));
  cleanupStaleTempDirs();
  timer = setInterval(tick, POLL_INTERVAL_MS);
  tick();
}

function stop() {
  clearInterval(timer);
  timer = null;
}

module.exports = { start, stop };
