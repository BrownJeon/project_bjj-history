// pages/clips.js - 참고영상 CRUD (기술 N:M 태깅)

import { api, setLoading } from '../core/api.js';
import { CACHE } from '../core/cache.js';
import { toast, buildPagination } from '../utils/utils.js';
import { consumePendingAdd, refreshAllPickers } from '../utils/clip-picker.js';

// ── module-level 상태 ──
let clipSearch     = '';
let clipFilter     = 'all';  // 'all' | 'star'
let clipTechFilter = '';     // '' | tech_name (string)
const CLIPS_PAGE_SIZE = 12;
let clipsPage = 1;
let clipFormTags    = [];
export let clipCurrentId = null;

// ── YouTube 유틸 ──
function getYtId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function getYtThumb(url) {
  const id = getYtId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}
function getYtEmbed(url) {
  const id = getYtId(url);
  return id ? `https://www.youtube.com/embed/${id}?rel=0` : null;
}
function getPlatformLabel(platform) {
  if (platform === 'youtube')   return 'YouTube';
  if (platform === 'instagram') return 'Instagram';
  return '링크';
}
function getPlatformIcon(platform) {
  if (platform === 'youtube')   return '▶';
  if (platform === 'instagram') return '📷';
  return '🔗';
}
function getClipThumb(c) {
  if (c.platform === 'youtube') return getYtThumb(c.url);
  if (c.thumb_url) return c.thumb_url;
  return null;
}

// ── 필터 칩 ──
export function renderClipFilters() {
  const wrap = document.getElementById('clip-filter-chips');
  if (!wrap) return;

  function chip(label, isActive, onclick) {
    const s = isActive ? 'border:1.5px solid #000;color:var(--text);font-weight:600;' : '';
    return `<button class="filter-chip" style="${s}" onclick="${onclick}">${label}</button>`;
  }

  const staticChips = [
    chip('전체',     clipFilter === 'all',  "setClipFilter('all')"),
    chip('★ 즐겨찾기', clipFilter === 'star', "setClipFilter('star')"),
  ];

  // 영상에 등록된 기술명 union (중복 제거)
  const names = [...new Set((CACHE.clips || [])
    .map(c => (c.tech_name || '').trim())
    .filter(Boolean))].sort();

  const techChips = names.map(name =>
    chip(name, clipTechFilter === name, `setClipTechFilter('${name.replace(/'/g, "\\'")}')`)
  );

  wrap.innerHTML = [...staticChips, ...techChips].join('');
}

export function setClipFilter(f) {
  clipFilter = ['all', 'star'].includes(f) ? f : 'all';
  clipsPage = 1;
  renderClipFilters();
  renderClips();
}

export function setClipTechFilter(techName) {
  clipTechFilter = clipTechFilter === techName ? '' : techName;
  clipsPage = 1;
  renderClipFilters();
  renderClips();
}

export function setClipSearch(v) {
  clipSearch = v.toLowerCase();
  clipsPage = 1;
  renderClips();
}

export function setClipsPage(p) { clipsPage = p; renderClips(); }

// ── 목록 렌더링 ──
export function renderClips() {
  const list = document.getElementById('clips-list');
  if (!list) return;

  let items = CACHE.clips || [];

  if (clipFilter === 'star') items = items.filter(c => c.starred);
  if (clipTechFilter) {
    items = items.filter(c => (c.tech_name || '') === clipTechFilter);
  }

  if (clipSearch) {
    items = items.filter(c =>
      (c.title || '').toLowerCase().includes(clipSearch) ||
      (c.tech_name || '').toLowerCase().includes(clipSearch) ||
      (c.description || '').toLowerCase().includes(clipSearch) ||
      (c.tags || []).some(t => t.toLowerCase().includes(clipSearch))
    );
  }

  if (!items.length) {
    list.innerHTML = `<div style="text-align:center;color:var(--text2);padding:40px 0;font-size:14px">영상이 없습니다</div>`;
    return;
  }

  const total = items.length;
  const start = (clipsPage - 1) * CLIPS_PAGE_SIZE;
  const paged = items.slice(start, start + CLIPS_PAGE_SIZE);
  list.innerHTML = paged.map(c => renderClipCard(c)).join('')
    + buildPagination(total, clipsPage, CLIPS_PAGE_SIZE, 'setClipsPage');
}

