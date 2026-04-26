// pages/class-modal.js - 수업 기록 수정/생성 모달

import { CACHE } from '../core/cache.js';
import { api, setLoading } from '../core/api.js';
import { loadAll } from '../core/cache.js';
import { toast, parseMaybeJson } from '../utils/utils.js';
import { closeModal } from './navigation.js';
import { createClipPicker } from '../utils/clip-picker.js';

let editClassDrillTechs = [], editClassDrillDetails = [], editClassDrillStars = 0;
let editClassDrillChainIds = [];
let editClassDrillClipPicker = null;
let sparDayClipPicker = null;
let sparSessions = [];
let _addingNewTech = false;

// editClassSessions is kept as alias for backward compat with window binding
export { sparSessions as editClassSessions };

export function openEditClass(id){
  const c = CACHE.classes.find(x=>x.id===id); if(!c) return;
  document.getElementById('edit-class-id').value = id;
  document.getElementById('edit-c-date').value     = (c.date||'').toString().slice(0,10);
  document.getElementById('edit-c-date-end').value = (c.date_end||'').toString().slice(0,10);
  document.getElementById('edit-c-theme').value = c.theme || '';
  document.getElementById('edit-c-note').value = c.note||'';
  document.getElementById('edit-c-feedback').value = c.feedback||'';
  let initialClipIds = [];
  if(c.drill){
    document.getElementById('edit-c-pos').value = c.drill.pos||'';
    editClassDrillTechs  = [...(c.drill.tech||[])];
    editClassDrillDetails= [...(c.drill.detail||[])];
    editClassDrillStars  = c.drill.stars||0;
    initialClipIds = (c.drill.clips || []).map(cl => cl.id);
    editClassDrillChainIds = [...parseMaybeJson(c.drill.chain_ids)].map(Number).filter(Boolean);
  } else {
    document.getElementById('edit-c-pos').value='';
    editClassDrillTechs=[]; editClassDrillDetails=[]; editClassDrillStars=0;
    editClassDrillChainIds=[];
  }
  document.getElementById('edit-c-tech-input').value = '';
  document.getElementById('tech-suggestions').style.display = 'none';
  renderEditClassChips('tech'); renderEditClassChips('detail');
  const drillPickerMount = document.getElementById('edit-c-clip-picker');
  if (drillPickerMount) editClassDrillClipPicker = createClipPicker(drillPickerMount, { selectedIds: initialClipIds });
  renderEditClassChainChips(); populateChainSelect();
  document.querySelectorAll('#edit-c-stars span').forEach((s,i)=> s.classList.toggle('on', i<editClassDrillStars));
  const drillSection = document.getElementById('edit-c-drill-section');
  const drillArrow   = document.getElementById('edit-c-drill-arrow');
  drillSection.style.display = c.drill ? 'block' : 'none';
  drillArrow.textContent     = c.drill ? '\u25BC' : '\u25B6';
  document.querySelector('#modal-class .modal-title').textContent = '수업 기록 수정';
  document.querySelector('#modal-class .modal-actions .btn-primary').setAttribute('onclick', 'updateClass()');
  document.getElementById('modal-class').classList.add('show');
}

export function addEditClassChip(type){
  const inp = document.getElementById(type==='tech'?'edit-c-tech-input':'edit-c-detail-input');
  const arr = type==='tech' ? editClassDrillTechs : editClassDrillDetails;
  const v = inp.value.trim(); if(!v) return;
  arr.push(v); inp.value=''; renderEditClassChips(type);
}
export function removeEditClassChip(type, i){
  if(type==='tech') editClassDrillTechs.splice(i,1); else editClassDrillDetails.splice(i,1);
  renderEditClassChips(type);
}
export function renderEditClassChips(type){
  const arr = type==='tech' ? editClassDrillTechs : editClassDrillDetails;
  const elId = type==='tech' ? 'edit-c-tech-chips' : 'edit-c-detail-chips';
  document.getElementById(elId).innerHTML = arr.map((c,i)=>
    `<span class="chip" style="${type==='tech'?'background:var(--blue-bg);border-color:var(--blue)':''}">
      <span style="${type==='tech'?'color:var(--blue-text)':''}">${c}</span>
      <span class="chip-x" onclick="removeEditClassChip('${type}',${i})">×</span>
    </span>`
  ).join('');
}

/* 수정 모달 - 기술명 자동완성 */
export function filterTechSuggestions(){
  const q = document.getElementById('edit-c-tech-input').value.trim().toLowerCase();
  const box = document.getElementById('tech-suggestions');
  if(!q){ box.style.display='none'; return; }
  const matched = (CACHE.techniques||[]).filter(t => t.name && t.name.toLowerCase().includes(q));
  let html = matched
    .filter(t => !editClassDrillTechs.includes(t.name))
    .slice(0, 10)
    .map(t => {
      const pos = t.pos ? ` <span style="color:var(--text2);font-size:11px">${t.pos.split(' ')[0]}</span>` : '';
      return `<div class="tech-suggest-item" data-name="${t.name.replace(/"/g,'&quot;')}"
        onclick="selectTechSuggestion(this.dataset.name)">
        ${t.name}${pos}
      </div>`;
    }).join('');
  const exactMatch = (CACHE.techniques||[]).some(t => t.name && t.name.toLowerCase() === q);
  if(!exactMatch){
    const displayQ = document.getElementById('edit-c-tech-input').value.trim();
    html += `<div class="tech-suggest-item tech-suggest-new"
      data-name="${displayQ.replace(/"/g,'&quot;')}"
      onclick="addNewTechFromClass(this.dataset.name)">
      + "${displayQ}" 기술트리에 추가
    </div>`;
  }
  box.innerHTML = html;
  box.style.display = html ? '' : 'none';
}

