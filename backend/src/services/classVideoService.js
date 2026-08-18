/**
 * 수업 내용 → AI 영상 생성 파이프라인 v2
 *
 * @jiujitsu_suda 샘플 스타일:
 * 1. DB에서 Class + Drill 로딩
 * 2. Claude → 수업 내용 기반 10~12단계 포즈 시퀀스 ({step, ko, en, sdPrompt})
 * 3. M4 SD / Pollinations → 포즈별 정적 이미지 (432×768 포트레이트)
 * 4. 포즈별 단독 클립 (4초, 정지 이미지, 상단 한/영 텍스트 오버레이)
 * 5. 인트로 + 포즈클립 + 아웃트로 → concat → video.mp4
 *
 * 원칙: 애니메이션·Ken Burns·SVD 없음 — 각 단계를 명확한 정적 이미지로 표현
 */

const { execFile } = require('child_process');
const fs    = require('fs');
const path  = require('path');
const { promisify } = require('util');
const { runClaude } = require('./claudeCli');
const { getClassVideoDir, classVideoWebPath, ensureDir } = require('./storage');
const { Class, Drill } = require('../models');

const execFileP = promisify(execFile);

const AI_API_BASE = process.env.AI_API_BASE || 'http://192.168.219.100:8001';
const AI_API_KEY  = process.env.AI_API_KEY  || '';
const FONT        = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
const FONT_BOLD   = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';

// 영상 규격 (9:16 포트레이트 — 샘플영상 동일)
const W        = 720;
const H        = 1280;
const FPS      = 30;
const CLIP_DUR = 4;
const FADE     = 0.4;

// 이미지 생성 규격
const M4_IMG_W  = 432;
const M4_IMG_H  = 768;   // M4 height ≤ 768 제한
const POL_IMG_W = 576;
const POL_IMG_H = 1024;

// 색상
const ACCENT = '0xFFA500';
const WHITE  = 'white';
const GRAY   = '0x888888';

// SD 스타일 앵커 (chainAiVideoGenerator와 동일)
const STYLE_ANCHOR =
  'two bjj practitioners, dark black gi kimono, bald head, pale skin, ' +
  'black background, semi-realistic 3d anime illustration, clean flat shading, ' +
  'athletic body, grappling martial arts scene';

const STYLE_NEGATIVE =
  'realistic photo, colorful background, bright background, text, watermark, logo, ' +
  'blurry, low quality, extra limbs, deformed hands, bad anatomy, ' +
  'mutated, distorted, realistic skin texture, hair, cartoon chibi, nsfw';

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function runFFmpeg(args, timeoutMs) {
  return execFileP('ffmpeg', args, { timeout: timeoutMs || 120000 });
}

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

async function updateJob(sequelize, jobId, fields) {
  const sets = Object.keys(fields).map(function(k) { return k + '=?'; }).join(', ');
  await sequelize.query(
    'UPDATE class_video_jobs SET ' + sets + ', updated_at=NOW() WHERE id=?',
    { replacements: Object.values(fields).concat([jobId]) }
  );
}

// ── 이미지 생성 ───────────────────────────────────────────────────────────────

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
      console.warn('[classVideo] Pollinations 재시도 ' + (attempt + 1) + ':', e.message);
      return callGenerateImagePollinations(sdPrompt, attempt + 1);
    }
    throw e;
  }
}

async function callGenerateImage(sdPrompt) {
  try {
    const b64 = await callGenerateImageM4(sdPrompt);
    console.log('[classVideo] M4 SD 이미지 생성 성공');
    return b64;
  } catch (e) {
    console.warn('[classVideo] M4 SD 실패, Pollinations 폴백:', e.message);
  }
  try {
    const b64 = await callGenerateImagePollinations(sdPrompt);
    console.log('[classVideo] Pollinations 이미지 생성 성공');
    return b64;
  } catch (e) {
    console.error('[classVideo] Pollinations 도 실패:', e.message);
    return null;
  }
}

// ── 수업 데이터 로딩 ──────────────────────────────────────────────────────────

async function loadClassData(classId) {
  const cls = await Class.findByPk(classId, { raw: true });
  if (!cls) throw new Error('수업 ID ' + classId + '를 찾을 수 없습니다');
  const drill = await Drill.findOne({ where: { class_id: classId }, raw: true });
  return { cls, drill };
}

// ── Claude → 수업 기반 포즈 시퀀스 ──────────────────────────────────────────────