function renderClipCard(c) {
  const thumb = getClipThumb(c);
  const icon  = getPlatformIcon(c.platform);
  const safeIcon = icon.replace(/'/g, "\\'");
  const thumbHtml = thumb
    ? `<img class="clip-thumb" src="${thumb}" alt="" onerror="this.outerHTML='<div class=&quot;clip-thumb-placeholder&quot;>${safeIcon}</div>'">`
    : `<div class="clip-thumb-placeholder">${icon}</div>`;
  const techBadge = c.tech_name
    ? `<span class="tag" style="font-size:11px">⊙ ${c.tech_name}</span>`
    : '';

  return `<div class="clip-card" onclick="openClipDetail(${c.id})">
    ${thumbHtml}
    <div class="clip-info">
      <div class="clip-title">${c.title}</div>
      <div class="clip-meta">
        ${techBadge}
        <span class="clip-platform">${getPlatformLabel(c.platform)}</span>
      </div>
    </div>
    <button class="clip-star ${c.starred?'starred':''}" onclick="event.stopPropagation();toggleClipStar(${c.id})">
      ${c.starred?'★':'☆'}
    </button>
  </div>`;
}

// ── 즐겨찾기 토글 ──
export async function toggleClipStar(id) {
  try {
    const { starred } = await api('PATCH', `/api/clips/${id}/star`);
    const c = CACHE.clips.find(x => x.id === id);
    if (c) c.starred = starred;
    renderClips();
    if (clipCurrentId === id) {
      const btn = document.getElementById('cd-star-btn');
      if (btn) {
        btn.textContent     = starred ? '\u2605 즐겨찾기' : '\u2606 즐겨찾기';
        btn.style.color       = starred ? 'var(--amber)' : '';
        btn.style.borderColor = starred ? 'var(--amber)' : '';
      }
    }
  } catch(e) { toast('오류: ' + e.message); }
}

// ── 추가/수정 모달 ──
export function openClipModal(id, opts = {}) {
  clipFormTags = [];

  const modal = document.getElementById('modal-clip');
  if (!modal) return;

  document.getElementById('clip-edit-id').value   = id || '';
  document.getElementById('clip-modal-title').textContent = id ? '참고영상 수정' : '참고영상 추가';
  document.getElementById('clip-url').value        = '';
  document.getElementById('clip-title').value      = opts.initialTitle || '';
  document.getElementById('clip-desc').value       = '';
  document.getElementById('clip-tech-name').value  = opts.initialTechName || '';
  document.getElementById('clip-tag-input').value  = '';
  document.getElementById('clip-platform-preview').style.display = 'none';
  const starredEl = document.getElementById('clip-starred');
  if (starredEl) starredEl.checked = false;
  const suggestEl = document.getElementById('clip-tech-suggest');
  if (suggestEl) { suggestEl.innerHTML = ''; suggestEl.style.display = 'none'; }

  if (id) {
    const c = CACHE.clips.find(x => x.id === id);
    if (c) {
      document.getElementById('clip-url').value      = c.url || '';
      document.getElementById('clip-title').value    = c.title || '';
      document.getElementById('clip-desc').value     = c.description || '';
      document.getElementById('clip-tech-name').value = c.tech_name || '';
      if (starredEl) starredEl.checked = !!c.starred;
      clipFormTags = [...(c.tags || [])];
      onClipUrlInput(c.url || '');
    }
  }

  renderClipFormTags();
  modal.classList.add('show');
}

export async function analyzeClipVideo() {
  const url = document.getElementById('clip-url')?.value.trim();
  if (!url) { toast('URL을 먼저 입력해주세요'); return; }
  if (!/(youtube\.com|youtu\.be|instagram\.com)/.test(url)) {
    toast('YouTube 또는 Instagram URL만 AI 분석이 가능합니다');
    return;
  }
  const descEl = document.getElementById('clip-desc');
  setLoading(true);
  toast('음성 전사 중... 1~2분 소요될 수 있습니다');
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 300000); // 5분
  try {
    const res = await fetch('/api/enhance-memo/analyze-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: ctrl.signal
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || 'AI 분석 실패');
      return;
    }
    if (descEl) descEl.value = data.description || '';
    const methodLabel =
      data.method === 'vision+audio' ? '(영상+음성 통합)' :
      data.method === 'vision'       ? '(영상 분석)' :
      data.method === 'whisper'      ? '(음성 분석)' : '';
    toast(`AI 설명이 생성되었습니다 ${methodLabel}`);
  } catch(e) {
    toast('AI 분석 실패: ' + (e.name === 'AbortError' ? '시간 초과' : e.message));
  } finally {
    clearTimeout(timer);
    setLoading(false);
  }
}

