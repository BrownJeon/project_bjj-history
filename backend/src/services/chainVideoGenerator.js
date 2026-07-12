const { execFile } = require('child_process');
const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');
const { promisify } = require('util');

const execFileP = promisify(execFile);

const FONT      = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
const W = 1280, H = 720, FPS = 25;
const STEP_DUR  = 8;
const INTRO_DUR = 4;
const OUTRO_DUR = 3;

const BG_COLORS = ['0d1b2a', '0a2a1a', '1a0a2a', '2a1a0a', '0a2020', '20100a'];

// 첫 문장 추출 + 길이 제한
function truncate(str, max = 72) {
  const s = (str || '').split('\n')[0].trim();
  const m = s.slice(0, max);
  const dot = m.search(/[.!?。]/);
  if (dot > 15) return m.slice(0, dot + 1);
  return m.length < s.length ? m + '…' : m;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const mod  = url.startsWith('https') ? https : http;
    const req  = mod.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { file.close(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    });
    req.on('error', err => { fs.unlink(dest, () => {}); reject(err); });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// 텍스트 → 임시 파일에 쓰고 drawtext=textfile= 필터 문자열 반환
// textfile= 방식: 파일 내용을 그대로 읽으므로 특수문자 이스케이프 불필요
function makeDrawText({ textPath, size, y, alpha = 1 }) {
  return (
    `drawtext=fontfile=${FONT}` +
    `:textfile=${textPath}` +
    `:fontcolor=white@${alpha}` +
    `:fontsize=${size}` +
    `:x=(w-text_w)/2` +
    `:y=${y}` +
    `:borderw=2` +
    `:bordercolor=black@0.8`
  );
}

// 슬라이드 한 장 생성
// lines: [{ text, size, y(px), alpha? }]  — text는 이스케이프 불필요
async function createSlide({ dir, name, bgHex, thumbPath, duration, lines }) {
  const out = path.join(dir, `${name}.mp4`);

  // 각 텍스트를 파일에 기록
  const dtFilters = lines
    .filter(l => l && l.text && String(l.text).trim())
    .map((l, i) => {
      const textPath = path.join(dir, `${name}_t${i}.txt`);
      fs.writeFileSync(textPath, String(l.text), 'utf8');
      return makeDrawText({ textPath, size: l.size, y: l.y, alpha: l.alpha });
    })
    .join(',');

  if (thumbPath && fs.existsSync(thumbPath)) {
    const vf = [
      `scale=${W}:${H}:force_original_aspect_ratio=increase`,
      `crop=${W}:${H}`,
      'colorchannelmixer=rr=0.3:gg=0.3:bb=0.3',
      dtFilters,
    ].filter(Boolean).join(',');

    await execFileP('ffmpeg', [
      '-y', '-loop', '1', '-t', String(duration), '-i', thumbPath,
      '-vf', vf,
      '-c:v', 'libx264', '-r', String(FPS), '-pix_fmt', 'yuv420p', '-tune', 'stillimage',
      out,
    ], { timeout: 40000 });
  } else {
    const vf = ['format=yuv420p', dtFilters].filter(Boolean).join(',');

    await execFileP('ffmpeg', [
      '-y', '-f', 'lavfi',
      '-i', `color=color=0x${bgHex}:size=${W}x${H}:rate=${FPS}:duration=${duration}`,
      '-vf', vf,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      out,
    ], { timeout: 40000 });
  }

  return out;
}

async function generateChainVideo(chain, steps, clipsByTechId) {
  const dir = `/tmp/bjj-chain-${chain.id}-${Date.now()}`;
  fs.mkdirSync(dir, { recursive: true });

  const slides = [];

  // ── 인트로 ──
  const chainNote = truncate(chain.note || '', 68);
  slides.push(await createSlide({
    dir, name: 'intro', bgHex: '0c1020', thumbPath: null, duration: INTRO_DUR,
    lines: [
      { text: chain.name, size: 58, y: chainNote ? H / 2 - 44 : H / 2 - 28 },
      chainNote ? { text: chainNote, size: 22, y: H / 2 + 32, alpha: 0.7 } : null,
    ],
  }));

  // ── 스텝 슬라이드 ──
  for (const [i, step] of steps.entries()) {
    const clips = clipsByTechId[step.technique_id] || [];
    let thumbPath = null;

    if (clips[0]?.thumb_url) {
      const tp = path.join(dir, `thumb${i}.jpg`);
      try { await downloadFile(clips[0].thumb_url, tp); thumbPath = tp; } catch { /* 단색 배경으로 fallback */ }
    }

    const note     = truncate(step.transition_note || '', 72);
    const techName = step.tech_name || `Step ${i + 1}`;

    slides.push(await createSlide({
      dir, name: `step${i}`,
      bgHex: BG_COLORS[i % BG_COLORS.length],
      thumbPath, duration: STEP_DUR,
      lines: [
        { text: `STEP ${i + 1} / ${steps.length}`, size: 19, y: 44, alpha: 0.55 },
        { text: techName, size: 58, y: note ? H / 2 - 40 : H / 2 - 28 },
        note ? { text: note, size: 20, y: H / 2 + 36, alpha: 0.82 } : null,
      ],
    }));
  }

  // ── 아웃트로 ──
  slides.push(await createSlide({
    dir, name: 'outro', bgHex: '0c1020', thumbPath: null, duration: OUTRO_DUR,
    lines: [
      { text: chain.name,   size: 32, y: H / 2 - 22, alpha: 0.55 },
      { text: 'BJJ 훈련일지', size: 20, y: H / 2 + 20, alpha: 0.35 },
    ],
  }));

  // ── Concat ──
  const listPath = path.join(dir, 'list.txt');
  fs.writeFileSync(listPath, slides.map(p => `file '${p}'`).join('\n'));

  const outputPath = path.join(dir, 'output.mp4');
  await execFileP('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c', 'copy', outputPath,
  ], { timeout: 60000 });

  return {
    outputPath,
    cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
}

module.exports = { generateChainVideo };
