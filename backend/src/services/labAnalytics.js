// 복기·연구 집계 (task-024) — /api/holes · /api/mastery/:techId 의 계산 전부.
//
// [왜 서비스로 분리했나]
// 라우트에 인라인으로 쓰면 QA가 HTTP를 통해서만 검증할 수 있다. 이 집계는 "조용히 틀리는"
// 실패 방식이 여럿이라(아래) 네거티브 컨트롤 — 일부러 틀린 설정을 주입해 숫자가 무너지는지
// 확인하는 검증 — 이 필수다. 그래서 벨트 서열 맵과 "본인 벨트 결정 함수"를 **주입 가능**하게
// 두고, 계산 함수는 순수 함수(데이터 in → 결과 out)로 만들었다.
// 🔴 이 주입 가능성은 편의 기능이 아니라 **설계 요건**이다. 하드코딩하면 QA가
//    "코드를 봤더니 맞더라"로 후퇴하게 된다. 인자를 안 주면 정상 기본값으로 동작한다.
//
// [이 파일이 막고 있는 조용한 실패 5가지 — 전부 운영 DB에서 재현된 것]
//  1. 소유 스코프: spar_sessions·spar_days·drills 에는 user_id 컬럼이 **없다**.
//     반드시 classes 까지 조인해야 한다. 빠뜨리면 계정 간 데이터가 섞인다.
//  2. 벨트 서열: belt_history 에 'white' 와 '화이트' 가 **섞여 있다**. 한글만 매핑하면
//     5단계 집계가 20건 → 6건으로 줄고 14건이 에러 없이 사라진다.
//  3. 본인 벨트: "그 스파링 날짜 시점"의 벨트여야 한다. 현재 벨트로 전 기간을 판정하면
//     20건 → 10건. 절반만 어긋나서 숫자가 그럴듯해 보인다 — 그래서 더 발견하기 어렵다.
//  4. 파싱 타입: success·positions 는 드라이버가 **문자열**로 준다. 배열로 착각해
//     JSON.parse 하면 throw → catch → 행이 통째로 조용히 걸러진다.
//  5. 날짜: DATE 컬럼이 Date 객체로 오는 경로에서 toISOString() 을 쓰면 KST(+9) 기준
//     하루가 밀린다(2026-06-24 → 2026-06-23). SQL 의 DATE_FORMAT 으로 뽑는다.
const { sequelize } = require('../config/db');
const { normalize, matchTechnique } = require('../utils/techMatch');

// 🔴 영문 + 한글 **병기** 필수. 실측: belt_history 는 영문('white')과 한글('화이트')이 섞여 있고
//    spar_sessions.level 은 전부 한글이다. 한쪽만 넣으면 반대쪽이 통째로 매핑 실패한다.
const DEFAULT_BELT_RANK = Object.freeze({
  white: 0, '화이트': 0,
  blue:  1, '블루':   1,
  purple:2, '퍼플':   2,
  brown: 3, '브라운': 3,
  black: 4, '블랙':   4,
});

const LADDER_LABELS = Object.freeze([
  null,
  { key: 'learned',      label: '배움',          auto: true  },
  { key: 'drilled',      label: '드릴',          auto: false },
  { key: 'positionSpar', label: '포지션 스파링', auto: false },
  { key: 'spar',         label: '스파링',        auto: true  },
  { key: 'upperBelt',    label: '상위 벨트',     auto: true  },
]);

/**
 * 날짜를 'YYYY-MM-DD' 문자열로.
 * 🔴 toISOString() 을 쓰지 않는다 — UTC 로 변환되면서 KST 기준 하루가 밀린다.
 *    (실측: 2026-06-24 → toISOString() → '2026-06-23')
 *    String(d).slice(0,10) 도 안 된다 — 'Wed Jun 24' 가 나온다.
 * 이 함수는 안전망이고, 1차 방어는 SQL 의 DATE_FORMAT 이다.
 */
function fmtDate(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).slice(0, 10);
}

/** 벨트 문자열 → 서열 숫자. 매핑에 없으면 undefined (0 과 구분해야 하므로 null 이 아니다). */
function beltRankOf(value, beltRank = DEFAULT_BELT_RANK) {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  // 영문은 대소문자를 무시하고, 한글은 원문 그대로 조회한다(toLowerCase 가 한글을 바꾸지 않으므로
  // 두 번 조회해도 안전하다).
  const lower = raw.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(beltRank, lower)) return beltRank[lower];
  if (Object.prototype.hasOwnProperty.call(beltRank, raw))   return beltRank[raw];
  return undefined;
}

