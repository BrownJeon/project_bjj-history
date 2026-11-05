// Modal portals share one document-level focus/scroll boundary. Parent tokens keep
// initially nested dialogs above their parents even when React mounts child effects first.
const documents = new WeakMap();

function restoreAttribute(node, name, value) {
  if (value == null) node.removeAttribute(name);
  else node.setAttribute(name, value);
}

export function modalFocusable(sheet) {
  return [...sheet.querySelectorAll('button,input,textarea,select,a[href],area[href],summary,iframe,object,embed,video[controls],audio[controls],[contenteditable],[tabindex]')]
    .filter(node => {
      if (node.matches(':disabled,input[type="hidden"]') || node.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
      if (node.hasAttribute('tabindex') && node.tabIndex < 0) return false;
      const editable = node.hasAttribute('contenteditable') && node.getAttribute('contenteditable') !== 'false';
      if (node.tabIndex < 0 && !editable) return false;
      for (let ancestor = node; ancestor && ancestor !== sheet.parentElement; ancestor = ancestor.parentElement) {
        const style = sheet.ownerDocument.defaultView.getComputedStyle(ancestor);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        if (ancestor.tagName === 'DETAILS' && !ancestor.open && !ancestor.querySelector(':scope > summary')?.contains(node)) return false;
      }
      return true;
    });
}

function topOf(state) { return state.entries[state.entries.length - 1]; }
function focusEntry(entry) {
  if (!entry) return;
  const target = modalFocusable(entry.sheet)[0] || entry.sheet;
  target.focus({ preventScroll: true });
}

function orderEntries(state) {
  const byToken = new Map(state.entries.map(entry => [entry.token, entry]));
  const path = entry => {
    const result = [entry.order];
    for (let parent = byToken.get(entry.parent); parent; parent = byToken.get(parent.parent)) result.unshift(parent.order);
    return result;
  };
  state.entries.sort((left, right) => {
    const a = path(left), b = path(right);
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  });
}

function isolate(state) {
  const top = topOf(state);
  for (const node of state.document.body.children) {
    if (!state.originals.has(node)) state.originals.set(node, { inert: node.getAttribute('inert'), hidden: node.getAttribute('aria-hidden') });
    const original = state.originals.get(node);
    if (top && node !== top.overlay) { node.setAttribute('inert', ''); node.setAttribute('aria-hidden', 'true'); }
    else { restoreAttribute(node, 'inert', original.inert); restoreAttribute(node, 'aria-hidden', original.hidden); }
  }
  state.entries.forEach((entry, index) => { entry.overlay.style.zIndex = String(1000 + index * 2); });
}

function createState(document) {
  const state = { document, entries: [], originals: new Map(), sequence: 0, focusVersion: 0 };
  const bodyStyle = document.body.style;
  state.overflow = bodyStyle.getPropertyValue('overflow');
  state.overflowPriority = bodyStyle.getPropertyPriority('overflow');
  state.compositionstart = event => { state.composingTarget = event.target; };
  state.compositionend = event => { if (state.composingTarget === event.target) state.composingTarget = null; };
  state.keydown = event => {
    const top = topOf(state);
    if (!top) return;
    // IME owns its cancellation/navigation keys; some engines omit isComposing
    // or report legacy 229, so also retain the active composition target.
    if (event.isComposing || event.keyCode === 229 || state.composingTarget === event.target) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); top.close?.();
    } else if (event.key === 'Tab') {
      const nodes = modalFocusable(top.sheet), first = nodes[0] || top.sheet, last = nodes[nodes.length - 1] || top.sheet;
      if (!top.sheet.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    }
  };
  state.focusin = event => {
    if (state.composingTarget !== event.target) state.composingTarget = null;
    const top = topOf(state);
    if (top && !top.sheet.contains(event.target)) focusEntry(top);
  };
  document.addEventListener('keydown', state.keydown, true);
  document.addEventListener('focusin', state.focusin);
  document.addEventListener('compositionstart', state.compositionstart, true);
  document.addEventListener('compositionend', state.compositionend, true);
  state.observer = new document.defaultView.MutationObserver(() => isolate(state));
  state.observer.observe(document.body, { childList: true });
  bodyStyle.setProperty('overflow', 'hidden');
  return state;
}

export function topModal(document) { return topOf(documents.get(document) || { entries: [] }); }

export function registerModal({ token, parent, overlay, sheet, trigger, close }) {
  const document = overlay.ownerDocument;
  let state = documents.get(document);
  if (!state) { state = createState(document); documents.set(document, state); }
  const entry = { token, parent, overlay, sheet, trigger, close, order: ++state.sequence };
  state.entries.push(entry); orderEntries(state); isolate(state);
  // Run after every layout effect has registered (including StrictMode replay).
  const focusVersion = ++state.focusVersion;
  queueMicrotask(() => {
    if (documents.get(document) === state && state.focusVersion === focusVersion) focusEntry(topOf(state));
  });
  return () => {
    const wasTop = topOf(state) === entry;
    const index = state.entries.indexOf(entry);
    if (index < 0) return;
    // If an ancestor disappears first, descendants must not restore into its soon-removed DOM.
    for (const remaining of state.entries) {
      if (remaining !== entry && entry.sheet.contains(remaining.trigger)) remaining.trigger = entry.trigger;
    }
    state.entries.splice(index, 1); ++state.focusVersion; orderEntries(state);
    const next = topOf(state);
    if (next) isolate(state);
    else {
      state.observer.disconnect();
      document.removeEventListener('keydown', state.keydown, true);
      document.removeEventListener('focusin', state.focusin);
      document.removeEventListener('compositionstart', state.compositionstart, true);
      document.removeEventListener('compositionend', state.compositionend, true);
      state.composingTarget = null;
      for (const [node, original] of state.originals) {
        restoreAttribute(node, 'inert', original.inert); restoreAttribute(node, 'aria-hidden', original.hidden);
      }
      if (state.overflow) document.body.style.setProperty('overflow', state.overflow, state.overflowPriority);
      else document.body.style.removeProperty('overflow');
      documents.delete(document);
    }
    if (wasTop) {
      const restore = entry.trigger;
      if (restore?.isConnected && !restore.closest('[inert],[hidden],[aria-hidden="true"]') && (!next || next.sheet.contains(restore))) restore.focus({ preventScroll: true });
      else focusEntry(next);
    }
  };
}
