// pages/techniques.js - 기술 카드 CRUD, 상세 뷰, 필터

import { CACHE } from '../core/cache.js';
import { api, setLoading } from '../core/api.js';
import { loadAll } from '../core/cache.js';
import { toast, parseMaybeJson, buildPagination, expandableNote } from '../utils/utils.js';
import { closeModal } from './navigation.js';
import { createClipPicker } from '../utils/clip-picker.js';
import {
  POS_STANDARD, POS_LIST,
  CATEGORY_STANDARD, CATEGORY_LIST,
  CATEGORY_STYLE
} from '../core/constants.js';

/* ── 필터 상태 ── */
let refFilter = 'all';
let techFormTags = [], techFormStarred = false;
let techFormClipPicker = null;
let tdCurrentId = null;
const REF_PAGE_SIZE = 12;
let refPage = 1;

export function renderRefFilters(){
  const chips = [
    {key:'all',   label:'전체'},
    {key:'chain', label:'체인'},
    {key:'star',  label:'★ 즐겨찾기'},
    ...CATEGORY_LIST.map(c => ({key:'cat:'+c, label:c})),
    ...POS_LIST.map(p => ({key:p, label:p.split(' ')[0]}))
  ];
  document.getElementById('ref-filter-chips').innerHTML = chips.map(c =>
    `<button class="filter-chip${refFilter===c.key?' active':''}" onclick="setRefFilter('${c.key}')">${c.label}</button>`
  ).join('');
}

export function setRefFilter(key){ refFilter=key; refPage=1; renderRefFilters(); renderRef(); }
export function setRefSearch(){ refPage=1; renderRef(); }
export function setRefPage(p){ refPage=p; renderRef(); }

export function renderRef(){
  const search = (document.getElementById('ref-search').value||'').toLowerCase();
  let items = [];
  if(refFilter==='chain'){
    items = CACHE.chains.map(c=>({...c,_type:'chain'}));
  } else if(refFilter==='star'){
    items = CACHE.techniques.filter(t=>t.starred).map(t=>({...t,_type:'tech'}));
  } else if(refFilter.startsWith('cat:')){
    const cat = refFilter.slice(4);
    if(cat === '기타'){
      items = CACHE.techniques.filter(t=>t.category && !CATEGORY_STANDARD.includes(t.category)).map(t=>({...t,_type:'tech'}));
    } else {
      items = CACHE.techniques.filter(t=>t.category===cat).map(t=>({...t,_type:'tech'}));
    }
  } else if(POS_LIST.includes(refFilter)){
    if(refFilter === '기타'){
      items = CACHE.techniques.filter(t=>t.pos && !POS_STANDARD.includes(t.pos)).map(t=>({...t,_type:'tech'}));
    } else {
      items = CACHE.techniques.filter(t=>t.pos===refFilter).map(t=>({...t,_type:'tech'}));
    }
  } else {
    items = [
      ...CACHE.techniques.map(t=>({...t,_type:'tech'})),
      ...CACHE.chains.map(c=>({...c,_type:'chain'}))
    ];
  }
  if(search) items = items.filter(i=>JSON.stringify(i).toLowerCase().includes(search));
  const el = document.getElementById('ref-list');
  if(!items.length){ el.innerHTML='<div class="empty">등록된 항목이 없습니다</div>'; return; }
  const total = items.length;
  const start = (refPage - 1) * REF_PAGE_SIZE;
  const paged = items.slice(start, start + REF_PAGE_SIZE);
  el.innerHTML = paged.map(i=>i._type==='tech' ? renderTechCard(i) : window.renderChainCard(i)).join('')
    + buildPagination(total, refPage, REF_PAGE_SIZE, 'setRefPage');
}

