// cache 데이터에서 unique 값 추출 — 각 페이지에서 useMemo로 사용

const norm = s => (s || '').toString().trim();

export function uniqueTechPositions(techniques = []) {
  return [...new Set(techniques.map(t => norm(t.pos)).filter(Boolean))];
}

export function uniqueTechCategories(techniques = []) {
  return [...new Set(techniques.map(t => norm(t.category)).filter(Boolean))];
}

export function uniqueAllTags(techniques = []) {
  const set = new Set();
  for (const t of techniques) {
    for (const tag of (t.tags || [])) {
      const s = norm(tag);
      if (s) set.add(s);
    }
  }
  return [...set];
}

export function uniqueClassThemes(classes = []) {
  return [...new Set(classes.map(c => norm(c.theme)).filter(Boolean))];
}

export function uniqueDrillPositions(classes = []) {
  return [...new Set(classes.map(c => norm(c.drill?.pos)).filter(Boolean))];
}

// 모든 spar session 평탄화
function flatSessions(classes) {
  return (classes || []).flatMap(c =>
    (c.spar_days || []).flatMap(sd => sd.sessions || [])
  );
}

export function uniqueOpponents(classes = []) {
  return [...new Set(flatSessions(classes).map(s => norm(s.opponent)).filter(Boolean))];
}

export function uniqueLevels(classes = []) {
  return [...new Set(flatSessions(classes).map(s => norm(s.level)).filter(Boolean))];
}

export function uniqueWeaks(classes = []) {
  const set = new Set();
  for (const s of flatSessions(classes)) {
    for (const w of (s.weak || [])) {
      const v = norm(w);
      if (v) set.add(v);
    }
  }
  return [...set];
}

export function uniqueGameplanPositions(gameplans = [], key = 'start_pos') {
  return [...new Set((gameplans || []).map(gp => norm(gp[key])).filter(Boolean))];
}
