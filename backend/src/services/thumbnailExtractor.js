const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { VideoClip } = require('../models');
const { getThumbPath, thumbWebPath, ensureDir } = require('./storage');
// 🔴 PATH 리터럴 'yt-dlp' 를 쓰지 않는다 — services/ytdlp.js 상단 주석 참고(task-030 D-2).
const { YTDLP_BIN } = require('./ytdlp');

function getThumbDir() {
  return path.dirname(getThumbPath('__placeholder__'));
}
ensureDir(getThumbDir());

function getInstagramCookieArgs(url) {
  if (!/instagram\.com/.test(url)) return [];
  try {
    const { hasCookieFile, hasFirefoxSession, INSTAGRAM_COOKIE_PATH } = require('./videoAnalysis');
    if (hasCookieFile())     return ['--cookies', INSTAGRAM_COOKIE_PATH];
    if (hasFirefoxSession()) return ['--cookies-from-browser', 'firefox'];
  } catch {}
  return [];
}

// yt-dlp 로 썸네일 URL 추출
function extractThumbUrl(url) {
  return new Promise(resolve => {
    const cookieArgs = getInstagramCookieArgs(url);
    const proc = spawn(YTDLP_BIN, ['--get-thumbnail', '--no-warnings', ...cookieArgs, url], { timeout: 15000 });
    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    // 🔴 실행 자체가 안 됐을 때(ENOENT 등) 원인을 남긴다 — 예전에는 빈 문자열만 돌려줘서
    //    "썸네일이 없는 영상"과 "yt-dlp 를 못 찾음"이 구별되지 않았다(task-030 D-2).
    proc.on('error', e => { console.error('[thumbnail] yt-dlp 실행 실패:', e.code || '', e.message); resolve(''); });
    proc.on('close', () => resolve(out.trim().split('\n')[0] || ''));
  });
}

// 외부 URL 다운로드 → 로컬 캐시 (Instagram CDN hotlink 차단 우회 + 토큰 만료 영구화)
async function downloadToCache(remoteUrl, clipId) {
  try {
    const res = await fetch(remoteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return '';
    const filePath = getThumbPath(clipId);
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, buf);
    return thumbWebPath(clipId);
  } catch (e) {
    console.error('[thumb/download]', clipId, e.message);
    return '';
  }
}

// 직렬화 큐
let thumbQueue = Promise.resolve();
function queueThumbUpdate(clipId, url) {
  thumbQueue = thumbQueue.then(async () => {
    try {
      const remote = await extractThumbUrl(url);
      if (!remote) return;
      const localPath = await downloadToCache(remote, clipId);
      if (localPath) {
        await VideoClip.update({ thumb_url: localPath }, { where: { id: clipId } });
      }
    } catch (e) {
      console.error('[thumb]', clipId, e.message);
    }
  });
}

async function backfillThumbs() {
  try {
    const { Op } = require('sequelize');
    const rows = await VideoClip.findAll({
      where: {
        url: { [Op.ne]: '' },
        [Op.or]: [
          { thumb_url: '' },
          { thumb_url: null },
          // 외부 CDN URL이 저장된 기존 데이터도 로컬 캐시로 재변환
          { thumb_url: { [Op.like]: 'http%' } },
        ],
      },
      attributes: ['id', 'url'],
      raw: true,
    });
    if (rows.length) {
      console.log(`[thumb/backfill] ${rows.length}개 영상 썸네일 추출·캐시 시작`);
      rows.forEach(r => queueThumbUpdate(r.id, r.url));
    }
  } catch (e) {
    console.error('[thumb/backfill]', e.message);
  }
}

module.exports = { extractThumbUrl, queueThumbUpdate, backfillThumbs };
