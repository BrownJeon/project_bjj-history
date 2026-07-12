require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const path    = require('path');
const fs      = require('fs');
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');

const { sequelize, testConnection } = require('./config/db');
require('./models'); // 모델 + 관계 로드
const apiRouter = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } }));

app.use('/api', apiRouter);

const { getStaticRoot } = require('./services/storage');
app.use('/uploads', express.static(getStaticRoot()));

// React SPA 정적 서빙 — DIST_PATH(로컬 ext4) 우선, 없으면 NFS fallback
const distDir = process.env.DIST_PATH
  ? path.resolve(process.env.DIST_PATH)
  : path.resolve(__dirname, '../../web/dist');

console.log(`[static] dist 경로: ${distDir}`);

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

app.use(express.static(distDir, {
  setHeaders: (res, filePath) => {
    if (/\.(js|css|html)$/.test(filePath)) res.setHeader('Cache-Control', 'no-store');
  },
}));
// SPA fallback — /api 외 모든 경로는 index.html
app.get(/^(?!\/api\/).*/, (req, res, next) => {
  if (req.method !== 'GET') return next();
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(503).send('앱을 빌드 중입니다. 잠시 후 새로고침해주세요.');
});

app.use(notFound);
app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '3001', 10);

async function start() {
  try {
    await testConnection();
    console.log('[db] connected');
    app.listen(PORT, () => console.log(`[bjj-new] listening on :${PORT}`));
    // video_clips.frames 컬럼 마이그레이션 (AI 분석 캡처 경로)
    const { sequelize: sq } = require('./config/db');
    await sq.query(
      `ALTER TABLE video_clips ADD COLUMN IF NOT EXISTS frames TEXT DEFAULT '[]'`
    ).catch(() => {});
    // drills.tech 컬럼 TEXT로 확장 (성공여부 포함 JSON 객체 저장)
    await sq.query(
      `ALTER TABLE drills MODIFY COLUMN tech TEXT`
    ).catch(() => {});
    // video_clips.tech_name → TEXT (JSON 배열, 다중 기술 지원)
    await sq.query(
      `ALTER TABLE video_clips MODIFY COLUMN tech_name TEXT`
    ).catch(() => {});
    // classes.clip_ids 컬럼 (수업 연관 영상 ID 배열)
    await sq.query(
      `ALTER TABLE classes ADD COLUMN IF NOT EXISTS clip_ids TEXT DEFAULT '[]'`
    ).catch(() => {});
    // video_clips.video_file 컬럼 (오프라인 저장 영상 경로)
    await sq.query(
      `ALTER TABLE video_clips ADD COLUMN IF NOT EXISTS video_file TEXT DEFAULT ''`
    ).catch(() => {});
    // techniques.pos → TEXT (JSON 배열, 다중 포지션 지원)
    await sq.query(
      `ALTER TABLE techniques MODIFY COLUMN pos TEXT`
    ).catch(() => {});
    await sq.query(
      `UPDATE techniques SET pos = JSON_ARRAY(pos)
       WHERE pos IS NOT NULL AND pos != '' AND pos NOT LIKE '[%'`
    ).catch(() => {});
    // 기존 단일 문자열 데이터를 JSON 배열로 변환
    await sq.query(
      `UPDATE video_clips SET tech_name = JSON_ARRAY(tech_name)
       WHERE tech_name IS NOT NULL AND tech_name != '' AND tech_name NOT LIKE '[%'`
    ).catch(() => {});
    // voice_transcript 컬럼 (수업 음성 전사본)
    await sq.query(
      `ALTER TABLE classes ADD COLUMN IF NOT EXISTS voice_transcript MEDIUMTEXT`
    ).catch(() => {});
    // voice_jobs 테이블 (음성 분석 비동기 잡 — DB 영속)
    await sq.query(`
      CREATE TABLE IF NOT EXISTS voice_jobs (
        id         VARCHAR(36) PRIMARY KEY,
        class_id   INT NOT NULL,
        status     VARCHAR(10) DEFAULT 'pending',
        transcript MEDIUMTEXT,
        result     TEXT,
        error      TEXT,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
      )
    `).catch(() => {});
    // voice_jobs.trained_date 컬럼 추가 (날짜별 음성 분석)
    await sq.query(
      `ALTER TABLE voice_jobs ADD COLUMN IF NOT EXISTS trained_date VARCHAR(10) DEFAULT NULL`
    ).catch(() => {});
    // 영상 썸네일 백그라운드 백필 (서버 안정 후 5초 뒤 시작)
    const { backfillThumbs } = require('./services/thumbnailExtractor');
    setTimeout(backfillThumbs, 5000);
    // 서버 재시작 시 처리 중단된 pending 잡을 error로 정리
    await sq.query(
      `UPDATE voice_jobs SET status='error', error='서버 재시작으로 인해 처리 중단됨 (재업로드 필요)'
       WHERE status='pending'`
    ).catch(() => {});
    // class_video_jobs 테이블 (수업 AI 영상 생성 비동기 잡)
    await sq.query(`
      CREATE TABLE IF NOT EXISTS class_video_jobs (
        id          VARCHAR(36) PRIMARY KEY,
        class_id    INT NOT NULL,
        status      VARCHAR(10) DEFAULT 'pending',
        progress    VARCHAR(500) DEFAULT '',
        video_url   TEXT,
        error       TEXT,
        image_count INT DEFAULT 0,
        clip_count  INT DEFAULT 0,
        created_at  DATETIME DEFAULT NOW(),
        updated_at  DATETIME DEFAULT NOW() ON UPDATE NOW()
      )
    `).catch(() => {});
    await sq.query(
      `UPDATE class_video_jobs SET status='error', error='서버 재시작으로 처리 중단 — 다시 시도해주세요'
       WHERE status='pending'`
    ).catch(() => {});
    // pick_history 테이블 (픽미업 기능 — 날짜별 클립 픽 이력)
    await sq.query(`
      CREATE TABLE IF NOT EXISTS pick_history (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        clip_id    INT NOT NULL,
        pick_date  DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pick_date (pick_date),
        INDEX idx_clip_id (clip_id)
      )
    `).catch(() => {});
    // video_clips.ai_recommendation 컬럼 추가 (AI 픽미업 추천 메시지)
    await sq.query(
      `ALTER TABLE video_clips ADD COLUMN IF NOT EXISTS ai_recommendation TEXT DEFAULT NULL`
    ).catch(() => {});
    // video_clips.position 컬럼 추가 (포지션 JSON 배열)
    await sq.query(
      `ALTER TABLE video_clips ADD COLUMN IF NOT EXISTS position TEXT DEFAULT '[]'`
    ).catch(() => {});
    // technique_chains.video_path 컬럼 추가 (기술체인 생성 영상 경로)
    await sq.query(
      `ALTER TABLE technique_chains ADD COLUMN IF NOT EXISTS video_path VARCHAR(500) DEFAULT NULL`
    ).catch(() => {});
    // 회원권 결제이력 테이블
    await sq.query(`
      CREATE TABLE IF NOT EXISTS membership_payments (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        paid_date    DATE NOT NULL,
        duration     VARCHAR(10) NOT NULL,
        session_type VARCHAR(10) NOT NULL,
        memo         TEXT DEFAULT '',
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_paid_date (paid_date)
      )
    `).catch(() => {});
    // 주간 코치 리포트·플랜 자동 생성 (매주 일요일 06:00)
    const { scheduleWeeklyCron } = require('./services/coachCron');
    scheduleWeeklyCron();
  } catch (e) {
    console.error('[startup] failed', e);
    process.exit(1);
  }
}

start();
