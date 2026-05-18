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

// 업로드 (구버전과 공유)
const uploadsDir = path.resolve(__dirname, '../../public/uploads');
if (fs.existsSync(uploadsDir)) {
  app.use('/uploads', express.static(uploadsDir));
}

// React SPA 정적 서빙 (web/dist)
const distDir = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, {
    setHeaders: (res, filePath) => {
      if (/\.(js|css|html)$/.test(filePath)) res.setHeader('Cache-Control', 'no-store');
    },
  }));
  // SPA fallback — /api 외 모든 경로는 index.html
  app.get(/^(?!\/api\/).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

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
    // 영상 썸네일 백그라운드 백필 (서버 안정 후 5초 뒤 시작)
    const { backfillThumbs } = require('./services/thumbnailExtractor');
    setTimeout(backfillThumbs, 5000);
    // 주간 코치 리포트·플랜 자동 생성 (매주 일요일 06:00)
    const { scheduleWeeklyCron } = require('./services/coachCron');
    scheduleWeeklyCron();
  } catch (e) {
    console.error('[startup] failed', e);
    process.exit(1);
  }
}

start();
