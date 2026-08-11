/**
 * BJJ 체인 기술 AI 영상 생성 파이프라인 v3
 *
 * 샘플영상(@jiujitsu_suda) 스타일 기반 재설계:
 * 1. Claude → 기술당 10단계 포즈 시퀀스 ({step, ko, en, sdPrompt})
 * 2. 포즈별 독립 이미지 생성 (M4 SD txt2img → Pollinations 폴백, 576×1024 포트레이트)
 * 3. 포즈별 단독 클립 (4초, 검정 배경, 상단 한/영 텍스트 오버레이)
 * 4. 인트로 + 기술타이틀 + 포즈클립들 + 아웃트로 → concat → chain-{id}.mp4
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

// 영상 규격 (9:16 포트레이트)
const W        = 720;
const H        = 1280;
const FPS      = 30;
const CLIP_DUR = 4;   // 포즈 클립 지속시간(초)
const FADE     = 0.4;

// M4 SD: 432×768 (9:16 포트레이트, M4 height ≤ 768 제한 내 최대)
const M4_IMG_W = 432;
const M4_IMG_H = 768;
// Pollinations: 576×1024 (서버 제한 없음)
const POL_IMG_W = 576;
const POL_IMG_H = 1024;

// 색상 (샘플 스타일)
const ACCENT = '0xFFA500';  // 오렌지 (영문 텍스트용)
const WHITE  = 'white';
const GRAY   = '0x888888';

// SD 스타일 앵커 — @jiujitsu_suda 스타일 (3D 렌더 애니 BJJ 일러스트)
const STYLE_ANCHOR =
  'two bjj practitioners, dark black gi kimono, bald head, pale skin, ' +
  'black background, semi-realistic 3d anime illustration, clean flat shading, ' +
  'athletic body, grappling martial arts scene';

const STYLE_NEGATIVE =
  'realistic photo, colorful background, bright background, text, watermark, logo, ' +
  'blurry, low quality, extra limbs, deformed hands, bad anatomy, ' +
  'mutated, distorted, realistic skin texture, hair, cartoon chibi, nsfw';

// BJJ 포지션 → SD 포즈 컨텍스트 힌트
const BJJ_POSITION_SD_MAP = {
  '마운트':        'full mount position, attacker sitting on defender chest',
  '풀마운트':      'full mount position, attacker sitting on defender chest',
  '풀가드':        'closed guard, bottom player legs wrapped around opponent waist',
  '하프가드':      'half guard, bottom player one leg trapped between opponent legs',
  '사이드 컨트롤': 'side control, attacker perpendicular across defender chest',
  '사이드컨트롤':  'side control, attacker perpendicular across defender chest',
  '백마운트':      'back mount, attacker behind defender chest to back',
  '백':           'back mount, attacker behind defender',
  '니온더벨리':    'knee on belly, attacker one knee pressing opponent stomach',
  '니언더벨리':    'knee on belly, attacker one knee pressing opponent stomach',
  '스탠딩':       'standing, both players upright gripping collar and sleeves',
  '가드':         'guard position, bottom player legs around opponent',
  '클로즈드가드':  'closed guard, legs locked behind opponent back',
  '오픈가드':     'open guard, feet on opponents hips',
  '터틀':         'turtle position, one player on hands and knees',
  '스크램블':     'scramble, both players transitioning positions on knees',
};

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function runFFmpeg(args, timeoutMs) {
  return execFileP('ffmpeg', args, { timeout: timeoutMs || 120000 });
}

// textfile= 방식 drawtext (한국어 이스케이프 불필요)
// sn: 슬라이드 고유명, idx: 슬라이드 내 텍스트 인덱스
function dtFilter({ dir, sn, idx, text, font, size, x, y, color, alpha, borderw }) {
  var p = path.join(dir, sn + '_t' + idx + '.txt');
  fs.writeFileSync(p, String(text), 'utf8');
  return (
    'drawtext=fontfile=' + (font || FONT) +
    ':textfile=' + p +
    ':fontcolor=' + (color || 'white') + '@' + (alpha !== undefined ? alpha : 1) +
    ':fontsize=' + size +
    ':x=' + x + ':y=' + y +
    ':line_spacing=6' +
    ':borderw=' + (borderw || 2) +
    ':bordercolor=black@0.9'
  );
}

async function updateJobDB(sequelize, jobId, fields) {
  const sets = Object.keys(fields).map(function(k) { return k + '=?'; }).join(', ');
  await sequelize.query(
    'UPDATE chain_video_jobs SET ' + sets + ', updated_at=NOW() WHERE id=?',
    { replacements: Object.values(fields).concat([jobId]) }
  );
}

// ── M4 API 이미지 생성 ─────────────────────────────────────────────────────────

async function callGenerateImageM4(sdPrompt) {
  const resp = await fetch(AI_API_BASE + '/v1/image/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': AI_API_KEY },
    body: JSON.stringify({
      prompt: sdPrompt,
      negative_prompt: STYLE_NEGATIVE,
      width: M4_IMG_W, height: M4_IMG_H, steps: 25,
      seed: -1,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error('M4 이미지 API 오류 ' + resp.status);
  const data = await resp.json();
  if (!data.image_b64) throw new Error('M4 API 응답 없음');
  return data.image_b64;
}

// Pollinations.ai 폴백 — 최대 3회 재시도
async function callGenerateImagePollinations(sdPrompt, attempt) {
  attempt = attempt || 0;
  const encoded = encodeURIComponent(sdPrompt);
  const seed    = Math.floor(Math.random() * 999999);
  const url     = 'https://image.pollinations.ai/prompt/' + encoded +
    '?width=' + POL_IMG_W + '&height=' + POL_IMG_H + '&nologo=true&model=flux&seed=' + seed;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!resp.ok) throw new Error('Pollinations API 오류 ' + resp.status);
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 2000) throw new Error('Pollinations 응답 비정상 (' + buf.length + 'B)');
    return buf.toString('base64');
  } catch (e) {
    if (attempt < 2) {
      console.warn('[chain-ai] Pollinations 재시도 ' + (attempt + 1) + ':', e.message);
      return callGenerateImagePollinations(sdPrompt, attempt + 1);
    }
    throw e;
  }
}

// M4 SD → Pollinations 폴백 → null (실패 시 텍스트 전용 클립으로 폴백)
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

// ── 포즈 시퀀스 생성 (Claude) ─────────────────────────────────────────────────

// 기술 하나를 10단계 포즈 시퀀스로 세분화
// 반환: [{step, ko, en, sdPrompt}, ...] (10개)
async function generatePoseSequence(techName, note, techPos) {
  var positions = [];
  try {
    positions = typeof techPos === 'string' ? JSON.parse(techPos || '[]') : (techPos || []);
  } catch(e) {}
  var posCtx = BJJ_POSITION_SD_MAP[positions[0]] || '';

  const prompt =
    'You are a BJJ (Brazilian Jiu-Jitsu) technique animator.\n' +
    'Break down the BJJ technique "' + techName + '" into exactly 10 sequential steps.\n' +
    (posCtx ? 'Starting position context: ' + posCtx + '\n' : '') +
    (note ? 'Technique notes: ' + note + '\n' : '') +
    '\n' +
    'For each step output a JSON object with these exact keys:\n' +
    '- "step": integer (1-10)\n' +
    '- "ko": Korean description of the action (8-15 characters, concise verb phrase)\n' +
    '- "en": English description (4-8 words, imperative)\n' +
    '- "sdPrompt": Stable Diffusion image prompt (15-25 English words)\n' +
    '\n' +
    'Rules for sdPrompt:\n' +
    '- Use BJJ terminology freely (mount, guard, sweep, pass, underhook, overhook, hook, collar grip, sleeve grip, hip escape, shrimp, bridge etc.)\n' +
    '- Describe both "attacker" and "defender" body positions explicitly\n' +
    '- Include key body parts: hips, legs, arms, torso direction\n' +
    '- Use present tense, active voice\n' +
    '- Example: "attacker in half guard, posting right hand on mat, defender bridging hips upward to sweep"\n' +
    '\n' +
    'Output ONLY a valid JSON array of exactly 10 objects. No markdown fences, no explanation.';

  try {
    const raw = (await runClaude(prompt, { timeoutMs: 50000 })).trim();
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr) && arr.length >= 6) {
        const valid = arr.filter(function(item) {
          return item && typeof item.ko === 'string' && typeof item.en === 'string' && typeof item.sdPrompt === 'string';
        });
        if (valid.length >= 6) {
          return valid.slice(0, 12).map(function(item, i) {
            return { step: item.step || (i + 1), ko: item.ko, en: item.en, sdPrompt: item.sdPrompt };
          });
        }
      }
    }
  } catch(e) {
    console.warn('[chain-ai] 포즈 시퀀스 파싱 실패:', e.message);
  }

  // 폴백: 6단계 기본 시퀀스
  var base = posCtx || 'two bjj practitioners grappling on the ground';
  return [
    { step:1,  ko:'시작 포지션',  en:'Starting position',       sdPrompt: base + ', initial contact, both players setting grips' },
    { step:2,  ko:'그립 확보',    en:'Establish grip',           sdPrompt: base + ', attacker gripping collar and sleeve firmly' },
    { step:3,  ko:'무게 이동',    en:'Shift bodyweight',         sdPrompt: base + ', attacker shifting bodyweight forward aggressively' },
    { step:4,  ko:'기술 진입',    en:'Enter technique',          sdPrompt: base + ', attacker initiating the sweep or submission movement' },
    { step:5,  ko:'전환 동작',    en:'Transition movement',      sdPrompt: base + ', both players in mid-transition, hips rotating' },
    { step:6,  ko:'마무리',       en:'Finish and control',        sdPrompt: base + ', attacker establishing dominant final control position' },
  ];
}

// ── 클립 빌더 ─────────────────────────────────────────────────────────────────

// 단일 포즈 클립 (4초): 포트레이트 이미지 + 상단 한/영 텍스트 + 워터마크
// poseObj = {step, ko, en, sdPrompt}
// imgB64  = base64 PNG (null이면 검정 배경 텍스트 전용)
async function buildSinglePoseClip(poseObj, imgB64, dir, sn) {
  var out = path.join(dir, sn + '.mp4');
  var ti  = 0; // 슬라이드 내 텍스트 파일 인덱스
  function mkDt(opts) { return dtFilter(Object.assign({ dir: dir, sn: sn, idx: ti++ }, opts)); }

  var koText = (poseObj.step ? poseObj.step + '. ' : '') + (poseObj.ko || '');
  var enText = poseObj.en || '';

  // 상단 반투명 텍스트 배경박스
  var topBox = 'drawbox=x=0:y=0:w=' + W + ':h=' + Math.round(H * 0.29) + ':color=black@0.72:t=fill';

  // 텍스트 오버레이 (한국어 상단, 영문 그 아래, 워터마크 하단)
  var koFilter = mkDt({ text: koText, font: FONT_BOLD, size: 42,
    x: '(w-text_w)/2', y: Math.round(H * 0.07),
    color: WHITE, alpha: 1, borderw: 3 });
  var enFilter = mkDt({ text: enText, font: FONT, size: 27,
    x: '(w-text_w)/2', y: Math.round(H * 0.18),
    color: ACCENT, alpha: 1, borderw: 2 });
  var markFilter = mkDt({ text: '@BJJ훈련일지', font: FONT, size: 18,
    x: '(w-text_w)/2', y: Math.round(H * 0.92),
    color: GRAY, alpha: 0.65, borderw: 1 });

  var fadeAll   = 'fade=t=in:st=0:d=' + FADE + ',fade=t=out:st=' + (CLIP_DUR - FADE) + ':d=' + FADE;
  var textPart  = [topBox, koFilter, enFilter, markFilter, fadeAll].join(',');

  if (imgB64) {
    var imgPath = path.join(dir, sn + '_img.png');
    fs.writeFileSync(imgPath, Buffer.from(imgB64, 'base64'));
    // 이미지를 포트레이트 720×1280으로 스케일/크롭 후 텍스트 합성
    var scaleVf = 'scale=' + W + ':' + H + ':force_original_aspect_ratio=increase,crop=' + W + ':' + H;
    await runFFmpeg([
      '-y', '-loop', '1', '-i', imgPath,
      '-t', String(CLIP_DUR),
      '-vf', scaleVf + ',' + textPart,
      '-c:v', 'libx264', '-r', String(FPS), '-pix_fmt', 'yuv420p', '-an',
      out,
    ], 60000);
    try { fs.unlinkSync(imgPath); } catch(e) {}
  } else {
    // 이미지 생성 실패 → 검정 배경 + 텍스트 (텍스트 전용, 기존 색상슬라이드보다 나은 폴백)
    await runFFmpeg([
      '-y', '-f', 'lavfi',
      '-i', 'color=color=0x000000:size=' + W + 'x' + H + ':rate=' + FPS + ':duration=' + CLIP_DUR,
      '-vf', 'format=yuv420p,' + textPart,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      out,
    ], 30000);
  }

  return out;
}

// 인트로/아웃트로/기술타이틀 슬라이드 (검정 배경)
async function buildColorSlide(dir, slideName, duration, layerFilters) {
  var out    = path.join(dir, slideName + '.mp4');
  var fadeAll = 'fade=t=in:st=0:d=' + FADE + ',fade=t=out:st=' + (duration - FADE) + ':d=' + FADE;
  var draws  = layerFilters.filter(Boolean).join(',');
  var vf     = 'format=yuv420p,' + fadeAll + (draws ? ',' + draws : '');

  await runFFmpeg([
    '-y', '-f', 'lavfi',
    '-i', 'color=color=0x000000:size=' + W + 'x' + H + ':rate=' + FPS + ':duration=' + duration,
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

  // 슬라이드 내 텍스트 파일 인덱스 (buildColorSlide용)
  var ci = 0;
  function mkDt(sn, opts) { return dtFilter(Object.assign({ dir: dir, sn: sn, idx: ci++ }, opts)); }

  const slides = [];
  const cy     = Math.round(H * 0.46);

  try {
    // ── 인트로 ──
    await updateJobDB(sequelize, jobId, { status: 'generating', progress: '인트로 생성 중...' });
    slides.push(await buildColorSlide(dir, 'intro', 4, [
      mkDt('intro', { text: 'BJJ 훈련일지', font: FONT, size: 22,
        x: '(w-text_w)/2', y: cy - 90, color: ACCENT, alpha: 0.8 }),
      mkDt('intro', { text: chain.name, font: FONT_BOLD, size: 52,
        x: '(w-text_w)/2', y: cy - 20, color: WHITE, alpha: 1 }),
      mkDt('intro', { text: 'AI 기술 시연 영상', font: FONT, size: 20,
        x: '(w-text_w)/2', y: cy + 60, color: WHITE, alpha: 0.5 }),
      mkDt('intro', { text: steps.length + '단계 체인', font: FONT, size: 20,
        x: '(w-text_w)/2', y: cy + 100, color: ACCENT, alpha: 0.55 }),
    ]));

    // ── 기술별 포즈 슬라이드 ──
    for (var i = 0; i < steps.length; i++) {
      var step     = steps[i];
      var techName = step.tech_name || ('Step ' + (i + 1));

      // 기술명 타이틀 슬라이드 (체인에 여러 기술이 있을 때)
      if (steps.length > 1) {
        var tsn = 'tech' + i + '_title';
        slides.push(await buildColorSlide(dir, tsn, 3, [
          mkDt(tsn, { text: (i + 1) + ' / ' + steps.length, font: FONT, size: 22,
            x: '(w-text_w)/2', y: cy - 80, color: ACCENT, alpha: 0.75 }),
          mkDt(tsn, { text: techName, font: FONT_BOLD, size: 46,
            x: '(w-text_w)/2', y: cy - 20, color: WHITE, alpha: 1 }),
        ]));
      }

      // 1. Claude → 10단계 포즈 시퀀스 생성
      await updateJobDB(sequelize, jobId, { progress: '스텝 ' + (i+1) + '/' + steps.length + ': 포즈 시퀀스 분석 중...' });
      var poseObjs = await generatePoseSequence(techName, step.transition_note, step.tech_pos);
      console.log('[chain-ai] 스텝' + (i+1) + ' ' + techName + ' → ' + poseObjs.length + '개 포즈 생성');

      // 2. 포즈별 이미지 + 클립 생성
      for (var j = 0; j < poseObjs.length; j++) {
        var poseObj = poseObjs[j];
        var sn      = 'step' + i + '_pose' + j;
        var prog    = '스텝 ' + (i+1) + '/' + steps.length + ' 포즈 ' + (j+1) + '/' + poseObjs.length;

        // 이미지 생성
        await updateJobDB(sequelize, jobId, { progress: prog + ': 이미지 생성 중...' });
        var sdPrompt = STYLE_ANCHOR + ', ' + (poseObj.sdPrompt || poseObj.en || techName);
        console.log('[chain-ai] ' + sn + ':', sdPrompt.slice(0, 80));
        var imgB64 = await callGenerateImage(sdPrompt);

        // 클립 생성
        await updateJobDB(sequelize, jobId, { progress: prog + ': 클립 렌더 중...' });
        var clip = await buildSinglePoseClip(poseObj, imgB64, dir, sn);
        slides.push(clip);
      }
    }

    // ── 아웃트로 ──
    await updateJobDB(sequelize, jobId, { progress: '아웃트로 생성 중...' });
    slides.push(await buildColorSlide(dir, 'outro', 3, [
      mkDt('outro', { text: chain.name, font: FONT_BOLD, size: 36,
        x: '(w-text_w)/2', y: cy - 30, color: WHITE, alpha: 0.6 }),
      mkDt('outro', { text: 'BJJ 훈련일지', font: FONT, size: 20,
        x: '(w-text_w)/2', y: cy + 28, color: ACCENT, alpha: 0.5 }),
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
    ], 120000);

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