/**
 * 기본 "본인 벨트 결정 함수" — 🔴 그 스파링 **날짜 시점**의 벨트.
 * belt_history 에서 achieved_date <= 날짜 인 마지막 행. 현재 벨트로 전 기간을 판정하면 안 된다.
 * @param {Array<{achieved_date:string, belt:string}>} beltRows achieved_date 오름차순 정렬 필요
 * @returns {(date:string) => string|null}
 */
function makeAsOfDateBelt(beltRows) {
  const rows = (beltRows || []).slice().sort((a, b) => String(a.achieved_date).localeCompare(String(b.achieved_date)));
  return function ownBeltAt(date) {
    let cur = null;
    for (const r of rows) {
      if (String(r.achieved_date) <= String(date)) cur = r.belt;
      else break;
    }
    return cur;
  };
}

/**
 * 네거티브 컨트롤용 — 날짜와 무관하게 한 벨트로 고정하는 결정 함수.
 * 정상 동작에는 쓰지 않는다. QA 가 "현재 벨트로 전 기간 판정" 오류를 재현할 때 주입한다.
 */
function makeFixedBelt(belt) {
  return function ownBeltFixed() { return belt; };
}

/** success 항목 1개를 정규화. 레거시 호환: 문자열이면 {name, success:true} (routes/classes.js 와 같은 규칙). */
function normalizeItem(x) {
  const it = typeof x === 'string' ? { name: x, success: true } : (x || {});
  return {
    name:    String(it.name ?? '').trim(),
    // success 필드가 없는 과거 항목은 성공으로 본다(=== false 일 때만 실패).
    success: it.success !== false,
    causes:  Array.isArray(it.causes) ? it.causes.map((n) => parseInt(n, 10)).filter(Number.isInteger) : [],
  };
}

/**
 * JSON 컬럼 파싱. 🔴 실패를 조용히 넘기지 않는다 — 어느 행이 걸러졌는지 로그와 결과에 남긴다.
 * 조용한 필터링은 이 프로젝트가 이미 두 번 당한 실패 방식이다.
 */
function parseJsonArray(value, label, failures) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;            // 드라이버가 이미 파싱한 경우
  if (typeof value !== 'string') return [];
  const s = value.trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn(`[labAnalytics] JSON 파싱 실패로 건너뜀: ${label} — 값 앞부분: ${s.slice(0, 60)}`);
    failures.push(label);
    return [];
  }
}

/**
 * 이 사용자의 집계 원본을 한 번에 읽는다.
 * 🔴 소유 스코프: spar_sessions·spar_days·drills 에 user_id 가 없으므로 **classes 까지 조인**한다.
 * 🔴 날짜는 SQL 의 DATE_FORMAT 으로 문자열화한다(드라이버가 Date 로 주는 경로의 하루 밀림 차단).
 * 🔴 spar_causes 는 **읽기만** 한다 — 조회 API 가 시드를 만들면 안 된다.
 */
