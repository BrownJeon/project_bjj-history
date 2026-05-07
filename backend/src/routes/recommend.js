const express = require('express');
const router = express.Router();
const { runClaude } = require('../services/claudeCli');
const { wrap } = require('../utils/respond');

function extractJSONArray(text) {
  const cleaned = text.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('JSON 배열을 찾을 수 없습니다');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function extractJSONObject(text) {
  const cleaned = text.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON 객체를 찾을 수 없습니다');
  return JSON.parse(cleaned.slice(start, end + 1));
}

router.post('/', wrap(async (req, res) => {
  const { mode, query, techniques, gameplans, currentNodes, name, startPos, endPos, comment, startTech, tags } = req.body;

  if (mode === 'nodes') {
    const nodeList = (currentNodes || []).map(n => ({ label: n.label, tech_id: n.tech_id || null, is_finish: !!n.is_finish }));
    const prompt = `당신은 BJJ(브라질리언 주짓수) 전문 코치입니다. 반드시 JSON 객체만 출력하세요. 다른 설명 텍스트는 절대 포함하지 마세요.

현재 작성 중인 기술연구:
- 이름: "${name || '(미입력)'}"
- 시작 포지션: "${startPos || '(미선택)'}"
- 희망 포지션(목표): "${endPos || '(미설정)'}"
- 현재 노드: ${JSON.stringify(nodeList)}
${comment ? `\n추가 지시사항: "${comment}"\n` : ''}
시작 포지션에서 희망 포지션에 도달하거나 해당 포지션에서 유리한 기술로 이어지는 경로를 중심으로 추천하세요.
위 노드들을 기반으로 다음을 추천하세요:
1. 추가하면 좋을 기술 2~4개 (이미 있는 노드와 중복 금지)
2. 현재 노드 간 또는 신규 노드와의 추천 연결

반드시 이 JSON 객체 형식으로만 응답하세요:
{"suggested_nodes":[{"label":"기술명","tech_id":null,"is_finish":false,"note":"추가 이유"}],"suggested_edges":[{"from_label":"기술A","to_label":"기술B","condition":"전환 조건"}]}`;

    const raw = await runClaude(prompt);
    res.json(extractJSONObject(raw));
    return;
  }

  const tagList = Array.isArray(tags) && tags.length ? tags : [];
  const posContext = [
    startPos  ? `- 시작 포지션: "${startPos}"` : '',
    endPos    ? `- 희망 포지션(목표): "${endPos}"` : '',
    startTech ? `- 시작 기술: "${startTech}"` : '',
    tagList.length ? `- 태그/키워드: ${tagList.map(t => `"${t}"`).join(', ')}` : '',
    query     ? `- 추가 요청: "${query}"` : '',
  ].filter(Boolean).join('\n');
  const hasCondition = startPos || endPos || startTech || tagList.length;

  let prompt;
  if (mode === 'mine') {
    const techList = (techniques || []).map(t => ({ id: t.id, name: t.name, pos: t.pos || '' }));
    const gpList = (gameplans || []).map(gp => ({
      name: gp.name,
      start_pos: gp.start_pos || '',
      nodes: (gp.nodes || []).map(n => ({ id: n.id, label: n.tech_name || n.label, is_finish: n.is_finish })),
      edges: (gp.edges || []).map(e => ({ from: e.from_node_id, to: e.to_node_id, condition: e.condition })),
    }));
    prompt = `당신은 BJJ(브라질리언 주짓수) 전문 코치입니다. 반드시 JSON 배열만 출력하세요.

사용자 기술 목록 (ID 포함):
${JSON.stringify(techList)}

사용자 기술연구(게임플랜):
${JSON.stringify(gpList)}
${posContext ? `\n사용자 조건:\n${posContext}\n` : ''}
위 데이터를 분석하여 최적화된 기술연계 2~3개를 추천하세요.
- 기존 기술 ID를 최대한 활용하고 tech_id를 지정하세요. 목록에 없는 기술은 tech_id를 null로 설정하세요.
- 기존 게임플랜의 빈 곳이나 보완할 연계를 제안하세요.${hasCondition ? '\n- 지정된 조건(포지션, 시작 기술, 태그)을 반드시 반영하세요.' : ''}
- from_idx와 to_idx는 nodes 배열의 인덱스(0부터)입니다.

반드시 이 JSON 배열 형식으로만 응답하세요:
[{"title":"게임플랜 이름","start_pos":"시작 포지션","description":"추천 이유와 전략 설명","nodes":[{"tech_id":1,"label":"기술명","is_finish":false,"note":"설명"}],"edges":[{"from_idx":0,"to_idx":1,"condition":"전환 조건"}]}]`;
  } else {
    prompt = `당신은 BJJ(브라질리언 주짓수) 전문 코치입니다. 반드시 JSON 배열만 출력하세요.
${posContext ? `\n사용자 조건:\n${posContext}\n` : `\n요청: "${query || '효과적인 BJJ 서브미션 게임플랜'}"\n`}
현재 BJJ 커뮤니티에서 검증된 기술 연계 2~3개를 추천하세요.
- tech_id는 모두 null로 설정하세요.
- 실제 경기나 훈련에서 효과적으로 사용되는 패턴을 기반으로 하세요.${hasCondition ? '\n- 지정된 조건(포지션, 시작 기술, 태그)을 반드시 반영하세요.' : ''}
- from_idx와 to_idx는 nodes 배열의 인덱스(0부터)입니다.

반드시 이 JSON 배열 형식으로만 응답하세요:
[{"title":"게임플랜 이름","start_pos":"시작 포지션","description":"추천 이유와 전략 설명","nodes":[{"tech_id":null,"label":"기술명","is_finish":false,"note":"설명"}],"edges":[{"from_idx":0,"to_idx":1,"condition":"전환 조건"}]}]`;
  }

  const raw = await runClaude(prompt);
  res.json({ recommendations: extractJSONArray(raw) });
}));

module.exports = router;
