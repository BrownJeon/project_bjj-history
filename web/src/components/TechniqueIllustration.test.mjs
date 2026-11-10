// No live manifest, asset fetch, API or NFS dependencies are used.
// BJJ_ILLUSTRATION_TEST_DEPS=<React/esbuild root>
// BJJ_ILLUSTRATION_TEST_JSDOM=<jsdom root> node --test <this file>
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dependencyRoot = resolve(process.env.BJJ_ILLUSTRATION_TEST_DEPS || process.cwd());
const dependencies = createRequire(join(dependencyRoot, 'package.json'));
const domDependencies = createRequire(join(resolve(process.env.BJJ_ILLUSTRATION_TEST_JSDOM || dependencyRoot), 'package.json'));
const { JSDOM } = domDependencies('jsdom');
const React = dependencies('react');
const { act } = React;
const { build } = dependencies('esbuild');
const directory = await mkdtemp(join(dependencyRoot, '.task058-illustration-'));
const fixtureItem = (slug, names, status = 'ready') => ({ slug, names, url: `/technique-illustrations/set-01/${slug}.webp`, width: 512, height: 512, status });
const manifest = { version: 1, background: '#15171E', items: [
  fixtureItem('alpha', ['알파', '공통']), fixtureItem('bravo', ['브라보', '공통']), fixtureItem('pending', ['준비중'], 'pending'),
] };
const componentDirectory = dirname(fileURLToPath(import.meta.url));
await writeFile(join(directory, 'entry.jsx'), [
  `export { default } from ${JSON.stringify(join(componentDirectory, 'TechniqueIllustration.jsx'))};`,
  `export { default as TechniqueCard } from ${JSON.stringify(join(componentDirectory, 'TechniqueCard.jsx'))};`,
  `export { measureTechniqueCardPadding } from ${JSON.stringify(resolve(componentDirectory, '../utils/techniqueCardLayout.js'))};`,
].join('\n'));
await build({
  entryPoints: [join(directory, 'entry.jsx')],
  outfile: join(directory, 'component.mjs'), bundle: true, format: 'esm', platform: 'browser',
  external: ['react'], loader: { '.css': 'empty' }, logLevel: 'silent',
  plugins: [{ name: 'synthetic-manifest', setup(builder) {
    builder.onLoad({ filter: /techniqueIllustrations\.json$/ }, () => ({ contents: JSON.stringify(manifest), loader: 'json' }));
  } }],
});
const { default: TechniqueIllustration, TechniqueCard, measureTechniqueCardPadding } = await import(pathToFileURL(join(directory, 'component.mjs')));
after(() => rm(directory, { recursive: true, force: true }));
const h = React.createElement;

async function environment(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="mount"></div></body></html>', { url: 'http://127.0.0.1/' });
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'IS_REACT_ACT_ENVIRONMENT']) previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = dependencies('react-dom/client');
  const root = createRoot(document.getElementById('mount'));
  const render = async element => act(async () => { root.render(element); });
  const event = async (node, type) => act(async () => { node.dispatchEvent(new window.Event(type, { bubbles: true })); });
  try { await run({ render, event }); }
  finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('missing, pending and ambiguous names create no image or empty frame', async () => environment(async ({ render }) => {
  for (const name of ['미등록', '준비중', '공통']) {
    await render(h('div', null, h(TechniqueIllustration, { name }), h('span', null, '기존 내용')));
    assert.equal(document.querySelector('img'), null);
    assert.equal(document.querySelector('#mount > div').children.length, 1);
    assert.equal(document.getElementById('mount').textContent, '기존 내용');
  }
}));

test('a ready list image reserves 48px horizontally and its click still reaches the technique card', async () => environment(async ({ render, event }) => {
  let opens = 0;
  await render(h('div', { onClick: () => opens++ }, h(TechniqueIllustration, { name: '알파' }), h('span', null, '알파')));
  const image = document.querySelector('img');
  assert.equal(image.getAttribute('src'), '/technique-illustrations/set-01/alpha.webp');
  assert.deepEqual(['width', 'height', 'loading', 'decoding', 'draggable'].map(x => image.getAttribute(x)), ['48', '48', 'lazy', 'async', 'false']);
  assert.ok(image.classList.contains('technique-illustration--list'));
  assert.ok(image.parentElement.classList.contains('technique-illustration-slot'));
  await event(image, 'click');
  assert.equal(opens, 1);
}));

test('a failed image removes its frame and spacing while preserving existing card content', async () => environment(async ({ render, event }) => {
  await render(h('div', null, h(TechniqueIllustration, { name: '알파' }), h('span', null, '기존 기술명')));
  await event(document.querySelector('img'), 'error');
  assert.equal(document.querySelector('img'), null);
  assert.equal(document.querySelector('.technique-illustration'), null);
  assert.equal(document.querySelector('.technique-illustration-slot'), null);
  assert.equal(document.querySelector('#mount > div').children.length, 1);
  assert.equal(document.getElementById('mount').textContent, '기존 기술명');
}));

