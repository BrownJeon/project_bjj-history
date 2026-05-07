const express = require('express');
const router = express.Router();
const { runClaude } = require('../services/claudeCli');
const { analyzeVideo } = require('../services/videoAnalysis');
const { wrap } = require('../utils/respond');

function extractJSONObject(text) {
  const cleaned = text.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON 객체를 찾을 수 없습니다');
  let jsonStr = cleaned.slice(start, end + 1);
  jsonStr = jsonStr.replace(/"(?:[^"\\]|\\.)*"/g, m =>
    m.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n')
  );
  return JSON.parse(jsonStr);
}

router.post('/enhance', wrap(async (req, res) => {
  const { text, type, instruction } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: '메모 내용이 없습니다' });

  const typeLabels = {
    drill: '기술수업 드릴 메모',
    tech:  '기술 카드 핵심 포인트/메모',
    chain: '기술 체인 설명 메모',
    gp:    '기술연구(게임플랜) 설명 메모',
  };
  const typeLabel = typeLabels[type] || '훈련 메모';
  const instructionLine = instruction?.trim() ? `\n추가 요청사항: ${instruction.trim()}\n` : '';

  let prompt;
  if (type === 'classFeedback') {
    prompt = `당신은 주짓수(BJJ) 전문 코치입니다.
훈련생이 작성한 수업 기록을 기반으로 코칭 관점의 종합 피드백을 자연스러운 문체로 작성해주세요.

[피드백 구성]
- [잘한 점] : 드릴에서 시도한 기술·포지션·체인에서 긍정적인 측면을 구체적으로 짚기
- [개선할 점] : 약한 디테일·놓친 포인트·타이밍 등을 구체적 동작 레벨로 지적
- [다음 집중 포인트] : 다음 훈련에서 의도적으로 연습할 기술·드릴·체크 포인트 제안

[응답 형식 — 중요]
- enhanced 문자열 안에 JSON 이스케이프 시퀀스(\\n)를 사용해 줄바꿈
- 섹션 사이는 \\n\\n, 줄바꿈은 \\n
${instructionLine}
[수업 기록]
${text}

JSON 형식으로만 응답하세요:
{"enhanced":"세 섹션으로 구성된 피드백 전체 (\\n / \\n\\n 줄바꿈 포함)","changes":"핵심 포인트 2~4줄 요약 (\\n 으로 분리)"}`;
  } else if (type === 'spar') {
    prompt = `당신은 주짓수(BJJ) 전문 코치입니다.
훈련생이 작성한 스파링 세션 데이터를 자연스러운 문체로 코칭 분석해주세요.

[분석 방향]
- 세션 전반의 경향 파악 (상대 벨트·상대별 강점·약점, 탭 비율, 주요 공격/방어 패턴)
- ✓는 성공, ✗는 실패. ✗ 항목은 원인과 구체적 보완 방법을 제시
- BJJ 전문 용어 사용, 과장 없이 실행 가능한 방향으로

[응답 형식 — 중요]
- enhanced 문자열 안에 JSON 이스케이프 시퀀스(\\n)를 사용해 줄바꿈
- 주제·세션이 바뀌면 \\n\\n, 줄바꿈은 \\n
${instructionLine}
[스파링 데이터]
${text}

JSON 형식으로만 응답하세요:
{"enhanced":"코칭 분석 리포트 전체 (\\n / \\n\\n 줄바꿈 포함)","changes":"핵심 인사이트 2~4줄 요약 (\\n 으로 분리)"}`;
  } else {
    const ctx = type === 'classNote' ? '수업 기술 정보를 맥락으로' : `[${typeLabel}]를`;
    prompt = `당신은 주짓수(BJJ) 전문 트레이너입니다.
훈련생이 적은 메모를 ${ctx} 보완해주세요.

[보완 기준]
1. 원문의 핵심 내용과 맥락은 반드시 유지
2. 세부 동작 포인트, 그립, 체중 이동, 타이밍 구체화
3. 빠진 중요 세부사항 추가
4. 주짓수 전문 용어 적절히 사용
5. 분량은 원문보다 충실하게, 반복은 피한다

[응답 형식 — 중요]
- enhanced 문자열 안에 JSON 이스케이프 시퀀스(\\n)를 사용해 줄바꿈
- 문단이 바뀌면 \\n\\n, 줄바꿈은 \\n
- changes 는 항목마다 \\n 으로 분리
${instructionLine}
[원문 메모]
${text}

JSON 형식으로만 응답하세요:
{"enhanced":"보완된 전체 메모 (\\n / \\n\\n 줄바꿈 포함)","changes":"추가·보완한 내용 2~4줄 설명 (\\n 으로 분리)"}`;
  }

  const raw = await runClaude(prompt);
  res.json(extractJSONObject(raw));
}));

router.post('/videos', wrap(async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: '메모 내용이 없습니다' });

  const prompt = `당신은 주짓수(BJJ) 전문가입니다.
아래 훈련 메모에서 언급된 기술을 분석해 YouTube에서 검색하면 좋은 검색어를 최대 3개 추출해주세요.

[조건]
- 메모에서 실제로 언급된 기술·포지션·개념을 기반으로 구체적인 검색어를 만든다
- 검색어는 영어로 작성한다
- 메모에 관련 기술이 전혀 없으면 빈 배열을 반환한다

[훈련 메모]
${text}

JSON 형식으로만 응답하세요:
{"queries":[{"query":"half guard underhook sweep BJJ","reason":"언급된 기술 설명"}]}
관련 기술이 없으면: {"queries":[]}`;

  const raw = await runClaude(prompt);
  const data = extractJSONObject(raw);
  const queries = Array.isArray(data.queries) ? data.queries.slice(0, 3) : [];
  const videos = queries.map(q => ({
    title: q.query,
    url:   `https://www.youtube.com/results?search_query=${encodeURIComponent(q.query)}`,
    reason: q.reason || '',
  }));
  res.json({ videos });
}));

router.post('/analyze-video', wrap(async (req, res) => {
  const { url } = req.body;
  if (!url?.trim()) return res.status(400).json({ error: 'URL을 입력해주세요' });
  if (!/(youtube\.com|youtu\.be|instagram\.com)/.test(url)) {
    return res.status(400).json({ error: 'YouTube 또는 Instagram URL만 지원됩니다' });
  }
  const result = await analyzeVideo(url);
  res.json(result);
}));

module.exports = router;
