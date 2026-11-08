// task-054: 기술 참고자료(관장 설명·앞뒤 연결·함께 보는 기술) 읽기 서비스.
//
// - catalog.json(공개 참고 목록 + 관장 설명, 개인 데이터 없음)을 사용자 기술 행에 대응시킨다.
// - 대응 우선순위: confirmed 링크 > exact(normalize 동일) > alias(TECH_ALIASES, matchTechnique 재사용).
//   fuzzy 는 쓰지 않는다. rejected 링크는 그 (기술, slug) 대응만 억제한다.
//   한 slug 가 여러 기존 행에 걸리면 ambiguous — 연결하지 않는다(이름 첫 결과로 이동 금지).
// - 관계는 catalog 의 출처 순서·방향 그대로. related 를 양방향으로 만들지 않는다. 조건 문구는 null.
// - 실제 링크 조회가 명확한 table-not-found일 때만 linkStore:'unavailable'.
//   권한·기타 실패는503으로 중단한다(기존 rejected/confirmed 결정을 빈 목록으로 대체하지 않음).
// - DB 접근은 주입된 deps 로만 한다(테스트는 메모리 deps). 기본 deps 는 Sequelize 모델/sequelize.query.
const path = require('path');
const { normalize, matchTechnique } = require('../utils/techMatch');

const LINK_TABLE = 'technique_reference_links';
const RELATION_TYPES = Object.freeze(['incoming', 'outgoing', 'related']);
const CATALOG_PATH = path.join(__dirname, '..', 'data', 'techniqueReference', 'catalog.json');
const TIER = Object.freeze({ confirmed: 3, exact: 2, alias: 1 });

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// catalog 객체 검증 + 인덱스. 중복 slug, 미지 slug 를 가리키는 관계는 거부한다.
function loadCatalog(raw) {
  const errors = [];
  const items = Array.isArray(raw?.items) ? raw.items : null;
  if (!items) throw new Error('invalid technique reference catalog: items array required');
  const bySlug = new Map();
  for (const item of items) {
    if (!item || typeof item.slug !== 'string' || !item.slug) { errors.push('item without slug'); continue; }
    if (bySlug.has(item.slug)) errors.push(`duplicate slug: ${item.slug}`);
    bySlug.set(item.slug, item);
  }
  for (const item of items) {
    for (const type of RELATION_TYPES) {
      const list = item?.relations?.[type];
      if (!Array.isArray(list)) { errors.push(`${item?.slug}: relations.${type} array required`); continue; }
      for (const target of list) if (!bySlug.has(target)) errors.push(`${item.slug}: ${type} -> unknown slug ${target}`);
    }
  }
  if (errors.length) throw new Error(`invalid technique reference catalog: ${errors.join('; ')}`);
  return { version: raw.version ?? null, items, bySlug };
}

let defaultCatalog = null;
function getDefaultCatalog() {
  if (!defaultCatalog) defaultCatalog = loadCatalog(require(CATALOG_PATH));
  return defaultCatalog;
}

