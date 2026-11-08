// task-054: 참고 목록 → 사용자 기술트리 반영 계획(dry-run)과 명시 결정 적용/복구의 순수 코어.
//
// 원칙 (task-054 / Leader 설계 §5):
// - 기본은 dry-run. 자동 확정·자동 생성 없음. exact→keep_existing, alias·coach_candidate→review_link_existing,
//   none 중 concept→hold, technique/position→review_new, kind 미분류→hold. "none 131 ≠ 신규 131".
// - 적용은 decisions 파일 + apply 플래그 + confirmUser + planSha 가 모두 맞아야 진행한다.
// - 트랜잭션 안에서 대상 사용자 techniques 를 잠그고(FOR UPDATE) fingerprint 로 스냅샷 동일성을 확인한다.
// - 신규 행은 어댑터의 insertTechnique 로만 넣는다(POST 라우트·triggerAutoAnalysis 를 거치지 않음).
//   note '' · category 는 decision 에 있을 때만 · 이름 NFC 기준 중복이면 skip(멱등).
// - 적용 전/커밋 전 백업 JSON, 적용 후 기존 행 보존 diff 검사(불일치면 throw → 롤백).
// - restore 는 기존 기술에 붙인 미변경 참고 연결만 되돌린다. 신규 기술과 그 연결은 항상 보존한다.
//   기술 행이 같아도 이후 연구·수업·영상 등에서 사용됐을 수 있어 자동 삭제하지 않는다.
// DB 접근은 adapter 로만 한다(스크립트=Sequelize, 테스트=메모리).
const crypto = require('crypto');
const { resolve } = require('./techniqueReference');
const { normalize } = require('../utils/techMatch');

const PLAN_VERSION = 1;
const ACTIONS = Object.freeze(['keep_existing', 'review_link_existing', 'review_new', 'hold']);
const DECISIONS = Object.freeze(['create', 'confirm_link', 'reject_link']);
const PRESERVED_FIELDS = Object.freeze(['user_id', 'name', 'note', 'category', 'pos', 'tags', 'links', 'starred']);
const LINK_FIELDS = Object.freeze(['user_id', 'technique_id', 'technique_name_at_link', 'reference_slug', 'status', 'decided_at', 'note']);

const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const nfc = v => String(v ?? '').normalize('NFC');
const nameKey = v => nfc(v).trim().toLowerCase();

