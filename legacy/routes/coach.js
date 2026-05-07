const express = require('express');
const router  = express.Router();
const { pool, safeParse } = require('../db');
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

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

// ─── 훈련 데이터 집계 ───────────────────────────────────────────
async function collectTrainingData(periodStart, periodEnd) {
  const [classes] = await pool.query(
    'SELECT * FROM classes WHERE (date BETWEEN ? AND ?) OR (date_end BETWEEN ? AND ?) OR (date <= ? AND IFNULL(date_end,date) >= ?) ORDER BY date ASC',
    [periodStart, periodEnd, periodStart, periodEnd, periodStart, periodEnd]
  );

  const data = [];
  for (const c of classes) {
    const [[drill]] = await pool.query(
      'SELECT * FROM drills WHERE class_id=? ORDER BY id ASC LIMIT 1', [c.id]);
    if (drill) {
      drill.tech      = safeParse(drill.tech, []);
      drill.detail    = safeParse(drill.detail, []);
      drill.links     = safeParse(drill.links, []);
      drill.chain_ids = safeParse(drill.chain_ids, []);
    }

    const [sparDays] = await pool.query(
      'SELECT * FROM spar_days WHERE class_id=? AND date BETWEEN ? AND ? ORDER BY date ASC',
      [c.id, periodStart, periodEnd]
    );
    const sparList = [];
    for (const sd of sparDays) {
      const [sess] = await pool.query(
        'SELECT * FROM spar_sessions WHERE spar_day_id=? ORDER BY id ASC', [sd.id]);
      const sessions = sess.map(s => {
        const legacyScore = parseInt(s.position_score) || 0;
        return {
          level:    s.level || '',
          opponent: s.opponent || '',
          tapGot:   s.tap_got || 0,
          tapGave:  s.tap_gave || 0,
          timeMin:  s.time_min || 0,
          success:  safeParse(s.success, []).map(x =>
            typeof x === 'string' ? { name: x, success: true } : x
          ),
          weak:     safeParse(s.weak, []),
          positions: safeParse(s.positions, []).map(p =>
            typeof p === 'string' ? { name: p, score: legacyScore }
                                  : { name: p.name || '', score: parseInt(p.score) || 0 }
          ),
          note: s.note || ''
        };
      });
      sparList.push({
        date:    (sd.date || '').toString().slice(0, 10),
        dayNote: sd.day_note || '',
        sessions
      });
    }

    data.push({
      id: c.id,
      date:       (c.date || '').toString().slice(0, 10),
      dateEnd:    c.date_end ? c.date_end.toString().slice(0, 10) : null,
      theme:      c.theme || '',
      note:       c.note || '',
      feedback:   c.feedback || '',
      trainedDates: safeParse(c.trained_dates, []),
      drill:      drill || null,
      sparDays:   sparList
    });
  }
  return data;
}

