/**
 * BJJ 체인 기술 AI 영상 생성 파이프라인
 * classVideoService.js 패턴 참고
 *
 * 흐름 (단계별):
 * 1. Claude → 일러스트 스타일 영어 프롬프트 생성
 * 2. M4 API /v1/image/generate → SD 이미지 (768×432)
 * 3. M4 API /v1/video/generate → SVD 25 프레임 (1024×576)
 * 4. ffmpeg: 프레임 → 720×1280 (9:16 크롭) → 9초 클립 → 기술명 오버레이
 *    SVD 실패 시: SD 이미지 → Ken Burns 폴백
 * 5. 인트로 + 스텝 클립 + 아웃트로 → concat → chain-{id}.mp4
 */

const { execFile } = require('child_process');
const fs    = require('fs');
const path  = require('path');
const { promisify } = require('util');
const { runClaude } = require('./claudeCli');

const execFileP = promisify(execFile);

const AI_API_BASE = process.env.AI_API_BASE || 'http://192.168.219.163:8001';
const AI_API_KEY  = process.env.AI_API_KEY  || '';
const FONT        = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
const FONT_BOLD   = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';
const VIDEO_DIR   = '/home/brownjeon/.node-local/bjj-chain-videos';
const ACCENT      = '0x1D9E75';

const W        = 720;
const H        = 1280;
const FPS      = 30;
const STEP_DUR = 9;
const FADE     = 0.5;

// ── 유틸 ─────────────────────────────────────────────────────────────────────

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

function runFFmpeg(args, timeoutMs) {
  return execFileP('ffmpeg', args, { timeout: timeoutMs || 120000 });
}

// textfile= 방식 drawtext (한국어 이스케이프 불필요)
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

async function updateJobDB(sequelize, jobId, fields) {
  const sets = Object.keys(fields).map(function(k) { return k + '=?'; }).join(', ');
  await sequelize.query(
    'UPDATE chain_video_jobs SET ' + sets + ', updated_at=NOW() WHERE id=?',
    { replacements: Object.values(fields).concat([jobId]) }
  );
}

// ── M4 API 호출 ───────────────────────────────────────────────────────────────

async function callGenerateImageM4(sdPrompt) {
  const resp = await fetch(AI_API_BASE + '/v1/image/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': AI_API_KEY },
    body: JSON.stringify({
      prompt: sdPrompt,
      negative_prompt: 'realistic photography, photo, ugly, deformed, blurry, text, watermark, nsfw, extra limbs, bad anatomy',
      width: 768, height: 432, steps: 20,
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!resp.ok) throw new Error('이미지 API 오류 ' + resp.status);
  const data = await resp.json();
  if (!data.image_b64) throw new Error('이미지 API 응답 없음');
  return data.image_b64;
}

// Pollinations.ai 폴백 (Flux 모델, 무인증, 무료)
async function callGenerateImagePollinations(sdPrompt) {
  const encoded = encodeURIComponent(
    sdPrompt + ', anime illustration style, BJJ martial arts, clean line art, high quality'
  );
  const url = 'https://image.pollinations.ai/prompt/' + encoded +
    '?width=768&height=432&nologo=true&model=flux&seed=' + Math.floor(Date.now() / 1000);
  const resp = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!resp.ok) throw new Error('Pollinations API 오류 ' + resp.status);
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length < 1000) throw new Error('Pollinations 응답 이미지 비정상');
  return buf.toString('base64');
}

// M4 SD 시도 → 실패 시 Pollinations 폴백 → 실패 시 null
async function callGenerateImage(sdPrompt) {
  try {
    const b64 = await callGenerateImageM4(sdPrompt);
    console.log('[chain-ai] M4 SD 이미지 생성 성공');
    return b64;
  } catch (e) {
    console.warn('[chain-ai] M4 SD 실패, Pollinations 폴백:', e.message);
  }
  try {
    const b64 = await callGenerateImagePollinations(sdPrompt);
    console.log('[chain-ai] Pollinations 이미지 생성 성공');
    return b64;
  } catch (e) {
    console.error('[chain-ai] Pollinations 도 실패:', e.message);
    return null;
  }
}

