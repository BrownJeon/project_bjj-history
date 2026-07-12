const { execFile } = require('child_process');
const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');
const { promisify } = require('util');

const execFileP = promisify(execFile);

const FONT      = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
const FONT_BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';

// 9:16 세로 Shorts 포맷
const W = 720, H = 1280, FPS = 30;
const STEP_DUR  = 7;
const INTRO_DUR = 4;
const OUTRO_DUR = 3;
const FADE      = 0.5;

const ACCENT = '0x1D9E75';

const BG_COLORS = [
  '0d1b2a', '0a1f15', '1a0a1f', '1f150a', '0a1f1f', '1f0a10',
];

// 한국어 텍스트 줄바꿈 (charsPerLine 단위)
function wrapText(str, charsPerLine) {
  const s = (str || '').trim();
  if (s.length <= charsPerLine) return s;
  const words = s.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur.length && cur.length + 1 + w.length > charsPerLine) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + ' ' + w : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

// 첫 문장 추출 + 줄바꿈
function formatNote(str, maxChar, wrapAt) {
  if (!str) return '';
  const s = str.split('\n')[0].trim();
  const m = s.slice(0, maxChar);
  const dot = m.search(/[.!?。]/);
  const cut = dot > 15 ? m.slice(0, dot + 1) : (m.length < s.length ? m + '…' : m);
  return wrapText(cut, wrapAt);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const mod  = url.startsWith('https') ? https : http;
    const req  = mod.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlink(dest, () => {});
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
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

// textfile= 방식 drawtext 필터 생성 (텍스트 이스케이프 불필요)
function dt({ dir, name, idx, text, font, size, x, y, color, alpha }) {
  const p = path.join(dir, name + '_t' + idx + '.txt');
  fs.writeFileSync(p, String(text), 'utf8');
  return (
    'drawtext=fontfile=' + (font || FONT) +
    ':textfile=' + p +
    ':fontcolor=' + (color || 'white') + '@' + (alpha !== undefined ? alpha : 1) +
    ':fontsize=' + size +
    ':x=' + x +
    ':y=' + y +
    ':line_spacing=6' +
    ':borderw=3' +
    ':bordercolor=black@0.9'
  );
}

// 슬라이드 한 장 생성 (720x1280)
async function createSlide({ dir, name, bgHex, thumbPath, duration, layers }) {
  const out = path.join(dir, name + '.mp4');

  const fadeFilter = 'fade=t=in:st=0:d=' + FADE + ',fade=t=out:st=' + (duration - FADE) + ':d=' + FADE;

  const drawTexts = layers
    .filter(function(l) { return l && l.text && String(l.text).trim(); })
    .map(function(l, i) { return dt(Object.assign({ dir, name, idx: i }, l)); })
    .join(',');

  const allVf = [fadeFilter, drawTexts].filter(Boolean).join(',');

  if (thumbPath && fs.existsSync(thumbPath)) {
    const vf = [
      'scale=' + W + ':' + H + ':force_original_aspect_ratio=increase',
      'crop=' + W + ':' + H,
      'boxblur=12:12',
      'colorchannelmixer=rr=0.22:gg=0.22:bb=0.22',
      allVf,
    ].filter(Boolean).join(',');

    await execFileP('ffmpeg', [
      '-y', '-loop', '1', '-t', String(duration), '-i', thumbPath,
      '-vf', vf,
      '-c:v', 'libx264', '-r', String(FPS), '-pix_fmt', 'yuv420p', '-tune', 'stillimage',
      out,
    ], { timeout: 45000 });
  } else {
    const vf = ['format=yuv420p', allVf].filter(Boolean).join(',');

    await execFileP('ffmpeg', [
      '-y', '-f', 'lavfi',
      '-i', 'color=color=0x' + bgHex + ':size=' + W + 'x' + H + ':rate=' + FPS + ':duration=' + duration,
      '-vf', vf,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      out,
    ], { timeout: 45000 });
  }

  return out;
}

async function generateChainVideo(chain, steps, clipsByTechId) {
  const dir = '/tmp/bjj-chain-' + chain.id + '-' + Date.now();
  fs.mkdirSync(dir, { recursive: true });

  const slides = [];
  const cy = Math.round(H * 0.46);

  // 인트로
  const introNote = formatNote(chain.note, 54, 22);
  slides.push(await createSlide({
    dir, name: 'intro', bgHex: '0c1020', thumbPath: null, duration: INTRO_DUR,
    layers: [
      { text: 'BJJ 흘련일지', font: FONT, size: 24, x: '(w-text_w)/2', y: cy - 85, color: ACCENT, alpha: 0.8 },
      { text: chain.name, font: FONT_BOLD, size: 54, x: '(w-text_w)/2', y: cy, color: 'white', alpha: 1 },
      introNote ? { text: introNote, font: FONT, size: 22, x: '(w-text_w)/2', y: cy + 95, color: 'white', alpha: 0.6 } : null,
      { text: steps.length + '단계 체인', font: FONT, size: 20, x: '(w-text_w)/2', y: cy + 175, color: ACCENT, alpha: 0.55 },
    ],
  }));

  // 스텝 슬라이드
  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    var clips = clipsByTechId[step.technique_id] || [];
    var thumbPath = null;

    if (clips[0] && clips[0].thumb_url) {
      var tp = path.join(dir, 'thumb' + i + '.jpg');
      try { await downloadFile(clips[0].thumb_url, tp); thumbPath = tp; } catch(e) {}
    }

    var techName  = wrapText(step.tech_name || ('Step ' + (i + 1)), 10);
    var note      = formatNote(step.transition_note, 60, 22);
    var isLast    = i === steps.length - 1;
    var stepLabel = 'STEP ' + (i + 1) + ' / ' + steps.length;
    var techLines = techName.split('\n').length;
    var noteY     = Math.round(H * 0.45 + 70 + (techLines - 1) * 66);
    var sc        = Math.round(H * 0.45);

    slides.push(await createSlide({
      dir, name: 'step' + i,
      bgHex: BG_COLORS[i % BG_COLORS.length],
      thumbPath, duration: STEP_DUR,
      layers: [
        { text: chain.name, font: FONT, size: 19, x: '(w-text_w)/2', y: 55, color: 'white', alpha: 0.28 },
        { text: stepLabel,  font: FONT, size: 26, x: '(w-text_w)/2', y: sc - 85, color: ACCENT, alpha: 0.9 },
        { text: techName,   font: FONT_BOLD, size: 72, x: '(w-text_w)/2', y: sc - 30, color: 'white', alpha: 1 },
        note   ? { text: note,    font: FONT, size: 22, x: '(w-text_w)/2', y: noteY, color: 'white', alpha: 0.72 } : null,
        isLast ? { text: '▣ FINAL', font: FONT, size: 22, x: '(w-text_w)/2', y: Math.round(H * 0.84), color: ACCENT, alpha: 0.7 } : null,
      ],
    }));
  }

  // 아웃트로
  slides.push(await createSlide({
    dir, name: 'outro', bgHex: '0c1020', thumbPath: null, duration: OUTRO_DUR,
    layers: [
      { text: chain.name,       font: FONT, size: 38, x: '(w-text_w)/2', y: Math.round(H * 0.47 - 30), color: 'white', alpha: 0.5 },
      { text: 'BJJ 흘련일지', font: FONT, size: 22, x: '(w-text_w)/2', y: Math.round(H * 0.47 + 30), color: ACCENT, alpha: 0.45 },
    ],
  }));

  // Concat
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
