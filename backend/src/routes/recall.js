const express = require('express');
const router  = express.Router();
const { sequelize } = require('../config/db');
const { RecallSummary } = require('../models');
const { ok, fail, wrap } = require('../utils/respond');
const lab    = require('../services/labAnalytics');
const recall = require('../services/recallSearch');
const { runClaude } = require('../services/claudeCli');

// ─────────────────────────────────────────────────────────────────────────────
// 복기 화면 API — task-025.  /api/recall/search · /stale · /summarize
//
// 이 라우터는 얇다. 계산은 전부 services/recallSearch.js(순수 함수)와
// services/labAnalytics.js(computeStale)에 있고, 여기서는 입력 검증 · DB I/O · 캐시만 한다.
// 🔴 그렇게 나눈 이유: QA 가 프롬프트 길이 같은 것을 HTTP 밖에서 직접 잴 수 있어야 하기 때문이다.
//    라우트에 인라인으로 쓰면 "코드를 읽어보니 맞더라"로 후퇴하는 것 말고는 방법이 없어진다.
// ─────────────────────────────────────────────────────────────────────────────

const Q_MAX_CP   = 200;   // recall_summaries.query_norm VARCHAR(200) 기준
const POS_MAX_CP = 100;
const DATE_RE    = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 공통 입력 검증. 잘못된 입력은 **400 으로 명시적으로** 돌려준다 —
 * 조용히 무시하고 전체 결과를 주면 사용자는 필터가 걸린 줄 안다.
 * 🔴 이모지(non-BMP)를 여기서 막는 이유: 이 DB 는 전 테이블 utf8mb3 라 STRICT 모드에서
 *    `Incorrect string value` **500** 이 된다(task-022 의 spar_causes 와 같은 처리).
 *    검색만 하면 DB 에 안 쓰이지만, 같은 문자열이 /summarize 에서 query_norm 으로 저장된다 —
 *    두 라우트가 같은 규칙을 쓰지 않으면 "검색은 되는데 요약만 500"이 된다.
 * @returns {{error:string}|{q:string, pos:string|null, from:string|null, to:string|null}}
 */
function readFilters(src) {
  const rawQ   = String(src.q ?? '');
  const rawPos = src.pos == null || src.pos === '' ? null : String(src.pos);
  const from   = src.from == null || src.from === '' ? null : String(src.from);
  const to     = src.to   == null || src.to   === '' ? null : String(src.to);

  if (recall.cpLength(rawQ) > Q_MAX_CP)   return { error: `검색어는 ${Q_MAX_CP}자 이내여야 합니다` };
  if (recall.hasNonBMP(rawQ))             return { error: '검색어에 이모지는 사용할 수 없습니다' };
  if (rawPos != null) {
    if (recall.cpLength(rawPos) > POS_MAX_CP) return { error: `포지션 이름은 ${POS_MAX_CP}자 이내여야 합니다` };
    if (recall.hasNonBMP(rawPos))             return { error: '포지션 이름에 이모지는 사용할 수 없습니다' };
  }
  if (from && !DATE_RE.test(from)) return { error: 'from 은 YYYY-MM-DD 형식이어야 합니다' };
  if (to   && !DATE_RE.test(to))   return { error: 'to 는 YYYY-MM-DD 형식이어야 합니다' };
  if (from && to && from > to)     return { error: 'from 이 to 보다 늦습니다' };

  return { q: rawQ, pos: rawPos, from, to };
}

/**
 * GET /api/recall/search?q&pos&from&to — 수업기록 통합 검색.
 * 대상 5곳: classes.note · classes.theme · classes.voice_transcript · drills.pos · drills.tech
 *
 * 🔴 SQL LIKE 로 찾지 않는다. LIKE 는 유니코드 정규화를 못 해서 NFD(자모분리)로 친 검색어가
 *    **에러 없이 0건**이 된다(task-014 가 당한 실패 방식 그대로). SQL 은 소유·날짜만 좁히고
 *    텍스트 매칭은 JS 에서 toNFC() 를 양쪽에 적용한 뒤 한다. 데이터가 작아 비용이 문제되지 않는다
 *    (수업 29건 · 전사본 합계 104KB).
 *
 * 🔴 전사본 본문은 응답에 싣지 않는다 — ±80자 스니펫 최대 3개뿐. 대신 transcriptChars 로 크기는 알린다.
 */
router.get('/search', wrap(async (req, res) => {
  const f = readFilters(req.query);
  if (f.error) return fail(res, 400, f.error);

  const corpus = await recall.loadRecallCorpus(req.user.id, { from: f.from, to: f.to });
  const { results } = recall.searchCorpus(corpus, f);

  ok(res, {
    query: f.q,
    pos: f.pos,
    from: f.from,
    to: f.to,
    total: results.length,
    scannedClasses: corpus.classes.length,
    results,
  });
}));

/**
 * GET /api/recall/stale?limit — "잊기 직전".
 *
 * 🔴 구멍 기술의 제외를 **여기서**(백엔드에서) 한다. 프론트에서 걸러도 화면은 같지만, 그러면
 *    QA 가 API 한 번으로 "구멍과 중복 없음"을 판정할 수 없다. 제외한 사실은 응답의
 *    excludedHoleNames / excludedTechniqueIds 로 드러낸다 — 조용히 지우지 않는다.
 *
 * computeHoles 를 여기서 한 번 더 부르는 것은 중복 계산이지만(같은 loadLabData 재사용),
 * 두 API 가 **같은 함수의 같은 기본 threshold** 를 쓰는 것이 화면 두 곳의 숫자가 어긋나지 않는
 * 유일하게 확실한 방법이다. 데이터가 작아 비용은 무시할 수준이다.
 */
