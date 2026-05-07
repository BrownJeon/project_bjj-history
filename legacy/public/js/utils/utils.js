// utils/utils.js - 유틸리티 함수 10개

export function autoFillEnd(startId, endId){
  const start = document.getElementById(startId).value;
  if(!start) return;
  const endEl = document.getElementById(endId);
  if(!endEl.value || endEl.value < start) endEl.value = start;
}

export function weekLabel(dateStart, dateEnd){
  const fmt = d => (d||'').slice(0,10).slice(5).replace('-','/');
  if(!dateEnd) return (dateStart||'').slice(0,10);
  return `${fmt(dateStart)} ~ ${fmt(dateEnd)}`;
}

export function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(()=> el.classList.remove('show'), 1800);
}

export function today(){ return new Date().toISOString().slice(0,10); }

export function todayPlusDays(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }

export function setDisabled(id, v){ const b=document.getElementById(id); if(b) b.disabled=v; }

export function parseMaybeJson(v){ return typeof v==='string' ? JSON.parse(v||'[]') : (v||[]); }

export function normLink(l){ return typeof l==='string' ? {url:l, desc:''} : l; }

export function linkDisplay(l){
  const {url, desc} = normLink(l);
  const auto = url.includes('youtu')?'YouTube':url.includes('instagram')?'Instagram':'링크';
  return {url, label: desc||auto};
}

export function filterPeriod(arr, days){
  if(!days) return arr;
  const cut = Date.now() - days*86400000;
  return arr.filter(d=> new Date((d.date||'').toString().slice(0,10)).getTime() >= cut);
}

export function expandableNote(text, extraClass = '', style = '', stopProp = false) {
  if (!text) return '';
  const safe = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const sa   = style ? ` style="${style}"` : '';

  // 짧은 텍스트는 접기/펼치기 불필요 → 평문 div만 반환
  const newlineCount = (text.match(/\n/g) || []).length;
  const isLong = newlineCount > 2 || text.length > 120;
  if (!isLong) {
    const plainCls = extraClass ? ` class="${extraClass}"` : '';
    return `<div${plainCls}${sa}>${safe}</div>`;
  }

  const cls = ['expandable-wrap', 'collapsed', extraClass].filter(Boolean).join(' ');
  const handler = stopProp
    ? 'event.stopPropagation();toggleExpandText(this)'
    : 'toggleExpandText(this)';
  const preview   = text.replace(/\s+/g, ' ').slice(0, 10);
  const safeShort = preview.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<div class="${cls}"${sa}><span class="expandable-short">${safeShort}...</span><span class="expandable-full">${safe}</span></div><button class="expand-toggle-btn" onclick="${handler}">더 보기 ▾</button>`;
}

export function toggleExpandText(btn) {
  const wrap = btn.previousElementSibling;
  if (!wrap) return;
  const collapsed = wrap.classList.toggle('collapsed');
  btn.textContent = collapsed ? '더 보기 ▾' : '접기 ▴';
}

export function buildPagination(total, current, pageSize, setPageFn){
  const totalPages = Math.ceil(total / pageSize);
  if(totalPages <= 1) return '';
  const btn = (label, page, disabled) =>
    `<button class="pg-btn" onclick="${setPageFn}(${page})"${disabled ? ' disabled' : ''}>${label}</button>`;
  return `<div class="pagination">
    ${btn('«', 1, current === 1)}
    ${btn('‹', current - 1, current === 1)}
    <span class="pg-info"><strong>${current}</strong> / ${totalPages}</span>
    ${btn('›', current + 1, current === totalPages)}
    ${btn('»', totalPages, current === totalPages)}
  </div>`;
}