// slug -> { techniqueId|null, techniqueName|null, matchType, candidateIds? }
// userTechniques: 이미 user_id 로 스코프된 [{id,name}] · links: [{technique_id, reference_slug, status}]
function resolve(catalog, userTechniques, links = []) {
  const techs = (Array.isArray(userTechniques) ? userTechniques : []).map(t => ({ id: Number(t.id), name: String(t.name ?? '') }));
  const byId = new Map(techs.map(t => [t.id, t]));
  const confirmed = new Map();
  const rejected = new Map();
  for (const link of Array.isArray(links) ? links : []) {
    const id = Number(link.technique_id);
    if (!byId.has(id)) continue; // 삭제된 기술·남의 기술을 가리키는 링크는 무시
    if (link.status === 'confirmed' && (typeof link.technique_name_at_link !== 'string' || link.technique_name_at_link.normalize('NFC') !== byId.get(id).name.normalize('NFC'))) continue;
    const target = link.status === 'confirmed' ? confirmed : link.status === 'rejected' ? rejected : null;
    if (!target) continue;
    if (!target.has(link.reference_slug)) target.set(link.reference_slug, new Set());
    target.get(link.reference_slug).add(id);
  }

  const out = new Map();
  for (const item of catalog.items) {
    const slug = item.slug;
    const blocked = rejected.get(slug) || new Set();
    const confirmedIds = [...(confirmed.get(slug) || [])].filter(id => !blocked.has(id));
    if (confirmedIds.length === 1) {
      out.set(slug, { techniqueId: confirmedIds[0], techniqueName: byId.get(confirmedIds[0]).name, matchType: 'confirmed' });
      continue;
    }
    if (confirmedIds.length > 1) {
      out.set(slug, { techniqueId: null, techniqueName: null, matchType: 'ambiguous', candidateIds: confirmedIds.sort((a, b) => a - b) });
      continue;
    }
    const candidates = techs.filter(t => !blocked.has(t.id));
    const norm = normalize(item.name);
    const exact = norm ? candidates.filter(t => normalize(t.name) === norm) : [];
    if (exact.length) {
      out.set(slug, exact.length === 1
        ? { techniqueId: exact[0].id, techniqueName: exact[0].name, matchType: 'exact' }
        : { techniqueId: null, techniqueName: null, matchType: 'ambiguous', candidateIds: exact.map(t => t.id).sort((a, b) => a - b) });
      continue;
    }
    const m = matchTechnique(item.name, candidates);
    if (m.match_type === 'alias') {
      const canonicalNorm = normalize(m.matched_name);
      const same = candidates.filter(t => normalize(t.name) === canonicalNorm);
      out.set(slug, same.length === 1
        ? { techniqueId: same[0].id, techniqueName: same[0].name, matchType: 'alias' }
        : { techniqueId: null, techniqueName: null, matchType: 'ambiguous', candidateIds: same.map(t => t.id).sort((a, b) => a - b) });
      continue;
    }
    out.set(slug, { techniqueId: null, techniqueName: null, matchType: 'none' });
  }
  return out;
}

// 현재 기술 id 에 대응하는 slug 들. 같은 기술에 여러 slug 가 걸리면 가장 강한 대응 등급만 남기고,
// 그래도 둘 이상이면 호출측이 ambiguous 로 다룬다.
function slugsForTechnique(catalog, resolution, techniqueId) {
  const hits = catalog.items
    .map(item => ({ slug: item.slug, r: resolution.get(item.slug) }))
    .filter(h => h.r && h.r.techniqueId === techniqueId);
  if (!hits.length) return [];
  const best = Math.max(...hits.map(h => TIER[h.r.matchType] || 0));
  return hits.filter(h => (TIER[h.r.matchType] || 0) === best).map(h => h.slug);
}

function card({ type, from, to, index, targetSlug, catalog, resolution, currentSlug, currentTechniqueId }) {
  const target = catalog.bySlug.get(targetSlug);
  const r = resolution.get(targetSlug) || { techniqueId: null, techniqueName: null, matchType: 'none' };
  return {
    relationKey: `${type}:${from}>${to}:${index}`,
    slug: targetSlug,
    name: target.name,
    targetTechniqueId: r.techniqueId,
    targetTechniqueName: r.techniqueName,
    matchType: r.matchType,
    linkState: r.techniqueId != null ? 'linked' : 'unlinked',
    isSelf: targetSlug === currentSlug || (r.techniqueId != null && r.techniqueId === currentTechniqueId),
    conditionText: null,
  };
}

function emptyReference() {
  return { slug: null, matchType: 'none', kind: null, description: null, sourceUrl: null };
}