async function callGenerateVideo(imgB64) {
  const resp = await fetch(AI_API_BASE + '/v1/video/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': AI_API_KEY },
    body: JSON.stringify({ image_b64: imgB64, fps: 7, steps: 20, motion_bucket_id: 60 }),
    signal: AbortSignal.timeout(600000),
  });
  if (!resp.ok) throw new Error('SVD API 오류 ' + resp.status);
  const data = await resp.json();
  if (!data.frames_b64 || !data.frames_b64.length) throw new Error('SVD API 프레임 없음');
  return data.frames_b64;
}

// ── SD 프롬프트 생성 (Claude) ─────────────────────────────────────────────────

async function generateStepPrompt(techName, note) {
  const prompt = 'Write a single-line Stable Diffusion image generation prompt for a BJJ technique illustration.\n' +
    'Style: anime-influenced digital art illustration, two martial arts fighters demonstrating the technique, clean line art, dynamic action pose, detailed anatomy, simple dojo background, high quality.\n' +
    'Technique: ' + techName + '\n' +
    'Context: ' + (note || 'BJJ grappling technique') + '\n' +
    'Output ONLY the prompt text on one line. No quotes, no explanation.';
  try {
    const result = await runClaude(prompt, { timeoutMs: 30000 });
    const line = result.trim().split('\n')[0].trim();
    return line || ('BJJ martial arts illustration, two fighters demonstrating ' + techName + ', anime art style, dynamic pose, clean line art, high quality');
  } catch (e) {
    return 'BJJ martial arts illustration, two fighters demonstrating ' + techName + ', anime art style, dynamic pose, clean line art, high quality';
  }
}

// ── 슬라이드 빌드 ──────────────────────────────────────────────────────────────

// SVD 프레임 → 9:16 클립 (landscape raw → portrait final)
async function buildClipFromFrames(frames, dir, slideName, overlayLayers) {
  const frameDir = path.join(dir, slideName + '_frames');
  fs.mkdirSync(frameDir, { recursive: true });
  for (var i = 0; i < frames.length; i++) {
    fs.writeFileSync(
      path.join(frameDir, 'f' + String(i).padStart(3, '0') + '.png'),
      Buffer.from(frames[i], 'base64')
    );
  }

  // frames → 16:9 raw clip (1024×576, 3.57초)
  const rawPath = path.join(dir, slideName + '_raw.mp4');
  await runFFmpeg([
    '-y', '-framerate', '7',
    '-i', path.join(frameDir, 'f%03d.png'),
    '-vf', 'scale=1024:576',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast',
    rawPath,
  ], 60000);
  fs.rmSync(frameDir, { recursive: true, force: true });

  // raw → 9초 루프 + portrait crop + overlay
  const out = path.join(dir, slideName + '.mp4');
  const fadeAll = 'fade=t=in:st=0:d=' + FADE + ',fade=t=out:st=' + (STEP_DUR - FADE) + ':d=' + FADE;
  const BOX_TOP = H - 230;
  const boxFilter = 'drawbox=x=0:y=' + BOX_TOP + ':w=' + W + ':h=' + (H - BOX_TOP) + ':color=black@0.65:t=fill';
  const drawTexts = overlayLayers.filter(Boolean).join(',');
  const vf = [
    'scale=' + W + ':' + H + ':force_original_aspect_ratio=increase',
    'crop=' + W + ':' + H,
    boxFilter,
    drawTexts,
    fadeAll,
  ].filter(Boolean).join(',');

  await runFFmpeg([
    '-y', '-stream_loop', '-1', '-i', rawPath,
    '-t', String(STEP_DUR),
    '-vf', vf,
    '-c:v', 'libx264', '-r', String(FPS), '-pix_fmt', 'yuv420p', '-an',
    out,
  ], 90000);

  try { fs.unlinkSync(rawPath); } catch(e) {}
  return out;
}

