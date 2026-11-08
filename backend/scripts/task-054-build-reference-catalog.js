#!/usr/bin/env node
// task-054: 공개 참고 목록(이름·분류·URL)과 관계(incoming/outgoing/related)와 관장 설명(선택)을 합쳐
// backend/src/data/techniqueReference/catalog.json 을 만든다.
// - 개인 데이터(기존 기술 행·메모·기록)는 입력으로 받지 않는다.
// - 결정적: 같은 입력 파일 → 바이트 단위로 같은 출력(시각·난수 없음, 출처 순서 유지).
// - 관계는 출처 순서·방향 그대로 둔다(대칭화·정렬·중복 제거 없음). 조건 문구는 만들지 않는다.
// - descriptions.json 이 없으면 설명 없이 빌드된다(description:null, kind:null). 파일이 있으면 기본으로
//   모든 slug 의 설명 존재를 검증한다(--allow-partial 일 때만 일부 허용). kind 는 descriptions 의 kind.
// No dotenv, no DB, no network.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ASSETS = path.join(REPO_ROOT, 'agent-vault/10-Flow/improvements/assets');
const DATA_DIR = path.join(REPO_ROOT, 'backend/src/data/techniqueReference');
const DEFAULTS = Object.freeze({
  index: path.join(ASSETS, 'IMP-0001-reference-index.json'),
  relations: path.join(ASSETS, 'IMP-0002-reference-relations.json'),
  descriptions: path.join(DATA_DIR, 'descriptions.json'),
  out: path.join(DATA_DIR, 'catalog.json'),
});
const CATALOG_VERSION = 1;
const RELATION_TYPES = Object.freeze(['incoming', 'outgoing', 'related']);
const DESCRIPTION_LISTS = Object.freeze(['conditions', 'principles', 'mistakes', 'next']);

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const isNonEmptyString = v => typeof v === 'string' && v.trim().length > 0;

function fail(errors) {
  const error = new Error(`catalog build refused:\n- ${errors.join('\n- ')}`);
  error.errors = errors;
  throw error;
}

function normalizeDescription(raw, i, errors) {
  const at = `descriptions[${i}]${raw && raw.slug ? ` (${raw.slug})` : ''}`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errors.push(`${at}: object required`); return null; }
  if (!isNonEmptyString(raw.slug)) errors.push(`${at}: slug required`);
  if (!isNonEmptyString(raw.summary)) errors.push(`${at}: summary required`);
  if (raw.kind != null && !isNonEmptyString(raw.kind)) errors.push(`${at}: kind must be a non-empty string or absent`);
  for (const key of ['kind_note', 'next_note', 'mistakes_basis']) {
    if (raw[key] != null && typeof raw[key] !== 'string') errors.push(`${at}: ${key} must be a string or absent`);
  }
  for (const key of DESCRIPTION_LISTS) {
    const v = raw[key];
    if (v == null) continue;
    if (!Array.isArray(v) || !v.every(isNonEmptyString)) errors.push(`${at}: ${key} must be an array of non-empty strings`);
  }
  const review = raw.review;
  if (!review || typeof review !== 'object' || !isNonEmptyString(review.status)) errors.push(`${at}: review.status required`);
  return {
    slug: raw.slug,
    name: raw.name ?? null,
    kind: raw.kind ?? null,
    source_url: raw.source_url ?? null,
    description: {
      summary: raw.summary,
      conditions: raw.conditions ?? [],
      principles: raw.principles ?? [],
      mistakes: raw.mistakes ?? [],
      mistakes_basis: raw.mistakes_basis ?? null,
      next: raw.next ?? [],
      next_note: raw.next_note ?? null,
      kind_note: raw.kind_note ?? null,
      review: review && typeof review === 'object'
        ? { reviewer: review.reviewer ?? null, status: review.status ?? null, basis: review.basis ?? null }
        : null,
    },
  };
}

