// WebVTT 파싱 + 30초 빈 구간 압축 (task-007 Phase 1, 챕터 판단 우선순위 2 "자막 의미 분할" 용)
const fs = require('fs/promises');

const TIME_RE = /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/;

function toSec(h, m, s, ms) {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

function stripTags(text) {
  return text
    .replace(/<[^>]*>/g, '')     // <c>, <00:00:01.000> 등 yt-dlp 인라인 타이밍 태그 제거
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

// VTT 텍스트 → [{start, end, text}] (초 단위, 소수점 포함)
function parseVtt(vttText) {
  if (!vttText) return [];
  const lines = vttText.replace(/\r\n/g, '\n').split('\n');
  const cues = [];
  let i = 0;
  while (i < lines.length) {
    const m = TIME_RE.exec(lines[i]);
    if (m) {
      const start = toSec(m[1], m[2], m[3], m[4]);
      const end   = toSec(m[5], m[6], m[7], m[8]);
      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(stripTags(lines[i]));
        i++;
      }
      const text = textLines.filter(Boolean).join(' ').trim();
      if (text && end > start) cues.push({ start, end, text });
      continue;
    }
    i++;
  }
  return cues;
}

async function parseVttFile(filePath) {
  const text = await fs.readFile(filePath, 'utf-8');
  return parseVtt(text);
}

// 자막 큐를 이어붙이되, 큐 사이 공백이 maxGapSec 초과면 새 세그먼트로 끊는다 (30초 빈 구간 압축)
function compressGaps(cues, maxGapSec = 30) {
  if (!cues.length) return [];
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  const segments = [];
  let cur = { start: sorted[0].start, end: sorted[0].end, text: sorted[0].text };
  for (let i = 1; i < sorted.length; i++) {
    const c = sorted[i];
    if (c.start - cur.end > maxGapSec) {
      segments.push(cur);
      cur = { start: c.start, end: c.end, text: c.text };
    } else {
      cur.end = Math.max(cur.end, c.end);
      cur.text += ' ' + c.text;
    }
  }
  segments.push(cur);
  return segments;
}

module.exports = { parseVtt, parseVttFile, compressGaps };