function renderTechCard(t){
  const catStyle = t.category ? (CATEGORY_STYLE[t.category]||'background:var(--bg3);color:var(--text2)') : '';
  const catBadge = t.category ? `<span class="tag" style="font-size:11px;${catStyle}">${t.category}</span>` : '';
  const notePreview = t.note ? expandableNote(t.note, '', 'font-size:13px;color:var(--text2);margin-top:5px', true) : '';
  const linkCount = (t.clips||[]).length;
  const tagCount  = (t.tags||[]).length;
  return `<div class="card" onclick="openTechDetail(${t.id})" style="cursor:pointer;active:opacity:0.8">
    <div style="display:flex;align-items:flex-start;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:${(t.pos||t.category)?'4':'0'}px;flex-wrap:wrap">
          <span style="font-weight:600;font-size:15px">${t.name}</span>
          ${catBadge}
          ${t.pos?`<span class="tag tag-detail" style="font-size:11px">${t.pos.split(' ')[0]}</span>`:''}
        </div>
        ${tagCount?`<div style="font-size:12px;color:var(--text2);margin-top:2px"># ${(t.tags||[]).join('  ')}</div>`:''}
        ${notePreview}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
        <button onclick="event.stopPropagation();toggleStar(${t.id})" style="background:none;border:none;cursor:pointer;font-size:22px;color:${t.starred?'var(--amber)':'var(--border2)'};padding:0;line-height:1">${t.starred?'\u2605':'\u2606'}</button>
        ${linkCount?`<span style="font-size:11px;color:var(--blue)">링크 ${linkCount}</span>`:''}
      </div>
    </div>
  </div>`;
}

/* ── 기술 카드 모달 ── */
export function openAddTypeSheet(){ document.getElementById('modal-add-type').classList.add('show'); }

export function openTechModal(id){
  const isEdit = id!=null;
  document.getElementById('tech-modal-title').textContent = isEdit?'기술 카드 수정':'기술 카드 추가';
  document.getElementById('tech-edit-id').value = isEdit?id:'';
  if(isEdit){
    const t = CACHE.techniques.find(x=>x.id===id); if(!t) return;
    document.getElementById('tech-name').value = t.name||'';
    if(POS_STANDARD.includes(t.pos) || !t.pos){
      document.getElementById('tech-pos').value = t.pos||'';
      document.getElementById('tech-pos-custom').style.display='none';
      document.getElementById('tech-pos-custom').value='';
    } else {
      document.getElementById('tech-pos').value = '기타';
      document.getElementById('tech-pos-custom').style.display='';
      document.getElementById('tech-pos-custom').value = t.pos;
    }
    if(CATEGORY_STANDARD.includes(t.category) || !t.category){
      document.getElementById('tech-category').value = t.category||'';
      document.getElementById('tech-category-custom').style.display='none';
      document.getElementById('tech-category-custom').value='';
    } else {
      document.getElementById('tech-category').value = '기타';
      document.getElementById('tech-category-custom').style.display='';
      document.getElementById('tech-category-custom').value = t.category;
    }
    document.getElementById('tech-note').value = t.note||'';
    techFormTags = [...(t.tags||[])];
    techFormStarred = !!t.starred;
  } else {
    document.getElementById('tech-name').value='';
    document.getElementById('tech-pos').value='';
    document.getElementById('tech-pos-custom').style.display='none';
    document.getElementById('tech-pos-custom').value='';
    document.getElementById('tech-category').value='';
    document.getElementById('tech-category-custom').style.display='none';
    document.getElementById('tech-category-custom').value='';
    document.getElementById('tech-note').value='';
    techFormTags=[]; techFormStarred=false;
  }

  // 참고영상 picker (선택된 clip ids)
  const initialClipIds = isEdit
    ? ((CACHE.techniques.find(x=>x.id===id)?.clips || []).map(c => c.id))
    : [];
  const mount = document.getElementById('tech-clip-picker');
  if (mount) techFormClipPicker = createClipPicker(mount, { selectedIds: initialClipIds });

  renderTechFormTags(); updateTechStarBtn();
  document.getElementById('modal-technique').classList.add('show');
}

export function addTechTag(){
  const inp=document.getElementById('tech-tag-input');
  const v=inp.value.trim(); if(!v) return;
  techFormTags.push(v); inp.value=''; renderTechFormTags();
}
export function removeTechTag(i){ techFormTags.splice(i,1); renderTechFormTags(); }
function renderTechFormTags(){
  document.getElementById('tech-tag-chips').innerHTML = techFormTags.map((t,i)=>
    `<span class="chip">${t}<span class="chip-x" onclick="removeTechTag(${i})">×</span></span>`
  ).join('');
}

export function onTechPosChange(){
  const custom = document.getElementById('tech-pos-custom');
  const isOther = document.getElementById('tech-pos').value === '기타';
  custom.style.display = isOther ? '' : 'none';
  if(!isOther) custom.value = '';
}
export function onTechCategoryChange(){
  const custom = document.getElementById('tech-category-custom');
  const isOther = document.getElementById('tech-category').value === '기타';
  custom.style.display = isOther ? '' : 'none';
  if(!isOther) custom.value = '';
}

export function toggleTechFormStar(){ techFormStarred=!techFormStarred; updateTechStarBtn(); }
function updateTechStarBtn(){
  const btn=document.getElementById('tech-star-btn');
  btn.textContent=techFormStarred?'\u2605':'\u2606';
  btn.style.color=techFormStarred?'var(--amber)':'var(--border2)';
}

export async function saveTechnique(){
  const name=document.getElementById('tech-name').value.trim();
  if(!name){ toast('기술명을 입력해주세요'); return; }
  const id=document.getElementById('tech-edit-id').value;
  const posSelect = document.getElementById('tech-pos').value;
  const posCustom = document.getElementById('tech-pos-custom').value.trim();
  const pos = posSelect === '기타' ? (posCustom || '기타') : posSelect;
  const catSelect = document.getElementById('tech-category').value;
  const catCustom = document.getElementById('tech-category-custom').value.trim();
  const category = catSelect === '기타' ? (catCustom || '기타') : catSelect;
  const clipIds = techFormClipPicker ? techFormClipPicker.getSelectedIds() : [];
  const body={name, pos, category, tags:techFormTags, clip_ids:clipIds, note:document.getElementById('tech-note').value, starred:techFormStarred?1:0};
  setLoading(true);
  try {
    id ? await api('PUT',`/api/techniques/${id}`,body) : await api('POST','/api/techniques',body);
    await loadAll();
    closeModal('technique'); renderRef();
    toast(id?'수정되었습니다.':'기술 카드가 추가되었습니다.');
  } catch(e){ toast('저장 실패: '+e.message); }
  finally{ setLoading(false); }
}

/* ── 기술 상세 뷰 ── */
export function openTechDetail(id){
  const t = CACHE.techniques.find(x=>x.id===id);
  if(!t) return;
  tdCurrentId = id;
  document.getElementById('td-name').textContent = t.name;
  const catStyle = t.category ? (CATEGORY_STYLE[t.category]||'background:var(--bg3);color:var(--text2)') : '';
  const catBadge = t.category ? `<span class="tag" style="font-size:12px;${catStyle}">${t.category}</span>` : '';
  const posBadge = t.pos ? `<span class="tag tag-detail" style="font-size:12px">${t.pos}</span>` : '';
  document.getElementById('td-badges').innerHTML = [catBadge, posBadge].filter(Boolean).join('');
  const tags = (t.tags||[]).map(tag=>`<span class="chip" style="font-size:13px;padding:4px 12px">${tag}</span>`).join('');
  const tagsEl = document.getElementById('td-tags');
  tagsEl.innerHTML = tags ? `<div class="chip-group">${tags}</div>` : '';
  tagsEl.style.display = tags ? 'block' : 'none';
  const noteEl = document.getElementById('td-note');
  if (t.note) { noteEl.innerHTML = expandableNote(t.note); noteEl.style.display = 'block'; }
  else { noteEl.innerHTML = ''; noteEl.style.display = 'none'; }
  const clips = (t.clips||[]).map(c=>{
    const icon = c.platform === 'youtube' ? '▶' : c.platform === 'instagram' ? '📷' : '🔗';
    const safeTitle = (c.title || '제목 없음').replace(/</g,'&lt;');
    return `<button class="link-badge" onclick="closeModal('tech-detail');openClipDetail(${c.id})"
      style="font-size:14px;padding:9px 14px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;background:var(--bg2);border:0.5px solid var(--border2);border-radius:var(--radius)">
      ${icon} ${safeTitle}${c.starred ? ' ★' : ''}
    </button>`;
  }).join('');
  const linksEl = document.getElementById('td-links');
  linksEl.innerHTML = clips ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${clips}</div>` : '';
  linksEl.style.display = clips ? 'block' : 'none';
  const chainRefs = CACHE.chains.filter(c=>c.steps.some(s=>s.technique_id===t.id));
  const chainsEl  = document.getElementById('td-chains');
  if(chainRefs.length){
    const chainChips = chainRefs.map(c=>
      `<button class="chip" style="font-size:13px;padding:4px 12px;cursor:pointer"
        onclick="closeModal('tech-detail');openChainDetail(${c.id})">${c.name}</button>`
    ).join('');
    chainsEl.innerHTML = `<div style="font-size:12px;color:var(--text2);margin-bottom:6px">포함된 체인</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${chainChips}</div>`;
    chainsEl.style.display = 'block';
  } else {
    chainsEl.style.display = 'none';
  }
  tdUpdateStarBtn(t.starred);
  document.getElementById('modal-tech-detail').classList.add('show');
}

