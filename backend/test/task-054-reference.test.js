// task-054 기술 참고자료: catalog 빌드 · resolve · buildReference · schema 초안.
// 합성 픽스처만 사용한다(실제 개인 기술 목록·DB 미사용). 별칭 검사는 기존 사전의 일반 용어 1건만 쓴다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildCatalog, serialize } = require('../scripts/task-054-build-reference-catalog');
const ref = require('../src/services/techniqueReference');
const schema = require('../scripts/task-054-reference-links-schema');

const idx = slugs => ({ items: slugs.map(([slug, name]) => ({ source_slug: slug, source_name: name, source_category: '합성분류', source_url: `https://example.invalid/${slug}` })) });
const rels = map => ({ items: Object.entries(map).map(([slug, r]) => ({ source_slug: slug, status: 'observed', incoming: r.in || [], outgoing: r.out || [], related: r.rel || [] })) });
const desc = (slug, name, extra = {}) => ({ slug, name, kind: 'technique', summary: `${name} 합성 요약`, conditions: ['조건'], principles: ['원리'], mistakes: ['실수'], mistakes_basis: 'none', next: ['다음'], source_url: `https://example.invalid/${slug}`, review: { reviewer: 'gym-master', status: 'coach_draft', basis: '합성' }, ...extra });

const INDEX = idx([['s-a', '합성 알파'], ['s-b', '합성 베타'], ['s-c', '합성 감마'], ['s-d', '합성 델타'], ['s-k', 'kimura'], ['s-e', '합성 엡실론']]);
const RELS = rels({
  's-a': { in: ['s-c', 's-b', 's-d'], out: ['s-b', 's-e', 's-a'], rel: ['s-d'] },
  's-b': { in: ['s-a'], out: [], rel: [] },
  's-c': { out: ['s-a'] },
  's-d': { out: ['s-a'], rel: [] }, // s-a→s-d related 은 있지만 s-d→s-a related 는 없다(비대칭)
  's-k': {},
  's-e': { in: ['s-a'] },
});
const catalogRaw = (descriptions = [desc('s-a', '합성 알파', { kind_note: '합성 분류 메모', next_note: '합성 연결 메모' })]) => buildCatalog({ index: INDEX, relations: RELS, descriptions, sources: [{ path: 'x', sha256: 'y' }] });

test('catalog build is deterministic, preserves source order and attaches descriptions only where present', () => {
  const a = serialize(catalogRaw());
  const b = serialize(catalogRaw());
  assert.equal(a, b);
  const c = JSON.parse(a);
  assert.deepEqual(c.items.map(i => i.slug), ['s-a', 's-b', 's-c', 's-d', 's-k', 's-e']);
  assert.deepEqual(c.items[0].relations, { incoming: ['s-c', 's-b', 's-d'], outgoing: ['s-b', 's-e', 's-a'], related: ['s-d'] });
  assert.equal(c.items[0].kind, 'technique');
  assert.equal(c.items[0].description.summary, '합성 알파 합성 요약');
  assert.equal(c.items[0].description.next_note, '합성 연결 메모');
  assert.equal(c.items[0].description.review.status, 'coach_draft');
  assert.equal(c.items[1].description, null);
  assert.equal(c.items[1].kind, null);
  assert.equal(c.items[3].relations.related.length, 0, 'related is not mirrored');
  const none = buildCatalog({ index: INDEX, relations: RELS, descriptions: null });
  assert.ok(none.items.every(i => i.description === null && i.kind === null));
});

test('catalog build refuses unknown/duplicate slugs and incomplete descriptions when required', () => {
  assert.throws(() => buildCatalog({ index: INDEX, relations: rels({ ...Object.fromEntries(RELS.items.map(i => [i.source_slug, {}])), 's-a': { out: ['s-zz'] } }) }), /unknown target slug s-zz/);
  assert.throws(() => buildCatalog({ index: idx([['s-a', '알파'], ['s-a', '알파2']]), relations: rels({ 's-a': {} }) }), /duplicate slug in index/);
  assert.throws(() => buildCatalog({ index: INDEX, relations: rels({ 's-a': {} }) }), /relations missing for slug/);
  assert.throws(() => catalogRaw([desc('s-zz', '없음')]), /description for unknown slug/);
  assert.throws(() => catalogRaw([desc('s-a', '다른 이름')]), /name .* != index name/);
  assert.throws(() => catalogRaw([desc('s-a', '합성 알파', { summary: '' })]), /summary required/);
  assert.throws(() => buildCatalog({ index: INDEX, relations: RELS, descriptions: [desc('s-a', '합성 알파')], requireAllDescriptions: true }), /descriptions missing for 5\/6 slugs/);
  const all = INDEX.items.map(i => desc(i.source_slug, i.source_name));
  assert.equal(buildCatalog({ index: INDEX, relations: RELS, descriptions: all, requireAllDescriptions: true }).items.filter(i => i.description).length, 6);
});

