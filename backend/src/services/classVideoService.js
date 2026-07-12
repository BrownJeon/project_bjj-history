/**
 * 수업 내용 → AI 영상 생성 파이프라인
 *
 * 흐름:
 * 1. DB에서 Class + Drill 로딩
 * 2. Claude CLI → 10~12장 이미지 계획 (imagePrompt + type + overlayText)
 * 3. M4 API → SD 이미지 생성 (순차)
 * 4. type='motion': M4 API → SVD 25프레임 → FFmpeg mp4 클립
 *    type='ken_burns': FFmpeg zoompan 효과 클립
 * 5. overlayText 있는 클립: FFmpeg drawtext 텍스트 합성
 * 6. FFmpeg concat → 최종 mp4 → 영구 저장
 */

const { spawn } = require('child_process');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runClaude } = require('./claudeCli');
const { getClassVideoDir, classVideoWebPath, ensureDir } = require('./storage');
const { Class, Drill } = require('../models');

const AI_API_BASE = process.env.AI_API_BASE || 'http://192.168.219.163:8001';
const AI_API_KEY  = process.env.AI_API_KEY  || '';
const FONT_FILE   = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';
const KEN_BURNS_EFFECTS = [
  (frames) => `zoompan=z='min(zoom+0.0010,1.4)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=768x432`,
  (frames) => `zoompan=z='if(lte(zoom,1.0),1.4,max(1.0,zoom-0.0015))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=768x432`,
  (frames) => `zoompan=z='1.3':x='min(max(on*2,0),iw-(iw/zoom))':y='ih/2-(ih/zoom/2)':d=${frames}:s=768x432`,
  (frames) => `zoompan=z='1.3':x='max(iw-(iw/zoom)-on*2,0)':y='ih/2-(ih/zoom/2)':d=${frames}:s=768x432`,
];

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function runProcess(cmd, args, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { timeout: timeoutMs });
    let out = '', err = '';
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { err += d; });
    proc.on('error', e => reject(e));
    proc.on('close', (code, signal) => {
      if (signal) return reject(new Error(`${cmd} 강제 종료 (signal: ${signal})`));
      if (code !== 0) return reject(new Error((err.trim() || out.trim() || `${cmd} 종료 코드: ${code}`).slice(0, 400)));
      resolve(out);
    });
  });
}

async function updateJob(sequelize, jobId, fields) {
  const sets = Object.keys(fields).map(k => `${k}=?`).join(', ');
  await sequelize.query(
    `UPDATE class_video_jobs SET ${sets}, updated_at=NOW() WHERE id=?`,
    { replacements: [...Object.values(fields), jobId] },
  );
}

// ─── Step 1: 수업 데이터 로딩 ─────────────────────────────────────────────────

async function loadClassData(classId) {
  const cls = await Class.findByPk(classId, { raw: true });
  if (!cls) throw new Error(`수업 ID ${classId}를 찾을 수 없습니다`);
  const drill = await Drill.findOne({ where: { class_id: classId }, raw: true });
  return { cls, drill };
}

// ─── Step 2: Claude → 이미지 계획 ─────────────────────────────────────────────

async function buildImagePlan(classData) {
  const { cls, drill } = classData;
  const techList = (() => {
    try { return JSON.parse(drill?.tech || '[]').join(', '); } catch { return drill?.tech || ''; }
  })();
  const noteSummary = (cls.note || cls.voice_transcript || '').slice(0, 800);

  const prompt = `당신은 BJJ(브라질리언 주짓수) 수업 영상 제작 전문가입니다.
아래 수업 데이터를 바탕으로 10~12장 이미지 계획을 JSON 배열로 만드세요.

수업 주제: ${cls.theme || '(없음)'}
날짜: ${cls.date}
주요 포지션: ${drill?.pos || '(없음)'}
주요 기술: ${techList || '(없음)'}
수업 메모: ${noteSummary || '(없음)'}

각 항목 형식:
{
  "id": 숫자(0부터),
  "type": "motion" 또는 "ken_burns",
  "duration": 초(3~6),
  "imagePrompt": "영어 SD 프롬프트 (BJJ 동작/장면 묘사, anime-influenced digital art illustration 스타일)",
  "overlayText": "한국어 텍스트 (없으면 null)"
}

규칙:
- type "motion": BJJ 핵심 동작 장면 3~4장. 움직임이 자연스러운 포지션.
- type "ken_burns": 기술 상세·포인트·배경 6~8장. overlayText로 핵심 내용.
- 첫 번째(오프닝): motion, overlayText = "수업 주제\\n날짜" 형식
- 마지막(엔딩): motion, overlayText = "수업 주제\\n${cls.date}" 형식
- imagePrompt는 반드시 영어, 일러스트 스타일. 예: "BJJ martial arts illustration, two fighters demonstrating half guard underhook sweep, anime-influenced digital art, clean line art, dynamic pose, dojo background"
- overlayText 최대 2줄. 첫 줄 큰 텍스트(주제), 두 번째 줄 작은 텍스트(상세).

raw JSON 배열만 반환. 마크다운 코드블록 없이.`;

  const raw = await runClaude(prompt);
  const jsonStr = raw.trim().replace(/^```[^\n]*\n?/, '').replace(/```$/, '').trim();
  const plan = JSON.parse(jsonStr);
  if (!Array.isArray(plan)) throw new Error('Claude가 유효한 JSON 배열을 반환하지 않았습니다');
  return plan;
}

