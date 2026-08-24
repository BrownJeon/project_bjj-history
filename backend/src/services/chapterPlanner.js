// 챕터 판단 — task-007 Phase 1
// 우선순위 1(유튜브 제작자 챕터) → 2(자막 의미 분할) → 3(15장 시각 분석) → 4(단일 챕터)
// + 공통 보정(최소60초/최대12분/상한24챕터/gap·overlap 제거) + 저confidence 중립 라벨
const { runClaude: defaultRunClaude } = require('./claudeCli');
const { compressGaps } = require('./vttParser');
const { extractJSONObject } = require('../utils/extractJson');

const MIN_CHAPTER_SEC = 60;
const MAX_CHAPTER_SEC = 12 * 60;
const MAX_CHAPTERS = 24;
const LOW_CONFIDENCE_THRESHOLD = 60; // 0~100 스케일, 설계서 기준 0.6 미만

function fmtMmSs(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function lowConfidenceLabel(idx, startSec, endSec) {
  return `구간 ${idx + 1} (${fmtMmSs(startSec)}~${fmtMmSs(endSec)})`;
}

function parseMmSs(str) {
  if (typeof str === 'number') return Math.floor(str);
  const m = String(str || '').trim().match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  if (m[3] != null) return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// utils/extractJson.js의 공용 extractJSONObject를 감싸는 얇은 래퍼 — 이 파일의 기존 호출부들은
// "파싱 실패 시 null" 관례(예외 아님)로 작성돼 있어 그 관례만 유지한다(task-008: voiceAnalysis.js의
// extractJSONObject를 공용화해 재사용 — 3번째 중복 구현을 만들지 않기 위해 로직 자체는 승격된 것 사용).
function safeExtractJson(raw) {
  try { return extractJSONObject(String(raw || '')); } catch { return null; }
}

function singleChapterFallback(durationSec) {
  return [{ idx: 0, start_sec: 0, end_sec: Math.max(1, Math.floor(durationSec) || 1), title: '전체 영상', source: 'single', confidence: 100 }];
}

// 공통 보정: 클램프 → gap/overlap 제거(연속 커버리지화) → 최소길이 병합 → 최대길이 분할 → 상한 병합 → idx/라벨 부여
function applyCommonCorrections(rawChapters, durationSec) {
  const dur = Math.max(1, Math.floor(durationSec) || 0);
  if (!rawChapters?.length) return singleChapterFallback(dur);

  let chs = rawChapters
    .map(c => ({
      ...c,
      start_sec: Math.max(0, Math.min(dur, Math.floor(c.start_sec))),
      end_sec:   Math.max(0, Math.min(dur, Math.floor(c.end_sec))),
    }))
    .filter(c => c.end_sec > c.start_sec)
    .sort((a, b) => a.start_sec - b.start_sec);
  if (!chs.length) return singleChapterFallback(dur);

  // gap·overlap 제거 — 연속 커버리지로 정규화
  chs[0].start_sec = 0;
  for (let i = 1; i < chs.length; i++) chs[i].start_sec = chs[i - 1].end_sec;
  chs[chs.length - 1].end_sec = dur;
  chs = chs.filter(c => c.end_sec > c.start_sec);
  if (!chs.length) return singleChapterFallback(dur);

  // 최소 60초 미만 → 이웃과 병합
  let merged = true;
  while (merged && chs.length > 1) {
    merged = false;
    for (let i = 0; i < chs.length; i++) {
      if (chs[i].end_sec - chs[i].start_sec < MIN_CHAPTER_SEC) {
        if (i === chs.length - 1) {
          chs[i - 1].end_sec = chs[i].end_sec;
          chs.splice(i, 1);
        } else {
          const next = chs[i + 1];
          const keepCur = (chs[i].confidence || 0) >= (next.confidence || 0);
          chs[i + 1] = {
            ...next,
            start_sec: chs[i].start_sec,
            title: keepCur ? chs[i].title : next.title,
            confidence: Math.max(chs[i].confidence || 0, next.confidence || 0),
          };
          chs.splice(i, 1);
        }
        merged = true;
        break;
      }
    }
  }

  // 최대 12분 초과 → 균등 재분할
  const split = [];
  for (const c of chs) {
    const len = c.end_sec - c.start_sec;
    if (len <= MAX_CHAPTER_SEC) { split.push(c); continue; }
    const parts = Math.ceil(len / MAX_CHAPTER_SEC);
    const partLen = Math.ceil(len / parts);
    for (let p = 0; p < parts; p++) {
      const s = c.start_sec + p * partLen;
      const e = p === parts - 1 ? c.end_sec : Math.min(c.end_sec, s + partLen);
      if (e <= s) continue;
      split.push({ ...c, start_sec: s, end_sec: e, title: parts > 1 ? `${c.title} (${p + 1}/${parts})` : c.title });
    }
  }
  chs = split.length ? split : chs;

  // 챕터 수 상한 24 — 초과 시 가장 짧은 인접 쌍부터 병합
  while (chs.length > MAX_CHAPTERS) {
    let minIdx = 0, minLen = Infinity;
    for (let i = 0; i < chs.length - 1; i++) {
      const combined = chs[i + 1].end_sec - chs[i].start_sec;
      if (combined < minLen) { minLen = combined; minIdx = i; }
    }
    const a = chs[minIdx], b = chs[minIdx + 1];
    const keepA = (a.confidence || 0) >= (b.confidence || 0);
    chs[minIdx] = { ...a, end_sec: b.end_sec, title: keepA ? a.title : b.title, confidence: Math.max(a.confidence || 0, b.confidence || 0) };
    chs.splice(minIdx + 1, 1);
  }

  return chs.map((c, i) => {
    const confidence = Math.max(0, Math.min(100, Math.round(c.confidence ?? 100)));
    const lowConf = confidence < LOW_CONFIDENCE_THRESHOLD;
    const title = (c.title || '').trim();
    return {
      idx: i,
      start_sec: c.start_sec,
      end_sec: c.end_sec,
      title: lowConf || !title ? lowConfidenceLabel(i, c.start_sec, c.end_sec) : title,
      source: c.source,
      confidence,
    };
  });
}

// 우선순위 1: 유튜브 제작자 챕터 (yt-dlp -J chapters[])
function planFromMetaChapters(metaChapters, durationSec) {
  if (!metaChapters?.length) return null;
  const chapters = metaChapters.map((c, i) => ({
    start_sec: c.start_sec,
    end_sec: c.end_sec,
    title: c.title || `챕터 ${i + 1}`,
    source: 'youtube',
    confidence: 100,
  }));
  return applyCommonCorrections(chapters, durationSec);
}

// 20분 윈도우 + 1분 오버랩, 단 AI 호출 하드캡(기본 5회)을 넘지 않도록 윈도우 크기를 조정
function buildWindows(durationSec, { windowSec = 1200, overlapSec = 60, maxCalls = 5 } = {}) {
  const dur = Math.max(1, Math.floor(durationSec) || 0);
  if (dur <= 0) return [];
  let step = Math.max(60, windowSec - overlapSec);
  let win = windowSec;
  if (Math.ceil(dur / step) > maxCalls) {
    step = Math.ceil(dur / maxCalls);
    win = step + overlapSec;
  }
  const windows = [];
  let start = 0;
  while (start < dur && windows.length < maxCalls) {
    const end = Math.min(dur, start + win);
    windows.push({ start, end });
    if (end >= dur) break;
    start += step;
  }
  return windows;
}

function buildWindowPrompt(window, text) {
  return `당신은 BJJ(브라질리언 주짓수) 전문가입니다. 아래는 한 영상 자막 중 ${fmtMmSs(window.start)}~${fmtMmSs(window.end)} 구간입니다.
이 구간 안에서 주제가 바뀌는 지점(챕터 경계)을 찾아주세요.

[자막]
${text.slice(0, 6000)}

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{"chapters":[{"start":"mm:ss","end":"mm:ss","title":"12자 이내 제목","confidence":0.0}]}

규칙:
- start/end는 반드시 ${fmtMmSs(window.start)}~${fmtMmSs(window.end)} 구간 안의 시각(전체 영상 기준)만 사용
- 확신이 없으면 confidence를 0.6 미만으로 낮게 주세요. 제목을 억지로 짓지 마세요
- 챕터는 최소 1개, 보통 2~5개`;
}

// 우선순위 2: 자막 의미 분할 (윈도우별 Claude 호출, 최대 5회)
async function planFromSubtitleWindows(vttText, durationSec, opts = {}) {
  const { parseVtt } = require('./vttParser');
  const runClaudeFn = opts.runClaudeFn || defaultRunClaude;
  const cues = parseVtt(vttText);
  if (!cues.length) return null;
  const segments = compressGaps(cues, 30);
  const windows = buildWindows(durationSec, { maxCalls: 5 });
  if (!windows.length) return null;

  const collected = [];
  let callsUsed = 0;
  for (const w of windows) {
    const text = segments
      .filter(s => s.end > w.start && s.start < w.end)
      .map(s => s.text)
      .join(' ')
      .trim();
    if (!text) continue;
    callsUsed++;
    let raw;
    try {
      // priority:'batch' — 긴 영상 백그라운드 파이프라인의 호출이므로 인터랙티브 AI 기능(메모보완 등)을
      // 막지 않도록 배치 레인 사용 (task-008 §3-A)
      raw = await runClaudeFn(buildWindowPrompt(w, text), { timeoutMs: 120000, priority: 'batch' });
    } catch (e) {
      console.error('[long-video][chapterPlanner] 자막 챕터 판단 호출 실패(윈도우 스킵):', e.message);
      continue;
    }
    const parsed = safeExtractJson(raw);
    if (!parsed?.chapters?.length) continue;
    for (const c of parsed.chapters) {
      const start = parseMmSs(c.start);
      const end = parseMmSs(c.end);
      if (start == null || end == null || end <= start) continue;
      collected.push({
        start_sec: start,
        end_sec: end,
        title: String(c.title || '').trim().slice(0, 60),
        source: 'ai',
        confidence: Math.round(Math.max(0, Math.min(1, Number(c.confidence) || 0)) * 100),
      });
    }
  }
  // 버그 수정(task-008): calls는 됐는데 결과가 비어(파싱 실패·JSON 형식 이탈 등) collected가 비면
  // 예전 코드는 여기서 그냥 null을 반환해 callsUsed 정보 자체가 유실됐다(ai_calls 카운터가
  // 실제로는 호출했는데도 0으로 남는 근본 원인). null 대신 callsUsed를 포함한 객체를 반환한다.
  if (!collected.length) return { chapters: null, callsUsed };
  collected.sort((a, b) => a.start_sec - b.start_sec);
  return { chapters: applyCommonCorrections(collected, durationSec), callsUsed };
}

function buildVisualPrompt(frameSet, durationSec) {
  const frameList = frameSet.map((f, i) => `${i + 1}. ${f.path} (약 ${fmtMmSs(f.t)} 지점)`).join('\n');
  return `당신은 BJJ(브라질리언 주짓수) 전문가입니다. 아래는 한 영상(길이 약 ${fmtMmSs(durationSec)})에서 시간 순서대로 균등 추출한 프레임입니다.
프레임을 보고 영상의 큰 흐름이 전환되는 지점(챕터 경계)만 찾아주세요. 세부 기술명이 아니라 큰 흐름의 전환점만 판단하면 됩니다.

[프레임 이미지 파일 경로 — Read 툴로 순서대로 읽어 시각 분석해주세요]
${frameList}

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{"chapters":[{"start":"mm:ss","end":"mm:ss","title":"12자 이내 제목","confidence":0.0}]}

규칙:
- 확신이 없으면 confidence를 0.6 미만으로 낮게 주세요. 제목을 억지로 짓지 마세요
- 챕터는 최소 1개, 보통 2~6개`;
}

// 우선순위 3: 15장 시각 분석 (Claude 1회, 초과 시 12장으로 축소 재시도)
// 반환 형태를 planFromSubtitleWindows와 동일하게 {chapters, callsUsed}로 통일한다(task-008) —
// 이전에는 chapters 배열/null만 반환해 12장 축소 재시도가 발생한 경우(실제 Claude 호출 2회)에도
// 호출측이 무조건 1로만 증가시켜 ai_calls가 부정확했다.
async function planFromVisualFrames(framePaths, durationSec, opts = {}) {
  const runClaudeFn = opts.runClaudeFn || defaultRunClaude;
  if (!framePaths?.length) return { chapters: null, callsUsed: 0 };

  // priority:'batch' — task-008 §3-A, 인터랙티브 AI 기능을 막지 않는 배치 레인
  const attempt = (frameSet) => runClaudeFn(buildVisualPrompt(frameSet, durationSec), { tools: 'Read', timeoutMs: 300000, priority: 'batch' });

  let raw;
  let callsUsed = 0;
  try {
    callsUsed++;
    raw = await attempt(framePaths);
  } catch (e) {
    if (framePaths.length > 12) {
      console.log('[long-video][chapterPlanner] 시각 챕터 판단 실패, 12장으로 축소 재시도:', e.message);
      try {
        callsUsed++;
        raw = await attempt(framePaths.slice(0, 12));
      } catch (e2) {
        console.error('[long-video][chapterPlanner] 시각 챕터 판단 재시도도 실패:', e2.message);
        return { chapters: null, callsUsed };
      }
    } else {
      console.error('[long-video][chapterPlanner] 시각 챕터 판단 실패:', e.message);
      return { chapters: null, callsUsed };
    }
  }

  const parsed = safeExtractJson(raw);
  if (!parsed?.chapters?.length) return { chapters: null, callsUsed };
  const chapters = parsed.chapters
    .map(c => {
      const start = parseMmSs(c.start);
      const end = parseMmSs(c.end);
      if (start == null || end == null || end <= start) return null;
      return {
        start_sec: start,
        end_sec: end,
        title: String(c.title || '').trim().slice(0, 60),
        source: 'visual',
        confidence: Math.round(Math.max(0, Math.min(1, Number(c.confidence) || 0)) * 100),
      };
    })
    .filter(Boolean);
  if (!chapters.length) return { chapters: null, callsUsed };
  chapters.sort((a, b) => a.start_sec - b.start_sec);
  return { chapters: applyCommonCorrections(chapters, durationSec), callsUsed };
}

module.exports = {
  MIN_CHAPTER_SEC, MAX_CHAPTER_SEC, MAX_CHAPTERS, LOW_CONFIDENCE_THRESHOLD,
  fmtMmSs, lowConfidenceLabel, parseMmSs,
  singleChapterFallback, applyCommonCorrections,
  planFromMetaChapters, planFromSubtitleWindows, planFromVisualFrames,
  buildWindows,
};