test('loadCatalog rejects duplicate slugs and relations to unknown slugs', () => {
  const good = catalogRaw();
  assert.equal(ref.loadCatalog(good).items.length, 6);
  assert.throws(() => ref.loadCatalog({ items: [...good.items, good.items[0]] }), /duplicate slug/);
  const bad = structuredClone(good); bad.items[1].relations.related.push('s-nope');
  assert.throws(() => ref.loadCatalog(bad), /unknown slug s-nope/);
});

test('shipped catalog loads and contains no personal technique fields', () => {
  const shipped = require('../src/data/techniqueReference/catalog.json');
  const c = ref.loadCatalog(shipped);
  assert.ok(c.items.length > 0);
  for (const item of shipped.items) {
    assert.deepEqual(Object.keys(item).sort(), ['description', 'kind', 'name', 'relations', 'slug', 'source_category', 'source_url']);
  }
  assert.ok(!JSON.stringify(shipped).includes('technique_id'));
});

const CAT = ref.loadCatalog(catalogRaw());

test('resolve: exact / alias / ambiguous / none', () => {
  const techs = [
    { id: 11, name: '합성알파' },       // exact (normalize 로 공백 차이 흡수)
    { id: 12, name: '합성 베타' }, { id: 13, name: '합성베타' }, // 같은 정규화명 2행 → ambiguous
    { id: 14, name: '기무라' },          // 'kimura' 별칭 → alias
  ];
  const r = ref.resolve(CAT, techs, []);
  assert.deepEqual(r.get('s-a'), { techniqueId: 11, techniqueName: '합성알파', matchType: 'exact' });
  assert.deepEqual(r.get('s-b'), { techniqueId: null, techniqueName: null, matchType: 'ambiguous', candidateIds: [12, 13] });
  assert.deepEqual(r.get('s-k'), { techniqueId: 14, techniqueName: '기무라', matchType: 'alias' });
  assert.equal(r.get('s-c').matchType, 'none');
  assert.equal(r.get('s-c').techniqueId, null);
});

test('resolve: confirmed beats exact, rejected suppresses only that pair, foreign/deleted link ignored', () => {
  const techs = [{ id: 21, name: '합성 알파' }, { id: 22, name: '다른 이름' }, { id: 23, name: '합성 감마' }];
  const r = ref.resolve(CAT, techs, [
    { technique_id: 22, technique_name_at_link: '다른 이름', reference_slug: 's-a', status: 'confirmed' },
    { technique_id: 23, reference_slug: 's-c', status: 'rejected' },
    { technique_id: 999, reference_slug: 's-d', status: 'confirmed' },
  ]);
  assert.equal(r.get('s-a').matchType, 'confirmed');
  assert.equal(r.get('s-a').techniqueId, 22);
  assert.equal(r.get('s-c').matchType, 'none', 'rejected exact match is suppressed');
  assert.equal(r.get('s-d').matchType, 'none', 'link to a technique outside the user list is ignored');
  const both = ref.resolve(CAT, techs, [{ technique_id: 21, technique_name_at_link: '합성 알파', reference_slug: 's-a', status: 'confirmed' }, { technique_id: 22, technique_name_at_link: '다른 이름', reference_slug: 's-a', status: 'confirmed' }]);
  assert.equal(both.get('s-a').matchType, 'ambiguous');
});

function deps({ techs, links = [], available = true, owner = 1 }) {
  return {
    catalog: CAT,
    findTechnique: async (id, userId) => (userId === owner ? techs.find(t => t.id === id) || null : null),
    listUserTechniques: async userId => (userId === owner ? techs : []),
    listLinks: async () => (available ? { available: true, links } : { available: false, links: [] }),
  };
}