async function loadLabData(userId) {
  const parseFailures = [];

  const [techniques] = await sequelize.query(
    'SELECT id, name FROM techniques WHERE user_id = ? ORDER BY id ASC',
    { replacements: [userId] }
  );

  const [beltRows] = await sequelize.query(
    `SELECT DATE_FORMAT(achieved_date, '%Y-%m-%d') AS achieved_date, belt
       FROM belt_history WHERE user_id = ? ORDER BY achieved_date ASC, id ASC`,
    { replacements: [userId] }
  );

  const [sessionRows] = await sequelize.query(
    `SELECT ss.id, ss.level, ss.success,
            DATE_FORMAT(sd.date, '%Y-%m-%d') AS date
       FROM spar_sessions ss
       JOIN spar_days sd ON sd.id = ss.spar_day_id
       JOIN classes    c  ON c.id  = sd.class_id
      WHERE c.user_id = ?
      ORDER BY ss.id ASC`,
    { replacements: [userId] }
  );

  const [drillRows] = await sequelize.query(
    `SELECT d.id, d.tech, DATE_FORMAT(d.date, '%Y-%m-%d') AS date
       FROM drills d
       JOIN classes c ON c.id = d.class_id
      WHERE c.user_id = ?
      ORDER BY d.id ASC`,
    { replacements: [userId] }
  );

  // 실패 원인 태그 이름 사전 — 시드하지 않고 있는 그대로 읽는다(없으면 빈 맵).
  const [causeRows] = await sequelize.query(
    'SELECT id, name FROM spar_causes WHERE user_id = ?',
    { replacements: [userId] }
  );

  const sessions = sessionRows.map((r) => ({
    id: r.id,
    level: r.level,
    date: fmtDate(r.date),
    items: parseJsonArray(r.success, `spar_sessions.success id=${r.id}`, parseFailures)
      .map(normalizeItem)
      .filter((it) => it.name),
  }));

  const drills = drillRows.map((r) => {
    // drills.tech 는 JSON 배열 문자열(["델라리바","싱글엑스"]). 과거 단일 문자열 데이터도
    // 남아 있을 수 있어 배열이 아니면 통째로 이름 하나로 취급한다.
    let names;
    const t = r.tech;
    if (typeof t === 'string' && t.trim() && !t.trim().startsWith('[')) {
      names = [t.trim()];
    } else {
      names = parseJsonArray(t, `drills.tech id=${r.id}`, parseFailures);
    }
    return {
      id: r.id,
      date: fmtDate(r.date),
      names: names
        .map((x) => (typeof x === 'string' ? x : (x && x.name) || ''))
        .map((s) => String(s).trim())
        .filter(Boolean),
    };
  });

  return {
    userId,
    techniques,
    belts: beltRows.map((b) => ({ achieved_date: fmtDate(b.achieved_date), belt: b.belt })),
    sessions,
    drills,
    causeNames: new Map(causeRows.map((c) => [c.id, c.name])),
    parseFailures,
  };
}

/** 같은 이름을 여러 번 매칭하지 않도록 정규화명 기준 캐시. 후보는 이미 user 로 스코프된 목록이다. */
function makeMatcher(techniques) {
  const cache = new Map();
  return function match(rawName) {
    const key = normalize(rawName);
    if (!cache.has(key)) cache.set(key, matchTechnique(rawName, techniques));
    return cache.get(key);
  };
}

/**
 * 세션마다 "본인 벨트 / 상대 벨트" 서열을 판정한다.
 * 🔴 매핑에 없는 벨트 값을 조용히 건너뛰지 않는다 — console.warn 을 남기고 unknownBelts 로도 내보낸다.
 *    (한글만 매핑했을 때 'white' 39건이 소리 없이 사라지는 것이 이 task 최대 위험이었다)
 * 두 인자 모두 주입 가능 — 네거티브 컨트롤이 여기를 갈아끼운다.
 */
function resolveBelts(data, { beltRank = DEFAULT_BELT_RANK, ownBeltAt } = {}) {
  const resolveOwn = ownBeltAt || makeAsOfDateBelt(data.belts);
  // source -> (value -> count).
  // ⚠️ 한 개의 문자열 키(`source+구분자+value`)로 합치고 나중에 split 하지 않는다 —
  //    구분자를 고르는 순간 그 문자가 값에 들어오면 깨지고, 소스에 제어문자가 섞이면
  //    grep 이 파일을 binary 로 보고 **검색 결과를 조용히 비워 돌려준다**(리뷰어 검증이 무력화된다).
  const unknown = new Map();
  const noteUnknown = (value, source) => {
    if (!unknown.has(source)) unknown.set(source, new Map());
    const bucket = unknown.get(source);
    bucket.set(value, (bucket.get(value) || 0) + 1);
  };

  const bySession = new Map();
  for (const s of data.sessions) {
    const ownBelt = resolveOwn(s.date);
    const ownRank = beltRankOf(ownBelt, beltRank);
    const oppRank = beltRankOf(s.level, beltRank);
    if (ownBelt && ownRank === undefined) noteUnknown(String(ownBelt).trim(), 'belt_history');
    if (String(s.level ?? '').trim() && oppRank === undefined) noteUnknown(String(s.level).trim(), 'level');
    bySession.set(s.id, { ownBelt: ownBelt ?? null, ownRank, oppRank });
  }

  const unknownBelts = [...unknown.entries()]
    .flatMap(([source, bucket]) => [...bucket.entries()].map(([value, count]) => ({ value, source, count })))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  for (const u of unknownBelts) {
    console.warn(`[labAnalytics] 벨트 서열 맵에 없는 값: "${u.value}" (${u.source}, ${u.count}회) — 5단계 판정에서 제외됨`);
  }
  return { bySession, unknownBelts };
}