export function selectTechSuggestion(name){
  if(!editClassDrillTechs.includes(name)) editClassDrillTechs.push(name);
  document.getElementById('edit-c-tech-input').value = '';
  document.getElementById('tech-suggestions').style.display = 'none';
  renderEditClassChips('tech');
}

export async function addNewTechFromClass(name){
  if(_addingNewTech) return;
  document.getElementById('tech-suggestions').style.display = 'none';
  const existing = (CACHE.techniques||[]).find(t => t.name && t.name.toLowerCase() === name.toLowerCase());
  if(existing){
    selectTechSuggestion(existing.name);
    toast(`"${existing.name}"은 이미 기술트리에 있습니다`);
    return;
  }
  if(!confirm(`"${name}"을(를) 기술트리에 새로 추가할까요?`)) return;
  _addingNewTech = true;
  try {
    const pos = document.getElementById('edit-c-pos').value || '';
    const t = await api('POST', '/api/techniques', { name, pos });
    CACHE.techniques.push({ id: t.id, name, pos, category:'', tags:[], links:[], starred:0 });
    selectTechSuggestion(name);
    toast(`"${name}" 기술트리에 추가되었습니다`);
  } catch(e){ toast('추가 실패: '+e.message); }
  finally{ _addingNewTech = false; }
}

export function onTechInputKey(e){
  if(e.key === 'Enter'){
    e.preventDefault();
    const q = e.target.value.trim();
    if(!q) return;
    const exact = (CACHE.techniques||[]).find(t => t.name && t.name.toLowerCase() === q.toLowerCase());
    const first = exact || (CACHE.techniques||[]).find(t => t.name && t.name.toLowerCase().includes(q.toLowerCase()));
    if(first && !editClassDrillTechs.includes(first.name)) selectTechSuggestion(first.name);
    else if(!first) addNewTechFromClass(q);
  }
  if(e.key === 'Escape') document.getElementById('tech-suggestions').style.display = 'none';
}