test('buildReference: N cards in source order with self flag, unlinked targets and null conditions', async () => {
  const techs = [{ id: 1, name: '합성 알파' }, { id: 2, name: '합성 베타' }, { id: 4, name: '합성 델타' }];
  const out = await ref.buildReference(1, 1, deps({ techs }));
  assert.deepEqual(out.technique, { id: 1, name: '합성 알파' });
  assert.equal(out.reference.slug, 's-a');
  assert.equal(out.reference.matchType, 'exact');
  assert.equal(out.reference.kind, 'technique');
  assert.equal(out.reference.description.summary, '합성 알파 합성 요약');
  assert.equal(out.reference.sourceUrl, 'https://example.invalid/s-a');
  assert.equal(out.linkStore, 'available');
  assert.deepEqual(out.incoming.map(c => c.relationKey), ['incoming:s-c>s-a:0', 'incoming:s-b>s-a:1', 'incoming:s-d>s-a:2']);
  assert.deepEqual(out.incoming.map(c => [c.slug, c.targetTechniqueId, c.linkState]), [['s-c', null, 'unlinked'], ['s-b', 2, 'linked'], ['s-d', 4, 'linked']]);
  assert.deepEqual(out.outgoing.map(c => [c.relationKey, c.isSelf]), [['outgoing:s-a>s-b:0', false], ['outgoing:s-a>s-e:1', false], ['outgoing:s-a>s-a:2', true]]);
  assert.ok([...out.incoming, ...out.outgoing, ...out.related].every(c => c.conditionText === null));
  assert.equal(out.incoming[1].targetTechniqueName, '합성 베타');
});

test('buildReference: related is not mirrored; 0 and 1 card cases', async () => {
  const techs = [{ id: 1, name: '합성 알파' }, { id: 4, name: '합성 델타' }, { id: 2, name: '합성 베타' }];
  const d = await ref.buildReference(4, 1, deps({ techs }));
  assert.equal(d.reference.slug, 's-d');
  assert.equal(d.related.length, 0, 's-a lists s-d as related, but s-d does not list s-a');
  assert.equal(d.outgoing.length, 1);
  assert.equal(d.incoming.length, 0);
  const b = await ref.buildReference(2, 1, deps({ techs }));
  assert.equal(b.incoming.length, 1);
  assert.equal(b.outgoing.length, 0);
});

test('buildReference: no slug, ambiguous slugs, 404 for foreign technique, unavailable link store', async () => {
  const techs = [{ id: 1, name: '합성 알파' }, { id: 7, name: '관계없는 합성 이름' }, { id: 8, name: '합성 감마' }];
  const none = await ref.buildReference(7, 1, deps({ techs }));
  assert.deepEqual(none.reference, { slug: null, matchType: 'none', kind: null, description: null, sourceUrl: null });
  assert.deepEqual([none.incoming, none.outgoing, none.related], [[], [], []]);

  const multi = await ref.buildReference(8, 1, deps({ techs, links: [{ technique_id: 8, technique_name_at_link: '합성 감마', reference_slug: 's-e', status: 'confirmed' }, { technique_id: 8, technique_name_at_link: '합성 감마', reference_slug: 's-c', status: 'confirmed' }] }));
  assert.equal(multi.reference.matchType, 'ambiguous');
  assert.deepEqual(multi.reference.ambiguousSlugs, ['s-c', 's-e']);
  assert.equal(multi.reference.description, null);

  // 같은 기술에 confirmed 1개 + exact 1개 → confirmed 등급이 이긴다
  const tiered = await ref.buildReference(8, 1, deps({ techs, links: [{ technique_id: 8, technique_name_at_link: '합성 감마', reference_slug: 's-e', status: 'confirmed' }] }));
  assert.equal(tiered.reference.slug, 's-e');
  assert.equal(tiered.reference.matchType, 'confirmed');

  await assert.rejects(ref.buildReference(1, 2, deps({ techs })), e => e.status === 404);

  const unavailable = await ref.buildReference(1, 1, deps({ techs, available: false, links: [{ technique_id: 7, reference_slug: 's-a', status: 'confirmed' }] }));
  assert.equal(unavailable.linkStore, 'unavailable');
  assert.equal(unavailable.reference.slug, 's-a', 'links ignored when store unavailable');
});

test('listLinksWith: direct owner-scoped SELECT; only explicit table-not-found means unavailable', async () => {
  let sqlSeen;
  let paramsSeen;
  const present = await ref.listLinksWith(async (sql, params) => {
    sqlSeen = sql; paramsSeen = params;
    return [[{ technique_id: 1, technique_name_at_link: '합성 알파', reference_slug: 's-a', status: 'confirmed' }]];
  }, 5);
  assert.ok(!sqlSeen.includes('information_schema'));
  assert.match(sqlSeen, /FROM technique_reference_links WHERE user_id = \?/);
  assert.deepEqual(paramsSeen, [5]);
  assert.equal(present.available, true);
  assert.equal(present.links.length, 1);
  assert.deepEqual(await ref.listLinksWith(async () => [[]], 1), { available: true, links: [] });
  for (const error of [{ code: 'ER_NO_SUCH_TABLE' }, { errno: 1146 }, { parent: { errno: 1146 } }, { original: { code: 'ER_NO_SUCH_TABLE' } }]) {
    assert.deepEqual(await ref.listLinksWith(async () => { throw error; }, 1), { available: false, links: [] });
  }
});

