const { execFile } = require('child_process');
const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');
const { promisify } = require('util');
// 🔴 PATH 리터럴 'yt-dlp' 를 쓰지 않는다 — services/ytdlp.js 상단 주석 참고(task-030 D-2).
const { YTDLP_BIN } = require('./ytdlp');

const execFileP = promisify(execFile);

const FONT      = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
const FONT_BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';

const W = 720, H = 1280, FPS = 30;
const STEP_DUR  = 9;
const INTRO_DUR = 4;
const OUTRO_DUR = 3;
const FADE      = 0.5;
const ACCENT    = '0x1D9E75';
const CLIP_SKIP = 5;   // skip first N seconds (avoid intros)
const CLIP_TAKE = 13;  // extract N seconds

const BG_COLORS = ['0d1b2a', '0a1f15', '1a0a1f', '1f150a', '0a1f1f', '1f0a10'];

function wrapText(str, charsPerLine) {
  const s = (str || '').trim();
  if (s.length <= charsPerLine) return s;
  const words = s.split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    if (cur.length && cur.length + 1 + w.length > charsPerLine) { lines.push(cur); cur = w; }
    else { cur = cur ? cur + ' ' + w : w; }
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

function formatNote(str, maxChar, wrapAt) {
  if (!str) return '';
  const s = str.split('\n')[0].trim();
  const m = s.slice(0, maxChar);
  const dot = m.search(/[.!?。]/);
  const cut = dot > 15 ? m.slice(0, dot + 1) : (m.length < s.length ? m + '…' : m);
  return wrapText(cut, wrapAt);
}

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const mod  = url.startsWith('https') ? https : http;
    const req  = mod.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlink(dest, () => {});
        return downloadImage(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { file.close(); return reject(new Error('HTTP ' + res.statusCode)); }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    });
    req.on('error', err => { fs.unlink(dest, () => {}); reject(err); });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// textfile= 방식 — 한국어 포함 모든 텍스트 이스케이프 불필요
function dt({ dir, name, idx, text, font, size, x, y, color, alpha }) {
  const p = path.join(dir, name + '_t' + idx + '.txt');
  fs.writeFileSync(p, String(text), 'utf8');
  return (
    'drawtext=fontfile=' + (font || FONT) +
    ':textfile=' + p +
    ':fontcolor=' + (color || 'white') + '@' + (alpha !== undefined ? alpha : 1) +
    ':fontsize=' + size +
    ':x=' + x + ':y=' + y +
    ':line_spacing=6:borderw=2:bordercolor=black@0.8'
  );
}

// yt-dlp로 YouTube 클립 세그먼트만 다운로드 (CLIP_SKIP~CLIP_SKIP+CLIP_TAKE 초)
async function downloadSegment(url, destPath) {
  await execFileP(YTDLP_BIN, [
    '--no-playlist', '--no-warnings', '--quiet',
    '-f', 'best[height<=360][ext=mp4]/best[height<=360]/worst[ext=mp4]/worst',
    '--download-sections', '*' + CLIP_SKIP + '-' + (CLIP_SKIP + CLIP_TAKE),
    '-o', destPath,
    url,
  ], { timeout: 90000 });
}

const UPLOADS_ROOT = '/home/brownjeon/NFS/homes/brownjeon/project/files/bjj-trainning';

// /uploads/... 웹경로 → 실제 절대경로
function resolveWebPath(webPath) {
  if (!webPath || webPath.length < 4) return null;
  if (webPath.startsWith('/uploads/')) {
    return require('path').join(UPLOADS_ROOT, webPath.slice('/uploads/'.length));
  }
  return webPath;
}

// 클립별 실제 영상 경로 확보 (로컬파일 → yt-dlp 다운로드 → null)
async function resolveVideoPath(clip, dir, idx) {
  if (!clip) return null;

  // 이미 다운로드된 로컬 파일 (웹경로 → 실제경로 변환)
  const localPath = resolveWebPath(clip.video_file);
  if (localPath && fs.existsSync(localPath)) {
    return localPath;
  }

  // YouTube URL → 세그먼트 다운로드
  if (!clip.url) return null;
  const isYT = clip.url.includes('youtube') || clip.url.includes('youtu.be');
  if (!isYT) return null;

  const destPath = path.join(dir, 'clip' + idx + '.mp4');
  try {
    await downloadSegment(clip.url, destPath);
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 30000) {
      return destPath;
    }
  } catch (e) {
    console.error('[video-gen] clip' + idx + ' download fail:', (e.message || '').slice(0, 120));
  }
  return null;
}