// ─── 진단 집계 ────────────────────────────────────────────────
function computeDiagnosis(data, periodStart, periodEnd) {
  let sessionCount = 0, totalMin = 0, tapGot = 0, tapGave = 0;
  const trainedDays = new Set();
  const weakCount   = {};                // name → count
  const attemptMap  = {};                // name → {tried, success}
  const positionMap = {};                // name → {sum, count}
  const beltMap     = {};                // belt → {tapGot, tapGave, sessions}
  const usedPositions = new Set();
  const inRange = d => d && d >= periodStart && d <= periodEnd;

  for (const c of data) {
    (c.trainedDates || []).filter(inRange).forEach(d => trainedDays.add(d));
    for (const sd of c.sparDays) {
      trainedDays.add(sd.date);
      for (const s of sd.sessions) {
        sessionCount++;
        totalMin += s.timeMin || 0;
        tapGot   += s.tapGot  || 0;
        tapGave  += s.tapGave || 0;
        (s.weak || []).forEach(w => { weakCount[w] = (weakCount[w] || 0) + 1; });
        (s.success || []).forEach(a => {
          const key = a.name;
          if (!key) return;
          if (!attemptMap[key]) attemptMap[key] = { tried: 0, success: 0 };
          attemptMap[key].tried++;
          if (a.success) attemptMap[key].success++;
        });
        (s.positions || []).forEach(p => {
          if (!p.name) return;
          usedPositions.add(p.name);
          if (!positionMap[p.name]) positionMap[p.name] = { sum: 0, count: 0 };
          const score = parseInt(p.score) || 0;
          if (score > 0) {
            positionMap[p.name].sum += score;
            positionMap[p.name].count++;
          }
        });
        const belt = s.level || '기타';
        if (!beltMap[belt]) beltMap[belt] = { tapGot: 0, tapGave: 0, sessions: 0 };
        beltMap[belt].tapGot  += s.tapGot  || 0;
        beltMap[belt].tapGave += s.tapGave || 0;
        beltMap[belt].sessions++;
      }
    }
  }

  const weakTop = Object.entries(weakCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const failedTechs = Object.entries(attemptMap)
    .map(([name, v]) => ({ name, tried: v.tried, success: v.success, rate: v.tried ? v.success / v.tried : 0 }))
    .filter(t => t.tried >= 1 && t.rate < 0.5)
    .sort((a, b) => a.rate - b.rate || b.tried - a.tried)
    .slice(0, 5);

  const positions = Object.entries(positionMap)
    .map(([name, v]) => ({ name, avg: v.count ? +(v.sum / v.count).toFixed(1) : 0, count: v.count }))
    .sort((a, b) => b.count - a.count);

  const byOpponentBelt = Object.entries(beltMap)
    .map(([belt, v]) => ({ belt, ...v }))
    .sort((a, b) => b.sessions - a.sessions);

  return {
    summary: {
      classes: data.length,
      sessions: sessionCount,
      minutes: totalMin,
      trainedDays: trainedDays.size,
      tapGot, tapGave
    },
    weakTop,
    failedTechs,
    positions,
    byOpponentBelt,
    usedPositions: [...usedPositions]
  };
}

// ─── 데이터 → 프롬프트 구조화 텍스트 ─────────────────────────────
function serializeForPrompt(data) {
  if (!data.length) return '(데이터 없음)';
  const blocks = data.map(c => {
    const lines = [];
    const range = c.dateEnd ? `${c.date} ~ ${c.dateEnd}` : c.date;
    lines.push(`[수업 ${range}]${c.theme ? ' 테마: ' + c.theme : ''}`);
    if (c.drill) {
      const d = c.drill;
      const parts = [];
      if (d.pos) parts.push(`포지션 ${d.pos}`);
      if (d.stars) parts.push(`★${d.stars}`);
      if ((d.tech || []).length) parts.push(`기술: ${d.tech.join(', ')}`);
      if ((d.detail || []).length) parts.push(`디테일: ${d.detail.join(', ')}`);
      if (parts.length) lines.push('  드릴: ' + parts.join(' · '));
    }
    if (c.note) lines.push(`  메모: ${c.note.replace(/\n/g,' ').slice(0,300)}`);
    if (c.feedback) lines.push(`  피드백: ${c.feedback.replace(/\n/g,' ').slice(0,300)}`);
    for (const sd of c.sparDays) {
      lines.push(`  · 스파링 ${sd.date}`);
      sd.sessions.forEach((s, i) => {
        const header = [`세션${i+1}`, s.level ? `${s.level}벨트` : null, s.opponent || null, `탭 ${s.tapGot}:${s.tapGave}`, s.timeMin ? `${s.timeMin}분` : null].filter(Boolean).join(' · ');
        lines.push(`    [${header}]`);
        if ((s.positions || []).length) {
          const ps = s.positions.map(p => `${p.name}${p.score?' ★'+p.score:''}`).join(', ');
          lines.push(`      점유 포지션: ${ps}`);
        }
        if ((s.success || []).length) {
          const att = s.success.map(a => `${a.success?'✓':'✗'} ${a.name}`).join(', ');
          lines.push(`      시도 기술: ${att}`);
        }
        if ((s.weak || []).length) lines.push(`      부족했던 부분: ${s.weak.join(', ')}`);
        if (s.note) lines.push(`      메모: ${s.note.replace(/\n/g,' ').slice(0,200)}`);
      });
      if (sd.dayNote) lines.push(`    전체 메모: ${sd.dayNote.replace(/\n/g,' ').slice(0,300)}`);
    }
    return lines.join('\n');
  });
  return blocks.join('\n\n');
}

// ────────────── 라우트 ──────────────

// GET /api/coach/diagnosis?days=30
router.get('/diagnosis', async (req, res) => {
  try {
    const days  = parseInt(req.query.days) || 30;
    const end   = todayStr();
    const start = daysAgo(days - 1);
    const data  = await collectTrainingData(start, end);
    const diag  = computeDiagnosis(data, start, end);
    res.json({ period: { days, start, end }, ...diag });
  } catch(e) {
    console.error('[coach/diagnosis]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/coach/report  body: { periodStart, periodEnd, days? }
router.post('/report', async (req, res) => {
  try {
    let { periodStart, periodEnd, days } = req.body;
    if (!periodStart || !periodEnd) {
      const n = parseInt(days) || 30;
      periodEnd   = todayStr();
      periodStart = daysAgo(n - 1);
    }
    const data = await collectTrainingData(periodStart, periodEnd);
    if (!data.length) return res.status(400).json({ error: '해당 기간에 훈련 기록이 없습니다' });

    const context = serializeForPrompt(data);
    const prompt = `당신은 주짓수(BJJ) 전문 코치입니다. 아래 기간의 훈련 기록을 종합해 서술형 코칭 리포트를 자연스러운 문체로 작성해주세요.

[리포트 구성]
- 하이라이트: 이번 기간 두드러진 성과·변화 (구체적 세션·날짜 인용)
- 반복 약점: 데이터에서 반복되는 약점 패턴과 원인 분석
- 개선된 점: 이전 대비 나아진 영역 (확인 가능한 것만)
- 권장 사항: 다음 기간 구체 훈련 드릴·체크 포인트 (실행 가능해야 함)

[작성 원칙]
- 일반론이 아닌 훈련생 실제 기록에 기반
- 과장·미화 없이 사실 기반
- BJJ 전문 용어 적절히 사용
- 각 섹션은 자연스러운 서술 (불필요한 불릿 남발 금지)

[응답 형식 — 중요]
- 각 JSON 문자열 필드(highlights/weaknesses/improvements/recommendations) 내부에 JSON 이스케이프 시퀀스(\\n)를 사용해 줄바꿈
- 문단이 바뀌면 \\n\\n (빈 줄 1개), 같은 문단 내 줄 구분은 \\n
- 항목 나열 시 각 항목을 \\n 으로 분리해 한 줄씩 보이도록

[훈련 데이터 (기간: ${periodStart} ~ ${periodEnd})]
${context}

JSON 형식으로만 응답하세요:
{"highlights":"하이라이트 서술 (\\n\\n 문단, \\n 항목 구분)","weaknesses":"반복 약점 분석 (동일)","improvements":"개선된 점 서술 (동일)","recommendations":"다음 기간 권장 사항 (동일)"}`;

    const raw  = await runClaude(prompt);
    const json = extractJSONObject(raw);

    const [r] = await pool.query(
      'INSERT INTO coach_reports (type, period_start, period_end, content) VALUES (?,?,?,?)',
      ['report', periodStart, periodEnd, JSON.stringify(json)]
    );
    res.json({ id: r.insertId, periodStart, periodEnd, content: json });
  } catch(e) {
    console.error('[coach/report]', e);
    if (e.message.includes('claude CLI')) return res.status(503).json({ error: e.message });
    if (e.message.includes('JSON')) return res.status(500).json({ error: 'AI 응답 파싱 실패. 다시 시도해주세요.' });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/coach/plan  body: { days?=30 }
router.post('/plan', async (req, res) => {
  try {
    let { periodStart, periodEnd, days } = req.body;
    if (!periodStart || !periodEnd) {
      const n = parseInt(days) || 30;
      periodEnd   = todayStr();
      periodStart = daysAgo(n - 1);
    }
    const data = await collectTrainingData(periodStart, periodEnd);
    if (!data.length) return res.status(400).json({ error: '해당 기간에 훈련 기록이 없습니다' });
    const diag = computeDiagnosis(data, periodStart, periodEnd);

    const [techRows]  = await pool.query('SELECT id, name FROM techniques ORDER BY name');
    const [chainRows] = await pool.query('SELECT id, name FROM technique_chains ORDER BY name');
    const techNameList  = techRows.map(t => t.name).join(', ');
    const chainNameList = chainRows.map(c => c.name).join(', ');

    const prompt = `당신은 주짓수 코치입니다. 아래 진단 데이터를 바탕으로 다음 주 훈련 포커스 3개를 제안해주세요.
각 포커스는 실행 가능하고 데이터로 근거가 분명해야 합니다. 포커스는 약점 보완·미사용 영역·실패 비율 높은 기술을 우선 고려합니다.

[진단 요약]
${JSON.stringify(diag, null, 2)}

[사용 가능한 자원]
- 등록된 기술 목록: ${techNameList || '(없음)'}
- 등록된 체인 목록: ${chainNameList || '(없음)'}

[작성 원칙]
- title: 짧고 구체적 (예: "사이드 아래 프레임 복구")
- why: 진단 데이터 근거 1~2줄
- techniqueNames: 등록된 기술 목록에서 정확히 일치하는 이름만 (없으면 빈 배열)
- chainNames: 등록된 체인 목록에서 정확히 일치하는 이름만 (없으면 빈 배열)
- videoQueries: YouTube에서 영어로 검색할 키워드 1~2개
- drillSuggestion: 구체적 훈련 드릴 1~2줄 (체크 포인트 포함)

[응답 형식 — 중요]
- why, drillSuggestion 문자열 안에 줄이 2개 이상이면 JSON 이스케이프 시퀀스 \\n 으로 구분
- drillSuggestion 의 체크 포인트 나열은 각 항목을 \\n 으로 분리해 한 줄씩

JSON 형식으로만 응답하세요:
{"focuses":[{"title":"...","why":"근거 1\\n근거 2","techniqueNames":["..."],"chainNames":["..."],"videoQueries":["..."],"drillSuggestion":"드릴 설명\\n- 체크 포인트 1\\n- 체크 포인트 2"}]}`;

    const raw  = await runClaude(prompt);
    const json = extractJSONObject(raw);

    const focuses = (json.focuses || []).map(f => {
      const techniqueIds = (f.techniqueNames || [])
        .map(n => techRows.find(t => t.name === n)?.id).filter(Boolean);
      const chainIds = (f.chainNames || [])
        .map(n => chainRows.find(c => c.name === n)?.id).filter(Boolean);
      const videoLinks = (f.videoQueries || []).map(q => ({
        query: q,
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
      }));
      return {
        title:           f.title || '',
        why:             f.why || '',
        techniqueIds,
        chainIds,
        techniqueNames:  f.techniqueNames || [],
        chainNames:      f.chainNames || [],
        videoLinks,
        drillSuggestion: f.drillSuggestion || '',
        done:            false
      };
    });
    const content = { focuses };

    const [r] = await pool.query(
      'INSERT INTO coach_reports (type, period_start, period_end, content) VALUES (?,?,?,?)',
      ['plan', periodStart, periodEnd, JSON.stringify(content)]
    );
    res.json({ id: r.insertId, periodStart, periodEnd, content });
  } catch(e) {
    console.error('[coach/plan]', e);
    if (e.message.includes('claude CLI')) return res.status(503).json({ error: e.message });
    if (e.message.includes('JSON')) return res.status(500).json({ error: 'AI 응답 파싱 실패. 다시 시도해주세요.' });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/coach/chat  body: { question, days?=30 }
router.post('/chat', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: '질문을 입력해주세요' });
    const days  = parseInt(req.body.days) || 30;
    const end   = todayStr();
    const start = daysAgo(days - 1);
    const data  = await collectTrainingData(start, end);
    const diag  = computeDiagnosis(data, start, end);
    const context = serializeForPrompt(data);

    // 프로필 정보
    const [[prof]] = await pool.query('SELECT * FROM profile LIMIT 1');
    const [beltRows] = await pool.query('SELECT belt, stripes, achieved_date FROM belt_history ORDER BY achieved_date DESC LIMIT 1');
    const currentBelt = beltRows[0] || { belt: '화이트', stripes: 0 };

    const prompt = `당신은 주짓수(BJJ) 전문 코치이자 훈련생의 개인 훈련 비서입니다.
훈련생이 쌓아온 기록(수업·스파링)을 바탕으로 구체적이고 실행 가능한 조언을
자연스러운 대화체로 제공해주세요.

[답변 원칙]
1. 제공된 훈련 데이터 범위 내에서만 답변한다. 데이터가 부족하면 그렇게 밝힌다.
2. 일반론이 아닌 훈련생의 실제 기록에 기반해 답변한다 (특정 세션·기술·날짜 인용).
3. 구체적이고 실행 가능한 제안 (훈련 드릴, 체크 포인트, 연결 기술) 위주로.
4. 과장·미화 없이 훈련생이 다음 훈련에서 바로 적용할 수 있는 방향으로.
5. BJJ 전문 용어를 적절히 사용하되, 훈련생이 쓰지 않은 낯선 용어는 짧은 설명 병행.
6. 질문과 무관한 내용은 추가하지 않는다. 답변 분량은 질문의 복잡도에 맞게.
7. 훈련생의 벨트 수준에 맞는 기대치로 조언한다.

[훈련생 프로필]
현재 벨트: ${currentBelt.belt} (스트라이프 ${currentBelt.stripes||0})

[기간 요약]
범위: ${start} ~ ${end} (${days}일간)
수업 ${diag.summary.classes}회 · 수련 ${diag.summary.trainedDays}일
스파링 ${diag.summary.sessions}세션 · ${diag.summary.minutes}분 · 탭 ↓${diag.summary.tapGot} ↑${diag.summary.tapGave}
반복 약점 TOP: ${(diag.weakTop||[]).map(w=>`${w.name}(×${w.count})`).join(', ') || '-'}
실패 기술 TOP: ${(diag.failedTechs||[]).map(t=>`${t.name}(${t.success}/${t.tried})`).join(', ') || '-'}

[훈련 기록]
${context}

[훈련생 질문]
${question.trim()}

[답변 형식]
- 자연스러운 대화체로 서술 (JSON 래핑 금지, 평문 그대로)
- 필요 시 불릿 사용 가능하나 과하게 구조화하지 말 것
- 특정 세션·날짜 언급 시 구체적으로 ("지난 4/17 블루벨트 세션에서...")
- 데이터에서 근거를 찾을 수 없는 경우 솔직하게 말할 것

[줄바꿈 지침 — 중요]
- 문단이 바뀌면 줄바꿈 2개(빈 줄 1개)로 분리
- 같은 문단 내에서 강조할 줄은 줄바꿈 1개로 분리
- 불릿/항목 나열 시 각 항목을 새 줄로 배치 (한 줄 한 항목)`;

    const answer = await runClaude(prompt);

    const content = { answer, diagSummary: diag.summary };
    const [r] = await pool.query(
      'INSERT INTO coach_reports (type, period_start, period_end, question, content) VALUES (?,?,?,?,?)',
      ['chat', start, end, question.trim(), JSON.stringify(content)]
    );
    res.json({ id: r.insertId, question: question.trim(), answer, created_at: new Date().toISOString() });
  } catch(e) {
    console.error('[coach/chat]', e);
    if (e.message.includes('claude CLI')) return res.status(503).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/coach/reports/:id/focus-done  body: { focusIndex, done }
router.patch('/reports/:id/focus-done', async (req, res) => {
  try {
    const { focusIndex, done } = req.body;
    const [[row]] = await pool.query('SELECT content FROM coach_reports WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'not found' });
    const content = safeParse(row.content, {});
    if (!Array.isArray(content.focuses) || !content.focuses[focusIndex]) {
      return res.status(400).json({ error: 'invalid focus index' });
    }
    content.focuses[focusIndex].done = !!done;
    await pool.query('UPDATE coach_reports SET content=? WHERE id=?', [JSON.stringify(content), req.params.id]);
    res.json({ ok: true });
  } catch(e) {
    console.error('[coach/focus-done]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/coach/reports?type=report&limit=10
router.get('/reports', async (req, res) => {
  try {
    const type  = req.query.type  || 'report';
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const [rows] = await pool.query(
      'SELECT id, type, period_start, period_end, question, content, created_at FROM coach_reports WHERE type=? ORDER BY created_at DESC LIMIT ?',
      [type, limit]
    );
    rows.forEach(r => { r.content = safeParse(r.content, {}); });
    res.json(rows);
  } catch(e) {
    console.error('[coach/reports]', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/coach/reports/:id
router.delete('/reports/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM coach_reports WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch(e) {
    console.error('[coach/reports DELETE]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