test('link permission or query errors cannot resurrect a rejected exact match and expose only sanitized 503', async () => {
  const techs = [{ id: 1, name: '합성 알파' }];
  const base = deps({ techs, links: [{ technique_id: 1, reference_slug: 's-a', status: 'rejected' }] });
  const initial = await ref.buildReference(1, 1, base);
  assert.equal(initial.reference.slug, null);
  assert.equal(initial.reference.description, null);
  const logs = [];
  for (const code of [undefined, 'ER_TABLEACCESS_DENIED_ERROR', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_FIELD_ERROR']) {
    const sensitive = new Error('SELECT secret_sql FROM internal; password=synthetic-secret; database=private; 1146');
    if (code) sensitive.code = code;
    const query = async () => { throw sensitive; };
    const guarded = { ...base, listLinks: uid => ref.listLinksWith(query, uid, { log: { error: (...args) => logs.push(args.join(' ')) } }) };
    await assert.rejects(ref.buildReference(1, 1, guarded), error => {
      assert.equal(error.status, 503);
      assert.equal(error.code, 'REFERENCE_LINKS_UNAVAILABLE');
      assert.equal(error.message, '기술 참고자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      assert.ok(!JSON.stringify(error).includes('synthetic-secret'));
      assert.equal(error.cause, undefined);
      return true;
    });
  }
  assert.equal(logs.length, 4);
  assert.ok(logs.every(line => !/SELECT|password|private|synthetic-secret/.test(line)));
});

test('invalid link response fails closed instead of supplying empty decisions', async () => {
  await assert.rejects(ref.listLinksWith(async () => [null], 1, { log: { error() {} } }), error => error.status === 503 && error.code === 'REFERENCE_LINKS_UNAVAILABLE');
});

test('confirmed links require a current NFC name snapshot; renaming resolves only from the new name', async () => {
  const techs = [{ id: 21, name: '독립 합성 이름' }];
  const link = { technique_id: 21, technique_name_at_link: techs[0].name.normalize('NFD'), reference_slug: 's-a', status: 'confirmed' };
  const initial = await ref.buildReference(21, 1, deps({ techs, links: JSON.parse(JSON.stringify([link])) }));
  assert.equal(initial.reference.slug, 's-a');
  assert.equal(initial.reference.matchType, 'confirmed');
  techs[0].name = '합성 베타';
  const renamed = await ref.buildReference(21, 1, deps({ techs, links: [link] }));
  assert.equal(renamed.reference.slug, 's-b');
  assert.equal(renamed.reference.matchType, 'exact');
  assert.equal(renamed.reference.description, null, 'old alpha description must not follow the id');
  techs[0].name = '연결 없는 새 이름';
  assert.equal((await ref.buildReference(21, 1, deps({ techs, links: [link] }))).reference.slug, null);
});

test('confirmed without a snapshot is ignored; current-name exact fallback and ID-based rejection remain valid', async () => {
  const techs = [{ id: 21, name: '독립 합성 이름' }];
  const noSnapshot = [{ technique_id: 21, reference_slug: 's-a', status: 'confirmed' }];
  assert.equal((await ref.buildReference(21, 1, deps({ techs, links: noSnapshot }))).reference.slug, null);
  techs[0].name = '합성 알파';
  const exact = await ref.buildReference(21, 1, deps({ techs, links: noSnapshot }));
  assert.equal(exact.reference.slug, 's-a');
  assert.equal(exact.reference.matchType, 'exact');
  const rejected = await ref.buildReference(21, 1, deps({ techs, links: [{ technique_id: 21, technique_name_at_link: '과거 이름', reference_slug: 's-a', status: 'rejected' }] }));
  assert.equal(rejected.reference.slug, null);
});

test('schema draft: default is offline DDL only; apply requires explicit env and confirm-database', async () => {
  let text = '';
  const result = await schema.main([], {}, { write: s => { text += s; } });
  assert.equal(result, 'dry-run');
  assert.match(text, /DRY RUN: no connection/);
  assert.match(text, /UNIQUE KEY uq_tech_ref_link \(user_id, technique_id, reference_slug\)/);
  assert.match(text, /status ENUM\('confirmed','rejected'\) NOT NULL/);
  await assert.rejects(schema.main(['--apply'], {}), /Explicit DB_HOST required/);
  const env = { DB_HOST: 'h', DB_PORT: '1', DB_NAME: 'd', DB_USER: 'u', DB_PASS: '' };
  await assert.rejects(schema.main(['--apply'], env), /--confirm-database/);
  await assert.rejects(schema.main(['--apply', '--confirm-database', 'other'], env), /--confirm-database/);
});
