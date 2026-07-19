/**
 * BJJ 체인 기술 AI 영상 생성 파이프라인
 *
 * 흐름 (단계별):
 * 1. Claude → 기술별 6개 포즈 시퀀스 생성
 * 2. M4 API /v1/image/generate (txt2img) → 앵커 이미지 (포즈 0)
 *    → Pollinations.ai 폴백
 * 3. M4 API /v1/image/generate (img2img) → 포즈 1~5 (스타일 일관성 유지)
 * 4. ffmpeg xfade: 6 키프레임 → 9초 포트레이트 클립 (부드러운 포즈 전환)
 *    → 실패 시 Ken Burns 폴백 (zoompan 줌인)
 *    → 이미지도 실패 시 색상 슬라이드 폴백
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

// 플랫 일러스트 스타일 앵커 — 25토큰 이내 (CLIP 77토큰 한계 대비 pose desc 여유 확보)
const STYLE_ANCHOR = 'flat vector BJJ illustration, white gi vs blue gi, ' +
  'sky-blue background, faceless cartoon characters, 2D flat design';

const STYLE_NEGATIVE = 'photorealistic, realistic, photo, gradient, shading, ' +
  'detailed face, texture, 3D render, blurry, ugly, deformed, watermark, nsfw, ' +
  'extra limbs, bad anatomy, realistic skin';

// DB pos 필드값 → SD가 이해하는 리터럴 신체 위치 설명 (BJJ 용어 금지)
const BJJ_POSITION_SD_MAP = {
  '마운트':        "Person A sits upright on Person B's chest, Person B lies flat on back, A's knees on ground beside B's torso",
  '풀마운트':      "Person A sits upright on Person B's chest, Person B lies flat on back, A's knees on ground beside B's torso",
  '풀가드':        "Person B on back with legs wrapped around Person A's waist, A is between B's legs leaning forward",
  '하프가드':      "Person B on back, one leg entangled around Person A's near leg, A beside B pressing chest down",
  '사이드 컨트롤': "Person A lies perpendicular across Person B's chest, B on back with both arms pinned beside body",
  '사이드컨트롤':  "Person A lies perpendicular across Person B's chest, B on back with both arms pinned beside body",
  '백마운트':      "Person A behind Person B, both facing same direction, A's chest against B's back, A's legs hooked around B's hips",
  '백':           "Person A behind Person B, both facing same direction, A's chest against B's back",
  '니온더벨리':    "Person A kneels with one knee pressing on Person B's stomach, B lies flat on back looking up",
  '니언더벨리':    "Person A kneels with one knee pressing on Person B's stomach, B lies flat on back looking up",
  '스탠딩':       "Both persons standing upright facing each other, hands gripping each other's collars and sleeves",
  '가드':         "Person B on back with legs wrapped around Person A, A kneeling between B's legs",
  '클로즈드가드':  "Person B on back with legs locked crossed behind Person A's back, A kneeling between B's legs",
  '오픈가드':     "Person B on back with legs open and feet on Person A's hips, A standing or kneeling in front",
  '터틀':         "Person B on hands and knees facing down, Person A beside or behind B",
  '스크램블':     "Both persons on their knees transitioning positions, neither in stable control",
};

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
      negative_prompt: STYLE_NEGATIVE,
      width: 768, height: 432, steps: 20,
      seed: -1,
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
    sdPrompt + ', flat vector illustration, BJJ martial arts, anime style'
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

// img2img: 이전 키프레임에서 스타일 유지하며 새 포즈 생성
async function callGenerateImageWithInit(sdPrompt, initB64, strength, seed) {
  const resp = await fetch(AI_API_BASE + '/v1/image/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': AI_API_KEY },
    body: JSON.stringify({
      prompt: sdPrompt,
      negative_prompt: STYLE_NEGATIVE,
      width: 768, height: 432, steps: 18,
      seed: seed,
      init_image_b64: initB64,
      strength: strength,
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!resp.ok) throw new Error('img2img API 오류 ' + resp.status);
  const data = await resp.json();
  if (!data.image_b64) throw new Error('img2img API 응답 없음');
  return data.image_b64;
}

// ── 포즈 시퀀스 생성 (Claude) ─────────────────────────────────────────────────

async function generatePoseSequence(techName, note, techPos) {
  // techPos: DB pos JSON 문자열 (예: '["마운트","가드"]') 또는 배열
  var positions = [];
  try {
    positions = typeof techPos === 'string' ? JSON.parse(techPos || '[]') : (techPos || []);
  } catch(e) {}
  var posCtx = BJJ_POSITION_SD_MAP[positions[0]] || '';

  const prompt =
    'Describe 6 sequential body positions for a BJJ grappling technique as a JSON array.\n' +
    'STRICT RULES:\n' +
    '- ENGLISH ONLY\n' +
    '- Each item: 15-20 words of LITERAL body geometry only\n' +
    '- Use "Person A" (attacker/top) and "Person B" (defender/bottom)\n' +
    '- Describe EXACTLY: who lies/sits/kneels, where each person\'s hips, legs, arms are\n' +
    '- FORBIDDEN words: guard, mount, sweep, pass, base, frame, escape, submission (describe bodies instead)\n' +
    (posCtx ? 'Starting body position: ' + posCtx + '\n' : '') +
    'Technique name: ' + techName + '\n' +
    (note ? 'Note: ' + note + '\n' : '') +
    'Output ONLY a valid JSON array of 6 strings. No markdown, no explanation.';
  try {
    const raw = (await runClaude(prompt, { timeoutMs: 30000 })).trim();
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr) && arr.length >= 4) {
        return arr.slice(0, 6);
      }
    }
  } catch(e) {
    console.warn('[chain-ai] 포즈 시퀀스 파싱 실패:', e.message);
  }
  // 폴백: 포지션 맵 기반 기본 포즈
  var baseDesc = posCtx || 'two persons on the ground in grappling position';
  return [
    baseDesc + ', initial contact',
    baseDesc + ', Person A establishing grip on B\'s collar and sleeve',
    baseDesc + ', Person A shifting weight forward onto Person B',
    baseDesc + ', Person B\'s hips pinned, arms pressed against sides',
    baseDesc + ', Person A securing position, both persons on ground',
    baseDesc + ', technique completed, Person A in control on top',
  ];
}

// ── AnimateDiff (실제 모션) ────────────────────────────────────────────────────

async function callAnimateDiff(sdPrompt) {
  // 8프레임 6단계 ≈ 4.2분 (M4 CPU). 16프레임 20단계는 ~28분 → 6분 timeout 초과 폴백 발생
  var resp = await fetch(AI_API_BASE + '/v1/video/animate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': AI_API_KEY },
    body: JSON.stringify({
      prompt: sdPrompt,
      negative_prompt: STYLE_NEGATIVE,
      num_frames: 8,
      steps: 6,
    }),
    signal: AbortSignal.timeout(420000), // 7분 (4.2분 추정 + 여유)
  });
  if (!resp.ok) throw new Error('AnimateDiff API 오류 ' + resp.status);
  var data = await resp.json();
  if (!data.frames_b64 || !data.frames_b64.length) throw new Error('AnimateDiff 프레임 없음');
  return data.frames_b64; // base64 PNG 배열
}

// AnimateDiff 8프레임 → 9초 portrait 클립 (xfade 전환)
async function buildAnimateDiffClip(posePrompt, dir, sn, overlayLayers) {
  var frames = await callAnimateDiff(posePrompt);
  var N = frames.length;

  var framePaths = frames.map(function(b64, i) {
    var p = path.join(dir, sn + '_af' + String(i).padStart(3, '0') + '.png');
    fs.writeFileSync(p, Buffer.from(b64, 'base64'));
    return p;
  });

  // xfade: 각 프레임 POSE_DUR 노출 + 0.35s 전환
  // N*POSE_DUR - (N-1)*0.35 = STEP_DUR(9)  →  POSE_DUR = (9 + (N-1)*0.35) / N
  var XFADE_D = 0.35;
  var POSE_DUR = (STEP_DUR + (N - 1) * XFADE_D) / N;

  // 각 PNG를 POSE_DUR+XFADE_D+0.1초 정적 클립으로 입력
  var inputs = [];
  framePaths.forEach(function(p) {
    inputs.push('-loop', '1', '-t', String((POSE_DUR + XFADE_D + 0.1).toFixed(3)), '-i', p);
  });

  var fc = '';
  // 포트레이트 스케일/크롭
  framePaths.forEach(function(_, i) {
    fc += '[' + i + ':v]scale=' + W + ':' + H +
          ':force_original_aspect_ratio=increase,crop=' + W + ':' + H + '[v' + i + '];';
  });

  // xfade 체인: [v0][v1]→[xf1], [xf1][v2]→[xf2], ..., 마지막→[xfinal]
  var prev = 'v0';
  for (var k = 1; k < N; k++) {
    var offset = (k * (POSE_DUR - XFADE_D)).toFixed(3);
    var label = (k === N - 1) ? 'xfinal' : ('xf' + k);
    fc += '[' + prev + '][v' + k + ']xfade=transition=fade:duration=' +
          XFADE_D.toFixed(2) + ':offset=' + offset + '[' + label + '];';
    prev = label;
  }

  // 오버레이 + 페이드
  var BOX_TOP = H - 230;
  var postFilters = [
    'drawbox=x=0:y=' + BOX_TOP + ':w=' + W + ':h=' + (H - BOX_TOP) + ':color=black@0.65:t=fill',
    overlayLayers.filter(Boolean).join(','),
    'fade=t=in:st=0:d=' + FADE + ',fade=t=out:st=' + (STEP_DUR - FADE) + ':d=' + FADE,
  ].filter(Boolean).join(',');
  fc += '[' + prev + ']' + postFilters + '[vout]';

  var out = path.join(dir, sn + '.mp4');
  await runFFmpeg([
    '-y', ...inputs,
    '-filter_complex', fc,
    '-map', '[vout]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', '-t', String(STEP_DUR), out,
  ], 120000);

  framePaths.forEach(function(p) { try { fs.unlinkSync(p); } catch(e) {} });
  return out;
}

// ── 슬라이드 빌드 ──────────────────────────────────────────────────────────────

// 6 키프레임 이미지 → xfade 전환으로 9초 포즈 애니메이션 클립
async function buildPoseAnimClip(poseDescs, anchorImgB64, dir, sn, overlayLayers) {
  const POSE_DUR = 2.0;  // 각 포즈 지속 시간(초)
  const XFADE_D  = 0.5;  // xfade 전환 시간(초)
  const seed = Math.floor(Math.random() * 99999) + 1;

  // 1) 키프레임 생성 (0: anchor txt2img, 1~5: img2img 체인)
  const keyframes = [anchorImgB64];
  for (var i = 1; i < poseDescs.length; i++) {
    var fullPrompt = STYLE_ANCHOR + ', ' + poseDescs[i];
    try {
      var b64 = await callGenerateImageWithInit(fullPrompt, keyframes[i - 1], 0.60, seed);
      keyframes.push(b64);
      console.log('[chain-ai] 키프레임 ' + i + ' 생성 완료');
    } catch(e) {
      console.warn('[chain-ai] 키프레임 ' + i + ' 실패, 이전 프레임 재사용:', e.message);
      keyframes.push(keyframes[i - 1]);
    }
  }

  // 2) 디스크 저장
  var framePaths = keyframes.map(function(b64, i) {
    var p = path.join(dir, sn + '_kf' + i + '.png');
    fs.writeFileSync(p, Buffer.from(b64, 'base64'));
    return p;
  });

  // 3) FFmpeg xfade 필터 조립
  // 총 재생시간 = N*POSE_DUR - (N-1)*XFADE_D = 6*2.0 - 5*0.5 = 9.5초 → -t 9 트림
  var N = framePaths.length;
  var inputs = [];
  framePaths.forEach(function(p) {
    inputs.push('-loop', '1', '-t', String(POSE_DUR + 0.1), '-i', p);
  });

  var fc = '';
  // 각 입력을 포트레이트로 스케일/크롭
  for (var j = 0; j < N; j++) {
    fc += '[' + j + ':v]scale=' + W + ':' + H + ':force_original_aspect_ratio=increase' +
          ',crop=' + W + ':' + H + '[v' + j + '];';
  }
  // xfade 체인
  var prev = 'v0';
  for (var k = 1; k < N; k++) {
    var offset = k * (POSE_DUR - XFADE_D);  // 1.5, 3.0, 4.5, 6.0, 7.5
    var label  = (k === N - 1) ? 'xfinal' : ('x' + k);
    fc += '[' + prev + '][v' + k + ']xfade=transition=fade:duration=' + XFADE_D +
          ':offset=' + offset.toFixed(1) + '[' + label + '];';
    prev = label;
  }

  // 오버레이 + 페이드 인/아웃
  var BOX_TOP   = H - 230;
  var boxFilter = 'drawbox=x=0:y=' + BOX_TOP + ':w=' + W + ':h=' + (H - BOX_TOP) + ':color=black@0.65:t=fill';
  var drawTexts = overlayLayers.filter(Boolean).join(',');
  var fadeAll   = 'fade=t=in:st=0:d=' + FADE + ',fade=t=out:st=' + (STEP_DUR - FADE) + ':d=' + FADE;
  var postFilters = [boxFilter, drawTexts, fadeAll].filter(Boolean).join(',');
  fc += '[xfinal]' + postFilters + '[vout]';

  var out = path.join(dir, sn + '.mp4');
  await runFFmpeg([
    '-y',
    ...inputs,
    '-filter_complex', fc,
    '-map', '[vout]',
    '-c:v', 'libx264', '-r', String(FPS), '-pix_fmt', 'yuv420p', '-an',
    '-t', String(STEP_DUR),
    out,
  ], 180000);

  framePaths.forEach(function(p) { try { fs.unlinkSync(p); } catch(e) {} });
  return out;
}

// SD 이미지 → Ken Burns (느린 줌인 + 페이드) — 폴백용
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

      // 1. Claude → 포즈 시퀀스 (6개)
      await updateJobDB(sequelize, jobId, { progress: '스텝 ' + (i+1) + '/' + steps.length + ' 포즈 분석 중...' });
      var poseDescs  = await generatePoseSequence(step.tech_name, step.transition_note, step.tech_pos);
      var anchorPrompt = STYLE_ANCHOR + ', ' + poseDescs[0];
      console.log('[chain-ai] step' + (i+1) + ' 포즈:', poseDescs[0].slice(0, 60));

      // 2. 앵커 이미지 생성 (txt2img, 포즈 0)
      await updateJobDB(sequelize, jobId, { progress: '스텝 ' + (i+1) + '/' + steps.length + ' 앵커 이미지 생성 중...' });
      var imgB64 = await callGenerateImage(anchorPrompt);

      var imgPath = path.join(dir, sn + '_img.png');
      if (imgB64) {
        fs.writeFileSync(imgPath, Buffer.from(imgB64, 'base64'));
      }

      // 3. AnimateDiff (실제 모션) → img2img xfade 폴백 → Ken Burns 폴백
      await updateJobDB(sequelize, jobId, { progress: '스텝 ' + (i+1) + '/' + steps.length + ' 모션 애니메이션 생성 중...' });
      // AnimateDiff 프롬프트: 시작 포즈 + 끝 포즈 조합으로 기술 흐름 표현
      var animPrompt = STYLE_ANCHOR + ', ' + poseDescs[0] + ', transitioning to ' + poseDescs[poseDescs.length - 1];
      var clip;
      if (imgB64) {
        try {
          clip = await buildAnimateDiffClip(animPrompt, dir, sn, overlayLayers);
          console.log('[chain-ai] step' + (i+1) + ' AnimateDiff 모션 완료');
        } catch (animErr) {
          console.warn('[chain-ai] AnimateDiff 실패 step' + (i+1) + ', img2img xfade 폴백:', animErr.message);
          try {
            clip = await buildPoseAnimClip(poseDescs, imgB64, dir, sn, overlayLayers);
            console.log('[chain-ai] step' + (i+1) + ' img2img xfade 완료');
          } catch (e) {
            console.error('[chain-ai] img2img 실패 step' + (i+1) + ', Ken Burns 폴백:', e.message);
            clip = await buildKenBurnsClip(imgPath, dir, sn, overlayLayers);
          }
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