// deps: { catalog, findTechnique(id,userId)->{id,name}|null, listUserTechniques(userId)->[{id,name}], listLinks(userId)->{available:boolean, links:[]} }
async function buildReference(techniqueId, userId, deps) {
  const catalog = deps.catalog || getDefaultCatalog();
  const tech = await deps.findTechnique(techniqueId, userId);
  if (!tech) throw httpError(404, 'not found');
  const currentId = Number(tech.id);
  const [techs, linkResult] = await Promise.all([deps.listUserTechniques(userId), deps.listLinks(userId)]);
  const available = !!linkResult?.available;
  const links = available && Array.isArray(linkResult.links) ? linkResult.links : [];
  const resolution = resolve(catalog, techs, links);
  const base = { technique: { id: currentId, name: tech.name }, incoming: [], outgoing: [], related: [], linkStore: available ? 'available' : 'unavailable' };

  const slugs = slugsForTechnique(catalog, resolution, currentId);
  if (slugs.length === 0) return { ...base, reference: emptyReference() };
  if (slugs.length > 1) return { ...base, reference: { ...emptyReference(), matchType: 'ambiguous', ambiguousSlugs: slugs } };

  const slug = slugs[0];
  const item = catalog.bySlug.get(slug);
  const ctx = { catalog, resolution, currentSlug: slug, currentTechniqueId: currentId };
  return {
    ...base,
    reference: {
      slug,
      matchType: resolution.get(slug).matchType,
      kind: item.kind ?? null,
      description: item.description ?? null,
      sourceUrl: item.source_url ?? null,
    },
    incoming: item.relations.incoming.map((from, index) => card({ ...ctx, type: 'incoming', from, to: slug, index, targetSlug: from })),
    outgoing: item.relations.outgoing.map((to, index) => card({ ...ctx, type: 'outgoing', from: slug, to, index, targetSlug: to })),
    related: item.relations.related.map((to, index) => card({ ...ctx, type: 'related', from: slug, to, index, targetSlug: to })),
  };
}

function isMissingLinkTable(error) {
  const seen = new Set();
  const pending = [error];
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (current.code === 'ER_NO_SUCH_TABLE' || Number(current.errno) === 1146) return true;
    pending.push(current.original, current.parent);
  }
  return false;
}

// information_schema는 권한 부족도0행일 수 있어 실제 SELECT 결과로 부재와 실패를 구분한다.
async function listLinksWith(query, userId, { log = console } = {}) {
  try {
    const [rows] = await query(
      `SELECT technique_id, technique_name_at_link, reference_slug, status FROM ${LINK_TABLE} WHERE user_id = ?`,
      [userId],
    );
    if (!Array.isArray(rows)) throw new Error('invalid link response');
    return { available: true, links: rows };
  } catch (error) {
    if (isMissingLinkTable(error)) return { available: false, links: [] };
    // 원 DB 오류(SQL·접속 정보 포함 가능)는 응답이나 로그에 그대로 넣지 않는다.
    log.error?.('[technique-reference] reference mapping lookup failed');
    const unavailable = httpError(503, '기술 참고자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    unavailable.code = 'REFERENCE_LINKS_UNAVAILABLE';
    throw unavailable;
  }
}

function createDefaultDeps() {
  const { Technique } = require('../models');
  const { sequelize } = require('../config/db');
  const { QueryTypes } = require('sequelize');
  const query = async (sql, replacements) => [await sequelize.query(sql, { replacements, type: QueryTypes.SELECT })];
  return {
    findTechnique: (id, userId) => Technique.findOne({ where: { id, user_id: userId }, attributes: ['id', 'name'], raw: true }),
    listUserTechniques: userId => Technique.findAll({ where: { user_id: userId }, attributes: ['id', 'name'], raw: true }),
    listLinks: userId => listLinksWith(query, userId),
  };
}

let defaultDeps = null;
function getReference(techniqueId, userId) {
  if (!defaultDeps) defaultDeps = createDefaultDeps();
  return buildReference(techniqueId, userId, defaultDeps);
}

module.exports = {
  LINK_TABLE,
  CATALOG_PATH,
  loadCatalog,
  getDefaultCatalog,
  resolve,
  slugsForTechnique,
  buildReference,
  listLinksWith,
  isMissingLinkTable,
  getReference,
};
