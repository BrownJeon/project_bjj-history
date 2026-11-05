// Run with BJJ_MODAL_TEST_DEPS=<local React/esbuild deps root> and, when separate,
// BJJ_MODAL_TEST_JSDOM=<local jsdom deps root>. No NFS node_modules or live API is used.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dependencyRoot = resolve(process.env.BJJ_MODAL_TEST_DEPS || process.cwd());
const requireDependencies = createRequire(join(dependencyRoot, 'package.json'));
const requireDOM = createRequire(join(resolve(process.env.BJJ_MODAL_TEST_JSDOM || dependencyRoot), 'package.json'));
const { JSDOM } = requireDOM('jsdom');
const React = requireDependencies('react');
const { act } = React;
const { build } = requireDependencies('esbuild');
const directory = await mkdtemp(join(dependencyRoot, '.task051-modal-'));
const componentDirectory = dirname(fileURLToPath(import.meta.url));
await writeFile(join(directory, 'entry.jsx'), [
  `export { default as Modal } from ${JSON.stringify(join(componentDirectory, 'Modal.jsx'))};`,
  `export { runTopBackHandler, backStackSize } from ${JSON.stringify(resolve(componentDirectory, '../native/backStack.js'))};`,
].join('\n'));
await build({ entryPoints: [join(directory, 'entry.jsx')], outfile: join(directory, 'bundle.mjs'), bundle: true, format: 'esm', platform: 'browser', external: ['react', 'react-dom'], logLevel: 'silent' });
let Modal, runTopBackHandler, backStackSize;
after(() => rm(directory, { recursive: true, force: true }));
const h = React.createElement;