// 순수 함수: 파싱된 입력 → catalog 객체. sources 는 generated_from.files 에 그대로 들어간다.
// requireAllDescriptions: true 면 index 의 모든 slug 에 설명이 있어야 한다(누락 slug 를 나열하고 거부).
function buildCatalog({ index, relations, descriptions = null, sources = [], requireAllDescriptions = false }) {
  const errors = [];
  const indexItems = Array.isArray(index?.items) ? index.items : null;
  const relationItems = Array.isArray(relations?.items) ? relations.items : null;
  if (!indexItems) errors.push('index.items array required');
  if (!relationItems) errors.push('relations.items array required');
  if (descriptions != null && !Array.isArray(descriptions)) errors.push('descriptions must be an array');
  if (errors.length) fail(errors);

  const known = new Set();
  for (const [i, item] of indexItems.entries()) {
    if (!isNonEmptyString(item?.source_slug)) { errors.push(`index.items[${i}]: source_slug required`); continue; }
    if (!isNonEmptyString(item.source_name)) errors.push(`index.items[${i}] (${item.source_slug}): source_name required`);
    if (known.has(item.source_slug)) errors.push(`duplicate slug in index: ${item.source_slug}`);
    known.add(item.source_slug);
  }

  const relBySlug = new Map();
  for (const [i, item] of relationItems.entries()) {
    const slug = item?.source_slug;
    if (!isNonEmptyString(slug)) { errors.push(`relations.items[${i}]: source_slug required`); continue; }
    if (relBySlug.has(slug)) errors.push(`duplicate slug in relations: ${slug}`);
    if (!known.has(slug)) errors.push(`relations for unknown slug: ${slug}`);
    for (const type of RELATION_TYPES) {
      const list = item[type];
      if (!Array.isArray(list)) { errors.push(`relations ${slug}.${type}: array required`); continue; }
      for (const target of list) {
        if (!isNonEmptyString(target)) errors.push(`relations ${slug}.${type}: non-string target`);
        else if (!known.has(target)) errors.push(`relations ${slug}.${type}: unknown target slug ${target}`);
      }
    }
    relBySlug.set(slug, item);
  }
  for (const slug of known) if (!relBySlug.has(slug)) errors.push(`relations missing for slug: ${slug}`);

  const descBySlug = new Map();
  for (const [i, raw] of (descriptions || []).entries()) {
    const d = normalizeDescription(raw, i, errors);
    if (!d || !isNonEmptyString(d.slug)) continue;
    if (!known.has(d.slug)) errors.push(`description for unknown slug: ${d.slug}`);
    if (descBySlug.has(d.slug)) errors.push(`duplicate description slug: ${d.slug}`);
    const src = indexItems.find(item => item?.source_slug === d.slug);
    if (src && d.name != null && d.name !== src.source_name) errors.push(`description ${d.slug}: name "${d.name}" != index name "${src.source_name}"`);
    if (src && d.source_url != null && d.source_url !== src.source_url) errors.push(`description ${d.slug}: source_url differs from index`);
    descBySlug.set(d.slug, d);
  }
  if (requireAllDescriptions) {
    const missing = [...known].filter(slug => !descBySlug.has(slug));
    if (missing.length) errors.push(`descriptions missing for ${missing.length}/${known.size} slugs: ${missing.join(', ')}`);
  }
  if (errors.length) fail(errors);

  const items = indexItems.map(item => {
    const rel = relBySlug.get(item.source_slug);
    const desc = descBySlug.get(item.source_slug) || null;
    return {
      slug: item.source_slug,
      name: item.source_name,
      source_category: item.source_category ?? null,
      source_url: item.source_url ?? null,
      kind: desc ? desc.kind : null,
      description: desc ? desc.description : null,
      relations: {
        incoming: [...rel.incoming],
        outgoing: [...rel.outgoing],
        related: [...rel.related],
      },
    };
  });
  return { version: CATALOG_VERSION, generated_from: { files: sources }, items };
}

function readSource(file, { optional = false } = {}) {
  const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
  if (!fs.existsSync(file)) {
    if (!optional) throw new Error(`input missing: ${rel}`);
    return { data: null, source: { path: rel, sha256: null, present: false } };
  }
  const buf = fs.readFileSync(file);
  return { data: JSON.parse(buf.toString('utf8')), source: { path: rel, sha256: sha256(buf), present: true } };
}

function serialize(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

function parseArgs(args) {
  const opts = { ...DEFAULTS, check: false, allowPartial: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--check') opts.check = true;
    else if (a === '--allow-partial') opts.allowPartial = true;
    else if (['--index', '--relations', '--descriptions', '--out'].includes(a)) opts[a.slice(2)] = path.resolve(args[++i]);
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

function main(args = process.argv.slice(2)) {
  const opts = parseArgs(args);
  const index = readSource(opts.index);
  const relations = readSource(opts.relations);
  const descriptions = readSource(opts.descriptions, { optional: true });
  const catalog = buildCatalog({
    index: index.data,
    relations: relations.data,
    descriptions: descriptions.data,
    sources: [index.source, relations.source, descriptions.source],
    // 설명 파일이 있으면 기본으로 전체 slug 설명 존재를 요구한다(--allow-partial 로만 완화).
    requireAllDescriptions: descriptions.source.present && !opts.allowPartial,
  });
  const text = serialize(catalog);
  const described = catalog.items.filter(i => i.description).length;
  if (opts.check) {
    const current = fs.existsSync(opts.out) ? fs.readFileSync(opts.out, 'utf8') : null;
    if (current !== text) throw new Error(`catalog out of date: ${path.relative(REPO_ROOT, opts.out)}`);
    process.stdout.write(`catalog up to date (${catalog.items.length} items, ${described} described)\n`);
    return catalog;
  }
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, text);
  process.stdout.write(`wrote ${path.relative(REPO_ROOT, opts.out)} (${catalog.items.length} items, ${described} described, sha256 ${sha256(Buffer.from(text))})\n`);
  return catalog;
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildCatalog, serialize, main, DEFAULTS, CATALOG_VERSION, RELATION_TYPES };