/**
 * 5단계(상위 벨트 상대에게 성공) 해당 항목 집계.
 * "상위 벨트" = 상대 서열 > 본인 서열. 둘 중 하나라도 판정 불가면 제외한다.
 * 네거티브 컨트롤이 직접 호출하는 진입점이기도 하다(20 → 6 / 20 → 10 재현).
 */
function computeUpperBeltItems(data, opts = {}) {
  const { bySession, unknownBelts } = resolveBelts(data, opts);
  const match = opts.match || makeMatcher(data.techniques);

  let count = 0;
  const byTechnique = new Map();   // tid -> {count, samples:[]}
  const unlinked    = new Map();   // name -> count

  for (const s of data.sessions) {
    const b = bySession.get(s.id);
    if (!b || b.ownRank === undefined || b.oppRank === undefined) continue;
    if (!(b.oppRank > b.ownRank)) continue;
    for (const it of s.items) {
      if (!it.success) continue;
      count++;
      const m = match(it.name);
      if (m.technique_id) {
        if (!byTechnique.has(m.technique_id)) byTechnique.set(m.technique_id, { count: 0, samples: [] });
        const e = byTechnique.get(m.technique_id);
        e.count++;
        // 응답 비대 방지 — 최대 5건만 보관하고 전체 수는 count 로 알린다.
        if (e.samples.length < 5) {
          e.samples.push({ date: s.date, level: s.level ?? null, ownBelt: b.ownBelt, ownRank: b.ownRank, oppRank: b.oppRank });
        }
      } else {
        unlinked.set(it.name, (unlinked.get(it.name) || 0) + 1);
      }
    }
  }
  return { count, byTechnique, unlinked, unknownBelts, bySession };
}