// 슬라이드 한 장 생성
async function buildSlide({ dir, name, videoPath, thumbPath, bgHex, duration,
                            topLabel, stepLabel, techName, noteText }) {
  const out     = path.join(dir, name + '.mp4');
  const fadeAll = 'fade=t=in:st=0:d=' + FADE + ',fade=t=out:st=' + (duration - FADE) + ':d=' + FADE;

  let li = 0;
  function mkDt(opts) { return dt(Object.assign({ dir, name, idx: li++ }, opts)); }

  if (videoPath && fs.existsSync(videoPath)) {
    // ── 실제 스파링 영상 슬라이드 ──
    const BOX_TOP = H - 230;
    const layers  = [];

    if (topLabel)  layers.push(mkDt({ text: topLabel,  font: FONT,      size: 19, x: '(w-text_w)/2', y: 55, color: 'white', alpha: 0.35 }));
    if (stepLabel) layers.push(mkDt({ text: stepLabel, font: FONT,      size: 23, x: '(w-text_w)/2', y: BOX_TOP + 12, color: ACCENT, alpha: 1 }));
    if (techName)  layers.push(mkDt({ text: techName,  font: FONT_BOLD, size: 52, x: '(w-text_w)/2', y: BOX_TOP + 48, color: 'white', alpha: 1 }));
    if (noteText) {
      const nameLines = (techName || '').split('\n').length;
      const noteY     = BOX_TOP + 48 + 62 * nameLines + 6;
      layers.push(mkDt({ text: noteText, font: FONT, size: 18, x: '(w-text_w)/2', y: noteY, color: 'white', alpha: 0.78 }));
    }

    const boxFilter  = 'drawbox=x=0:y=' + BOX_TOP + ':w=' + W + ':h=' + (H - BOX_TOP) + ':color=black@0.65:t=fill';
    const drawTexts  = layers.filter(Boolean).join(',');
    const vf = [
      'scale=' + W + ':' + H + ':force_original_aspect_ratio=increase',
      'crop=' + W + ':' + H,
      boxFilter,
      drawTexts,
      fadeAll,
    ].filter(Boolean).join(',');

    await execFileP('ffmpeg', [
      '-y',
      '-stream_loop', '-1',
      '-i', videoPath,
      '-t', String(duration),
      '-vf', vf,
      '-c:v', 'libx264', '-r', String(FPS), '-pix_fmt', 'yuv420p',
      '-an',
      out,
    ], { timeout: 60000 });

  } else {
    // ── 폴백: 썸네일 또는 단색 배경 ──
    const cy = Math.round(H * 0.45);
    const layers = [];

    if (topLabel)  layers.push(mkDt({ text: topLabel,  font: FONT,      size: 19, x: '(w-text_w)/2', y: 55, color: 'white', alpha: 0.28 }));
    if (stepLabel) layers.push(mkDt({ text: stepLabel, font: FONT,      size: 26, x: '(w-text_w)/2', y: cy - 85, color: ACCENT, alpha: 0.9 }));
    if (techName)  layers.push(mkDt({ text: techName,  font: FONT_BOLD, size: 72, x: '(w-text_w)/2', y: cy - 30, color: 'white', alpha: 1 }));
    if (noteText) {
      const nameLines = (techName || '').split('\n').length;
      const noteY = cy - 30 + 80 * nameLines;
      layers.push(mkDt({ text: noteText, font: FONT, size: 22, x: '(w-text_w)/2', y: noteY, color: 'white', alpha: 0.72 }));
    }
    const drawTexts = layers.filter(Boolean).join(',');

    if (thumbPath && fs.existsSync(thumbPath)) {
      const vf = [
        'scale=' + W + ':' + H + ':force_original_aspect_ratio=increase',
        'crop=' + W + ':' + H,
        'boxblur=12:12',
        'colorchannelmixer=rr=0.22:gg=0.22:bb=0.22',
        fadeAll,
        drawTexts,
      ].filter(Boolean).join(',');

      await execFileP('ffmpeg', [
        '-y', '-loop', '1', '-t', String(duration), '-i', thumbPath,
        '-vf', vf,
        '-c:v', 'libx264', '-r', String(FPS), '-pix_fmt', 'yuv420p', '-tune', 'stillimage',
        out,
      ], { timeout: 45000 });
    } else {
      const vf = ['format=yuv420p', fadeAll, drawTexts].filter(Boolean).join(',');
      await execFileP('ffmpeg', [
        '-y', '-f', 'lavfi',
        '-i', 'color=color=0x' + bgHex + ':size=' + W + 'x' + H + ':rate=' + FPS + ':duration=' + duration,
        '-vf', vf,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        out,
      ], { timeout: 45000 });
    }
  }

  return out;
}

