const express = require('express');
const router  = express.Router();
const { spawn } = require('child_process');
const { runClaude } = require('../lib/claude-cli');

function extractJSONObject(text) {
  const cleaned = text.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON 객체를 찾을 수 없습니다');
  let jsonStr = cleaned.slice(start, end + 1);
  // JSON 문자열 값 내부의 이스케이프되지 않은 줄바꿈 처리
  jsonStr = jsonStr.replace(/"(?:[^"\\]|\\.)*"/g, m =>
    m.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n')
  );
  return JSON.parse(jsonStr);
}

// POST /api/enhance-memo — AI 메모 보완
router.post('/enhance', async (req, res) => {
  const { text, type, instruction } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: '메모 내용이 없습니다' });

  const typeLabels = {
    drill: '기술수업 드릴 메모',
    tech:  '기술 카드 핵심 포인트/메모',
    chain: '기술 체인 설명 메모',
    gp:    '기술연구(게임플랜) 설명 메모'
  };
  const typeLabel = typeLabels[type] || '훈련 메모';
  const instructionLine = instruction?.trim()
    ? `\n추가 요청사항: ${instruction.trim()}\n`
    : '';

  let prompt;
  if (type === 'classFeedback') {
    prompt = `당신은 주짓수(BJJ) 전문 코치입니다.
훈련생이 작성한 수업 기록(드릴 기술 정보 + 전체 메모 + 원문 피드백)을 기반으로
코칭 관점의 종합 피드백을 자연스러운 문체로 작성해주세요.

[피드백 구성]
- [잘한 점] : 드릴에서 시도한 기술·포지션·체인에서 긍정적인 측면을 구체적으로 짚기
- [개선할 점] : 약한 디테일·놓친 포인트·타이밍 등을 구체적 동작 레벨로 지적
- [다음 집중 포인트] : 다음 훈련에서 의도적으로 연습할 기술·드릴·체크 포인트 제안
- 섹션 라벨은 유지하되 내용은 자연스러운 흐름의 서술형
- 원문 피드백이 있으면 톤과 내용을 존중하며 확장, 없으면 처음부터 작성
- BJJ 전문 용어 사용, 과장 없이 훈련생이 실행 가능한 방향

[응답 형식 — 중요]
- enhanced 문자열 안에 JSON 이스케이프 시퀀스(\\n)를 사용해 줄바꿈 가독성을 확보한다
- 섹션([잘한 점]/[개선할 점]/[다음 집중 포인트]) 사이는 \\n\\n (빈 줄 1개)으로 구분
- 각 섹션 내에서 문단이 바뀌면 \\n\\n, 같은 문단에서 줄만 내리려면 \\n 사용
- changes 도 항목마다 \\n 으로 분리해 2~4줄이 각각 새 줄에 보이도록
${instructionLine}
[수업 기록]
${text}

JSON 형식으로만 응답하세요:
{"enhanced":"세 섹션으로 구성된 피드백 전체 (\\n / \\n\\n 줄바꿈 포함)","changes":"핵심 포인트 2~4줄 요약 (\\n 으로 분리)"}`;
  } else if (type === 'classNote') {
    prompt = `당신은 주짓수(BJJ) 전문 트레이너이자 훈련 일지 작성 어시스턴트입니다.
훈련생이 수업 직후 적은 전체 메모를, 아래 [수업 기술 정보]를 맥락으로 삼아 보완해주세요.

[보완 기준]
1. 원문의 핵심 내용과 맥락은 반드시 유지한다
2. 수업 기술 정보(포지션·기술·디테일·체인)와 연결되는 부분은 명시적으로 연결
3. 언급된 기술·동작에 대해 세부 동작 포인트, 그립, 체중 이동, 타이밍 등을 구체화
4. 빠진 중요 세부사항(포지션 전환 조건, 상대 반응에 따른 대응)을 추가
5. 주짓수 전문 용어를 적절히 사용하되, 원문에 없는 용어는 설명과 함께 추가
6. 분량은 원문보다 충실하게, 불필요한 반복은 피한다

[응답 형식 — 중요]
- enhanced 문자열 안에 JSON 이스케이프 시퀀스(\\n)를 사용해 줄바꿈 가독성을 확보
- 문단이 바뀌면 \\n\\n (빈 줄 1개), 같은 문단 내 줄바꿈은 \\n
- 항목 나열(불릿/번호)이 필요하면 각 항목을 새 줄(\\n)로 분리
- changes 는 항목마다 \\n 으로 분리
${instructionLine}
[입력 텍스트]
${text}

JSON 형식으로만 응답하세요:
{"enhanced":"보완된 전체 메모 (\\n / \\n\\n 줄바꿈 포함)","changes":"추가·보완한 내용 2~4줄 설명 (\\n 으로 분리)"}`;
  } else if (type === 'spar') {
    prompt = `당신은 주짓수(BJJ) 전문 코치입니다.
훈련생이 작성한 스파링 세션 데이터를 자연스러운 문체로 코칭 분석해주세요.

[분석 방향]
- 세션 전반의 경향 파악 (상대 벨트·상대별 강점·약점, 탭 비율, 주요 공격/방어 패턴)
- 시도 기술에서 ✓는 성공, ✗는 시도했으나 실패를 의미함. ✗ 항목은 원인과 구체적 보완 방법을 제시
- "부족했던 부분"에 대해 훈련 드릴·체크 포인트·연결 기술을 구체적으로 제안
- ✓ 성공 기술과 강점은 유지·발전 관점에서 언급
- 상대 이름이 있으면 상대별 상황도 분석에 반영
- 섹션을 나누기보다는 자연스러운 흐름의 코칭 멘트로 서술
- BJJ 전문 용어를 적절히 사용하되 어려운 용어는 짧게 설명 병행
- 과장·미화 없이 훈련생이 실행 가능한 방향으로

[응답 형식 — 중요]
- enhanced 문자열 안에 JSON 이스케이프 시퀀스(\\n)를 사용해 줄바꿈 가독성을 확보
- 주제·세션이 바뀌면 \\n\\n (빈 줄 1개)으로 구분
- 같은 주제 내에서 줄만 바꾸려면 \\n
- 항목 나열 시 각 항목은 새 줄(\\n)로 분리
- changes 항목도 \\n 으로 구분
${instructionLine}
[스파링 데이터]
${text}

JSON 형식으로만 응답하세요:
{"enhanced":"코칭 분석 리포트 전체 (\\n / \\n\\n 줄바꿈 포함)","changes":"핵심 인사이트 2~4줄 요약 (\\n 으로 분리)"}`;
  } else {
    prompt = `당신은 주짓수(BJJ) 전문 트레이너이자 훈련 일지 작성 어시스턴트입니다.
훈련생이 수업 직후 기억나는 대로 적은 [${typeLabel}]를 아래 기준으로 보완해주세요.

[보완 기준]
1. 원문의 핵심 내용과 맥락을 반드시 유지한다
2. 언급된 기술·동작에 대해 세부 동작 포인트, 그립, 체중 이동, 타이밍 등을 구체화한다
3. 빠진 중요 세부사항(포지션 전환 조건, 상대 반응에 따른 대응)을 추가한다
4. 코치 피드백이 언급되었다면 그 의미와 적용 방법을 풀어서 설명한다
5. 주짓수 전문 용어를 적절히 사용하되, 원문에 없는 용어는 설명과 함께 추가한다
6. 분량은 원문보다 충실하게 작성하되, 불필요한 반복은 피한다

[응답 형식 — 중요]
- enhanced 문자열 안에 JSON 이스케이프 시퀀스(\\n)를 사용해 줄바꿈 가독성을 확보
- 문단이 바뀌면 \\n\\n (빈 줄 1개), 같은 문단 내 줄바꿈은 \\n
- 항목 나열 시 각 항목을 \\n 으로 분리
- changes 도 항목마다 \\n 으로 분리
${instructionLine}
[원문 메모]
${text}

JSON 형식으로만 응답하세요:
{"enhanced":"보완된 전체 메모 (\\n / \\n\\n 줄바꿈 포함)","changes":"추가·보완한 내용 2~4줄 설명 (\\n 으로 분리)"}`;
  }

  try {
    const raw  = await runClaude(prompt);
    const data = extractJSONObject(raw);
    res.json(data);
  } catch(e) {
    console.error('[enhance-memo/enhance]', e.message);
    if (e.message.includes('claude CLI')) return res.status(503).json({ error: e.message });
    if (e.message.includes('JSON')) return res.status(500).json({ error: 'AI 응답 파싱 실패. 다시 시도해주세요.' });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/enhance-memo/videos — 관련 영상 검색 (YouTube 검색 쿼리 생성)
router.post('/videos', async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: '메모 내용이 없습니다' });

  const prompt = `당신은 주짓수(BJJ) 전문가입니다.
아래 훈련 메모에서 언급된 기술을 분석해 YouTube에서 검색하면 좋은 검색어를 최대 3개 추출해주세요.

[조건]
- 메모에서 실제로 언급된 기술·포지션·개념을 기반으로 구체적인 검색어를 만든다
- 검색어는 영어로 작성한다 (YouTube BJJ 영상은 영어 콘텐츠가 풍부)
- 메모에 관련 기술이 전혀 없으면 빈 배열을 반환한다

[훈련 메모]
${text}

JSON 형식으로만 응답하세요:
{"queries":[{"query":"half guard underhook sweep BJJ","reason":"언급된 기술 설명"}]}
관련 기술이 없으면: {"queries":[]}`;

  try {
    const raw  = await runClaude(prompt);
    const data = extractJSONObject(raw);
    const queries = Array.isArray(data.queries) ? data.queries.slice(0, 3) : [];
    const videos  = queries.map(q => ({
      title:  q.query,
      url:    `https://www.youtube.com/results?search_query=${encodeURIComponent(q.query)}`,
      reason: q.reason || ''
    }));
    res.json({ videos });
  } catch(e) {
    console.error('[enhance-memo/videos]', e.message);
    if (e.message.includes('claude CLI')) return res.status(503).json({ error: e.message });
    if (e.message.includes('JSON')) return res.status(500).json({ error: 'AI 응답 파싱 실패. 다시 시도해주세요.' });
    res.status(500).json({ error: e.message });
  }
});