/* 수정 모달 - 체인 연결 */
export function populateChainSelect(){
  const sel = document.getElementById('edit-c-chain-select');
  if(!sel) return;
  sel.innerHTML = '<option value="">체인 선택...</option>' +
    CACHE.chains.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

export function addEditClassChain(){
  const sel = document.getElementById('edit-c-chain-select');
  const id = parseInt(sel.value); if(!id) return;
  if(!editClassDrillChainIds.includes(id)) editClassDrillChainIds.push(id);
  sel.value = '';
  renderEditClassChainChips();
}

export function removeEditClassChain(id){
  editClassDrillChainIds = editClassDrillChainIds.filter(x => x !== id);
  renderEditClassChainChips();
}

export function renderEditClassChainChips(){
  const el = document.getElementById('edit-c-chain-chips');
  if(!el) return;
  el.innerHTML = editClassDrillChainIds.map(id => {
    const c = CACHE.chains.find(x => x.id === id);
    const name = c ? c.name : `체인#${id}`;
    return `<span class="chip">${name} <button onclick="removeEditClassChain(${id})" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--text2);padding:0;line-height:1">x</button></span>`;
  }).join('');
}

// ── 스파링 모달 ──
let _sparClassId = null;
let _sparDayId   = null;

export function openSparModal(classId, sparDayId) {
  _sparClassId = classId;
  _sparDayId   = sparDayId || null;
  sparSessions = [];

  const cls = CACHE.classes.find(x => x.id === classId);
  const title = sparDayId ? '스파링 수정' : '스파링 등록';
  document.getElementById('spar-modal-title').textContent = title;
  document.getElementById('spar-class-id').value  = classId;
  document.getElementById('spar-day-id').value    = sparDayId || '';

  // 날짜 범위 제한
  if (cls) {
    const start = (cls.date || '').toString().slice(0, 10);
    const end   = (cls.date_end || cls.date || '').toString().slice(0, 10);
    const dateEl = document.getElementById('spar-date');
    dateEl.min = start;
    dateEl.max = end;
    dateEl.value = '';
  }

  if (sparDayId) {
    const sd = (cls?.spar_days || []).find(x => x.id === sparDayId);
    if (sd) {
      document.getElementById('spar-date').value     = (sd.date || '').toString().slice(0, 10);
      document.getElementById('spar-day-note').value = sd.day_note || '';
      sparSessions = (sd.sessions || []).map(s => {
        const legacyScore = parseInt(s.position_score ?? s.positionScore) || 0;
        const positions = (Array.isArray(s.positions) ? s.positions : []).map(p =>
          typeof p === 'string'
            ? { name: p, score: legacyScore }
            : { name: p.name || '', score: parseInt(p.score) || 0 }
        );
        return {
          level:     s.level || '화이트',
          opponent:  s.opponent || '',
          tapGot:    parseInt(s.tap_got ?? s.tapGot) || 0,
          tapGave:   parseInt(s.tap_gave ?? s.tapGave) || 0,
          time:      s.time_min ?? s.time ?? '',
          positions,
          success:   (Array.isArray(s.success) ? s.success : []).map(x =>
            typeof x === 'string' ? { name: x, success: true } : { name: x.name || '', success: x.success !== false }
          ),
          weak:      [...(Array.isArray(s.weak) ? s.weak : [])],
          note:      s.note || ''
        };
      });
    }
  } else {
    document.getElementById('spar-day-note').value = '';
  }

  const sparPickerMount = document.getElementById('spar-clip-picker');
  if (sparPickerMount) {
    const initialIds = sparDayId
      ? (((cls?.spar_days || []).find(x => x.id === sparDayId)?.clips) || []).map(c => c.id)
      : [];
    sparDayClipPicker = createClipPicker(sparPickerMount, { selectedIds: initialIds });
  }

  renderSparSessions();
  document.getElementById('modal-spar').classList.add('show');
}

export function addSparSession(){
  sparSessions.push({level:'화이트',opponent:'',tapGot:0,tapGave:0,time:'',positions:[],success:[],weak:[],note:''});
  renderSparSessions();
}
export function removeSparSession(i){ sparSessions.splice(i,1); renderSparSessions(); }

export function updateSparTapRatio(idx){
  const got  = parseInt(sparSessions[idx].tapGot)  || 0;
  const gave = parseInt(sparSessions[idx].tapGave) || 0;
  const total = got + gave;
  const el = document.getElementById('spar-tap-sum-' + idx);
  if(el) el.textContent = total > 0 ? `총 ${total}회 · 당함 ${got} / 냄 ${gave}` : '';
}

export function addSparSessionChip(idx, type){
  const inp = document.getElementById(`ssc-${type}-${idx}`);
  const v = inp.value.trim(); if(!v) return;
  sparSessions[idx][type].push(v); inp.value = '';
  renderSparSessionChips(idx, type);
}
export function removeSparSessionChip(idx, type, ci){
  sparSessions[idx][type].splice(ci, 1);
  renderSparSessionChips(idx, type);
}

export function addSparPosition(idx){
  const inp = document.getElementById(`ssc-position-${idx}`);
  if(!inp) return;
  const v = inp.value.trim(); if(!v) return;
  sparSessions[idx].positions.push({ name: v, score: 0 });
  inp.value = '';
  renderSparPositionChips(idx);
}
export function removeSparPosition(idx, ci){
  sparSessions[idx].positions.splice(ci, 1);
  renderSparPositionChips(idx);
}
export function editSparPosition(idx, ci){
  const item = sparSessions[idx]?.positions?.[ci]; if(!item) return;
  const inp  = document.getElementById(`ssc-position-${idx}`); if(!inp) return;
  inp.value = item.name || '';
  sparSessions[idx].positions.splice(ci, 1);
  renderSparPositionChips(idx);
  inp.focus();
}
export function setSparPositionScore(idx, ci, v){
  const item = sparSessions[idx]?.positions?.[ci]; if(!item) return;
  const cur = parseInt(item.score) || 0;
  item.score = (cur === v) ? 0 : v;
  renderSparPositionChips(idx);
}

function renderSparPositionChips(idx){
  const el = document.getElementById(`schips-position-${idx}`); if(!el) return;
  el.innerHTML = sparSessions[idx].positions.map((p, ci) => {
    const safe  = (p.name || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const score = parseInt(p.score) || 0;
    const stars = [1,2,3,4,5].map(n =>
      `<span class="${n <= score ? 'on' : ''}" onclick="setSparPositionScore(${idx},${ci},${n})">★</span>`
    ).join('');
    return `<span class="chip spar-pos-chip">
      <span style="cursor:pointer" title="클릭하여 수정" onclick="editSparPosition(${idx},${ci})">${safe}</span>
      <span class="stars spar-pos-chip-stars">${stars}</span>
      <span class="chip-x" onclick="removeSparPosition(${idx},${ci})">×</span>
    </span>`;
  }).join('');
}

export function addSparAttempt(idx){
  const inp = document.getElementById(`ssc-success-${idx}`);
  if(!inp) return;
  const v = inp.value.trim(); if(!v) return;
  const success = inp.dataset.editSuccess === '0' ? false : true;
  delete inp.dataset.editSuccess;
  sparSessions[idx].success.push({ name: v, success });
  inp.value = '';
  renderSparAttemptChips(idx);
}
export function editSparAttempt(idx, ci){
  const item = sparSessions[idx]?.success?.[ci]; if(!item) return;
  const inp  = document.getElementById(`ssc-success-${idx}`); if(!inp) return;
  inp.value = item.name || '';
  inp.dataset.editSuccess = item.success ? '1' : '0';
  sparSessions[idx].success.splice(ci, 1);
  renderSparAttemptChips(idx);
  inp.focus();
}
export function editSparWeak(idx, ci){
  const item = sparSessions[idx]?.weak?.[ci]; if(item == null) return;
  const inp  = document.getElementById(`ssc-weak-${idx}`); if(!inp) return;
  inp.value = String(item);
  sparSessions[idx].weak.splice(ci, 1);
  renderSparSessionChips(idx, 'weak');
  inp.focus();
}
export function toggleSparAttemptSuccess(idx, ci){
  const item = sparSessions[idx]?.success?.[ci];
  if(!item) return;
  item.success = !item.success;
  renderSparAttemptChips(idx);
}
export function removeSparAttempt(idx, ci){
  sparSessions[idx].success.splice(ci, 1);
  renderSparAttemptChips(idx);
}

function renderSparAttemptChips(idx){
  const el = document.getElementById(`schips-success-${idx}`); if(!el) return;
  el.innerHTML = sparSessions[idx].success.map((a, ci) => {
    const checked = a.success ? 'checked' : '';
    const safeName = (a.name || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<span class="chip spar-attempt-chip">
      <input type="checkbox" ${checked} onchange="toggleSparAttemptSuccess(${idx},${ci})">
      <span class="spar-attempt-name${a.success?'':' failed'}" style="cursor:pointer" title="클릭하여 수정" onclick="editSparAttempt(${idx},${ci})">${safeName}</span>
      <span class="chip-x" onclick="removeSparAttempt(${idx},${ci})">×</span>
    </span>`;
  }).join('');
}

function renderSparSessionChips(idx, type){
  const el = document.getElementById(`schips-${type}-${idx}`); if(!el) return;
  el.innerHTML = sparSessions[idx][type].map((c, ci) => {
    const editAttr = type === 'weak'
      ? ` style="cursor:pointer" title="클릭하여 수정" onclick="editSparWeak(${idx},${ci})"`
      : '';
    return `<span class="chip"><span${editAttr}>${c}</span><span class="chip-x" onclick="removeSparSessionChip(${idx},'${type}',${ci})">×</span></span>`;
  }).join('');
}

function renderSparSessions(){
  const wrap = document.getElementById('spar-sessions-wrap');
  if(!wrap) return;
  if(!sparSessions.length){ wrap.innerHTML = ''; return; }
  wrap.innerHTML = sparSessions.map((s, idx) => `<div class="card-inner">
    <div class="session-header">
      <span class="session-num">세션 ${idx + 1}</span>
      <button class="btn-danger-sm" onclick="removeSparSession(${idx})">삭제</button>
    </div>
    <div class="field row">
      <div><label>상대 레벨</label>
        <select onchange="sparSessions[${idx}].level=this.value">
          ${['화이트','블루','퍼플','브라운','블랙'].map(l => `<option${s.level===l?' selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div><label>시간(분)</label>
        <input type="number" min="0" placeholder="5" value="${s.time||''}"
          oninput="sparSessions[${idx}].time=this.value">
      </div>
    </div>
    <div class="field">
      <label>이름</label>
      <input type="text" value="${(s.opponent||'').replace(/"/g,'&quot;')}"
        oninput="sparSessions[${idx}].opponent=this.value">
    </div>
    <div class="field">
      <label>탭아웃 비중</label>
      <div class="tap-wrap">
        <div class="tap-box tap-got"><label>당함</label>
          <input type="number" min="0" value="${s.tapGot||0}"
            oninput="sparSessions[${idx}].tapGot=parseInt(this.value)||0;updateSparTapRatio(${idx})">
        </div>
        <div class="tap-sep">:</div>
        <div class="tap-box tap-gave"><label>냄</label>
          <input type="number" min="0" value="${s.tapGave||0}"
            oninput="sparSessions[${idx}].tapGave=parseInt(this.value)||0;updateSparTapRatio(${idx})">
        </div>
      </div>
      <div class="tap-summary" id="spar-tap-sum-${idx}"></div>
    </div>
    <div class="field">
      <label>점유 포지션 <span style="font-size:11px;color:var(--text2)">(칩의 별을 클릭해 점수)</span></label>
      <div id="schips-position-${idx}" class="chip-group"></div>
      <div class="row" style="margin-top:8px;gap:8px">
        <input type="text" id="ssc-position-${idx}" placeholder="예: 사이드 컨트롤, 마운트" style="flex:1"
          onkeydown="if(event.key==='Enter'){event.preventDefault();addSparPosition(${idx})}">
        <button class="btn-sm" onclick="addSparPosition(${idx})">추가</button>
      </div>
    </div>
    <div class="field">
      <label>시도한 기술 <span style="font-size:11px;color:var(--text2)">(체크: 성공)</span></label>
      <div id="schips-success-${idx}" class="chip-group"></div>
      <div class="row" style="margin-top:8px;gap:8px">
        <input type="text" id="ssc-success-${idx}" placeholder="기술명 또는 설명 입력" style="flex:1"
          onkeydown="if(event.key==='Enter'){event.preventDefault();addSparAttempt(${idx})}">
        <button class="btn-sm" onclick="addSparAttempt(${idx})">추가</button>
      </div>
    </div>
    <div class="field">
      <label>부족했던 부분</label>
      <div id="schips-weak-${idx}" class="chip-group"></div>
      <div class="row" style="margin-top:8px;gap:8px">
        <input type="text" id="ssc-weak-${idx}" placeholder="상황 또는 기술 입력" style="flex:1"
          onkeydown="if(event.key==='Enter'){event.preventDefault();addSparSessionChip(${idx},'weak')}">
        <button class="btn-sm" onclick="addSparSessionChip(${idx},'weak')">추가</button>
      </div>
    </div>
    <div class="field" style="margin-bottom:0">
      <label>메모</label>
      <input type="text" placeholder="이 스파링에서 느낀 점..." value="${s.note||''}"
        oninput="sparSessions[${idx}].note=this.value">
    </div>
  </div>`).join('');
  sparSessions.forEach((_, idx) => {
    renderSparPositionChips(idx);
    renderSparAttemptChips(idx);
    renderSparSessionChips(idx, 'weak');
    updateSparTapRatio(idx);
  });
}

export async function saveSpar(){
  const classId   = parseInt(document.getElementById('spar-class-id').value);
  const sparDayId = document.getElementById('spar-day-id').value;
  const date      = document.getElementById('spar-date').value;
  const dayNote   = document.getElementById('spar-day-note').value;

  if(!date){ toast('날짜를 선택해주세요'); return; }
  if(!sparSessions.length){ toast('세션을 1개 이상 추가해주세요'); return; }

  const clipIds = sparDayClipPicker ? sparDayClipPicker.getSelectedIds() : [];
  const body = { date, dayNote, sessions: sparSessions, clipIds };
  setLoading(true);
  try {
    if(sparDayId){
      await api('PUT', `/api/classes/${classId}/spar/${sparDayId}`, body);
    } else {
      await api('POST', `/api/classes/${classId}/spar`, body);
    }
    await loadAll();
    document.getElementById('modal-spar').classList.remove('show');
    window.renderHistory();
    // 캘린더 상세 시트가 열려있으면 갱신
    const sheet = document.getElementById('cal-sheet');
    if(sheet && sheet.classList.contains('show')){
      const titleEl = document.getElementById('cal-sheet-title');
      if(titleEl) window.renderCalDetail(date);
    }
    toast('저장 완료!');
  } catch(e){ toast('저장 실패: ' + e.message); }
  finally{ setLoading(false); }
}

export async function deleteSparDay(classId, sparDayId){
  if(!confirm('이 스파링을 삭제하시겠습니까?')) return;
  setLoading(true);
  try {
    await api('DELETE', `/api/classes/${classId}/spar/${sparDayId}`);
    await loadAll();
    window.renderHistory();
    // 캘린더 상세 갱신
    const sheet = document.getElementById('cal-sheet');
    if(sheet && sheet.classList.contains('show')){
      const cls = CACHE.classes.find(x => x.id === classId);
      const dateStr = cls ? (cls.date || '').toString().slice(0, 10) : null;
      if(dateStr) window.renderCalDetail(dateStr);
    }
    toast('삭제되었습니다.');
  } catch(e){ toast('삭제 실패: ' + e.message); }
  finally{ setLoading(false); }
}

export async function updateClass(){
  const id = parseInt(document.getElementById('edit-class-id').value);
  const date = document.getElementById('edit-c-date').value;
  if(!date){ toast('날짜를 선택해주세요'); return; }
  const drillOpen = document.getElementById('edit-c-drill-section').style.display !== 'none';
  let drill = null;
  if(drillOpen){
    const hasTech = editClassDrillTechs.length > 0;
    const hasPos  = document.getElementById('edit-c-pos').value !== '';
    if(hasTech || hasPos){
      drill = {
        pos:      document.getElementById('edit-c-pos').value,
        tech:     editClassDrillTechs,
        detail:   editClassDrillDetails,
        stars:    editClassDrillStars,
        clipIds:  editClassDrillClipPicker ? editClassDrillClipPicker.getSelectedIds() : [],
        chainIds: editClassDrillChainIds
      };
    }
  }
  setLoading(true);
  try {
    const existingClass = CACHE.classes.find(x => x.id === id);
    await api('PUT',`/api/classes/${id}`,{
      date,
      dateEnd:      document.getElementById('edit-c-date-end').value,
      theme:        document.getElementById('edit-c-theme').value,
      note:         document.getElementById('edit-c-note').value,
      feedback:     document.getElementById('edit-c-feedback').value,
      trainedDates: existingClass ? (existingClass.trained_dates || []) : [],
      drill
    });
    await loadAll();
    closeModal('class');
    window.renderHistory();
    toast('수정되었습니다.');
  } catch(e){ toast('수정 실패: '+e.message); }
  finally { setLoading(false); }
}

export async function deleteClass(id){
  if(!confirm('이 수업 기록을 삭제할까요?')) return;
  setLoading(true);
  try {
    await api('DELETE',`/api/classes/${id}`);
    CACHE.classes = CACHE.classes.filter(c=>c.id!==id);
    window.closeCalSheet();
    toast('삭제되었습니다.');
    window.renderHistory();
    if(document.getElementById('page-analysis').classList.contains('active')) window.renderAnalysis();
  } catch(e){ toast('삭제 실패: '+e.message); }
  finally { setLoading(false); }
}

export function openNewClass(dateStr){
  document.getElementById('edit-class-id').value = '';
  document.getElementById('edit-c-date').value = dateStr;
  document.getElementById('edit-c-date-end').value = dateStr;
  document.getElementById('edit-c-theme').value = '';
  document.getElementById('edit-c-note').value = '';
  document.getElementById('edit-c-feedback').value = '';
  document.getElementById('edit-c-pos').value = '';
  editClassDrillTechs=[]; editClassDrillDetails=[]; editClassDrillStars=0; editClassDrillChainIds=[];
  document.getElementById('edit-c-tech-input').value = '';
  document.getElementById('tech-suggestions').style.display = 'none';
  renderEditClassChips('tech'); renderEditClassChips('detail');
  const drillPickerMount = document.getElementById('edit-c-clip-picker');
  if (drillPickerMount) editClassDrillClipPicker = createClipPicker(drillPickerMount, { selectedIds: [] });
  renderEditClassChainChips(); populateChainSelect();
  document.querySelectorAll('#edit-c-stars span').forEach(s=> s.classList.remove('on'));
  document.getElementById('edit-c-drill-section').style.display = 'none';
  document.getElementById('edit-c-drill-arrow').textContent = '\u25B6';
  document.querySelector('#modal-class .modal-title').textContent = '수업 기간 등록';
  document.querySelector('#modal-class .modal-actions .btn-primary').setAttribute('onclick', 'saveNewClass()');
  document.getElementById('modal-class').classList.add('show');
}

export async function saveNewClass(){
  const date = document.getElementById('edit-c-date').value;
  if(!date){ toast('날짜를 선택해주세요'); return; }
  const drillOpen = document.getElementById('edit-c-drill-section').style.display !== 'none';
  let drill = null;
  if(drillOpen && (editClassDrillTechs.length > 0 || document.getElementById('edit-c-pos').value)){
    drill = { pos: document.getElementById('edit-c-pos').value, tech: editClassDrillTechs, detail: editClassDrillDetails, stars: editClassDrillStars, clipIds: editClassDrillClipPicker ? editClassDrillClipPicker.getSelectedIds() : [], chainIds: editClassDrillChainIds };
  }
  setLoading(true);
  try {
    await api('POST', '/api/classes', { date, dateEnd: document.getElementById('edit-c-date-end').value, theme: document.getElementById('edit-c-theme').value, note: document.getElementById('edit-c-note').value, feedback: document.getElementById('edit-c-feedback').value, trainedDates: [], drill });
    await loadAll(); closeModal('class'); window.renderHistory(); toast('저장 완료!');
  } catch(e){ toast('저장 실패: ' + e.message); }
  finally { setLoading(false); }
}

export function initClassModalEvents(){
  const starsEl = document.getElementById('edit-c-stars');
  if(starsEl) starsEl.addEventListener('click', e=>{
    const v=e.target.dataset.v; if(!v) return;
    editClassDrillStars=parseInt(v);
    document.querySelectorAll('#edit-c-stars span').forEach((s,i)=>s.classList.toggle('on',i<editClassDrillStars));
  });
}

// ── AI 메모 보완 ──
const _memoAiConfig = {
  spar:          { textareaId: 'spar-day-note',    panelId: 'memo-ai-panel-spar' },
  tech:          { textareaId: 'tech-note',        panelId: 'memo-ai-panel-tech' },
  chain:         { textareaId: 'chain-note',       panelId: 'memo-ai-panel-chain' },
  gp:            { textareaId: 'gp-note',          panelId: 'memo-ai-panel-gp' },
  classNote:     { textareaId: 'edit-c-note',      panelId: 'memo-ai-panel-classNote' },
  classFeedback: { textareaId: 'edit-c-feedback',  panelId: 'memo-ai-panel-classFeedback' }
};

function _renderMemoAiLoading(msg = 'AI가 메모를 보완하는 중...') {
  return `<div class="memo-ai-loading">✨ ${msg}</div>`;
}

function _renderMemoAiResult(type, enhanced, changes) {
  const safeEnhanced = enhanced.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
    <div class="memo-ai-result-header">
      <span>✨ AI 보완 결과</span>
      <button onclick="closeMemoAi('${type}')" class="modal-close">&#215;</button>
    </div>
    <div class="memo-ai-section-label">보완된 내용</div>
    <div class="memo-ai-text-wrap collapsed" id="memo-ai-wrap-${type}">
      <div class="memo-ai-enhanced-text">${safeEnhanced}</div>
    </div>
    <button class="memo-ai-toggle-btn" onclick="toggleMemoAiText('${type}')">더 보기 ▾</button>
    <div class="memo-ai-section-label">변경 사항</div>
    <div class="memo-ai-changes">${changes.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
    <div class="memo-ai-section-label">추가 지시사항 (선택)</div>
    <input class="memo-ai-instruction" type="text" placeholder="예: 더 간결하게, 영어 용어 사용 등">
    <div class="memo-ai-video-section" id="memo-ai-videos-${type}"></div>
    <div class="memo-ai-actions">
      <button class="btn-outline" onclick="retryMemoAi('${type}')">다시<br>요청</button>
      <button class="btn-outline" onclick="closeMemoAi('${type}')">취소</button>
      <button class="btn-outline" onclick="findMemoVideos('${type}')">영상 찾기</button>
      <button class="btn-primary" onclick="applyMemoAi('${type}')">적용</button>
    </div>`;
}

function _buildSparMemoText() {
  const dayNote = document.getElementById('spar-day-note')?.value.trim() || '';
  const sessionBlocks = (sparSessions || []).map((s, i) => {
    const header = [
      `세션${i+1}`,
      `탭 당함${s.tapGot||0}:냄${s.tapGave||0}`
    ].filter(Boolean).join(' · ');
    const attempts = (s.success || []).map(a =>
      `${a.success ? '✓' : '✗'} ${a.name}`
    );
    const body = [];
    const positions = s.positions || [];
    if (positions.length) {
      const posStr = positions.map(p => {
        const score = parseInt(p.score) || 0;
        return score ? `${p.name} ★${score}` : p.name;
      }).join(', ');
      body.push(`  점유 포지션: ${posStr}`);
    }
    if (attempts.length) body.push(`  시도 기술: ${attempts.join(', ')}`);
    if ((s.weak || []).length) body.push(`  부족했던 부분: ${s.weak.join(', ')}`);
    if (s.note) body.push(`  세션 메모: ${s.note}`);
    return `[${header}]${body.length ? '\n' + body.join('\n') : ''}`;
  });
  const sessionText = sessionBlocks.length ? sessionBlocks.join('\n\n') : '(세션 없음)';
  return `${sessionText}${dayNote ? `\n\n[전체 메모]\n${dayNote}` : ''}`;
}

function _buildClassContext() {
  const pos   = document.getElementById('edit-c-pos')?.value || '';
  const stars = editClassDrillStars || 0;
  const chainNames = (editClassDrillChainIds || []).map(id => {
    const ch = (window.CACHE?.chains || []).find(x => x.id === Number(id));
    return ch ? ch.name : null;
  }).filter(Boolean);
  const lines = [];
  if (pos) lines.push(`포지션: ${pos}`);
  if ((editClassDrillTechs || []).length) lines.push(`기술: ${editClassDrillTechs.join(', ')}`);
  if ((editClassDrillDetails || []).length) lines.push(`디테일: ${editClassDrillDetails.join(', ')}`);
  if (stars) lines.push(`별점: ★${stars}`);
  if (chainNames.length) lines.push(`체인: ${chainNames.join(', ')}`);
  const drillClipCount = editClassDrillClipPicker ? editClassDrillClipPicker.getSelectedIds().length : 0;
  if (drillClipCount) lines.push(`참고 영상: ${drillClipCount}개`);
  return lines.length ? `[수업 기술 정보]\n${lines.join('\n')}` : '';
}

function _getMemoAiText(type) {
  if (type === 'spar') return _buildSparMemoText();
  if (type === 'classNote') {
    const raw = document.getElementById('edit-c-note')?.value.trim() || '';
    const ctx = _buildClassContext();
    if (!raw && !ctx) return '';
    return [ctx, raw ? `[원문 메모]\n${raw}` : ''].filter(Boolean).join('\n\n');
  }
  if (type === 'classFeedback') {
    const raw  = document.getElementById('edit-c-feedback')?.value.trim() || '';
    const note = document.getElementById('edit-c-note')?.value.trim() || '';
    const ctx  = _buildClassContext();
    const parts = [];
    if (ctx)  parts.push(ctx);
    if (note) parts.push(`[전체 메모]\n${note}`);
    parts.push(raw ? `[피드백 원문]\n${raw}` : `[피드백 원문]\n(작성 전 — 새로 생성)`);
    return parts.join('\n\n');
  }
  const ta = document.getElementById(_memoAiConfig[type].textareaId);
  return ta?.value.trim() || '';
}

async function _callEnhance(type, text, instruction) {
  const res  = await fetch('/api/enhance-memo/enhance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, type, instruction: instruction || '' })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function openMemoAi(type) {
  const cfg      = _memoAiConfig[type];
  const textarea = document.getElementById(cfg.textareaId);
  const panel    = document.getElementById(cfg.panelId);
  const text     = _getMemoAiText(type);
  if (!text) {
    const msg = type === 'spar' ? '세션 또는 메모를 먼저 입력해주세요'
      : type === 'classFeedback' ? '드릴 또는 메모를 먼저 입력해주세요'
      : '메모 내용을 먼저 입력해주세요';
    toast(msg);
    return;
  }

  panel.style.display = 'block';
  panel.innerHTML = _renderMemoAiLoading(
    type === 'spar' ? 'AI가 스파링을 분석하는 중...' :
    type === 'classFeedback' ? 'AI가 피드백을 작성하는 중...' :
    'AI가 메모를 보완하는 중...'
  );
  textarea.disabled = true;

  try {
    const data = await _callEnhance(type, text, '');
    panel.innerHTML = _renderMemoAiResult(type, data.enhanced || '', data.changes || '');
  } catch(e) {
    panel.style.display = 'none';
    toast('AI 보완 실패: ' + e.message);
  } finally {
    textarea.disabled = false;
  }
}

export async function retryMemoAi(type) {
  const cfg         = _memoAiConfig[type];
  const textarea    = document.getElementById(cfg.textareaId);
  const panel       = document.getElementById(cfg.panelId);
  const instruction = panel.querySelector('.memo-ai-instruction')?.value.trim() || '';
  const text        = _getMemoAiText(type);

  panel.innerHTML = _renderMemoAiLoading(
    type === 'spar' ? 'AI가 스파링을 분석하는 중...' :
    type === 'classFeedback' ? 'AI가 피드백을 작성하는 중...' :
    'AI가 메모를 보완하는 중...'
  );
  textarea.disabled = true;

  try {
    const data = await _callEnhance(type, text, instruction);
    panel.innerHTML = _renderMemoAiResult(type, data.enhanced || '', data.changes || '');
  } catch(e) {
    panel.style.display = 'none';
    toast('AI 보완 실패: ' + e.message);
  } finally {
    textarea.disabled = false;
  }
}

export function applyMemoAi(type) {
  const cfg      = _memoAiConfig[type];
  const textarea = document.getElementById(cfg.textareaId);
  const panel    = document.getElementById(cfg.panelId);
  const el       = panel.querySelector('.memo-ai-enhanced-text');
  if (el) textarea.value = el.textContent;
  panel.style.display = 'none';
}

export function toggleMemoAiText(type) {
  const wrap = document.getElementById(`memo-ai-wrap-${type}`);
  const btn  = wrap?.nextElementSibling;
  if (!wrap) return;
  const collapsed = wrap.classList.toggle('collapsed');
  if (btn) btn.textContent = collapsed ? '더 보기 ▾' : '접기 ▴';
}

export function closeMemoAi(type) {
  const cfg = _memoAiConfig[type];
  document.getElementById(cfg.panelId).style.display = 'none';
  document.getElementById(cfg.textareaId).disabled = false;
}

export async function findMemoVideos(type) {
  const cfg    = _memoAiConfig[type];
  const panel  = document.getElementById(cfg.panelId);
  const videoSection = document.getElementById(`memo-ai-videos-${type}`);
  if (!videoSection) return;

  const enhanced = panel.querySelector('.memo-ai-enhanced-text')?.textContent?.trim() || '';
  if (!enhanced) { toast('보완된 내용이 없습니다'); return; }

  videoSection.innerHTML = `<div class="memo-ai-loading">🎬 관련 영상 검색 중...</div>`;

  try {
    const res  = await fetch('/api/enhance-memo/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: enhanced })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    videoSection.innerHTML = _renderVideoCards(type, data.videos || []);
  } catch(e) {
    videoSection.innerHTML = `<div class="memo-ai-no-video">영상 검색 실패: ${e.message}</div>`;
  }
}

function _renderVideoCards(type, videos) {
  if (!videos.length) return `<div class="memo-ai-no-video">관련 영상 없음</div>`;
  return `<div class="memo-ai-section-label">관련 영상 검색</div>` + videos.map(v => {
    const safeTitle = v.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const safeUrl   = v.url.replace(/'/g, "\\'");
    return `<div class="memo-ai-video-card">
      <div class="memo-ai-video-info">
        <a class="memo-ai-video-title" href="${v.url}" target="_blank" rel="noopener">${v.title.replace(/</g,'&lt;')}</a>
        <div class="memo-ai-video-reason">${(v.reason||'').replace(/</g,'&lt;')}</div>
      </div>
      <button class="btn-sm" onclick="addVideoLink('${type}','${safeUrl}','${safeTitle}')">추가</button>
    </div>`;
  }).join('');
}

export async function addVideoLink(type, url, desc) {
  let picker = null;
  if (type === 'drill' || type === 'classNote' || type === 'classFeedback') picker = editClassDrillClipPicker;
  else if (type === 'spar') picker = sparDayClipPicker;
  if (!picker) { toast('참고영상은 해당 항목 편집 모달에서 추가해주세요'); return; }
  try {
    const { id } = await api('POST', '/api/clips', {
      title: desc || url,
      url,
      description: '',
      tech_ids: [],
      tags: []
    });
    const platform = url.includes('youtu') ? 'youtube' : url.includes('instagram') ? 'instagram' : 'other';
    CACHE.clips.unshift({
      id, title: desc || url, url, description: '', platform,
      tech_ids: [], tech_names: [], tech_name: null, tags: [], starred: 0
    });
    picker.setSelectedIds([...picker.getSelectedIds(), id]);
    toast('참고영상에 등록 후 연결되었습니다');
  } catch(e) {
    toast('영상 등록 실패: ' + e.message);
  }
}
