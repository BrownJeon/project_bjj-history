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
    // 영상 썸네일 백그라운드 백필 (서버 안정 후 5초 뒤 시작)
    const { backfillThumbs } = require('./services/thumbnailExtractor');
    setTimeout(backfillThumbs, 5000);
  } catch (e) {
    console.error('[startup] failed', e);
    process.exit(1);
  }
}

start();