// ── YouTube oEmbed로 제목 수집 ──
const fs = require('fs/promises');

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
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(err.trim() || `${cmd} 종료 코드: ${code}`));
      resolve(out);
    });
  });
}

// ── 오디오 트랙 존재 여부 확인 ──
async function hasAudioTrack(videoPath) {
  try {
    const out = await runProcess('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=codec_type',
      '-of', 'csv=p=0',
      videoPath
    ], 10000);
    return out.trim() === 'audio';
  } catch { return false; }
}

// ── ffmpeg로 등간격 프레임 추출 ──
async function extractFrames(videoPath, framePrefix, count = 6) {
  let duration = 30;
  try {
    const durOut = await runProcess('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath
    ], 30000);
    duration = parseFloat(durOut.trim()) || 30;
  } catch {}

  const interval = (duration * 0.9) / count;
  const start    = duration * 0.05;
  const frames   = [];
  for (let i = 0; i < count; i++) {
    const ts  = (start + interval * i).toFixed(2);
    const out = `${framePrefix}-frame-${i + 1}.jpg`;
    await runProcess('ffmpeg', [
      '-y', '-ss', ts, '-i', videoPath,
      '-frames:v', '1', '-q:v', '3',
      out
    ], 30000);
    frames.push(out);
  }
  return frames;
}

