// 가져오기 검색 — 5개 저장소 통합 (task-028 B · docs/recall-lab-spec.md §4.6)
//
// 연구 노드에 "근거"를 매달 때 사용자는 수업기록·기술트리·시뮬레이터·참고영상·영상분석을
// 각각 뒤지지 않는다. 한 번 치면 여섯 갈래가 **출처별로 묶여** 돌아온다.
//
// 🔴 [재사용 원칙] **새 검색 로직을 한 줄도 만들지 않는다.**
//   매칭·스니펫·정규화는 전부 task-025 의 `recallSearch` 것을 그대로 부른다:
//     - `normQuery`     — NFC + 소문자 + trim (검색어 정본화)
//     - `makeSnippets`  — 양쪽을 toNFC 한 뒤 ±80자 스니펫 (윈도우 상한 포함)
//     - `loadRecallCorpus` / `searchCorpus` — 수업기록 갈래는 **통째로** 저것을 쓴다
//   두 벌이 되면 갈라진다. 실제로 task-025 가 "스니펫 윈도우 상한 없음"을 한 곳에서 고쳤는데
//   복제본이 있었다면 다른 쪽은 아직도 전사본을 통째로 싣고 있을 것이다.
//
// 🔴 [NFD] 검색어를 SQL LIKE 로 좁히지 않는다. LIKE 는 유니코드 정규화를 못 해서 자모분리(NFD)
//   검색어가 **에러 없이 0건**이 된다(task-014 의 실패 방식 그대로). SQL 이 하는 일은
//   `WHERE user_id = ?` 하나뿐이고, 텍스트 매칭은 전부 JS 에서 NFC 정규화 후 한다.
//   반대 방향도 막힌다: `long_videos.title` 에는 yt-dlp 가 넣은 **NFD 저장값**이 실재한다.
//   양쪽을 toNFC 하는 makeSnippets 를 쓰므로 NFC 검색어 → NFD 데이터도 걸린다.
//
// 🔴 [소유] `spar_sessions`·`spar_days`·`drills` 에는 user_id 가 **없다**(수업기록 갈래는
//   recallSearch 가 classes 를 조인해 처리한다). 여기서 직접 읽는 5테이블은 전부 user_id 를
//   가지고 있어 `WHERE user_id = ?` 로 좁힌다 — 예외 없다.
//
// 🔴 [표본 0] "검색어가 아무 데도 없다"와 "그 저장소가 비어 있다"는 다른 말이다.
//   출처마다 `total`(매치 수) 과 `available`(그 저장소의 전체 행 수)을 따로 싣는다.
//   0/0 을 0% 로 읽지 않게 하려는 것이고, QA 가 "검사 대상이 0건이라 통째로 skip" 되는
//   무력한 검사를 만들지 못하게 하려는 것이다.
const { sequelize } = require('../config/db');
const { safeParse } = require('../utils/respond');
const {
  normQuery, makeSnippets, loadRecallCorpus, searchCorpus,
  SNIPPET_RADIUS, SNIPPET_MAX,
} = require('./recallSearch');

/** 출처 정본. `key` 는 응답의 그룹 키이자 `?source=` 필터값이고, `linkType` 은 research_links.link_type 이다. */
const SOURCES = [
  { key: 'class',     linkType: 'class',     label: '수업기록',   table: 'classes' },
  { key: 'technique', linkType: 'technique', label: '기술트리',   table: 'techniques' },
  { key: 'gameplan',  linkType: 'gameplan',  label: '시뮬레이터', table: 'gameplans' },
  { key: 'chain',     linkType: 'chain',     label: '시뮬레이터', table: 'technique_chains' },
  { key: 'clip',      linkType: 'clip',      label: '참고영상',   table: 'video_clips' },
  { key: 'chapter',   linkType: 'chapter',   label: '영상분석',   table: 'long_video_chapters' },
];
const SOURCE_KEYS = SOURCES.map((s) => s.key);
const SOURCE_BY_KEY = new Map(SOURCES.map((s) => [s.key, s]));

/** 출처별 기본 반환 개수. 상한 50 — 응답 비대 방지(스니펫이 붙어 행당 수백 바이트다). */
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * 한 행에서 필드별 스니펫 히트를 만든다. **`makeSnippets` 를 부르는 것 말고는 아무것도 안 한다.**
 * @param fields [{ field: '응답 필드명', value: 원문 }]
 */