test('connected-technique navigation gets a new failure state and ignores the previous asset error', async () => environment(async ({ render, event }) => {
  await render(h(TechniqueIllustration, { name: '알파', large: true }));
  const previousImage = document.querySelector('img');
  await event(previousImage, 'error');
  assert.equal(document.querySelector('img'), null);
  await render(h(TechniqueIllustration, { name: '브라보', large: true }));
  const currentImage = document.querySelector('img');
  assert.equal(currentImage.getAttribute('src'), '/technique-illustrations/set-01/bravo.webp');
  assert.equal(currentImage.getAttribute('alt'), '브라보 자세');
  assert.deepEqual(['width', 'height'].map(x => currentImage.getAttribute(x)), ['224', '224']);
  assert.ok(currentImage.classList.contains('technique-illustration--detail'));
  assert.equal(document.querySelector('.technique-illustration-slot'), null, 'detail must not use the list layout slot');
  await event(previousImage, 'error');
  assert.equal(document.querySelector('img'), currentImage);
}));

test('untagged, tagged and naturally wrapping text stays in charge of its row content', async () => environment(async ({ render, event }) => {
  const cases = [
    { title: '짧은 기술명', tags: [] },
    { title: '짧은 기술명', tags: ['탑'] },
    { title: '자연스럽게 여러 줄로 이어지는 아주 긴 기술명과 연습 조건', tags: ['탑', '긴 포지션명'] },
  ];
  for (const { title, tags } of cases) {
    await render(h('div', { className: 'existing-technique-row' },
      h(TechniqueIllustration, { name: '알파' }),
      h('div', { className: 'existing-technique-text' },
        h('div', { className: 'existing-technique-title' }, title),
        h('div', { className: 'existing-technique-tags' }, tags.map(tag => h('span', { key: tag }, tag))))));
    const slot = document.querySelector('.technique-illustration-slot');
    const text = document.querySelector('.existing-technique-text');
    assert.equal(slot.children.length, 1);
    assert.equal(slot.nextElementSibling, text);
    assert.equal(document.querySelector('.existing-technique-title').textContent, title);
    assert.deepEqual([...document.querySelector('.existing-technique-tags').children].map(x => x.textContent), tags);
    assert.equal(document.querySelector('.existing-technique-row').getAttribute('style'), null, 'image must not force a row height');
    const savedText = text.outerHTML;
    await event(document.querySelector('img'), 'error');
    assert.equal(document.querySelector('.technique-illustration-slot'), null);
    assert.equal(document.querySelector('.existing-technique-text').outerHTML, savedText);
    // A different ready asset resets the per-image failure state for the next case.
    await render(h(TechniqueIllustration, { name: '브라보' }));
  }
}));

function fakeGeometry() {
  const original = window.HTMLElement.prototype.getBoundingClientRect;
  const state = { current: 74, baseline: 48, failClone: false, cloneReads: 0 };
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    const image = this.closest('.technique-card-row')?.querySelector('.technique-illustration-slot');
    let width = 22, height = 22;
    if (this.classList.contains('technique-card-row')) { width = 300; height = image ? state.current : state.baseline; }
    if (this.classList.contains('technique-card-content')) {
      width = image ? 202 : 260;
      height = image ? state.current : state.baseline;
      if (this.style.position === 'fixed') {
        state.cloneReads++;
        if (state.failClone) throw new Error('synthetic measurement failure');
        width = Number.parseFloat(this.style.width); height = state.baseline;
      }
    }
    if (this.classList.contains('technique-illustration-slot')) { width = 48; height = state.current; }
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height };
  };
  return { state, restore: () => { window.HTMLElement.prototype.getBoundingClientRect = original; } };
}

test('extra tag height is absorbed, then image failure restores normal padding and removes its slot', async () => environment(async ({ render, event }) => {
  const geometry = fakeGeometry(), observers = [];
  window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.active = true; observers.push(this); }
    observe() {}
    disconnect() { this.active = false; }
  };
  const technique = { id: 1, name: '알파', positions: ['탑'], clips: [{ usage: { view: 0, used: 0 } }] };
  try {
    await render(h(TechniqueCard, { technique }));
    const row = document.querySelector('.technique-card-row');
    assert.equal(row.parentElement.style.paddingBlock, '1px');
    assert.equal(document.querySelectorAll('[aria-hidden="true"][inert]').length, 0, 'measurement clone must not remain');
    await event(document.querySelector('img'), 'error');
    await act(async () => { observers.find(observer => observer.active).callback([]); });
    assert.equal(row.parentElement.style.paddingBlock, '14px');
    assert.equal(row.querySelector('.technique-illustration-slot'), null);
    assert.match(row.textContent, /알파.*탑.*영상 1.*0.*0/s);
  } finally { geometry.restore(); }
}));