/** 한 집계 버킷의 표시 이름 — 최빈 원본 표기, 동률이면 첫 등장(Map 삽입순 + 안정 정렬). */
function displayName(nameCounts) {
  return [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * GET /api/holes — 실패 항목을 기술명으로 집계.
 *
 * 🔴 집계 키는 techMatch.normalize() 한 **이름**이지 technique_id 가 아니다.
 *    technique_id 로 묶으면 '삼각 쵸크'(alias→27)가 '트라이앵글 쵸크'에 합쳐져 5건이 6건이 된다.
 *    대신 같은 technique_id 를 가진 이름이 둘 이상이면 summary.sameTechnique 로 **드러낸다** —
 *    조용히 합치지도, 조용히 숨기지도 않는다.
 *
 * 🔴 holes 와 unlinked 는 **겹칠 수 있다**. 미연결인데 실패가 threshold 이상이면 양쪽에 모두 들어간다.
 *    (현재 데이터에서는 미연결이 전부 실패 1건이라 겹치지 않지만, 기록이 쌓이면 겹친다.)
 *    unlinked 는 threshold 와 **무관하게** 전부 내보낸다 — "매칭이 안 돼서" 빠진 것과
 *    "횟수가 낮아서" 빠진 것을 화면에서 구분할 수 있어야 하기 때문이다.
 */
function computeHoles(data, opts = {}) {
  // ⚠️ `parseInt(x) || 2` 로 쓰면 안 된다 — min=0 이 falsy 라 클램프(→1)가 아니라 기본값(2)이 된다.
  //    숫자가 아닐 때만 기본값으로 떨어지고, 숫자면 1~99 로 클램프한다.
  const parsedMin = parseInt(opts.threshold, 10);
  const threshold = Number.isNaN(parsedMin) ? 2 : Math.min(99, Math.max(1, parsedMin));
  const match = opts.match || makeMatcher(data.techniques);

  const agg = new Map();   // normName -> bucket
  let items = 0, successItems = 0, failItems = 0;

  for (const s of data.sessions) {
    for (const it of s.items) {
      items++;
      if (it.success) successItems++; else failItems++;
      const key = normalize(it.name);
      if (!agg.has(key)) {
        agg.set(key, { normName: key, names: new Map(), failCount: 0, successCount: 0, lastFailedAt: null, causes: new Map() });
      }
      const b = agg.get(key);
      b.names.set(it.name, (b.names.get(it.name) || 0) + 1);
      if (it.success) {
        b.successCount++;
      } else {
        b.failCount++;
        // 🔴 "최근 실패일" = 실패한 날짜들의 **최댓값**. 비집계 컬럼을 그냥 집어오면
        //    (ONLY_FULL_GROUP_BY 가 꺼져 있어 SQL 이 막아주지 않는다) 임의의 행 값이 나온다.
        if (!b.lastFailedAt || s.date > b.lastFailedAt) b.lastFailedAt = s.date;
        for (const id of it.causes) b.causes.set(id, (b.causes.get(id) || 0) + 1);
      }
    }
  }

  const view = (b) => {
    const name = displayName(b.names);
    const m = match(name);
    return {
      name,
      normName: b.normName,
      failCount: b.failCount,
      successCount: b.successCount,
      lastFailedAt: b.lastFailedAt,
      // 이름을 못 찾아도 항목을 버리지 않는다 — 지워진(비활성) 태그도 개수는 보여야 한다.
      causes: [...b.causes.entries()]
        .map(([id, count]) => ({ id, name: data.causeNames.get(id) ?? null, count }))
        .sort((x, y) => y.count - x.count || x.id - y.id),
      techniqueId:  m.technique_id,
      matchedName:  m.matched_name,
      matchType:    m.match_type,
      linked:       !!m.technique_id,
      isHole:       b.failCount >= threshold,
    };
  };

  // 결정적 정렬: 실패수 ↓ → 최근 실패일 ↓ → 이름 ↑
  const byRank = (x, y) =>
    y.failCount - x.failCount ||
    String(y.lastFailedAt ?? '').localeCompare(String(x.lastFailedAt ?? '')) ||
    x.name.localeCompare(y.name);

  const all = [...agg.values()].map(view);
  const holes    = all.filter((h) => h.failCount >= threshold).sort(byRank);
  const unlinked = all.filter((h) => h.failCount > 0 && !h.linked).sort(byRank);

  let linkedFailItems = 0, unlinkedFailItems = 0;
  for (const h of all) {
    if (h.failCount <= 0) continue;
    if (h.linked) linkedFailItems += h.failCount; else unlinkedFailItems += h.failCount;
  }

  // 같은 technique_id 를 가진 서로 다른 이름 — 합치지 않았다는 사실을 드러낸다.
  const byTid = new Map();
  for (const h of all) {
    if (!h.techniqueId) continue;
    if (!byTid.has(h.techniqueId)) byTid.set(h.techniqueId, []);
    byTid.get(h.techniqueId).push(h.name);
  }
  const sameTechnique = [...byTid.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([techniqueId, names]) => ({ techniqueId, names: names.slice().sort() }))
    .sort((a, b) => a.techniqueId - b.techniqueId);

  return {
    threshold,
    empty: items === 0,
    summary: {
      sparSessions: data.sessions.length,
      items, successItems, failItems,
      linkedFailItems, unlinkedFailItems,
      unlinkedNames: unlinked.length,
      sameTechnique,
      parseFailures: data.parseFailures,
    },
    holes,
    unlinked,
  };
}

/**
 * GET /api/mastery/:techId — 사다리 5단계 판정.
 *
 * 🔴 reached 는 **done 인 단계 중 최댓값**이다. "연속으로 올라온 마지막 칸"이 아니다.
 *    실제 데이터에 1단계는 못 올랐는데 4·5단계는 올라 있는 기술이 있다(니슬라이드 — 드릴로
 *    배운 적은 없지만 스파링에서 8번 성공, 그중 6번이 상위 벨트 상대). 연속으로 계산하면 0이 된다.
 *
 * 🔴 status 는 done / not_yet / no_record 3값이다. "아직 못 했다"와 "잴 기록이 아예 없다"는
 *    다른 말이다. 표본이 0건인데 0/0 으로 표시하면 사용자는 자기가 못한 줄 안다.
 *    판정 규칙: 이 기술이 드릴·스파링 **어디에도 안 나오면** 자동 3단계 전부 no_record,
 *    한 군데라도 나오면 각 단계는 자기 근거로 done / not_yet 을 가른다.
 */
function computeMastery(data, techniqueId, opts = {}) {
  const tid = parseInt(techniqueId, 10);
  const tech = data.techniques.find((t) => t.id === tid);
  if (!tech) return null;

  const match = opts.match || makeMatcher(data.techniques);
  const matchedNames = new Set();

  // 1단계 — 드릴에서 배운 적이 있는가
  let drillHits = 0, drillLastAt = null;
  for (const d of data.drills) {
    for (const nm of d.names) {
      const m = match(nm);
      if (m.technique_id !== tid) continue;
      drillHits++;
      matchedNames.add(nm);
      if (!drillLastAt || d.date > drillLastAt) drillLastAt = d.date;
    }
  }

  // 4단계 — 스파링에서 성공한 적이 있는가
  let successCount = 0, failCount = 0, sparLastAt = null;
  for (const s of data.sessions) {
    for (const it of s.items) {
      const m = match(it.name);
      if (m.technique_id !== tid) continue;
      matchedNames.add(it.name);
      if (it.success) {
        successCount++;
        if (!sparLastAt || s.date > sparLastAt) sparLastAt = s.date;
      } else {
        failCount++;
      }
    }
  }

  // 5단계 — 상위 벨트 상대에게 성공한 적이 있는가
  const upper = computeUpperBeltItems(data, { ...opts, match });
  const upperEntry = upper.byTechnique.get(tid) || { count: 0, samples: [] };

  // 이 기술에 대한 기록이 아예 없으면 자동 단계는 전부 no_record.
  const hasAnyRecord = drillHits > 0 || successCount > 0 || failCount > 0;
  const autoStatus = (evidenceCount) => {
    if (!hasAnyRecord) return 'no_record';
    return evidenceCount > 0 ? 'done' : 'not_yet';
  };

  const m = opts.mastery || null;   // technique_mastery 행 (없으면 2·3단계 false)
  const step1Status = autoStatus(drillHits);
  const step4Status = autoStatus(successCount);
  const step5Status = autoStatus(upperEntry.count);

  const steps = [
    { step: 1, ...LADDER_LABELS[1], status: step1Status, done: step1Status === 'done',
      evidence: { drillHits, lastAt: drillLastAt } },
    { step: 2, ...LADDER_LABELS[2], done: !!(m && m.drilled),
      checkedAt: (m && m.drilled && m.drilled_at) ? m.drilled_at : null },
    { step: 3, ...LADDER_LABELS[3], done: !!(m && m.position_spar),
      checkedAt: (m && m.position_spar && m.position_spar_at) ? m.position_spar_at : null },
    { step: 4, ...LADDER_LABELS[4], status: step4Status, done: step4Status === 'done',
      evidence: { successItems: successCount, lastAt: sparLastAt } },
    { step: 5, ...LADDER_LABELS[5], status: step5Status, done: step5Status === 'done',
      evidence: { count: upperEntry.count, samples: upperEntry.samples } },
  ];

  // 🔴 최댓값. 연속 가정 금지.
  const reached = steps.reduce((mx, s) => (s.done ? Math.max(mx, s.step) : mx), 0);

  return {
    techniqueId: tid,
    name: tech.name,
    reached,
    steps,
    sample: {
      sparSessions: data.sessions.length,
      successItems: successCount,
      failItems: failCount,
      drillHits,
    },
    unknownBelts: upper.unknownBelts,
    matchedNames: [...matchedNames],
  };
}


/**
 * 오늘 날짜(KST) 'YYYY-MM-DD'.
 * 🔴 toISOString() 금지 — UTC 로 변환되면서 KST 기준 하루가 밀린다. 서버 TZ 설정에 기대지도
 *    않는다(coachAnalytics 의 UTC 버그가 그렇게 생겼다): UTC 에 +9시간을 더해 명시적으로 만든다.
 */
function todayKST(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())}`;
}

/**
 * 'YYYY-MM-DD' 두 개 사이의 일수. 🔴 문자열 → Date.UTC 로만 계산한다 —
 * 로컬 Date 생성자를 쓰면 서머타임·TZ 가 개입해 경계에서 하루가 어긋난다.
 */
function daysBetween(fromDate, toDate) {
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const a = parse(fromDate), b = parse(toDate);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * GET /api/recall/stale — "잊기 직전" (task-025).
 *
 * 기술마다 **마지막 배움일**(매칭된 drills.date 최댓값)과 **마지막 스파링 등장일**
 * (매칭된 spar 세션 date 최댓값, 성공/실패 무관 — "등장"이 기준이다)을 구하고,
 * 둘 중 더 최근 날짜로부터 오늘까지의 경과일이 긴 순으로 정렬한다.
 *
 * 🔴 구멍 목록에 있는 기술은 **여기서**(백엔드에서) 제외한다. 프론트에서 걸러도 화면은 같지만,
 *    그러면 QA 가 API 한 번으로 "중복 없음"을 판정할 수 없고 두 곳이 어긋났을 때 원인 추적이
 *    불가능해진다. 제외한 사실은 excludedHoleNames / excludedTechniqueIds 로 **드러낸다** —
 *    조용히 지우지 않는다.
 *
 * 🔴 status 는 'stale' 과 'no_record' 두 값이고 **다른 말**이다. 기록이 아예 없는 기술을
 *    "경과 0일"로 쓰면 방금 한 것처럼 보인다. 정렬에서도 섞지 않는다 — stale 먼저, no_record 뒤로.
 *
 * @param {object} data          loadLabData() 결과
 * @param {object} opts
 *   holes  — computeHoles() 결과(또는 {holes:[...]}). 제외 목록의 근거. 주입 가능 = QA 가
 *            빈 목록을 넣어 "제외가 실제로 동작하는지"를 역검증할 수 있다.
 *   today  — 'YYYY-MM-DD'. 주입 가능 = 시간이 흘러도 QA 기대값이 고정된다.
 *   limit  — 기본 10, 1~50 클램프.
 */
function computeStale(data, opts = {}) {
  const today = opts.today || todayKST();
  const match = opts.match || makeMatcher(data.techniques);

  const parsedLimit = parseInt(opts.limit, 10);
  const limit = Number.isNaN(parsedLimit) ? 10 : Math.min(50, Math.max(1, parsedLimit));

  const holeList = Array.isArray(opts.holes) ? opts.holes : ((opts.holes && opts.holes.holes) || []);
  const excludedHoleNames    = holeList.map((h) => h.name);
  const excludedTechniqueIds = [...new Set(holeList.map((h) => h.techniqueId).filter((v) => v != null))];
  const excludedSet = new Set(excludedTechniqueIds);

  // 기술 id -> 마지막 배움일 / 마지막 등장일
  const lastLearned = new Map();
  const lastSeen    = new Map();
  const bump = (map, tid, date) => {
    if (!date) return;
    const cur = map.get(tid);
    if (!cur || date > cur) map.set(tid, date);
  };

  for (const d of data.drills) {
    for (const nm of d.names) {
      const m = match(nm);
      if (m.technique_id) bump(lastLearned, m.technique_id, d.date);
    }
  }
  for (const s of data.sessions) {
    for (const it of s.items) {
      const m = match(it.name);
      if (m.technique_id) bump(lastSeen, m.technique_id, s.date);
    }
  }

  const all = data.techniques
    .filter((t) => !excludedSet.has(t.id))
    .map((t) => {
      const learned = lastLearned.get(t.id) || null;
      const seen    = lastSeen.get(t.id)    || null;
      // 마지막 접촉일 = 배움/등장 중 **더 최근**. 'YYYY-MM-DD' 는 사전순 = 시간순이라 문자열 비교로 충분하다.
      const latest  = [learned, seen].filter(Boolean).sort().pop() || null;
      return {
        techniqueId: t.id,
        name: t.name,
        lastLearnedAt: learned,
        lastSeenAt: seen,
        // 🔴 표본 0건은 "경과 0일"이 아니라 no_record. daysSince 도 0 이 아니라 null 이다.
        daysSince: latest ? daysBetween(latest, today) : null,
        status: latest ? 'stale' : 'no_record',
      };
    });

  // stale 먼저(경과일 내림차순), no_record 뒤로. 동률은 이름 오름차순 — 결정적 정렬.
  const rank = (x) => (x.status === 'stale' ? 0 : 1);
  const items = all.sort((x, y) =>
    rank(x) - rank(y) ||
    (y.daysSince ?? -1) - (x.daysSince ?? -1) ||
    x.name.localeCompare(y.name)
  );

  return {
    today,
    limit,
    total: items.length,
    staleCount:    items.filter((i) => i.status === 'stale').length,
    noRecordCount: items.filter((i) => i.status === 'no_record').length,
    excludedHoleNames,
    excludedTechniqueIds,
    items: items.slice(0, limit),
  };
}

module.exports = {
  DEFAULT_BELT_RANK,
  fmtDate,
  beltRankOf,
  makeAsOfDateBelt,
  makeFixedBelt,
  makeMatcher,
  loadLabData,
  resolveBelts,
  computeUpperBeltItems,
  computeHoles,
  computeMastery,
  todayKST,
  daysBetween,
  computeStale,
};