async function generateChainVideo(chain, steps, clipsByTechId) {
  const dir = '/tmp/bjj-chain-' + chain.id + '-' + Date.now();
  fs.mkdirSync(dir, { recursive: true });

  // ── 1. 병렬 클립 다운로드 ──
  console.log('[video-gen] parallel clip download start (' + steps.length + ' steps)');
  const clipList   = steps.map(function(s) { return (clipsByTechId[s.technique_id] || [])[0] || null; });
  const videoPaths = await Promise.all(clipList.map(function(c, i) { return resolveVideoPath(c, dir, i); }));
  const hitCount   = videoPaths.filter(Boolean).length;
  console.log('[video-gen] clips resolved: ' + hitCount + '/' + steps.length);

  const slides = [];

  // ── 2. 인트로 ──
  {
    const cy  = Math.round(H * 0.46);
    const iNote = formatNote(chain.note, 54, 22);
    const out = path.join(dir, 'intro.mp4');
    const fadeAll = 'fade=t=in:st=0:d=' + FADE + ',fade=t=out:st=' + (INTRO_DUR - FADE) + ':d=' + FADE;
    let ii = 0;
    function iDt(opts) { return dt(Object.assign({ dir, name: 'intro', idx: ii++ }, opts)); }
    const iLayers = [
      iDt({ text: 'BJJ 훈련일지', font: FONT,      size: 24, x: '(w-text_w)/2', y: cy - 85, color: ACCENT, alpha: 0.8 }),
      iDt({ text: chain.name,    font: FONT_BOLD, size: 54, x: '(w-text_w)/2', y: cy,      color: 'white', alpha: 1 }),
      iNote ? iDt({ text: iNote, font: FONT, size: 22, x: '(w-text_w)/2', y: cy + 95, color: 'white', alpha: 0.6 }) : null,
      iDt({ text: steps.length + '단계 체인', font: FONT, size: 20, x: '(w-text_w)/2', y: cy + 175, color: ACCENT, alpha: 0.55 }),
    ].filter(Boolean).join(',');

    await execFileP('ffmpeg', [
      '-y', '-f', 'lavfi',
      '-i', 'color=color=0x0c1020:size=' + W + 'x' + H + ':rate=' + FPS + ':duration=' + INTRO_DUR,
      '-vf', 'format=yuv420p,' + fadeAll + ',' + iLayers,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out,
    ], { timeout: 30000 });
    slides.push(out);
  }

  // ── 3. 기술 슬라이드 ──
  for (var i = 0; i < steps.length; i++) {
    var step      = steps[i];
    var clip      = clipList[i];
    var videoPath = videoPaths[i];
    var isLast    = (i === steps.length - 1);

    var thumbPath = null;
    if (clip && clip.thumb_url) {
      var tp = path.join(dir, 'thumb' + i + '.jpg');
      try { await downloadImage(clip.thumb_url, tp); thumbPath = tp; } catch(e) {}
    }

    var techName  = wrapText(step.tech_name || ('Step ' + (i + 1)), 10);
    var note      = formatNote(step.transition_note, 55, 22);
    var stepLabel = 'STEP ' + (i + 1) + ' / ' + steps.length + (isLast ? '   ▣ FINAL' : '');

    slides.push(await buildSlide({
      dir,
      name:      'step' + i,
      videoPath,
      thumbPath,
      bgHex:     BG_COLORS[i % BG_COLORS.length],
      duration:  STEP_DUR,
      topLabel:  chain.name,
      stepLabel,
      techName,
      // 실제 영상이 있으면 노트 생략 (텍스트 최소화 — 영상에 집중)
      noteText:  videoPath ? null : (note || null),
    }));
  }

  // ── 4. 아웃트로 ──
  {
    const oy  = Math.round(H * 0.47);
    const out = path.join(dir, 'outro.mp4');
    const fadeAll = 'fade=t=in:st=0:d=' + FADE + ',fade=t=out:st=' + (OUTRO_DUR - FADE) + ':d=' + FADE;
    let oi = 0;
    function oDt(opts) { return dt(Object.assign({ dir, name: 'outro', idx: oi++ }, opts)); }
    const oLayers = [
      oDt({ text: chain.name,    font: FONT, size: 38, x: '(w-text_w)/2', y: oy - 30, color: 'white', alpha: 0.5 }),
      oDt({ text: 'BJJ 훈련일지', font: FONT, size: 22, x: '(w-text_w)/2', y: oy + 30, color: ACCENT, alpha: 0.45 }),
    ].join(',');

    await execFileP('ffmpeg', [
      '-y', '-f', 'lavfi',
      '-i', 'color=color=0x0c1020:size=' + W + 'x' + H + ':rate=' + FPS + ':duration=' + OUTRO_DUR,
      '-vf', 'format=yuv420p,' + fadeAll + ',' + oLayers,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out,
    ], { timeout: 30000 });
    slides.push(out);
  }

  // ── 5. 연결 ──
  const listPath = path.join(dir, 'list.txt');
  fs.writeFileSync(listPath, slides.map(function(p) { return "file '" + p + "'"; }).join('\n'));

  const outputPath = path.join(dir, 'output.mp4');
  await execFileP('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c', 'copy', outputPath,
  ], { timeout: 60000 });

  return {
    outputPath,
    cleanup: function() { try { fs.rmSync(dir, { recursive: true, force: true }); } catch(e) {} },
  };
}

module.exports = { generateChainVideo };