export function onClipUrlInput(v) {
  const el = document.getElementById('clip-platform-preview');
  if (!el) return;
  if (!v) { el.style.display = 'none'; return; }
  if (v.includes('youtu'))     { el.textContent = '▶ YouTube 영상'; el.style.display = 'block'; }
  else if (v.includes('instagram')) { el.textContent = '📷 Instagram'; el.style.display = 'block'; }
  else                              { el.textContent = '🔗 외부 링크'; el.style.display = 'block'; }
}

// ── 기술명 자동완성 (단일 텍스트, 등록된 기술명만 제안) ──
export function clipTechSearch(v) {
  const suggest = document.getElementById('clip-tech-suggest');
  if (!suggest) return;
  if (!v.trim()) { suggest.innerHTML = ''; suggest.style.display = 'none'; return; }

  const q = v.toLowerCase();
  const matched = (CACHE.techniques || [])
    .filter(t => t.name.toLowerCase().includes(q))
    .slice(0, 10);
  if (!matched.length) { suggest.innerHTML = ''; suggest.style.display = 'none'; return; }

  suggest.innerHTML = matched.map(t => {
    const pos = t.pos ? ` <span style="color:var(--text2);font-size:11px">${t.pos.split(' ')[0]}</span>` : '';
    return `<div class="tech-suggest-item"
      onclick="selectClipTech('${t.name.replace(/'/g,"\\'")}')">
      ${t.name}${pos}
    </div>`;
  }).join('');
  suggest.style.display = 'block';
}

export function selectClipTech(name) {
  document.getElementById('clip-tech-name').value = name;
  const suggest = document.getElementById('clip-tech-suggest');
  if (suggest) { suggest.innerHTML = ''; suggest.style.display = 'none'; }
}

// ── 태그 ──
export function addClipTag() {
  const inp = document.getElementById('clip-tag-input');
  if (!inp) return;
  const v = inp.value.trim();
  if (!v || clipFormTags.includes(v)) { inp.value = ''; return; }
  clipFormTags.push(v);
  inp.value = '';
  renderClipFormTags();
}

export function removeClipTag(i) {
  clipFormTags.splice(i, 1);
  renderClipFormTags();
}

function renderClipFormTags() {
  const wrap = document.getElementById('clip-tags-wrap');
  if (!wrap) return;
  wrap.innerHTML = clipFormTags.map((t, i) =>
    `<span class="chip">${t}<span class="chip-x" onclick="removeClipTag(${i})">×</span></span>`
  ).join('');
}

