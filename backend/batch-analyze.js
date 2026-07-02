// BJJ 클립 배치 AI 분석 스크립트
// 실행: node /home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning/backend/batch-analyze.js
require('dotenv').config();

const mysql2 = require('mysql2/promise');
const { analyzeVideo } = require('./src/services/videoAnalysis');

const DB_CONFIG = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
};

function isAnalyzable(url) {
  if (!url) return false;
  if (/youtube\.com\/results/.test(url)) return false;
  return /(youtube\.com|youtu\.be|instagram\.com)/.test(url);
}

async function main() {
  const conn = await mysql2.createConnection(DB_CONFIG);

  const [rows] = await conn.query(
    "SELECT id, title, url FROM video_clips WHERE (description IS NULL OR description='') ORDER BY id"
  );

  const targets = rows.filter(r => isAnalyzable(r.url));
  const skipped = rows.filter(r => !isAnalyzable(r.url));

  console.log(`\n=== BJJ 배치 AI 분석 시작 ===`);
  console.log(`분석 대상: ${targets.length}개 | 스킵(검색URL): ${skipped.length}개`);
  skipped.forEach(r => console.log(`  SKIP id=${r.id} "${r.title}"`));
  console.log('');

  const results = [];

  for (let i = 0; i < targets.length; i++) {
    const clip = targets[i];
    console.log(`[${i+1}/${targets.length}] id=${clip.id} "${clip.title}"`);
    console.log(`  URL: ${clip.url}`);
    const t0 = Date.now();

    try {
      const res = await analyzeVideo(clip.url, clip.id, (pct, stage) => {
        process.stdout.write(`\r  진행: ${stage} ${pct}%   `);
      });

      const elapsed = Math.round((Date.now() - t0) / 1000);
      console.log(`\n  ✅ 완료 (${elapsed}s) method=${res.method}`);
      console.log(`  설명: ${(res.description || '').slice(0, 120).replace(/\n/g, ' ')}`);

      // analyzeVideo 내부에서 clipId로 frames 저장, description은 여기서 보장
      if (res.description) {
        await conn.query(
          'UPDATE video_clips SET description=? WHERE id=? AND (description IS NULL OR description="")',
          [res.description, clip.id]
        );
      }

      results.push({ id: clip.id, title: clip.title, status: 'OK', elapsed, method: res.method, desc: (res.description || '').slice(0, 100) });
    } catch (e) {
      const elapsed = Math.round((Date.now() - t0) / 1000);
      console.log(`\n  ❌ 실패 (${elapsed}s): ${e.message.slice(0, 150)}`);
      results.push({ id: clip.id, title: clip.title, status: 'FAIL', elapsed, error: e.message.slice(0, 120) });
    }
    console.log('');
  }

  await conn.end();

  const ok   = results.filter(r => r.status === 'OK');
  const fail = results.filter(r => r.status === 'FAIL');

  console.log('\n============================================================');
  console.log('=== 배치 AI 분석 완료 리포트 ===');
  console.log(`총 대상: ${targets.length}  성공: ${ok.length}  실패: ${fail.length}  스킵: ${skipped.length}`);
  console.log('');
  if (ok.length) {
    console.log('✅ 성공:');
    ok.forEach(r => console.log(`  id=${r.id} "${r.title}" (${r.elapsed}s, ${r.method})\n    ${r.desc}`));
  }
  if (fail.length) {
    console.log('\n❌ 실패:');
    fail.forEach(r => console.log(`  id=${r.id} "${r.title}"\n    ${r.error}`));
  }
  if (skipped.length) {
    console.log('\n⏭ 스킵 (실제 영상 URL 아님):');
    skipped.forEach(r => console.log(`  id=${r.id} "${r.title}"`));
  }
  console.log('============================================================\n');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