function stableStringify(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// 정렬된 id + NFC 이름의 해시. 행 추가/삭제/이름 변경을 감지한다.
function fingerprint(techniques) {
  const lines = [...techniques]
    .map(t => ({ id: Number(t.id), name: nfc(t.name) }))
    .sort((a, b) => a.id - b.id)
    .map(t => `${t.id}\t${t.name}`);
  return sha256(lines.join('\n'));
}

function planSha(plan) {
  return sha256(stableStringify({ version: plan.version, user_id: plan.user_id, snapshot_fingerprint: plan.snapshot_fingerprint, items: plan.items }));
}

function classify(item, match) {
  if (match.type === 'exact' || match.type === 'confirmed') return { action: 'keep_existing', basis: `${match.type} 대응 — 기존 행(id ${match.technique_id}) 그대로 유지` };
  if (match.type === 'alias') return { action: 'review_link_existing', basis: `별칭 사전 대응(id ${match.technique_id}) — 자동 확정 금지, 연결 여부 사용자 검토` };
  if (match.type === 'ambiguous') return { action: 'review_link_existing', basis: `여러 기존 행 후보(${match.candidate_ids.join(', ')}) — 연결하지 않음, 사용자 검토` };
  if (match.type === 'coach_candidate') return { action: 'review_link_existing', basis: `관장 후보(id ${match.technique_id}, ${match.coach.confidence_text}) — 사용자 결정 전, 자동 확정 금지` };
  if (item.kind === 'concept') return { action: 'hold', basis: '대응 없음 · 일반 개념(concept) — 개별 기술로 추가하지 않고 보류' };
  if (item.kind === 'technique' || item.kind === 'position') return { action: 'review_new', basis: `대응 없음 · ${item.kind} — 신규 추가 여부 사용자 검토(자동 생성 아님)` };
  return { action: 'hold', basis: `대응 없음 · 종류 미분류(kind ${item.kind == null ? 'null' : JSON.stringify(item.kind)}) — 관장 분류 전 보류` };
}

// catalog: loadCatalog() 결과 · snapshot: {scope_user?, techniques:[{id,name,category}]} · coachCandidates: {items:[...]}
function buildPlan({ catalog, snapshot, userId, coachCandidates = null, inputs = null }) {
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('userId (positive integer) required');
  const techniques = Array.isArray(snapshot?.techniques) ? snapshot.techniques : null;
  if (!techniques) throw new Error('snapshot.techniques array required');
  if (snapshot.scope_user != null && Number(snapshot.scope_user) !== userId) throw new Error(`snapshot scope_user ${snapshot.scope_user} != --user-id ${userId}`);
  const byId = new Map(techniques.map(t => [Number(t.id), t]));
  const coachBySlug = new Map();
  for (const c of coachCandidates?.items || []) {
    if (coachBySlug.has(c.source_slug)) throw new Error(`duplicate coach candidate slug: ${c.source_slug}`);
    if (!catalog.bySlug.has(c.source_slug)) throw new Error(`coach candidate for unknown slug: ${c.source_slug}`);
    coachBySlug.set(c.source_slug, c);
  }

  const resolution = resolve(catalog, techniques, []);
  const items = catalog.items.map(item => {
    const r = resolution.get(item.slug);
    let match;
    if (r.matchType === 'none' && coachBySlug.has(item.slug)) {
      const c = coachBySlug.get(item.slug);
      const tech = byId.get(Number(c.candidate_technique_id));
      match = tech
        ? { type: 'coach_candidate', technique_id: Number(tech.id), technique_name: tech.name, coach: { confidence: c.confidence, confidence_text: c.confidence_text, needs_check: c.needs_check } }
        : { type: 'none', technique_id: null, technique_name: null, note: `관장 후보 id ${c.candidate_technique_id} 가 스냅샷에 없음` };
    } else {
      match = { type: r.matchType, technique_id: r.techniqueId, technique_name: r.techniqueName };
      if (r.candidateIds) match.candidate_ids = r.candidateIds;
    }
    const { action, basis } = classify(item, match);
    return { slug: item.slug, name: item.name, source_category: item.source_category ?? null, kind: item.kind ?? null, tool_match: r.matchType, match, action, basis };
  });

  const count = (list, key) => list.reduce((acc, x) => { const k = key(x); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const toolNone = items.filter(i => i.tool_match === 'none');
  const remainingNone = toolNone.filter(i => i.match.type === 'none');
  const plan = {
    kind: 'task-054-reference-apply-plan',
    version: PLAN_VERSION,
    mode: 'dry-run',
    user_id: userId,
    snapshot_fingerprint: fingerprint(techniques),
    inputs,
    summary: {
      total: items.length,
      existing_techniques: techniques.length,
      by_tool_match: count(items, i => i.tool_match),
      by_match: count(items, i => i.match.type),
      by_action: count(items, i => i.action),
      none_breakdown: {
        tool_none: toolNone.length,
        coach_candidate: toolNone.length - remainingNone.length,
        remaining_none: remainingNone.length,
        remaining_none_by_action: count(remainingNone, i => i.action),
        note: 'tool_none 은 신규 개수가 아니다. 신규 검토 대상은 review_new 뿐이며 그것도 사용자 결정 전이다.',
      },
      new_rows_planned: 0,
      links_planned: 0,
    },
    items,
  };
  plan.plan_sha = planSha(plan);
  return plan;
}

function renderPlanMarkdown(plan) {
  const s = plan.summary;
  const kv = obj => Object.entries(obj).map(([k, v]) => `${k} ${v}`).join(' · ') || '없음';
  const lines = [
    '# IMP-0001 참고 목록 반영 계획 (dry-run)',
    '',
    `- 모드: dry-run (DB 접속·쓰기 없음, 오프라인 스냅샷) · 대상 user_id ${plan.user_id}`,
    `- plan_sha: \`${plan.plan_sha}\``,
    `- snapshot_fingerprint: \`${plan.snapshot_fingerprint}\``,
    `- 참고 항목 ${s.total}개 · 스냅샷 기존 기술 ${s.existing_techniques}행`,
    '',
    '## 집계',
    '',
    `- 도구 매칭(exact/alias/none): ${kv(s.by_tool_match)}`,
    `- 계획 매칭(관장 후보 반영): ${kv(s.by_match)}`,
    `- 조치: ${kv(s.by_action)}`,
    `- **none 분리 집계**: 도구 none ${s.none_breakdown.tool_none} = 관장 후보 ${s.none_breakdown.coach_candidate} + 남은 none ${s.none_breakdown.remaining_none} (남은 none 조치: ${kv(s.none_breakdown.remaining_none_by_action)})`,
    `- ${s.none_breakdown.note}`,
    `- 이 계획으로 생성될 행 ${s.new_rows_planned} · 연결 ${s.links_planned} (결정 파일 없이 아무것도 쓰지 않는다)`,
    '',
    '## 항목',
    '',
    '| slug | 이름 | kind | 매칭 | 기존 id/이름 | 조치 | 근거 |',
    '|---|---|---|---|---|---|---|',
    ...plan.items.map(i => `| \`${i.slug}\` | ${i.name} | ${i.kind ?? '-'} | ${i.match.type} | ${i.match.technique_id != null ? `${i.match.technique_id} / ${i.match.technique_name}` : (i.match.candidate_ids ? i.match.candidate_ids.join(',') : '-')} | ${i.action} | ${String(i.basis).replace(/\|/g, '\\|')} |`),
    '',
  ];
  return lines.join('\n');
}

function applyError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

// 실제 적용 전 플래그 검사. 하나라도 빠지면 거부한다.
function checkApplyFlags({ plan, decisions, flags }) {
  const missing = [];
  if (!flags?.apply) missing.push('--apply');
  if (!decisions) missing.push('--decisions');
  if (flags?.confirmUser == null) missing.push('--confirm-user');
  if (!flags?.planSha) missing.push('--plan-sha');
  if (missing.length) throw applyError('FLAGS_MISSING', `apply refused: missing ${missing.join(', ')}`);
  if (Number(flags.confirmUser) !== plan.user_id) throw applyError('CONFIRM_USER_MISMATCH', `--confirm-user ${flags.confirmUser} != plan user ${plan.user_id}`);
  if (planSha(plan) !== plan.plan_sha) throw applyError('PLAN_TAMPERED', 'plan content does not match plan_sha');
  if (flags.planSha !== plan.plan_sha) throw applyError('PLAN_SHA_MISMATCH', '--plan-sha does not match the regenerated plan');
  if (decisions.plan_sha !== plan.plan_sha) throw applyError('DECISIONS_PLAN_MISMATCH', 'decisions.plan_sha does not match plan');
  if (Number(decisions.user_id) !== plan.user_id) throw applyError('DECISIONS_USER_MISMATCH', 'decisions.user_id does not match plan');
  if (!Array.isArray(decisions.decisions)) throw applyError('DECISIONS_INVALID', 'decisions.decisions array required');
}

function validateDecisions(plan, decisions) {
  const bySlug = new Map(plan.items.map(i => [i.slug, i]));
  const seen = new Set();
  const errors = [];
  for (const [n, d] of decisions.entries()) {
    const at = `decisions[${n}]`;
    const item = bySlug.get(d?.slug);
    if (!item) { errors.push(`${at}: unknown slug ${d?.slug}`); continue; }
    if (!DECISIONS.includes(d.decision)) { errors.push(`${at}: decision must be one of ${DECISIONS.join('|')}`); continue; }
    const key = d.decision === 'create' ? `create:${d.slug}` : `${d.slug}:${d.technique_id}`;
    if (seen.has(key)) errors.push(`${at}: duplicate decision for ${key}`);
    seen.add(key);
    if (d.decision === 'create') {
      if (item.action === 'keep_existing') errors.push(`${at}: ${d.slug} already maps to an existing row (keep_existing)`);
      const name = nfc(d.name ?? item.name).trim();
      if (!name || name.length > 100) errors.push(`${at}: name must be 1..100 chars`);
      if (d.category != null && (typeof d.category !== 'string' || d.category.length > 50)) errors.push(`${at}: category must be a string <= 50 chars`);
    } else if (!Number.isInteger(d.technique_id)) errors.push(`${at}: technique_id integer required`);
  }
  if (errors.length) throw applyError('DECISIONS_INVALID', `decisions refused:\n- ${errors.join('\n- ')}`);
}

function pick(row, fields) {
  const out = {};
  for (const f of fields) out[f] = row?.[f] ?? null;
  return out;
}
const sameFields = (a, b, fields) => stableStringify(pick(a, fields)) === stableStringify(pick(b, fields));

// before 의 모든 행이 after 에 같은 id 로 남아 있고 보존 필드가 불변인지. 위반 목록을 돌려준다.
function preservationDiff(before, after, fields = PRESERVED_FIELDS) {
  const afterById = new Map(after.map(r => [Number(r.id), r]));
  const violations = [];
  for (const row of before) {
    const cur = afterById.get(Number(row.id));
    if (!cur) { violations.push({ id: Number(row.id), problem: 'missing' }); continue; }
    for (const f of fields) {
      if (stableStringify(row[f] ?? null) !== stableStringify(cur[f] ?? null)) violations.push({ id: Number(row.id), problem: 'changed', field: f });
    }
  }
  return violations;
}

// adapter.transaction(fn) — fn(tx) 가 throw 하면 롤백. tx: lockUserTechniques, linkStoreAvailable, lockUserLinks,
// insertTechnique(row)->id, insertLink(row)->id, deleteLink(userId,id). 기술 삭제 능력은 노출하지 않는다.
async function applyDecisions({ adapter, plan, decisions, flags, runId, now = () => new Date(), writeBackup }) {
  checkApplyFlags({ plan, decisions, flags });
  validateDecisions(plan, decisions.decisions);
  if (typeof writeBackup !== 'function') throw applyError('BACKUP_REQUIRED', 'writeBackup is required before any write');
  const userId = plan.user_id;
  const itemBySlug = new Map(plan.items.map(i => [i.slug, i]));

  return adapter.transaction(async tx => {
    const before = await tx.lockUserTechniques(userId);
    const fp = fingerprint(before);
    if (fp !== plan.snapshot_fingerprint) throw applyError('FINGERPRINT_MISMATCH', 'current techniques differ from the snapshot used for the plan — regenerate the plan', { expected: plan.snapshot_fingerprint, actual: fp });
    const linkStore = await tx.linkStoreAvailable();
    const linksBefore = linkStore ? await tx.lockUserLinks(userId) : [];
    const owned = new Set(before.map(r => Number(r.id)));

    for (const d of decisions.decisions) {
      if (d.decision !== 'create' && !owned.has(d.technique_id)) throw applyError('TECHNIQUE_NOT_OWNED', `technique ${d.technique_id} is not owned by user ${userId}`);
      if (d.decision !== 'create' && !linkStore) throw applyError('LINK_STORE_UNAVAILABLE', `${d.decision} needs ${'technique_reference_links'} (schema not applied)`);
      if (d.decision === 'create' && !linkStore && normalize(d.name ?? itemBySlug.get(d.slug).name) !== normalize(itemBySlug.get(d.slug).name)) {
        throw applyError('LINK_STORE_UNAVAILABLE', `create ${d.slug} with a different name needs technique_reference_links to keep the mapping`);
      }
    }

    // DDL의 DATETIME은 초 단위다. 백업도 같은 정밀도로 저장해야 미변경 연결을 정확히 비교한다.
    const decidedAt = new Date(Math.floor(now().getTime() / 1000) * 1000);
    const backup = {
      kind: 'task-054-reference-apply-backup',
      run_id: runId,
      user_id: userId,
      plan_sha: plan.plan_sha,
      snapshot_fingerprint: fp,
      created_at: decidedAt.toISOString(),
      status: 'pre-write',
      before: { techniques: before, links: linksBefore },
      inserted: { techniques: [], links: [] },
      skipped: [],
    };
    await writeBackup(backup);

    const names = new Map(before.map(r => [nameKey(r.name), Number(r.id)]));
    const namesById = new Map(before.map(r => [Number(r.id), nfc(r.name)]));
    const linkKey = (t, s) => `${t}\u0000${s}`;
    const links = new Map(linksBefore.map(l => [linkKey(Number(l.technique_id), l.reference_slug), l]));
    const runNote = `task-054 apply ${runId}`;

    const addLink = async (techniqueId, slug, status) => {
      const existing = links.get(linkKey(techniqueId, slug));
      if (existing) {
        if (existing.status === status) {
          if (status === 'confirmed' && (typeof existing.technique_name_at_link !== 'string' || nfc(existing.technique_name_at_link) !== namesById.get(techniqueId))) {
            throw applyError('LINK_NAME_CONFLICT', `confirmed link ${techniqueId}/${slug} has a different or missing name snapshot; refusing to overwrite or report it as already applied`);
          }
          backup.skipped.push({ slug, technique_id: techniqueId, reason: 'link_exists' });
          return;
        }
        throw applyError('LINK_CONFLICT', `link ${techniqueId}/${slug} already ${existing.status}; refusing to overwrite with ${status}`);
      }
      const row = { user_id: userId, technique_id: techniqueId, technique_name_at_link: namesById.get(techniqueId), reference_slug: slug, status, decided_at: decidedAt, note: runNote };
      const id = await tx.insertLink(row);
      const saved = { id, ...row };
      links.set(linkKey(techniqueId, slug), saved);
      backup.inserted.links.push(saved);
    };

    for (const d of decisions.decisions) {
      if (d.decision === 'create') {
        const item = itemBySlug.get(d.slug);
        const name = nfc(d.name ?? item.name).trim();
        const existingId = names.get(nameKey(name));
        if (existingId != null) { backup.skipped.push({ slug: d.slug, reason: 'duplicate_name', existing_id: existingId }); continue; }
        const row = { user_id: userId, name, category: typeof d.category === 'string' ? d.category : '', note: '', pos: '[]', tags: '[]', links: '[]', starred: 0 };
        const id = await tx.insertTechnique(row);
        names.set(nameKey(name), id);
        namesById.set(id, nfc(name));
        backup.inserted.techniques.push({ id, ...row });
        if (linkStore) await addLink(id, d.slug, 'confirmed');
      } else {
        await addLink(d.technique_id, d.slug, d.decision === 'confirm_link' ? 'confirmed' : 'rejected');
      }
    }

    const after = await tx.lockUserTechniques(userId);
    const violations = preservationDiff(before, after);
    if (linkStore) violations.push(...preservationDiff(linksBefore, await tx.lockUserLinks(userId), LINK_FIELDS).map(v => ({ ...v, table: 'links' })));
    if (violations.length) throw applyError('PRESERVATION_VIOLATION', 'existing rows changed during apply — rolled back', { violations });

    backup.status = 'pre-commit';
    await writeBackup(backup);
    return {
      run_id: runId,
      user_id: userId,
      plan_sha: plan.plan_sha,
      inserted: { techniques: backup.inserted.techniques.map(r => ({ id: r.id, name: r.name })), links: backup.inserted.links.map(l => ({ id: l.id, technique_id: l.technique_id, reference_slug: l.reference_slug, status: l.status })) },
      skipped: backup.skipped,
      preserved_rows_checked: before.length,
    };
  });
}

async function restoreRun({ adapter, backup, flags }) {
  if (backup?.kind !== 'task-054-reference-apply-backup') throw applyError('BACKUP_INVALID', 'not a task-054 apply backup');
  if (!Array.isArray(backup.before?.techniques) || !Array.isArray(backup.inserted?.techniques) || !Array.isArray(backup.inserted?.links)) throw applyError('BACKUP_INVALID', 'backup techniques and inserted arrays required');
  if (!flags?.apply || flags.confirmUser == null) throw applyError('FLAGS_MISSING', 'restore requires --apply and --confirm-user');
  if (Number(flags.confirmUser) !== backup.user_id) throw applyError('CONFIRM_USER_MISMATCH', '--confirm-user does not match backup user');
  if (backup.status !== 'pre-commit') throw applyError('BACKUP_INCOMPLETE', `backup status ${backup.status}: the run never reached commit; nothing to restore`);
  const userId = backup.user_id;

  return adapter.transaction(async tx => {
    const rows = await tx.lockUserTechniques(userId);
    const byId = new Map(rows.map(r => [Number(r.id), r]));
    const result = { mode: 'mapping-only-techniques-retained', deleted: { techniques: [], links: [] }, preserved: [], absent: [] };
    // 모든 참조/이후 사용을 증명할 수 없으므로 기술 행은 무조건 남긴다.
    // 의존성 검사 어댑터가 없거나 실패하는 경우에도 삭제 분기로 들어갈 수 없다.
    const keepTech = new Set(backup.inserted.techniques.map(ins => Number(ins.id)));
    const originalTech = new Set(backup.before.techniques.filter(row => Number(row.user_id) === userId).map(row => Number(row.id)));
    for (const ins of backup.inserted.techniques) {
      const cur = byId.get(Number(ins.id));
      if (!cur) { result.absent.push({ table: 'techniques', id: ins.id }); continue; }
      result.preserved.push({ table: 'techniques', id: ins.id, reason: sameFields(cur, ins, PRESERVED_FIELDS) ? 'automatic_technique_deletion_disabled' : 'changed_after_apply' });
    }
    const linkStore = backup.inserted.links.length ? await tx.linkStoreAvailable() : false;
    const linkRows = linkStore ? await tx.lockUserLinks(userId) : [];
    const linkById = new Map(linkRows.map(l => [Number(l.id), l]));
    for (const ins of backup.inserted.links) {
      if (!linkStore) { result.preserved.push({ table: 'links', id: ins.id, reason: 'link_store_unavailable' }); continue; }
      const cur = linkById.get(Number(ins.id));
      if (!cur) { result.absent.push({ table: 'links', id: ins.id }); continue; }
      if (keepTech.has(Number(ins.technique_id))) { result.preserved.push({ table: 'links', id: ins.id, reason: 'technique_preserved' }); continue; }
      if (!originalTech.has(Number(ins.technique_id)) || !byId.has(Number(ins.technique_id))) { result.preserved.push({ table: 'links', id: ins.id, reason: 'original_owned_technique_unconfirmed' }); continue; }
      if (!sameFields(cur, ins, LINK_FIELDS)) { result.preserved.push({ table: 'links', id: ins.id, reason: 'changed_after_apply' }); continue; }
      await tx.deleteLink(userId, Number(ins.id));
      result.deleted.links.push(Number(ins.id));
    }
    const violations = preservationDiff(rows, await tx.lockUserTechniques(userId));
    if (violations.length) throw applyError('PRESERVATION_VIOLATION', 'restore changed technique rows — rolled back', { violations });
    return result;
  });
}

module.exports = {
  PLAN_VERSION,
  ACTIONS,
  DECISIONS,
  PRESERVED_FIELDS,
  fingerprint,
  planSha,
  stableStringify,
  buildPlan,
  renderPlanMarkdown,
  checkApplyFlags,
  validateDecisions,
  preservationDiff,
  applyDecisions,
  restoreRun,
};