// ─── Step 3: SD 이미지 생성 ──────────────────────────────────────────────────

async function generateImage(prompt, outPath) {
  const body = JSON.stringify({
    prompt: `BJJ martial arts illustration, ${prompt}, anime-influenced digital art, clean line art, dynamic pose, detailed anatomy, high quality`,
    negative_prompt: 'realistic photography, photo, ugly, deformed, blurry, text, watermark, nsfw, extra limbs, bad anatomy',
    width: 768, height: 432, steps: 20,
  });
  const resp = await fetch(`${AI_API_BASE}/v1/image/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': AI_API_KEY },
    body,
    signal: AbortSignal.timeout(180000),
  });
  if (!resp.ok) throw new Error(`이미지 API 오류 ${resp.status}`);
  const { image_b64 } = await resp.json();
  await fs.writeFile(outPath, Buffer.from(image_b64, 'base64'));
}

async function generateFallbackImage(outPath, index) {
  // ffmpeg 단색 배경 이미지 생성 (PIL 불필요)
  const colors = ['0a1628', '0f2a1e', '1a0a28', '1a1400', '001a28'];
  const color = colors[index % colors.length];
  await runProcess('ffmpeg', [
    '-y', '-f', 'lavfi',
    '-i', `color=color=0x${color}:size=768x432:rate=1:duration=1`,
    '-vframes', '1', '-f', 'image2', outPath,
  ], 15000);
}

// ─── Step 4-A: SVD 모션 클립 ─────────────────────────────────────────────────

async function generateSvdClip(imagePath, outClipPath) {
  const imgB64 = (await fs.readFile(imagePath)).toString('base64');
  const resp = await fetch(`${AI_API_BASE}/v1/video/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': AI_API_KEY },
    body: JSON.stringify({ image_b64: imgB64, fps: 7, steps: 20, motion_bucket_id: 60 }),
    signal: AbortSignal.timeout(600000), // SVD 최대 10분
  });
  if (!resp.ok) throw new Error(`SVD API 오류 ${resp.status}`);
  const { frames_b64 } = await resp.json();

  const frameDir = `${outClipPath}_frames`;
  await fs.mkdir(frameDir, { recursive: true });
  for (let i = 0; i < frames_b64.length; i++) {
    await fs.writeFile(
      path.join(frameDir, `f${String(i).padStart(3, '0')}.png`),
      Buffer.from(frames_b64[i], 'base64'),
    );
  }
  await runProcess('ffmpeg', [
    '-y', '-framerate', '7',
    '-i', path.join(frameDir, 'f%03d.png'),
    '-vf', 'scale=768:432',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast',
    outClipPath,
  ]);
  await fs.rm(frameDir, { recursive: true }).catch(() => {});
}

// ─── Step 4-B: Ken Burns 클립 ────────────────────────────────────────────────

async function generateKenBurnsClip(imagePath, outClipPath, durationSec, effectIndex) {
  const frames = Math.round(durationSec * 25);
  const effect = KEN_BURNS_EFFECTS[effectIndex % KEN_BURNS_EFFECTS.length](frames);
  await runProcess('ffmpeg', [
    '-y', '-loop', '1', '-i', imagePath,
    '-vf', effect,
    '-t', String(durationSec),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-preset', 'fast', '-r', '25',
    outClipPath,
  ], 60000);
}

// ─── Step 5: 텍스트 오버레이 ──────────────────────────────────────────────────

async function addTextOverlay(inputClip, outputClip, text) {
  const lines = text.split('\n').filter(Boolean);
  // textfile= 방식 — 한국어 특수문자 이스케이프 불필요
  const tmpDir = `${outputClip}_txtfiles`;
  fsSync.mkdirSync(tmpDir, { recursive: true });
  const filters = lines.map((line, i) => {
    const txtPath = path.join(tmpDir, `line${i}.txt`);
    fsSync.writeFileSync(txtPath, line, 'utf8');
    const fontSize = i === 0 ? 38 : 24;
    const yPos = i === 0 ? `h*0.70` : `h*0.70+${38 + 10}`;
    return [
      `drawtext=fontfile=${FONT_FILE}`,
      `textfile=${txtPath}`,
      `fontcolor=white`,
      `fontsize=${fontSize}`,
      `x=(w-text_w)/2`,
      `y=${yPos}`,
      `shadowcolor=black@0.8:shadowx=2:shadowy=2`,
      `box=1:boxcolor=black@0.55:boxborderw=10`,
    ].join(':');
  });
  await runProcess('ffmpeg', [
    '-y', '-i', inputClip,
    '-vf', filters.join(','),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast',
    outputClip,
  ], 60000);
  fsSync.rmSync(tmpDir, { recursive: true, force: true });
}