// ── Whisper 전사만 (best-effort, 실패 시 빈 문자열) ──
async function getWhisperTranscript(videoPath, audioPath, txtPath) {
  try {
    await runProcess('ffmpeg', ['-y', '-i', videoPath, '-vn', '-q:a', '5', audioPath], 60000);
    await runProcess('whisper', [
      audioPath, '--model', 'small',
      '--output_format', 'txt', '--output_dir', '/tmp',
      '--verbose', 'False'
    ], 240000);
    const transcript = (await fs.readFile(txtPath, 'utf-8').catch(() => '')).trim();
    return transcript;
  } catch (e) {
    console.log('[analyze-video] Whisper 스킵:', e.message);
    return '';
  }
}

// ── 프레임 + (선택) 음성 전사 → Claude 비전 분석 ──
async function runCombinedAnalysis(videoPath, framePrefix, url, transcript) {
  const frames = await extractFrames(videoPath, framePrefix, 6);
  const frameList = frames.map((f, i) => `${i + 1}. ${f}`).join('\n');

  const snippet = transcript
    ? (transcript.length > 3500 ? transcript.slice(0, 3500) + '...' : transcript)
    : '';
  const transcriptBlock = snippet
    ? `\n[음성 전사 (참고용, 보조 단서)]\n${snippet}\n`
    : '\n[음성 전사]\n(없음 — 프레임 이미지 기반으로만 분석)\n';

  const prompt = `당신은 주짓수(BJJ) 전문가입니다. 아래 이미지는 한 BJJ 영상에서 시간 순서대로 추출한 프레임이며, 음성 전사가 있을 수도 있습니다.
두 정보를 종합해 영상이 다루는 핵심 내용을 2~4줄로 요약해주세요.

[분석 방향]
- **프레임 이미지(시각 정보)를 주축으로 분석**. 보이는 포지션·자세·기술·전환을 구체적으로 식별
- 음성 전사는 보조 단서로만 사용. 숫자 카운팅·무의미한 발화는 무시하고, 기술명·포인트가 언급된 경우에만 활용
- 음성이 없거나 무의미해도 프레임만으로 충분히 요약 가능해야 함
- 시각과 음성이 상충하면 **시각 정보 우선**
- BJJ 전문 용어 사용 (사이드 컨트롤, 마운트, 가드, 하프가드, 패스, 스윕, 서브미션 등)
- 과장 없이 간결하게 (3~6문장)
- 응답은 평문만 (JSON 래핑·마크다운 헤더 금지)

[응답 형식]
- 주제가 바뀌면 줄바꿈(빈 줄 1개)으로 구분
- 항목 나열 시 각 항목을 새 줄에 배치

[영상 URL]
${url}

[프레임 이미지 파일 경로 — Read 툴로 각 파일을 순서대로 읽어 시각 분석해주세요]
${frameList}
${transcriptBlock}`;

  const out = (await runClaude(prompt, { tools: 'Read' })).trim();
  return { description: out, frames };
}