// 수업 내용을 10~12 단계 포즈 시퀀스로 세분화
// 반환: [{step, ko, en, sdPrompt}, ...]
async function buildPoseSequence(classData) {
  const { cls, drill } = classData;
  var techList = '';
  try { techList = JSON.parse(drill && drill.tech || '[]').join(', '); } catch(e) { techList = (drill && drill.tech) || ''; }
  var noteSummary = ((cls.note || cls.voice_transcript || '')).slice(0, 600);

  const prompt =
    'You are a BJJ (Brazilian Jiu-Jitsu) technique animator.\n' +
    'Based on this training session, break down the main techniques into 10 clear sequential steps.\n' +
    '\n' +
    'Training session info:\n' +
    '- Theme: ' + (cls.theme || '(없음)') + '\n' +
    '- Date: ' + cls.date + '\n' +
    '- Main position: ' + ((drill && drill.pos) || '(없음)') + '\n' +
    '- Techniques practiced: ' + (techList || '(없음)') + '\n' +
    '- Class notes: ' + (noteSummary || '(없음)') + '\n' +
    '\n' +
    'For each step output a JSON object with:\n' +
    '- "step": integer (1-10)\n' +
    '- "ko": Korean action description (8-15 characters, concise)\n' +
    '- "en": English description (4-8 words, imperative)\n' +
    '- "sdPrompt": Stable Diffusion image prompt (15-25 English words)\n' +
    '\n' +
    'Rules for sdPrompt:\n' +
    '- Use BJJ terminology (mount, guard, sweep, pass, underhook, overhook, collar grip, sleeve grip, hip escape, bridge, shrimp, etc.)\n' +
    '- Describe both "attacker" and "defender" body positions explicitly\n' +
    '- Include body parts: hips, legs, arms, torso direction\n' +
    '- Use present tense, active voice\n' +
    '- Example: "attacker in half guard posting right hand on mat, defender bridging hips upward"\n' +
    '\n' +
    'Output ONLY a valid JSON array of exactly 10 objects. No markdown, no explanation.';

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
    console.warn('[classVideo] 포즈 시퀀스 파싱 실패:', e.message);
  }

  // 폴백: 수업 주제 기반 기본 6단계
  var theme = cls.theme || '기술 훈련';
  return [
    { step:1, ko:'시작 포지션',  en:'Starting position',     sdPrompt: 'two bjj practitioners standing, establishing grips on collar and sleeve' },
    { step:2, ko:'포지션 진입',  en:'Enter position',         sdPrompt: 'bjj practitioner pulling opponent into guard position on the mat' },
    { step:3, ko:'그립 확보',    en:'Establish grip',          sdPrompt: 'bjj practitioner in guard gripping collar and sleeve firmly' },
    { step:4, ko:'기술 시도',    en:'Attempt technique',       sdPrompt: 'bjj practitioner initiating sweep from guard, hip movement starting' },
    { step:5, ko:'전환 동작',    en:'Transition movement',     sdPrompt: 'bjj practitioners in mid-transition, one sweeping the other' },
    { step:6, ko:'포지션 완성',  en:'Complete position',       sdPrompt: 'bjj practitioner completing sweep, establishing top control position' },
  ];
}

// ── 클립 빌더 ─────────────────────────────────────────────────────────────────