// ─── Step 6: 클립 연결 ───────────────────────────────────────────────────────

async function concatenateClips(clips, outPath) {
  const concatFile = `${outPath}.concat.txt`;
  await fs.writeFile(concatFile, clips.map(p => `file '${p}'`).join('\n'));
  await runProcess('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', concatFile,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-preset', 'fast', '-crf', '22',
    outPath,
  ], 120000);
  await fs.unlink(concatFile).catch(() => {});
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function generateClassVideo(classId, jobId) {
  const { sequelize } = require('../models');
  const tmpDir = `/tmp/class-video-${classId}-${Date.now()}`;
  const imagesDir = path.join(tmpDir, 'images');
  const clipsDir  = path.join(tmpDir, 'clips');
  const finalDir  = path.join(tmpDir, 'final');

  const update = (progress) => updateJob(sequelize, jobId, { progress });

  try {
    await fs.mkdir(imagesDir, { recursive: true });
    await fs.mkdir(clipsDir,  { recursive: true });
    await fs.mkdir(finalDir,  { recursive: true });

    // 1. 수업 데이터 로딩
    await update('수업 데이터 로딩 중...');
    const classData = await loadClassData(classId);

    // 2. Claude → 이미지 계획
    await update('AI 영상 구성 계획 중...');
    const plan = await buildImagePlan(classData);
    await updateJob(sequelize, jobId, { progress: `이미지 계획 완료 (${plan.length}장)`, image_count: plan.length });

    // 3. SD 이미지 생성 (순차)
    for (let i = 0; i < plan.length; i++) {
      await update(`이미지 ${i + 1}/${plan.length} 생성 중...`);
      const imgPath = path.join(imagesDir, `img_${String(i).padStart(2, '0')}.png`);
      try {
        await generateImage(plan[i].imagePrompt, imgPath);
      } catch (e) {
        console.warn(`[classVideo] 이미지 ${i} 생성 실패, 폴백 사용:`, e.message);
        await generateFallbackImage(imgPath, i);
      }
      plan[i]._imgPath = imgPath;
    }

    // 4. 클립 생성
    let kbIndex = 0;
    for (let i = 0; i < plan.length; i++) {
      const item = plan[i];
      const clipPath = path.join(clipsDir, `clip_${String(i).padStart(2, '0')}_raw.mp4`);
      await update(`클립 ${i + 1}/${plan.length} 생성 중 (${item.type})...`);

      if (item.type === 'motion') {
        try {
          await generateSvdClip(item._imgPath, clipPath);
        } catch (e) {
          console.warn(`[classVideo] SVD 클립 ${i} 실패, Ken Burns 폴백:`, e.message);
          await generateKenBurnsClip(item._imgPath, clipPath, item.duration || 4, kbIndex++);
        }
      } else {
        await generateKenBurnsClip(item._imgPath, clipPath, item.duration || 5, kbIndex++);
      }
      item._clipPath = clipPath;
    }

    // 5. 텍스트 오버레이
    await update('텍스트 합성 중...');
    const finalClips = [];
    for (let i = 0; i < plan.length; i++) {
      const item = plan[i];
      if (item.overlayText) {
        const textClipPath = path.join(finalDir, `clip_${String(i).padStart(2, '0')}_text.mp4`);
        await addTextOverlay(item._clipPath, textClipPath, item.overlayText);
        finalClips.push(textClipPath);
      } else {
        finalClips.push(item._clipPath);
      }
    }
    await updateJob(sequelize, jobId, { progress: '영상 합성 중...', clip_count: finalClips.length });

    // 6. 클립 연결
    const tmpVideoPath = path.join(tmpDir, 'output.mp4');
    await concatenateClips(finalClips, tmpVideoPath);

    // 7. 영구 저장
    await update('영상 저장 중...');
    const destDir = getClassVideoDir(classId);
    ensureDir(destDir);
    const destPath = path.join(destDir, 'video.mp4');
    await fs.copyFile(tmpVideoPath, destPath);

    const videoUrl = classVideoWebPath(classId);
    await updateJob(sequelize, jobId, { status: 'done', progress: '완료', video_url: videoUrl });
    console.log(`[classVideo] 클래스 ${classId} 영상 생성 완료: ${videoUrl}`);
  } catch (e) {
    console.error(`[classVideo] 클래스 ${classId} 실패:`, e.message);
    await updateJob(sequelize, jobId, { status: 'error', error: e.message });
  } finally {
    await fs.rm(tmpDir, { recursive: true }).catch(() => {});
  }
}

module.exports = { generateClassVideo };