async function environment(run) {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"><button id="outside">밖</button></main><div id="mount"></div></body></html>', { url: 'http://127.0.0.1/' });
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'MutationObserver', 'IS_REACT_ACT_ENVIRONMENT']) previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  if (!Modal) ({ Modal, runTopBackHandler, backStackSize } = await import(pathToFileURL(join(directory, 'bundle.mjs'))));
  const { createRoot } = requireDependencies('react-dom/client');
  const root = createRoot(document.getElementById('mount'));
  const render = async element => act(async () => { root.render(element); });
  const click = async node => act(async () => { node.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  const key = async (name, shiftKey = false) => act(async () => { document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true })); });
  const byTitle = title => [...document.querySelectorAll('[role="dialog"]')].find(node => document.getElementById(node.getAttribute('aria-labelledby'))?.textContent === title);
  try { await run({ render, click, key, byTitle }); }
  finally {
    await act(async () => { root.unmount(); });
    assert.equal(backStackSize(), 0, 'unmount must remove every native handler');
    assert.equal(document.querySelectorAll('.bjj-modal-overlay').length, 0);
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('default sheet is labelled, traps focus, ignores sheet clicks and restores trigger', async () => environment(async ({ render, click, key, byTitle }) => {
  function App() {
    const [open, setOpen] = React.useState(false);
    return h(React.Fragment, null,
      h('button', { id: 'launcher', onClick: () => setOpen(true) }, '수업'),
      h(Modal, { open, title: '수업 추가', onClose: () => setOpen(false), footer: h('button', { id: 'save' }, '저장') }, h('input', { 'aria-label': '수업 내용' })));
  }
  document.body.style.setProperty('overflow', 'scroll', 'important');
  await render(h(App));
  const launcher = document.getElementById('launcher'); launcher.focus(); await click(launcher);
  const sheet = byTitle('수업 추가');
  assert.equal(sheet.getAttribute('aria-modal'), 'true');
  assert.equal(sheet.style.maxHeight, '88%');
  assert.equal(sheet.querySelector('button').getAttribute('aria-label'), '닫기');
  assert.equal(document.activeElement, sheet.querySelector('button'));
  assert.equal(document.body.style.overflow, 'hidden');
  document.getElementById('save').focus(); await key('Tab');
  assert.equal(document.activeElement, sheet.querySelector('button'));
  await key('Tab', true); assert.equal(document.activeElement.id, 'save');
  document.getElementById('outside').focus(); assert.equal(document.activeElement, sheet.querySelector('button'));
  await click(sheet); assert.ok(byTitle('수업 추가'));
  await click(sheet.parentElement); assert.equal(byTitle('수업 추가'), undefined);
  assert.equal(document.activeElement, launcher);
  assert.equal(document.body.style.overflow, 'scroll');
  assert.equal(document.body.style.getPropertyPriority('overflow'), 'important');
}));

test('nested clip dialog alone closes on Escape/backdrop and keeps parent locked', async () => environment(async ({ render, click, key, byTitle }) => {
  const closed = [];
  function App() {
    const [parent, setParent] = React.useState(true), [child, setChild] = React.useState(false);
    return h(Modal, { open: parent, fullScreen: true, title: '피드백', onClose: () => { closed.push('parent'); setParent(false); } },
      h('button', { id: 'clip', onClick: () => setChild(true) }, '영상 상세'),
      h(Modal, { open: child, title: '영상', onClose: () => { closed.push('clip'); setChild(false); } }, h('button', { id: 'usage' }, '드릴 +1')));
  }
  await render(h(App)); document.getElementById('clip').focus(); await click(document.getElementById('clip'));
  const parent = byTitle('피드백'), child = byTitle('영상');
  assert.equal(parent.style.height, '100dvh');
  assert.equal(parent.parentElement.getAttribute('aria-hidden'), 'true');
  assert.ok(parent.parentElement.hasAttribute('inert'));
  assert.equal(child.parentElement.hasAttribute('inert'), false);
  assert.ok(Number(child.parentElement.style.zIndex) > Number(parent.parentElement.style.zIndex));
  await click(parent.parentElement); assert.deepEqual(closed, []);
  await key('Escape'); assert.deepEqual(closed, ['clip']);
  assert.ok(byTitle('피드백')); assert.equal(document.body.style.overflow, 'hidden');
  assert.equal(document.activeElement.id, 'clip');
  await click(document.getElementById('clip')); await click(byTitle('영상').parentElement);
  assert.deepEqual(closed, ['clip', 'clip']);
  await key('Escape'); assert.deepEqual(closed, ['clip', 'clip', 'parent']);
  assert.equal(document.body.style.overflow, '');
}));

test('initial nested StrictMode mount uses child as top and native back closes only child', async () => environment(async ({ render, key, byTitle }) => {
  const closed = [];
  function App() {
    const [parent, setParent] = React.useState(true), [child, setChild] = React.useState(true);
    return h(Modal, { open: parent, title: '상위', onClose: () => { closed.push('parent'); setParent(false); } },
      h('button', { id: 'parent-control' }, '부모 동작'),
      h(Modal, { open: child, title: '하위', onClose: () => { closed.push('child'); setChild(false); } }, h('button', null, '하위 동작')));
  }
  const outside = document.getElementById('outside'); outside.focus();
  await render(h(React.StrictMode, null, h(App)));
  const child = byTitle('하위');
  assert.ok(child.contains(document.activeElement));
  assert.ok(byTitle('상위').parentElement.hasAttribute('inert'));
  assert.equal(backStackSize(), 2);
  await act(async () => { assert.equal(runTopBackHandler(), true); });
  assert.deepEqual(closed, ['child']); assert.ok(byTitle('상위'));
  assert.equal(backStackSize(), 1);
  await key('Escape'); assert.deepEqual(closed, ['child', 'parent']);
  assert.equal(backStackSize(), 0); assert.equal(document.activeElement, outside);
}));

test('later root dialogs remain above older descendants and lower unmount does not steal focus', async () => environment(async ({ render, byTitle }) => {
  function App({ first = true, second = false }) {
    return h(React.Fragment, null,
      first && h(Modal, { title: '첫째', onClose: () => {} }, h(Modal, { title: '첫째 하위', onClose: () => {} }, h('input', { id: 'nested-input' }))),
      second && h(Modal, { title: '둘째', onClose: () => {} }, h('input', { id: 'later-input' })));
  }
  await render(h(App)); await render(h(App, { second: true }));
  const second = byTitle('둘째'); assert.ok(second.contains(document.activeElement));
  assert.ok(Number(second.parentElement.style.zIndex) > Number(byTitle('첫째 하위').parentElement.style.zIndex));
  document.getElementById('later-input').focus();
  await render(h(App, { first: false, second: true }));
  assert.equal(document.activeElement.id, 'later-input'); assert.equal(document.body.style.overflow, 'hidden');
}));

test('background attributes and newly inserted nodes are restored exactly', async () => environment(async ({ render }) => {
  const app = document.getElementById('app'); app.setAttribute('aria-hidden', 'false');
  const preserved = document.createElement('aside'); preserved.setAttribute('inert', 'original'); preserved.setAttribute('aria-hidden', 'true'); document.body.append(preserved);
  await render(h(Modal, { title: '모달', onClose: () => {} }, '내용'));
  const late = document.createElement('aside'); document.body.append(late);
  await act(async () => { await Promise.resolve(); });
  assert.ok(late.hasAttribute('inert')); assert.equal(late.getAttribute('aria-hidden'), 'true');
  await render(null);
  assert.equal(app.getAttribute('aria-hidden'), 'false'); assert.equal(app.hasAttribute('inert'), false);
  assert.equal(late.hasAttribute('inert'), false); assert.equal(late.hasAttribute('aria-hidden'), false);
  assert.equal(preserved.getAttribute('inert'), 'original'); assert.equal(preserved.getAttribute('aria-hidden'), 'true');
}));

test('empty dialog traps focus, hidden controls are skipped, and latest callback does not reorder', async () => environment(async ({ render, key, byTitle }) => {
  await render(h(Modal, null, '닫을 수 없는 내용'));
  const empty = document.querySelector('[role="dialog"]');
  assert.equal(empty.getAttribute('aria-label'), '상세 보기'); assert.equal(document.activeElement, empty);
  await key('Tab'); assert.equal(document.activeElement, empty);
  await render(null);
  let closed = '';
  function App({ version }) {
    return h(Modal, { title: '부모', onClose: () => { closed = 'parent'; } },
      h(Modal, { title: '자식', onClose: () => { closed = `child-${version}`; } },
        h('button', { style: { display: 'none' } }, '숨김'), h('input', { type: 'hidden' }),
        h('button', { disabled: true }, '비활성'), h('button', { id: 'last' }, '마지막')));
  }
  await render(h(App, { version: 1 })); await render(h(App, { version: 2 }));
  document.getElementById('last').focus(); await key('Tab');
  assert.equal(document.activeElement, byTitle('자식').querySelector('button'));
  await key('Escape'); assert.equal(closed, 'child-2');
}));

test('unmounting the entire nested tree restores the original outside opener', async () => environment(async ({ render, click }) => {
  function App() {
    const [open, setOpen] = React.useState(true);
    return open && h(Modal, { title: '상위', onClose: () => setOpen(false) },
      h('button', { id: 'inside-launch' }, '선택'),
      h(Modal, { title: '하위', onClose: () => {} }, h('button', { id: 'remove-all', onClick: () => setOpen(false) }, '모두 닫기')));
  }
  const outside = document.getElementById('outside'); outside.focus();
  await render(h(App)); await click(document.getElementById('remove-all'));
  assert.equal(document.querySelector('[role="dialog"]'), null); assert.equal(document.activeElement, outside);
  assert.equal(document.body.style.overflow, '');
}));

test('IME cancellation Escape stays untouched while ordinary Escape closes only the top dialog', async () => environment(async ({ render, key, byTitle }) => {
  const closed = [];
  function App() {
    const [parent, setParent] = React.useState(true), [child, setChild] = React.useState(true);
    return h(Modal, { open: parent, title: '피드백 입력', onClose: () => { closed.push('parent'); setParent(false); } },
      h(Modal, { open: child, title: '보완 답변', onClose: () => { closed.push('child'); setChild(false); } }, h('textarea', { id: 'korean-answer' })));
  }
  await render(h(App));
  const input = document.getElementById('korean-answer'); input.focus();
  let received = 0;
  input.addEventListener('keydown', () => { received += 1; });
  const escape = options => new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...options });
  const flagged = escape({ isComposing: true });
  await act(async () => { input.dispatchEvent(flagged); });
  assert.equal(flagged.defaultPrevented, false); assert.deepEqual(closed, []);
  await act(async () => { input.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true, data: 'ㅎ' })); });
  const unmarked = escape({ isComposing: false });
  await act(async () => { input.dispatchEvent(unmarked); });
  assert.equal(unmarked.defaultPrevented, false); assert.deepEqual(closed, []);
  await act(async () => { input.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true, data: '한' })); });
  const legacy = escape({ keyCode: 229 });
  assert.equal(legacy.keyCode, 229);
  await act(async () => { input.dispatchEvent(legacy); });
  assert.equal(legacy.defaultPrevented, false); assert.deepEqual(closed, []);
  assert.equal(received, 3, 'IME key events must still reach the input');
  await key('Escape');
  assert.deepEqual(closed, ['child']); assert.ok(byTitle('피드백 입력'));
  await key('Escape'); assert.deepEqual(closed, ['child', 'parent']);
}));