// 단일 포즈 클립 (4초, 정적 이미지): 상단 한/영 텍스트 오버레이
// poseObj = {step, ko, en}
// imgB64  = base64 PNG (null이면 검정 배경)
async function buildStaticPoseClip(poseObj, imgB64, dir, sn) {
  var out = path.join(dir, sn + '.mp4');
  var ti  = 0;
  function mkDt(opts) { return dtFilter(Object.assign({ dir: dir, sn: sn, idx: ti++ }, opts)); }

  var koText = (poseObj.step ? poseObj.step + '. ' : '') + (poseObj.ko || '');
  var enText = poseObj.en || '';

  var topBox    = 'drawbox=x=0:y=0:w=' + W + ':h=' + Math.round(H * 0.29) + ':color=black@0.72:t=fill';
  var koFilter  = mkDt({ text: koText, font: FONT_BOLD, size: 42,
    x: '(w-text_w)/2', y: Math.round(H * 0.07),
    color: WHITE, alpha: 1, borderw: 3 });
  var enFilter  = mkDt({ text: enText, font: FONT, size: 27,
    x: '(w-text_w)/2', y: Math.round(H * 0.18),
    color: ACCENT, alpha: 1, borderw: 2 });
  var markFilter = mkDt({ text: '@BJJ훈련일지', font: FONT, size: 18,
    x: '(w-text_w)/2', y: Math.round(H * 0.92),
    color: GRAY, alpha: 0.65, borderw: 1 });

  var fadeAll  = 'fade=t=in:st=0:d=' + FADE + ',fade=t=out:st=' + (CLIP_DUR - FADE) + ':d=' + FADE;
  var textPart = [topBox, koFilter, enFilter, markFilter, fadeAll].join(',');

  if (imgB64) {
    var imgPath = path.join(dir, sn + '_img.png');
    fs.writeFileSync(imgPath, Buffer.from(imgB64, 'base64'));
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
    // 이미지 없음 → 검정 배경 + 텍스트
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

// 인트로/아웃트로 슬라이드 (검정 배경)
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

// ── 메인 파이프라인 ───────────────────────────────────────────────────────────

async function generateClassVideo(classId, jobId) {
  const { sequelize } = require('../models');
  const update = function(progress) { return updateJob(sequelize, jobId, { progress: progress }); };

  const dir = '/tmp/class-video-' + classId + '-' + Date.now();
  fs.mkdirSync(dir, { recursive: true });

  var ci = 0;
  function mkDt(sn, opts) { return dtFilter(Object.assign({ dir: dir, sn: sn, idx: ci++ }, opts)); }

  const slides = [];
  const cy     = Math.round(H * 0.46);

  try {
    // 1. 수업 데이터 로딩
    await update('수업 데이터 로딩 중...');
    const classData = await loadClassData(classId);
    const cls = classData.cls;
    const dateStr = (cls.date || '').slice(0, 10);

    // 2. 인트로
    await update('인트로 생성 중...');
    slides.push(await buildColorSlide(dir, 'intro', 4, [
      mkDt('intro', { text: 'BJJ 훈련일지', font: FONT, size: 22,
        x: '(w-text_w)/2', y: cy - 95, color: ACCENT, alpha: 0.8 }),
      mkDt('intro', { text: cls.theme || '수업 기록', font: FONT_BOLD, size: 46,
        x: '(w-text_w)/2', y: cy - 25, color: WHITE, alpha: 1 }),
      mkDt('intro', { text: dateStr, font: FONT, size: 22,
        x: '(w-text_w)/2', y: cy + 50, color: WHITE, alpha: 0.55 }),
    ]));

    // 3. Claude → 수업 내용 기반 포즈 시퀀스 생성
    await update('AI 기술 시퀀스 분석 중...');
    const poseObjs = await buildPoseSequence(classData);
    console.log('[classVideo] 포즈 시퀀스 ' + poseObjs.length + '개 생성');
    await updateJob(sequelize, jobId, { progress: '포즈 시퀀스 완료 (' + poseObjs.length + '단계)', image_count: poseObjs.length });

    // 4. 포즈별 이미지 + 정적 클립 생성
    for (var i = 0; i < poseObjs.length; i++) {
      var poseObj = poseObjs[i];
      var sn      = 'pose' + i;
      var prog    = '포즈 ' + (i + 1) + '/' + poseObjs.length;

      await update(prog + ': 이미지 생성 중...');
      var sdPrompt = STYLE_ANCHOR + ', ' + (poseObj.sdPrompt || poseObj.en || cls.theme || 'bjj grappling');
      console.log('[classVideo] ' + sn + ':', sdPrompt.slice(0, 80));
      var imgB64 = await callGenerateImage(sdPrompt);

      await update(prog + ': 클립 렌더 중...');
      var clip = await buildStaticPoseClip(poseObj, imgB64, dir, sn);
      slides.push(clip);
    }

    // 5. 아웃트로
    await update('아웃트로 생성 중...');
    slides.push(await buildColorSlide(dir, 'outro', 3, [
      mkDt('outro', { text: cls.theme || '수업 기록', font: FONT_BOLD, size: 36,
        x: '(w-text_w)/2', y: cy - 30, color: WHITE, alpha: 0.6 }),
      mkDt('outro', { text: dateStr, font: FONT, size: 20,
        x: '(w-text_w)/2', y: cy + 28, color: ACCENT, alpha: 0.5 }),
    ]));

    // 6. Concat
    await update('영상 합치는 중...');
    var listPath = path.join(dir, 'list.txt');
    fs.writeFileSync(listPath, slides.map(function(p) { return "file '" + p + "'"; }).join('\n'));

    var destDir  = getClassVideoDir(classId);
    ensureDir(destDir);
    var destPath = path.join(destDir, 'video.mp4');

    await runFFmpeg([
      '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
      '-c', 'copy', destPath,
    ], 120000);

    var videoUrl = classVideoWebPath(classId);
    await updateJob(sequelize, jobId, { status: 'done', progress: '완료', video_url: videoUrl });
    console.log('[classVideo] 클래스 ' + classId + ' 완료: ' + videoUrl);

  } catch (e) {
    console.error('[classVideo] 클래스 ' + classId + ' 실패:', e.message);
    await updateJob(sequelize, jobId, { status: 'error', error: e.message });
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch(e) {}
  }
}

module.exports = { generateClassVideo };
