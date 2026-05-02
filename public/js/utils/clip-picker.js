// utils/clip-picker.js - 공용 영상(clip) 선택 컴포넌트
// 기술/수업/스파링 모달에서 기존 참고영상을 검색·선택하거나 새로 등록하여 참조

import { CACHE } from '../core/cache.js';

let nextPickerId = 1;
const pickerRegistry = new Map();
// clip 모달이 "추가 등록" 경로로 열렸을 때 저장 완료 콜백
let pendingAddCallback = null;

function platformIcon(p) {
  if (p === 'youtube')   return '▶';
  if (p === 'instagram') return '📷';
  return '🔗';
}

function escapeHtml(s) {
  return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function createClipPicker(container, opts = {}) {
  if (!container) return null;
  const id = nextPickerId++;
  const inst = {
    id,
    container,
    selectedIds: new Set((opts.selectedIds || []).map(Number)),
    onChange: opts.onChange || (() => {}),
    placeholder: opts.placeholder || '영상 제목으로 검색 또는 추가...'
  };
  pickerRegistry.set(id, inst);
  renderPicker(inst);
  return {
    id,
    getSelectedIds: () => [...inst.selectedIds],
    setSelectedIds: (ids) => {
      inst.selectedIds = new Set((ids || []).map(Number));
      renderPicker(inst);
    },
    refresh: () => renderPicker(inst)
  };
}

function renderPicker(inst) {
  const clips = CACHE.clips || [];
  const selectedClips = [...inst.selectedIds]
    .map(id => clips.find(c => c.id === id))
    .filter(Boolean);

  const chips = selectedClips.map(c => {
    const title = c.title || '제목 없음';
    const short = title.length > 22 ? title.slice(0, 22) + '…' : title;
    return `<span class="chip" style="background:var(--blue-bg);border-color:var(--blue)">
      <span style="cursor:pointer;color:var(--blue-text)" onclick="__clipPickerOpenDetail(${c.id})" title="${escapeHtml(title)}">
        ${platformIcon(c.platform)} ${escapeHtml(short)}
      </span>
      <span class="chip-x" onclick="__clipPickerRemove(${inst.id}, ${c.id})">×</span>
    </span>`;
  }).join('');

  inst.container.innerHTML = `
    <div class="clip-picker-chips chip-group" style="margin-bottom:6px">${chips}</div>
    <div style="position:relative">
      <input type="text" class="clip-picker-input"
             placeholder="${escapeHtml(inst.placeholder)}"
             oninput="__clipPickerSearch(${inst.id}, this.value)"
             onfocus="__clipPickerSearch(${inst.id}, this.value)"
             onblur="setTimeout(()=>__clipPickerHide(${inst.id}), 180)"
             autocomplete="off" style="width:100%">
      <div class="clip-picker-suggest" id="clip-picker-suggest-${inst.id}" style="
        position:absolute;top:100%;left:0;right:0;background:var(--bg2);
        border:0.5px solid var(--border2);border-radius:var(--radius);
        max-height:240px;overflow-y:auto;z-index:200;display:none"></div>
    </div>
  `;
}

function runSearch(pickerId, query) {
  const inst = pickerRegistry.get(pickerId);
  if (!inst) return;
  const suggestEl = document.getElementById(`clip-picker-suggest-${pickerId}`);
  if (!suggestEl) return;
  const q = (query || '').trim().toLowerCase();
  let items = (CACHE.clips || []).filter(c => !inst.selectedIds.has(c.id));
  if (q) {
    items = items.filter(c =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.url   || '').toLowerCase().includes(q) ||
      (c.tech_name || '').toLowerCase().includes(q) ||
      (c.tags || []).some(t => (t || '').toLowerCase().includes(q))
    );
  }
  items = items.slice(0, 10);

  const rows = items.map(c => {
    const techStr = c.tech_name || '';
    return `<div class="tech-suggest-item" onmousedown="event.preventDefault()" onclick="__clipPickerSelect(${pickerId}, ${c.id})">
      ${platformIcon(c.platform)} ${escapeHtml(c.title || '')}
      ${techStr ? `<span style="font-size:11px;color:var(--text2);margin-left:6px">· ${escapeHtml(techStr)}</span>` : ''}
    </div>`;
  }).join('');

  const safeQ = (query || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const addNew = `<div class="tech-suggest-item tech-suggest-new"
      onmousedown="event.preventDefault()" onclick="__clipPickerOpenNew(${pickerId}, '${safeQ}')">
      + 새 영상 등록${q ? ` ("${escapeHtml(query)}")` : ''}
    </div>`;

  suggestEl.innerHTML = (rows || '') + addNew;
  suggestEl.style.display = 'block';
}

window.__clipPickerSearch = runSearch;

window.__clipPickerHide = (pickerId) => {
  const suggestEl = document.getElementById(`clip-picker-suggest-${pickerId}`);
  if (suggestEl) suggestEl.style.display = 'none';
};

window.__clipPickerSelect = (pickerId, clipId) => {
  const inst = pickerRegistry.get(pickerId);
  if (!inst) return;
  inst.selectedIds.add(Number(clipId));
  const suggestEl = document.getElementById(`clip-picker-suggest-${pickerId}`);
  if (suggestEl) suggestEl.style.display = 'none';
  renderPicker(inst);
  inst.onChange([...inst.selectedIds]);
};

window.__clipPickerRemove = (pickerId, clipId) => {
  const inst = pickerRegistry.get(pickerId);
  if (!inst) return;
  inst.selectedIds.delete(Number(clipId));
  renderPicker(inst);
  inst.onChange([...inst.selectedIds]);
};

window.__clipPickerOpenDetail = (clipId) => {
  if (typeof window.openClipDetail === 'function') window.openClipDetail(clipId);
};

window.__clipPickerOpenNew = (pickerId, initialQ) => {
  const inst = pickerRegistry.get(pickerId);
  if (!inst) return;
  pendingAddCallback = (newClipId) => {
    inst.selectedIds.add(Number(newClipId));
    renderPicker(inst);
    inst.onChange([...inst.selectedIds]);
  };
  const suggestEl = document.getElementById(`clip-picker-suggest-${pickerId}`);
  if (suggestEl) suggestEl.style.display = 'none';
  if (typeof window.openClipModal === 'function') {
    window.openClipModal(null, { initialTitle: initialQ || '' });
  }
};

// clips.js 의 saveClip 이 신규 등록 시 이 함수를 호출해 picker 에 반영
export function consumePendingAdd(newClipId) {
  if (!pendingAddCallback) return false;
  const cb = pendingAddCallback;
  pendingAddCallback = null;
  try { cb(newClipId); } catch(_) {}
  return true;
}

// 외부에서 cache 가 갱신됐을 때 모든 picker 재렌더
export function refreshAllPickers() {
  for (const inst of pickerRegistry.values()) renderPicker(inst);
}