router.get('/stale', wrap(async (req, res) => {
  const data  = await lab.loadLabData(req.user.id);
  const holes = lab.computeHoles(data);
  const result = lab.computeStale(data, { holes, limit: req.query.limit });
  ok(res, { threshold: holes.threshold, ...result });
}));

/** created_at 을 'YYYY-MM-DD HH:MM:SS' 로 — SQL 의 DATE_FORMAT 으로 뽑는다(드라이버 TZ 개입 차단). */
async function readCache(userId, queryNorm, hash) {
  const [[row]] = await sequelize.query(
    `SELECT id, content, prompt_chars,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS generated_at
       FROM recall_summaries
      WHERE user_id = ? AND query_norm = ? AND class_ids_hash = ?
      LIMIT 1`,
    { replacements: [userId, queryNorm, hash] }
  );
  return row || null;
}

/**
 * POST /api/recall/summarize — AI 복기 카드 (+ recall_summaries 캐시).
 * Body: { q, pos?, from?, to? }  또는  { classIds: [...] }
 *
 * 🔴 이 라우트의 최대 위험은 프롬프트 길이다. 전사본 합계가 104,283자 —
 *    claudeCli 의 하드캡 24,000자의 4.3배다. buildRecallPrompt() 가 예산 20,000자를
 *    **구조적으로** 지킨다(블록을 넣기 전에 자리를 확인하고, 없으면 안 넣는다).
 *    잘라낸 사실은 droppedClassIds · abridgedClassIds · truncated 로 응답에 드러낸다 —
 *    조용히 6건만 요약하고 "전부 봤다"는 얼굴을 하면 안 된다.
 *
 * 🔴 cached · generatedAt 이 응답에 없으면 QA 가 캐시 적중을 자기 보고 말고는 확인할 방법이 없다.
 */
router.post('/summarize', wrap(async (req, res) => {
  const uid  = req.user.id;
  const body = req.body || {};

  // ── 대상 수업 결정 ────────────────────────────────────────────────────────
  let classes, queryNorm, filters = null, explicitIds = null;

  if (Array.isArray(body.classIds)) {
    const ids = [...new Set(body.classIds.map((n) => parseInt(n, 10)).filter(Number.isInteger))];
    if (!ids.length) return fail(res, 400, 'classIds 가 비어 있습니다');
    if (ids.length > 50) return fail(res, 400, 'classIds 는 50건 이내여야 합니다');
    // 🔴 소유 필터는 코퍼스 로더(WHERE c.user_id = ?)가 한다. 넘겨받은 id 를 그대로 믿지 않는다 —
    //    남의 수업 id 를 넣어도 여기서 걸러져 결과에 없다.
    const corpus = await recall.loadRecallCorpus(uid);
    const set = new Set(ids);
    classes = corpus.classes.filter((c) => set.has(c.id));
    explicitIds = classes.map((c) => c.id);
    queryNorm = recall.buildQueryNorm({ classIds: explicitIds });
  } else {
    const f = readFilters(body);
    if (f.error) return fail(res, 400, f.error);
    filters = f;
    const corpus = await recall.loadRecallCorpus(uid, { from: f.from, to: f.to });
    ({ matched: classes } = recall.searchCorpus(corpus, f));
    queryNorm = recall.buildQueryNorm(f);
  }

  if (!classes.length) return fail(res, 400, '요약할 수업이 없습니다 — 검색 결과가 0건입니다');

  const matchedClassIds = classes.map((c) => c.id);
  const hash = recall.classIdsHash(matchedClassIds);

  // 프롬프트는 캐시 적중 여부와 무관하게 **항상** 만든다. 순수 함수라 같은 입력이면 같은 결과가
  // 나오므로, 캐시 적중 시에도 includedClassIds / droppedClassIds 를 정확히 보고할 수 있다.
  // (이 값들을 테이블에 저장하지 않고 다시 계산하는 이유 — 저장하면 두 곳이 어긋날 수 있다)
  const built = recall.buildRecallPrompt({
    query: filters ? filters.q : '',
    classes,
  });

  const shape = (row, cached) => ({
    cached,
    generatedAt: row.generated_at,
    promptChars: row.prompt_chars,
    promptCharsNow: built.chars,      // 지금 다시 만든 프롬프트 길이 — 캐시가 오래되면 달라질 수 있다
    matchedClassIds,
    includedClassIds: built.includedClassIds,
    droppedClassIds:  built.droppedClassIds,
    abridgedClassIds: built.abridgedClassIds,
    truncated: built.truncated,
    queryNorm,
    classIdsHash: hash,
    content: row.content,
  });

  const hit = await readCache(uid, queryNorm, hash);
  if (hit) return ok(res, shape(hit, true));

  // ── 캐시 미스 → AI 호출 ──────────────────────────────────────────────────
  const content = await runClaude(built.prompt, { priority: 'interactive' });

  try {
    await RecallSummary.create({
      user_id: uid, query_norm: queryNorm, class_ids_hash: hash,
      content, prompt_chars: built.chars,
    });
  } catch (e) {
    // UNIQUE(user_id, query_norm, class_ids_hash) 충돌 = 동시 요청 중 상대가 먼저 넣었다는 뜻.
    // 조용히 삼키지 않고 **상대가 넣은 행을 읽어** 돌려준다(두 응답이 서로 다른 내용이 되지 않게).
    if (!String(e.name || '').includes('Unique')) throw e;
    const raced = await readCache(uid, queryNorm, hash);
    if (raced) return ok(res, shape(raced, true));
    throw e;
  }

  const stored = await readCache(uid, queryNorm, hash);
  ok(res, shape(stored || { content, prompt_chars: built.chars, generated_at: null }, false));
}));

module.exports = router;