// ── 통합 분석: 항상 프레임 비전 + 오디오 있으면 Whisper 병행 ──
async function analyzeVideo(url) {
  const rand      = Math.random().toString(36).slice(2, 8);
  const tmpBase   = `/tmp/bjj-video-${Date.now()}-${rand}`;
  const videoPath = `${tmpBase}.mp4`;
  const audioPath = `${tmpBase}.mp3`;
  const txtPath   = `${tmpBase}.txt`;
  let createdFrames = [];

  try {
    // 1) yt-dlp로 영상(오디오+비디오) 다운로드
    await runProcess('yt-dlp', [
      '-f', 'mp4/best',
      '-o', videoPath,
      '--no-warnings',
      url
    ], 120000);

    // 2) 오디오 트랙 확인 + Whisper 전사 (오디오 있을 때만)
    const hasAudio = await hasAudioTrack(videoPath);
    const transcript = hasAudio
      ? await getWhisperTranscript(videoPath, audioPath, txtPath)
      : '';
    console.log('[analyze-video] hasAudio=', hasAudio, 'transcriptLen=', transcript.length, 'url=', url);

    // 3) 프레임 비전 분석 (+ 음성 전사 병합)
    const { description, frames } = await runCombinedAnalysis(videoPath, tmpBase, url, transcript);
    createdFrames = frames;
    const method = transcript ? 'vision+audio' : 'vision';
    return { description, method };
  } finally {
    for (const ext of ['.mp4', '.mp3', '.txt', '.srt', '.vtt', '.tsv', '.json']) {
      await fs.unlink(tmpBase + ext).catch(() => {});
    }
    for (const f of createdFrames) await fs.unlink(f).catch(() => {});
  }
}

// POST /api/enhance-memo/analyze-video — URL 영상을 yt-dlp+Whisper로 분석
router.post('/analyze-video', async (req, res) => {
  const { url } = req.body;
  if (!url?.trim()) return res.status(400).json({ error: 'URL을 입력해주세요' });
  if (!/(youtube\.com|youtu\.be|instagram\.com)/.test(url)) {
    return res.status(400).json({ error: 'YouTube 또는 Instagram URL만 지원됩니다' });
  }
  try {
    const result = await analyzeVideo(url);
    res.json(result);
  } catch(e) {
    console.error('[enhance-memo/analyze-video]', e.message);
    if (e.message.includes('claude CLI'))   return res.status(503).json({ error: e.message });
    if (e.message.includes('설치되어 있지')) return res.status(503).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
