const { spawn } = require('child_process');
const fs     = require('fs/promises');
const fsSync = require('fs');
const path   = require('path');
const { runClaude } = require('./claudeCli');
const { extractJSONObject } = require('../utils/extractJson');

function runProcess(cmd, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { timeout: timeoutMs });
    let err = '', out = '';
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { err += d; });
    proc.on('error', e => {
      if (e.code === 'ENOENT') reject(new Error(`${cmd} 명령이 설치되어 있지 않습니다`));
      else reject(e);
    });
    proc.on('close', (code, signal) => {
      // signal이 있으면 timeout 등 강제 종료 — stderr 무시하고 명시적 에러
      if (signal) return reject(new Error(`${cmd} 강제 종료 (signal: ${signal})`));
      // exit code != 0 이면 실패 — stderr에서 Whisper progress/warning 제거 후 진짜 에러만 추출
      if (code !== 0) {
        const realErr = err.split('\n')
          .filter(l => !l.includes('UserWarning') && !l.includes('warnings.warn') &&
                       !l.includes('%|') && !l.includes('frames/s') && l.trim())
          .join('\n').trim();
        return reject(new Error(realErr || `${cmd} 종료 코드: ${code}`));
      }
      resolve(out);
    });
  });
}

// 오디오 파일 → 10분 청크 분할 → 순차 Whisper → 전문 반환
// onChunkDone(partialTranscript): 청크 완료 시 중간 저장 콜백
async function transcribeLongAudio(audioPath, onChunkDone) {
  const ts       = Date.now();
  const normPath = `/tmp/voice-norm-${ts}.mp3`;
  const chunkDir = `/tmp/voice-chunks-${ts}`;
  fsSync.mkdirSync(chunkDir, { recursive: true });

  try {
    // 1. 정규화 (16kHz mono MP3)
    console.log('[voice] ffmpeg 정규화 시작');
    await runProcess('ffmpeg', [
      '-y', '-i', audioPath,
      '-ar', '16000', '-ac', '1', '-q:a', '5', normPath,
    ], 120000);

    // 2. 10분(600초) 단위 분할
    console.log('[voice] 청크 분할 시작');
    await runProcess('ffmpeg', [
      '-y', '-i', normPath,
      '-f', 'segment', '-segment_time', '600',
      '-c', 'copy', `${chunkDir}/chunk-%03d.mp3`,
    ], 60000);

    const chunks = fsSync.readdirSync(chunkDir)
      .filter(f => f.endsWith('.mp3'))
      .sort();
    console.log(`[voice] 청크 수: ${chunks.length}`);

    // 3. 청크별 Whisper 순차 처리
    let fullTranscript = '';
    for (let i = 0; i < chunks.length; i++) {
      const chunkPath = path.join(chunkDir, chunks[i]);
      const chunkBase = chunks[i].replace('.mp3', '');
      console.log(`[voice] Whisper 처리 중 ${i + 1}/${chunks.length}: ${chunks[i]}`);

      await runProcess('whisper', [
        chunkPath,
        '--model', 'small',
        '--output_format', 'txt',
        '--output_dir', chunkDir,
        '--language', 'ko',
        // '--verbose False' 는 argparse에서 문자열로 인식되어 verbose를 활성화시킴 — 제거
      ], 1800000); // 청크당 최대 30분 (CPU 처리 속도 감안)

      const txtPath = path.join(chunkDir, `${chunkBase}.txt`);
      const chunkText = (await fs.readFile(txtPath, 'utf-8').catch(() => '')).trim();
      if (chunkText) {
        fullTranscript += (fullTranscript ? '\n' : '') + chunkText;
      }
      await onChunkDone?.(fullTranscript);
    }

    console.log(`[voice] 전사 완료 (${fullTranscript.length}자)`);
    return fullTranscript;
  } finally {
    await fs.rm(chunkDir, { recursive: true }).catch(() => {});
    await fs.unlink(normPath).catch(() => {});
  }
}

// 전사본 → BJJ 수업 구조화 JSON
async function structureClassContent(transcript) {
  const snippet = transcript.length > 8000
    ? transcript.slice(0, 8000) + '\n...(이하 생략)'
    : transcript;

  const prompt = `당신은 주짓수(BJJ) 전문 코치입니다.
아래는 BJJ 수업 전체 녹음의 전사 텍스트입니다.
수업에서 다룬 내용을 BJJ 훈련일지 형식으로 구조화해주세요.

[분석 방향]
- 수업 테마(theme): 한 줄로 핵심 주제 요약 (예: "하프가드 언더훅 스윕 시리즈")
- 노트(note): 동작 순서·그립·체중이동·타이밍 등 구체적 포인트 정리 (\\n 줄바꿈)
- 주요 포지션(drillPos): 수업에서 가장 많이 다룬 포지션 1개
- 기술 목록(techniques): 언급된 BJJ 기술명 (한국어, 최대 5개)
- 영상 검색어(videoQueries): 관련 YouTube 검색어 (영어, 최대 3개)

[전사 텍스트]
${snippet}

JSON 형식으로만 응답하세요:
{"theme":"수업 테마","note":"핵심 내용 (\\n 줄바꿈)","drillPos":"주요 포지션","techniques":["기술1","기술2"],"videoQueries":[{"query":"영어 검색어","reason":"이유"}]}`;

  const raw = await runClaude(prompt, { timeoutMs: 300000 });
  return extractJSONObject(raw);
}

module.exports = { transcribeLongAudio, structureClassContent };