function tdUpdateStarBtn(starred){
  const btn = document.getElementById('td-star-btn');
  btn.textContent = starred ? '\u2605 즐겨찾기' : '\u2606 즐겨찾기';
  btn.style.color       = starred ? 'var(--amber)' : '';
  btn.style.borderColor = starred ? 'var(--amber)' : '';
}

export async function tdToggleStar(){
  if(!tdCurrentId) return;
  try {
    const res = await api('PATCH', `/api/techniques/${tdCurrentId}/star`);
    const t = CACHE.techniques.find(x=>x.id===tdCurrentId);
    if(t){ t.starred = res.starred; tdUpdateStarBtn(res.starred); renderRef(); }
  } catch(e){ toast('오류: '+e.message); }
}

export function tdEdit(){ closeModal('tech-detail'); openTechModal(tdCurrentId); }

export async function tdDelete(){
  if(!confirm('이 기술 카드를 삭제할까요?')) return;
  closeModal('tech-detail');
  setLoading(true);
  try {
    await api('DELETE', `/api/techniques/${tdCurrentId}`);
    CACHE.techniques = CACHE.techniques.filter(t=>t.id!==tdCurrentId);
    renderRef(); toast('삭제되었습니다.');
  } catch(e){ toast('삭제 실패: '+e.message); }
  finally{ setLoading(false); }
}

export async function toggleStar(id){
  try {
    const res=await api('PATCH',`/api/techniques/${id}/star`);
    const t=CACHE.techniques.find(x=>x.id===id);
    if(t) t.starred=res.starred;
    renderRef();
  } catch(e){ toast('오류: '+e.message); }
}

export async function deleteTechnique(id){
  if(!confirm('이 기술 카드를 삭제할까요?')) return;
  setLoading(true);
  try {
    await api('DELETE',`/api/techniques/${id}`);
    CACHE.techniques=CACHE.techniques.filter(t=>t.id!==id);
    renderRef(); toast('삭제되었습니다.');
  } catch(e){ toast('삭제 실패: '+e.message); }
  finally{ setLoading(false); }
}

export function highlightTech(techId){
  const t=CACHE.techniques.find(x=>x.id===techId); if(!t) return;
  window.showPage('ref');
  document.getElementById('ref-search').value=t.name;
  refFilter='all'; renderRefFilters(); renderRef();
}