// SD 이미지 → Ken Burns (느린 줌인 + 페이드)
async function buildKenBurnsClip(imgPath, dir, slideName, overlayLayers) {
  const out = path.join(dir, slideName + '.mp4');
  const totalFrames = STEP_DUR * FPS; // 270
  const fadeAll = 'fade=t=in:st=0:d=' + FADE + ',fade=t=out:st=' + (STEP_DUR - FADE) + ':d=' + FADE;
  const BOX_TOP = H - 230;
  const boxFilter = 'drawbox=x=0:y=' + BOX_TOP + ':w=' + W + ':h=' + (H - BOX_TOP) + ':color=black@0.65:t=fill';
  const drawTexts = overlayLayers.filter(Boolean).join(',');
  // landscape → portrait 크롭 후 zoompan: 1.0 → 1.25 느린 줌인
  const zoom = 'zoompan=z=\'min(zoom+0.0009,1.25)\':d=' + totalFrames +
    ':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':s=' + W + 'x' + H + ':fps=' + FPS;
  const vf = [
    'scale=' + W + ':' + H + ':force_original_aspect_ratio=increase',
    'crop=' + W + ':' + H,
    zoom,
    boxFilter,
    drawTexts,
    fadeAll,
  ].filter(Boolean).join(',');

  await runFFmpeg([
    '-y', '-loop', '1', '-i', imgPath,
    '-t', String(STEP_DUR),
    '-vf', vf,
    '-c:v', 'libx264', '-r', String(FPS), '-pix_fmt', 'yuv420p', '-an',
    out,
  ], 120000);
  return out;
}

// 인트로/아웃트로 색상 슬라이드
async function buildColorSlide(dir, slideName, duration, layerFilters) {
  const out = path.join(dir, slideName + '.mp4');
  const fadeAll = 'fade=t=in:st=0:d=' + FADE + ',fade=t=out:st=' + (duration - FADE) + ':d=' + FADE;
  const drawTexts = layerFilters.filter(Boolean).join(',');
  const vf = 'format=yuv420p,' + fadeAll + (drawTexts ? ',' + drawTexts : '');

  await runFFmpeg([
    '-y', '-f', 'lavfi',
    '-i', 'color=color=0x0c1020:size=' + W + 'x' + H + ':rate=' + FPS + ':duration=' + duration,
    '-vf', vf,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    out,
  ], 30000);
  return out;
}

// ── 메인 파이프라인 (비동기 백그라운드) ──────────────────────────────────────────