// ── 저장 ──
export async function saveClip() {
  const id    = document.getElementById('clip-edit-id').value;
  const url   = document.getElementById('clip-url').value.trim();
  const title = document.getElementById('clip-title').value.trim();
  const desc  = document.getElementById('clip-desc').value.trim();

  const techName = document.getElementById('clip-tech-name').value.trim();

  if (!title)    { toast('영상 제목을 입력해주세요'); return; }
  if (!url)      { toast('URL을 입력해주세요'); return; }
  if (!techName) { toast('기술명을 입력해주세요'); return; }

  const starredEl = document.getElementById('clip-starred');
  const starred = starredEl && starredEl.checked ? 1 : 0;
  const body = { title, url, description: desc, tech_name: techName, tags: clipFormTags, starred };
  const platform = url.includes('youtu') ? 'youtube' : url.includes('instagram') ? 'instagram' : 'other';

  try {
    let savedId = id ? +id : null;
    if (id) {
      await api('PUT', `/api/clips/${id}`, body);
      const idx = CACHE.clips.findIndex(c => c.id === +id);
      if (idx !== -1) {
        CACHE.clips[idx] = { ...CACHE.clips[idx], ...body, platform, starred };
      }
    } else {
      const { id: newId } = await api('POST', '/api/clips', body);
      savedId = newId;
      CACHE.clips.unshift({ id: newId, ...body, platform, starred });
    }
    document.getElementById('modal-clip').classList.remove('show');
    renderClips();
    renderClipFilters();
    refreshAllPickers();
    if (savedId) consumePendingAdd(savedId);
  } catch(e) { toast('저장 실패: ' + e.message); }
}

// ── 삭제 ──
export async function deleteClip(id) {
  if (!confirm('영상을 삭제하시겠습니까?')) return;
  try {
    await api('DELETE', `/api/clips/${id}`);
    CACHE.clips = CACHE.clips.filter(c => c.id !== id);
    document.getElementById('modal-clip-detail').classList.remove('show');
    renderClips();
    renderClipFilters();
    refreshAllPickers();
  } catch(e) { toast('삭제 실패: ' + e.message); }
}

// ── 상세 모달 ──
export function openClipDetail(id) {
  const c = CACHE.clips.find(x => x.id === id);
  if (!c) return;
  clipCurrentId = id;

  const starPrefix = c.starred ? '<span style="color:var(--amber);margin-right:6px">★</span>' : '';
  document.getElementById('cd-title').innerHTML = `${starPrefix}${(c.title || '').replace(/</g,'&lt;')}`;

  // 연결 기술명
  const techEl = document.getElementById('cd-tech');
  if (c.tech_name) {
    techEl.style.display = 'block';
    techEl.innerHTML = `<span style="font-size:13px;color:var(--text2)">기술명</span><br><span class="tag" style="font-size:12px;display:inline-block">⊙ ${c.tech_name}</span>`;
  } else {
    techEl.style.display = 'none';
  }

  // 설명
  const descEl = document.getElementById('cd-desc');
  descEl.style.display = c.description ? 'block' : 'none';
  descEl.textContent   = c.description || '';

  // 태그
  const tagsEl = document.getElementById('cd-tags');
  if (c.tags && c.tags.length) {
    tagsEl.style.display = 'block';
    tagsEl.innerHTML = c.tags.map(t => `<span class="tag" style="font-size:11px">${t}</span>`).join(' ');
  } else {
    tagsEl.style.display = 'none';
  }

  // 원본 URL 링크
  const urlEl = document.getElementById('cd-url-link');
  if (urlEl) {
    urlEl.innerHTML = c.url
      ? `<a href="${c.url}" target="_blank" rel="noopener" style="color:var(--blue);font-size:14px;text-decoration:none">▶ 원본 영상 열기 ↗</a>`
      : '';
  }

  document.getElementById('modal-clip-detail').classList.add('show');
}

export function clipCdEdit() {
  document.getElementById('modal-clip-detail').classList.remove('show');
  openClipModal(clipCurrentId);
}

export function clipCdDelete() {
  deleteClip(clipCurrentId);
}