test('without ResizeObserver an image error restores 14px automatically and a replacement asset can be measured', async () => environment(async ({ render, event }) => {
  const geometry = fakeGeometry();
  delete window.ResizeObserver;
  const technique = { id: 1, name: '알파', positions: ['탑'], clips: [{ usage: { view: 0, used: 0 } }] };
  try {
    await render(h(React.StrictMode, null, h(TechniqueCard, { technique })));
    const row = document.querySelector('.technique-card-row');
    assert.equal(row.parentElement.style.paddingBlock, '1px');
    await event(row.querySelector('img'), 'error');
    assert.equal(row.querySelector('.technique-illustration-slot'), null);
    assert.equal(row.parentElement.style.paddingBlock, '14px', 'no observer callback or resize event is dispatched');
    assert.match(row.textContent, /알파.*탑.*영상 1.*0.*0/s);
    await render(h(React.StrictMode, null, h(TechniqueCard, { technique: { ...technique, name: '브라보' } })));
    assert.equal(document.querySelector('img').getAttribute('src'), '/technique-illustrations/set-01/bravo.webp');
    assert.equal(document.querySelector('.technique-card-row').parentElement.style.paddingBlock, '1px');
  } finally { geometry.restore(); }
}));

test('availability reports missing and failed slots and URL replacement, but ignores an old asset error', async () => environment(async ({ render, event }) => {
  const changes = [];
  const onAvailabilityChange = available => changes.push(available);
  await render(h(TechniqueIllustration, { name: '알파', onAvailabilityChange }));
  const oldImage = document.querySelector('img');
  assert.deepEqual(changes, [true]);
  await event(oldImage, 'error');
  assert.deepEqual(changes, [true, false]);
  await render(h(TechniqueIllustration, { name: '브라보', onAvailabilityChange }));
  assert.deepEqual(changes, [true, false, true]);
  await event(oldImage, 'error');
  assert.deepEqual(changes, [true, false, true]);
  await render(h(TechniqueIllustration, { name: '미등록', onAvailabilityChange }));
  assert.deepEqual(changes, [true, false, true, false]);
}));

test('StrictMode, font loading, resize and clip-stat changes remeasure without leaking observers or clones', async () => environment(async ({ render, event }) => {
  const geometry = fakeGeometry(), observers = [];
  window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.active = true; observers.push(this); }
    observe() {}
    disconnect() { this.active = false; }
  };
  const fonts = new window.EventTarget();
  fonts.ready = Promise.resolve(fonts);
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
  const technique = { id: 1, name: '알파', positions: ['탑'], clips: [{ usage: { view: 0, used: 0 } }] };
  try {
    await render(h(React.StrictMode, null, h(TechniqueCard, { technique })));
    assert.equal(observers.filter(observer => observer.active).length, 1);
    assert.equal(document.querySelector('.technique-card-row').parentElement.style.paddingBlock, '1px');
    geometry.state.current = 48;
    await event(fonts, 'loadingdone');
    assert.equal(document.querySelector('.technique-card-row').parentElement.style.paddingBlock, '14px');
    geometry.state.current = 74;
    await event(window, 'resize');
    assert.equal(document.querySelector('.technique-card-row').parentElement.style.paddingBlock, '1px');
    geometry.state.current = 48;
    await render(h(React.StrictMode, null, h(TechniqueCard, { technique: { ...technique, clips: [{ usage: { view: 120, used: 30 } }] } })));
    assert.match(document.querySelector('.technique-card-content').textContent, /120.*30/s);
    assert.equal(document.querySelector('.technique-card-row').parentElement.style.paddingBlock, '14px');
    await render(null);
    assert.equal(observers.filter(observer => observer.active).length, 0);
    const reads = geometry.state.cloneReads;
    for (const observer of observers) observer.callback([]);
    assert.equal(geometry.state.cloneReads, reads, 'callbacks after cleanup must not measure detached content');
    assert.equal(document.querySelector('[aria-hidden="true"][inert]'), null);
  } finally { geometry.restore(); }
}));

test('measurement failures remove the hidden clone and preserve the original content IDs', async () => environment(async ({ render }) => {
  const geometry = fakeGeometry();
  try {
    await render(h(TechniqueCard, { technique: { id: 1, name: '알파', positions: [], clips: [] } }));
    const row = document.querySelector('.technique-card-row');
    const content = row.querySelector('.technique-card-content');
    content.id = 'original-content'; content.firstElementChild.id = 'original-title';
    geometry.state.failClone = true;
    assert.equal(measureTechniqueCardPadding(row, content), null);
    assert.equal(document.querySelector('[aria-hidden="true"][inert]'), null);
    assert.equal(document.querySelectorAll('#original-content').length, 1);
    assert.equal(document.querySelectorAll('#original-title').length, 1);
  } finally { geometry.restore(); }
}));