async function generateChainVideoAsync(chain, steps, jobId) {
  const { sequelize, TechniqueChain } = require('../models');

  const dir = '/tmp/bjj-chain-ai-' + chain.id + '-' + Date.now();
  fs.mkdirSync(dir, { recursive: true });

  let li = 0;
  function mkDt(name, opts) { return dt(Object.assign({ dir, name, idx: li++ }, opts)); }

  const slides = [];

  try {
    // ── 인트로 ──
    await updateJobDB(sequelize, jobId, { status: 'generating', progress: '인트로 생성 중...' });
    const cy = Math.round(H * 0.46);
    slides.push(await buildColorSlide(dir, 'intro', 4, [
      mkDt('intro', { text: 'BJJ 훈련일지', font: FONT, size: 24, x: '(w-text_w)/2', y: cy - 85, color: ACCENT, alpha: 0.8 }),
      mkDt('intro', { text: chain.name, font: FONT_BOLD, size: 54, x: '(w-text_w)/2', y: cy, color: 'white', alpha: 1 }),
      mkDt('intro', { text: 'AI 생성 기술 시연', font: FONT, size: 20, x: '(w-text_w)/2', y: cy + 88, color: 'white', alpha: 0.5 }),
      mkDt('intro', { text: steps.length + '단계 체인', font: FONT, size: 20, x: '(w-text_w)/2', y: cy + 128, color: ACCENT, alpha: 0.55 }),
    ]));

    // ── 기술 슬라이드 ──
    for (var i = 0; i < steps.length; i++) {
      var step      = steps[i];
      var techName  = wrapText(step.tech_name || ('Step ' + (i + 1)), 10);
      var isLast    = (i === steps.length - 1);
      var stepLabel = 'STEP ' + (i + 1) + ' / ' + steps.length + (isLast ? '   ▣ FINAL' : '');
      var BOX_TOP   = H - 230;
      var sn        = 'step' + i;

      var overlayLayers = [
        mkDt(sn, { text: chain.name, font: FONT, size: 19, x: '(w-text_w)/2', y: 55, color: 'white', alpha: 0.35 }),
        mkDt(sn, { text: stepLabel,  font: FONT, size: 22, x: '(w-text_w)/2', y: BOX_TOP + 12, color: ACCENT, alpha: 1 }),
        mkDt(sn, { text: techName,   font: FONT_BOLD, size: 52, x: '(w-text_w)/2', y: BOX_TOP + 48, color: 'white', alpha: 1 }),
      ];

      // 1. Claude → SD 프롬프트
      await updateJobDB(sequelize, jobId, { progress: '스텝 ' + (i+1) + '/' + steps.length + ' 프롬프트 생성 중...' });
      var sdPrompt = await generateStepPrompt(step.tech_name, step.transition_note);
      console.log('[chain-ai] step' + (i+1) + ':', sdPrompt.slice(0, 80));

      // 2. 이미지 생성 (M4 SD → Pollinations 순서로 시도)
      await updateJobDB(sequelize, jobId, { progress: '스텝 ' + (i+1) + '/' + steps.length + ' AI 이미지 생성 중...' });
      var imgB64 = await callGenerateImage(sdPrompt);

      var imgPath = path.join(dir, sn + '_img.png');
      if (imgB64) {
        fs.writeFileSync(imgPath, Buffer.from(imgB64, 'base64'));
      }

      // 3. SVD 영상 생성 (SVD 실패 → Ken Burns 폴백)
      await updateJobDB(sequelize, jobId, { progress: '스텝 ' + (i+1) + '/' + steps.length + ' AI 영상 생성 중...' });
      var clip;
      if (imgB64) {
        try {
          var frames = await callGenerateVideo(imgB64);
          clip = await buildClipFromFrames(frames, dir, sn, overlayLayers);
        } catch (e) {
          console.error('[chain-ai] SVD 실패 step' + (i+1) + ', Ken Burns 폴백:', e.message);
          clip = await buildKenBurnsClip(imgPath, dir, sn, overlayLayers);
        }
      } else {
        // 이미지 생성도 실패 → 색상 슬라이드
        var cy2 = Math.round(H * 0.45);
        clip = await buildColorSlide(dir, sn, STEP_DUR, [
          mkDt(sn + 'fb', { text: stepLabel, font: FONT, size: 26, x: '(w-text_w)/2', y: cy2 - 85, color: ACCENT, alpha: 0.9 }),
          mkDt(sn + 'fb', { text: techName,  font: FONT_BOLD, size: 72, x: '(w-text_w)/2', y: cy2 - 30, color: 'white', alpha: 1 }),
        ]);
      }

      slides.push(clip);
    }

    // ── 아웃트로 ──
    await updateJobDB(sequelize, jobId, { progress: '아웃트로 생성 중...' });
    var oy = Math.round(H * 0.47);
    slides.push(await buildColorSlide(dir, 'outro', 3, [
      mkDt('outro', { text: chain.name, font: FONT, size: 38, x: '(w-text_w)/2', y: oy - 30, color: 'white', alpha: 0.5 }),
      mkDt('outro', { text: 'BJJ 훈련일지', font: FONT, size: 22, x: '(w-text_w)/2', y: oy + 30, color: ACCENT, alpha: 0.45 }),
    ]));

    // ── Concat ──
    await updateJobDB(sequelize, jobId, { progress: '영상 합치는 중...' });
    var listPath = path.join(dir, 'list.txt');
    fs.writeFileSync(listPath, slides.map(function(p) { return "file '" + p + "'"; }).join('\n'));

    if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });
    var outputPath = path.join(VIDEO_DIR, 'chain-' + chain.id + '.mp4');

    await runFFmpeg([
      '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
      '-c', 'copy', outputPath,
    ], 60000);

    await TechniqueChain.update({ video_path: outputPath }, { where: { id: chain.id } });
    await updateJobDB(sequelize, jobId, { status: 'done', progress: '완료', video_path: outputPath });
    console.log('[chain-ai] 완료:', outputPath);

  } catch (e) {
    console.error('[chain-ai] 파이프라인 오류:', e.message);
    await updateJobDB(sequelize, jobId, {
      status: 'error',
      error: (e.message || '알 수 없는 오류').slice(0, 400),
    }).catch(function() {});
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch(e) {}
  }
}

module.exports = { generateChainVideoAsync };