function rowHits(fields, qNFC, { radius = SNIPPET_RADIUS, max = SNIPPET_MAX } = {}) {
  const hits = [];
  if (!qNFC) return hits;
  for (const f of fields) {
    const s = makeSnippets(f.value, qNFC, { radius, max });
    if (s.count > 0) {
      hits.push({
        field: f.field, snippet: s.snippet, snippets: s.snippets,
        count: s.count, truncated: s.truncated,
      });
    }
  }
  return hits;
}

/** JSON 배열 컬럼(techniques.pos, video_clips.position 등)을 이름 배열로. safeParse 로만 연다. */
function nameList(value) {
  const parsed = safeParse(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((x) => String((x && x.name) || x || '').trim()).filter(Boolean);
}

// ── 로더 ────────────────────────────────────────────────────────────────────
// 🔴 전부 `WHERE user_id = ?` 뿐이다. 검색어는 SQL 에 넣지 않는다(위 NFD 주석).
//    데이터가 작다 — 실측 기술 53 · 클립 135 · 챕터 23 · 게임플랜 2 · 체인 2 (계정 3 기준).

async function loadTechniques(uid) {
  const [rows] = await sequelize.query(
    'SELECT id, name, note, pos, category FROM techniques WHERE user_id = ? ORDER BY id DESC',
    { replacements: [uid] }
  );
  return rows;
}

async function loadGameplans(uid) {
  const [rows] = await sequelize.query(
    'SELECT id, name, note, start_pos, end_pos FROM gameplans WHERE user_id = ? ORDER BY id DESC',
    { replacements: [uid] }
  );
  return rows;
}

async function loadChains(uid) {
  // 체인은 스텝 이름까지 검색 대상이다 — 체인 이름만 보면 "싱글렉 연계" 안의 스텝을 못 찾는다.
  const [rows] = await sequelize.query(
    'SELECT id, name, note FROM technique_chains WHERE user_id = ? ORDER BY id DESC',
    { replacements: [uid] }
  );
  if (!rows.length) return rows;
  // 🔴 `chain_steps` 에는 이름 컬럼이 없다 — `technique_id` 로 techniques 를 가리킨다(실측).
  //    LEFT JOIN 인 이유: 기술이 지워진 스텝(technique_id 가 끊긴 행)이 있어도 체인 자체를
  //    검색 결과에서 통째로 떨어뜨리지 않기 위해서다. 이름 없는 스텝은 빈 값으로 빠질 뿐이다.
  const [steps] = await sequelize.query(
    `SELECT cs.chain_id, t.name AS step_name, cs.transition_note
       FROM chain_steps cs
       JOIN technique_chains tc ON tc.id = cs.chain_id
       LEFT JOIN techniques  t  ON t.id  = cs.technique_id AND t.user_id = tc.user_id
      WHERE tc.user_id = ? ORDER BY cs.chain_id ASC, cs.step_order ASC, cs.id ASC`,
    { replacements: [uid] }
  );
  const byChain = new Map();
  for (const s of steps) {
    const k = Number(s.chain_id);
    if (!byChain.has(k)) byChain.set(k, { names: [], notes: [] });
    const b = byChain.get(k);
    const nm = String(s.step_name ?? '').trim();
    if (nm) b.names.push(nm);
    const nt = String(s.transition_note ?? '').trim();
    if (nt) b.notes.push(nt);
  }
  return rows.map((r) => {
    const b = byChain.get(Number(r.id)) || { names: [], notes: [] };
    return { ...r, step_names: b.names, step_notes: b.notes };
  });
}

async function loadClips(uid) {
  const [rows] = await sequelize.query(
    `SELECT id, title, description, tech_name, position, platform
       FROM video_clips WHERE user_id = ? ORDER BY id DESC`,
    { replacements: [uid] }
  );
  return rows;
}

async function loadChapters(uid) {
  // 🔴 챕터 제목은 실측상 "구간 1 (0:00~3:49)" 같은 자동 생성 문자열이다. 제목만 검색하면
  //    이 출처는 **에러 없이 항상 0건**이 된다. 요약과 **부모 영상 제목**까지 봐야 실제로 걸린다.
  //    (그 부모 제목이 바로 task-014 에서 NFD 로 저장된 것이 발견된 그 컬럼이다.)
  const [rows] = await sequelize.query(
    `SELECT c.id, c.long_video_id, c.idx, c.title, c.summary, c.start_sec, c.end_sec,
            v.title AS video_title
       FROM long_video_chapters c
       JOIN long_videos v ON v.id = c.long_video_id
      WHERE c.user_id = ? ORDER BY c.long_video_id DESC, c.idx ASC`,
    { replacements: [uid] }
  );
  return rows;
}

// ── 출처별 매칭 ──────────────────────────────────────────────────────────────

/** 수업기록 — **recallSearch 를 통째로 재사용**한다. 여기에 검색 로직이 없다. */
function matchClasses(corpus, q) {
  const { results } = searchCorpus(corpus, { q });
  return results.map((r) => ({
    refId: Number(r.classId),
    title: r.theme || '(테마 없음)',
    subtitle: [r.date, r.dateEnd && r.dateEnd !== r.date ? `~ ${r.dateEnd}` : '']
      .filter(Boolean).join(' '),
    date: r.date ?? null,
    hits: r.hits,
    meta: { positions: r.positions, transcriptChars: r.transcriptChars },
  }));
}

function matchTechniques(rows, qNFC) {
  const out = [];
  for (const r of rows) {
    const pos = nameList(r.pos);
    const hits = rowHits([
      { field: 'name', value: r.name },
      { field: 'note', value: r.note },
      { field: 'pos',  value: pos.join(' · ') },
    ], qNFC);
    if (qNFC && !hits.length) continue;
    out.push({
      refId: Number(r.id),
      title: r.name ?? '',
      subtitle: [r.category || '', pos.join(' · ')].filter(Boolean).join(' · '),
      date: null,
      hits,
      meta: { positions: pos, category: r.category ?? null },
    });
  }
  return out;
}

function matchGameplans(rows, qNFC) {
  const out = [];
  for (const r of rows) {
    const hits = rowHits([
      { field: 'name',     value: r.name },
      { field: 'note',     value: r.note },
      { field: 'startPos', value: r.start_pos },
      { field: 'endPos',   value: r.end_pos },
    ], qNFC);
    if (qNFC && !hits.length) continue;
    out.push({
      refId: Number(r.id),
      title: r.name ?? '',
      subtitle: [r.start_pos, r.end_pos].filter(Boolean).join(' → '),
      date: null,
      hits,
      meta: { startPos: r.start_pos ?? null, endPos: r.end_pos ?? null },
    });
  }
  return out;
}

function matchChains(rows, qNFC) {
  const out = [];
  for (const r of rows) {
    const steps = Array.isArray(r.step_names) ? r.step_names : [];
    const notes = Array.isArray(r.step_notes) ? r.step_notes : [];
    const hits = rowHits([
      { field: 'name',      value: r.name },
      { field: 'note',      value: r.note },
      { field: 'steps',     value: steps.join(' → ') },
      { field: 'stepNotes', value: notes.join(' · ') },
    ], qNFC);
    if (qNFC && !hits.length) continue;
    out.push({
      refId: Number(r.id),
      title: r.name ?? '',
      subtitle: steps.join(' → '),
      date: null,
      hits,
      meta: { stepCount: steps.length, steps },
    });
  }
  return out;
}

function matchClips(rows, qNFC) {
  const out = [];
  for (const r of rows) {
    const techNames = nameList(r.tech_name);
    const positions = nameList(r.position);
    const hits = rowHits([
      { field: 'title',       value: r.title },
      { field: 'description', value: r.description },
      { field: 'techName',    value: techNames.join(' · ') },
      { field: 'position',    value: positions.join(' · ') },
    ], qNFC);
    if (qNFC && !hits.length) continue;
    out.push({
      refId: Number(r.id),
      title: r.title ?? '',
      subtitle: [r.platform || '', techNames.join(' · ')].filter(Boolean).join(' · '),
      date: null,
      hits,
      meta: { platform: r.platform ?? null, techNames, positions },
    });
  }
  return out;
}

function matchChapters(rows, qNFC) {
  const out = [];
  for (const r of rows) {
    const hits = rowHits([
      { field: 'title',      value: r.title },
      { field: 'summary',    value: r.summary },
      { field: 'videoTitle', value: r.video_title },
    ], qNFC);
    if (qNFC && !hits.length) continue;
    out.push({
      refId: Number(r.id),
      title: r.title ?? '',
      subtitle: r.video_title ?? '',
      date: null,
      hits,
      meta: {
        longVideoId: Number(r.long_video_id),
        idx: Number(r.idx) || 0,
        startSec: r.start_sec == null ? null : Number(r.start_sec),
        endSec:   r.end_sec   == null ? null : Number(r.end_sec),
      },
    });
  }
  return out;
}

// ── 통합 ────────────────────────────────────────────────────────────────────

/**
 * 5개 저장소(6갈래) 통합 검색.
 *
 * @param uid       소유자. 모든 SQL 이 이 값으로 좁힌다.
 * @param q         검색어. **빈 문자열이면 "둘러보기"** — 각 출처의 최신 `limit` 건을 그대로 준다
 *                  (화면을 열자마자 빈 손이 되지 않게. `browse: true` 로 구분해 알린다).
 * @param sources   출처 키 배열. 비면 전부.
 * @param limit     출처당 반환 개수(기본 10, 상한 50). `total` 은 자르기 **전** 매치 수다.
 */
async function importSearch(uid, { q = '', sources = null, limit = DEFAULT_LIMIT } = {}) {
  const qNFC = normQuery(q);
  const browse = qNFC === '';
  const cap = Math.max(1, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT));

  const wanted = (Array.isArray(sources) && sources.length)
    ? SOURCE_KEYS.filter((k) => sources.includes(k))
    : SOURCE_KEYS;
  const want = (k) => wanted.includes(k);

  // 🔴 필요한 출처만 읽는다. 그리고 각 출처는 **쿼리 1~2회** — 행마다 도는 쿼리가 없다(N+1 금지).
  const [corpus, techniques, gameplans, chains, clips, chapters] = await Promise.all([
    want('class')     ? loadRecallCorpus(uid) : Promise.resolve({ userId: uid, classes: [] }),
    want('technique') ? loadTechniques(uid)   : Promise.resolve([]),
    want('gameplan')  ? loadGameplans(uid)    : Promise.resolve([]),
    want('chain')     ? loadChains(uid)       : Promise.resolve([]),
    want('clip')      ? loadClips(uid)        : Promise.resolve([]),
    want('chapter')   ? loadChapters(uid)     : Promise.resolve([]),
  ]);

  const matchedBy = {
    class:     want('class')     ? matchClasses(corpus, q)          : [],
    technique: want('technique') ? matchTechniques(techniques, qNFC) : [],
    gameplan:  want('gameplan')  ? matchGameplans(gameplans, qNFC)   : [],
    chain:     want('chain')     ? matchChains(chains, qNFC)         : [],
    clip:      want('clip')      ? matchClips(clips, qNFC)           : [],
    chapter:   want('chapter')   ? matchChapters(chapters, qNFC)     : [],
  };
  const availableBy = {
    class: corpus.classes.length, technique: techniques.length, gameplan: gameplans.length,
    chain: chains.length, clip: clips.length, chapter: chapters.length,
  };

  const groups = [];
  let totalMatched = 0;
  for (const key of wanted) {
    const meta = SOURCE_BY_KEY.get(key);
    const all  = matchedBy[key];
    totalMatched += all.length;
    groups.push({
      source: key,
      label: meta.label,
      linkType: meta.linkType,
      // total = 자르기 전 매치 수 · available = 그 저장소에 이 계정이 가진 전체 행 수.
      // 🔴 둘을 구분하는 이유: `total:0, available:0` 은 "기록 없음"이고
      //    `total:0, available:135` 는 "검색어가 없음"이다. 화면이 다르게 말해야 한다.
      total: all.length,
      available: availableBy[key],
      truncated: all.length > cap,
      items: all.slice(0, cap).map((it) => ({
        source: key,
        label: meta.label,
        // 🔴 이 두 값이 그대로 POST /nodes/:id/links 의 본문이 된다. 화면이 재조립하지 않게 서버가 준다.
        linkType: meta.linkType,
        refId: it.refId,
        title: it.title,
        subtitle: it.subtitle,
        date: it.date,
        hits: it.hits,
        meta: it.meta,
      })),
    });
  }

  return {
    q: String(q ?? ''),
    qNorm: qNFC,
    browse,
    limit: cap,
    sources: groups,
    summary: {
      matched: totalMatched,
      returned: groups.reduce((n, g) => n + g.items.length, 0),
      sourcesWithResults: groups.filter((g) => g.total > 0).length,
      sourcesSearched: groups.length,
      // "아무 저장소에도 기록이 없다" — 검색어가 안 걸린 것과 다른 말이다.
      emptyStores: groups.filter((g) => g.available === 0).map((g) => g.source),
    },
  };
}

module.exports = {
  SOURCES, SOURCE_KEYS, DEFAULT_LIMIT, MAX_LIMIT,
  rowHits, nameList,
  matchClasses, matchTechniques, matchGameplans, matchChains, matchClips, matchChapters,
  loadTechniques, loadGameplans, loadChains, loadClips, loadChapters,
  importSearch,
};
