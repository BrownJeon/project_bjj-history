// pages/gameplan.js - 게임플랜(기술연구) 함수들

import { CACHE } from '../core/cache.js';
import { api, setLoading } from '../core/api.js';
import { loadAll } from '../core/cache.js';
import { toast, buildPagination } from '../utils/utils.js';
import { closeModal } from './navigation.js';
import { POS_STANDARD } from '../core/constants.js';

let researchStarOnly = false;
let gpCurrentId = null;
const RESEARCH_PAGE_SIZE = 12;
let researchPage = 1;
let gpFormNodes = [];
let gpFormEdges = [];
let gpNodeCounter = 0;
let _recResults = [];
let _inlineRecData = null;
let _recStartTechId = null;
let _recStartTechName = '';
let _recTags = [];

export { gpFormNodes, gpFormEdges };

// 포지션 select "기타" 선택 시 직접 입력란 표시/숨김
export function onGpPosChange(role){
  const select = document.getElementById(`gp-${role}-pos`);
  const custom = document.getElementById(`gp-${role}-pos-custom`);
  if(!select || !custom) return;
  const isOther = select.value === '기타';
  custom.style.display = isOther ? '' : 'none';
  if(!isOther) custom.value = '';
}

// 추천 모달 포지션 select "기타" 선택 시 직접 입력란 표시/숨김
export function onRecPosChange(role){
  const select = document.getElementById(`rec-${role}-pos`);
  const custom = document.getElementById(`rec-${role}-pos-custom`);
  if(!select || !custom) return;
  const isOther = select.value === '기타';
  custom.style.display = isOther ? '' : 'none';
  if(!isOther) custom.value = '';
}

// ── 추천 모달 시작 기술 검색 ──
export function filterRecStartTech(q){
  const suggest = document.getElementById('rec-start-tech-suggest'); if(!suggest) return;
  if(!q.trim()){ suggest.style.display = 'none'; return; }
  const matched = (CACHE.techniques||[]).filter(t => t.name && t.name.toLowerCase().includes(q.toLowerCase())).slice(0, 10);
  if(!matched.length){ suggest.style.display = 'none'; return; }
  suggest.innerHTML = matched.map(t => {
    const pos = t.pos ? ` <span style="color:var(--text2);font-size:11px">${t.pos.split(' ')[0]}</span>` : '';
    return `<div class="tech-suggest-item" onclick="selectRecStartTech(${t.id}, '${t.name.replace(/'/g,"\\'")}')">${t.name}${pos}</div>`;
  }).join('');
  suggest.style.display = '';
}

export function selectRecStartTech(id, name){
  _recStartTechId = id; _recStartTechName = name;
  document.getElementById('rec-start-tech-search').value = '';
  const suggest = document.getElementById('rec-start-tech-suggest');
  if(suggest){ suggest.innerHTML = ''; suggest.style.display = 'none'; }
  _renderRecStartTechSelected();
}

export function clearRecStartTech(){
  _recStartTechId = null; _recStartTechName = '';
  _renderRecStartTechSelected();
}

function _renderRecStartTechSelected(){
  const el = document.getElementById('rec-start-tech-selected'); if(!el) return;
  el.innerHTML = _recStartTechName
    ? `<div style="display:flex;align-items:center;gap:6px"><span class="tag tag-tech">${_recStartTechName}</span><button onclick="clearRecStartTech()" style="background:none;border:none;cursor:pointer;color:var(--text2);font-size:18px;line-height:1;padding:0">×</button></div>`
    : '';
}

// ── 추천 모달 태그 ──
export function addRecTag(){
  const inp = document.getElementById('rec-tag-input'); if(!inp) return;
  const v = inp.value.trim();
  if(!v || _recTags.includes(v)){ inp.value = ''; return; }
  _recTags.push(v); inp.value = ''; _renderRecTags();
}

export function removeRecTag(i){ _recTags.splice(i, 1); _renderRecTags(); }

function _renderRecTags(){
  const el = document.getElementById('rec-tag-chips'); if(!el) return;
  el.innerHTML = _recTags.map((t, i) => `<span class="chip">${t}<button onclick="removeRecTag(${i})">×</button></span>`).join('');
}

function _getRecPos(role){
  const select = document.getElementById(`rec-${role}-pos`);
  if(!select) return '';
  if(select.value === '기타'){
    return document.getElementById(`rec-${role}-pos-custom`)?.value.trim() || '기타';
  }
  return select.value;
}

// 포지션 select+custom 에서 실제 저장 값 추출
function _getGpPos(role){
  const select = document.getElementById(`gp-${role}-pos`);
  if(!select) return '';
  if(select.value === '기타'){
    return document.getElementById(`gp-${role}-pos-custom`)?.value.trim() || '기타';
  }
  return select.value;
}

// 포지션 값을 select+custom 에 복원
function _setGpPos(role, value){
  const select = document.getElementById(`gp-${role}-pos`);
  const custom = document.getElementById(`gp-${role}-pos-custom`);
  if(!select || !custom) return;
  if(!value){
    select.value = '';
    custom.style.display = 'none';
    custom.value = '';
  } else if(POS_STANDARD.includes(value) || value === '서브미션 피니시'){
    select.value = value;
    custom.style.display = 'none';
    custom.value = '';
  } else {
    select.value = '기타';
    custom.style.display = '';
    custom.value = value;
  }
}

export function toggleResearchStarFilter(){
  researchStarOnly = !researchStarOnly;
  researchPage = 1;
  const btn = document.getElementById('research-star-btn');
  if(btn){ btn.style.background = researchStarOnly ? 'var(--amber)' : ''; btn.style.color = researchStarOnly ? '#fff' : ''; btn.style.borderColor = researchStarOnly ? 'var(--amber)' : ''; }
  renderResearch();
}

export function setResearchSearch(){ researchPage = 1; renderResearch(); }
export function setResearchPage(p){ researchPage = p; renderResearch(); }

export function renderResearch(){
  const el = document.getElementById('research-list'); if(!el) return;
  const q = (document.getElementById('research-search')?.value || '').trim().toLowerCase();
  let list = CACHE.gameplans;
  if(researchStarOnly) list = list.filter(gp => gp.starred);
  if(q) list = list.filter(gp => (gp.name||'').toLowerCase().includes(q) || (gp.start_pos||'').toLowerCase().includes(q) || (gp.note||'').toLowerCase().includes(q));
  if(!list.length){ el.innerHTML = (q || researchStarOnly) ? '<div class="empty">검색 결과가 없습니다</div>' : '<div class="empty">등록된 기술연구가 없습니다</div>'; return; }
  const total = list.length;
  const start = (researchPage - 1) * RESEARCH_PAGE_SIZE;
  const paged = list.slice(start, start + RESEARCH_PAGE_SIZE);
  el.innerHTML = paged.map(gp => renderGpCard(gp)).join('')
    + buildPagination(total, researchPage, RESEARCH_PAGE_SIZE, 'setResearchPage');
}

export function renderGpCard(gp){
  const finishCount = (gp.nodes||[]).filter(n=>n.is_finish).length;
  const metaStr = `노드 ${(gp.nodes||[]).length}개 · 연결 ${(gp.edges||[]).length}개${finishCount ? ` · <span style="color:var(--red)">탭 ${finishCount}개</span>` : ''}`;
  const notePreview = gp.note ? `<div style="font-size:13px;color:var(--text2);margin-top:4px">${gp.note.length>60?gp.note.slice(0,60)+'\u2026':gp.note}</div>` : '';
  return `<div class="card" onclick="openGpDetail(${gp.id})" style="cursor:pointer"><div style="display:flex;align-items:flex-start;gap:8px"><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span class="tag tag-spar" style="font-size:11px">기술연구</span><span style="font-weight:600;font-size:15px">${gp.name}</span></div>${gp.start_pos?`<div style="font-size:12px;color:var(--text2);margin-bottom:2px">${gp.start_pos}</div>`:''}<div style="font-size:12px;color:var(--text2)">${metaStr}</div>${notePreview}</div><button onclick="event.stopPropagation();toggleGpStar(${gp.id})" style="background:none;border:none;cursor:pointer;font-size:22px;color:${gp.starred?'var(--amber)':'var(--border2)'};padding:0;line-height:1;flex-shrink:0">${gp.starred?'\u2605':'\u2606'}</button></div></div>`;
}

export function openGpModal(id, prefill){
  const isEdit = id != null;
  document.getElementById('gp-modal-title').textContent = isEdit ? '기술연구 수정' : '기술연구 추가';
  document.getElementById('gp-edit-id').value = isEdit ? id : '';
  gpNodeCounter = 0;
  const aiBox = document.getElementById('gp-ai-comment');
  if(aiBox && !prefill) aiBox.style.display = 'none';
  if(isEdit){
    const gp = CACHE.gameplans.find(x=>x.id===id); if(!gp) return;
    document.getElementById('gp-name').value = gp.name || '';
    _setGpPos('start', gp.start_pos || '');
    _setGpPos('end', gp.end_pos || '');
    document.getElementById('gp-note').value = gp.note || '';
    gpFormNodes = (gp.nodes||[]).map(n => ({ clientId: 'n'+n.id, techniqueId: n.technique_id ? String(n.technique_id) : '', label: n.label || '', isFinish: !!n.is_finish, note: n.note || '' }));
    gpNodeCounter = (gp.nodes||[]).reduce((max,n) => Math.max(max,n.id), 0) + 1;
    gpFormEdges = (gp.edges||[]).map(e => ({ fromClientId: 'n'+e.from_node_id, toClientId: 'n'+e.to_node_id, condition: e.condition || '' }));
  } else if(prefill){
    document.getElementById('gp-name').value = prefill.title || '';
    _setGpPos('start', prefill._userStartPos || '');
    _setGpPos('end',   prefill._userEndPos   || '');
    document.getElementById('gp-note').value = prefill.description || '';
    // AI 추천 참고사항 박스 표시
    const aiBox = document.getElementById('gp-ai-comment');
    const aiBody = document.getElementById('gp-ai-comment-body');
    if(aiBox && aiBody){
      const lines = [
        prefill.title    ? `<div><span style="color:var(--text2)">제목:</span> ${prefill.title}</div>` : '',
        prefill.start_pos ? `<div><span style="color:var(--text2)">시작 포지션:</span> ${prefill.start_pos}</div>` : '',
        prefill.description ? `<div style="margin-top:4px">${prefill.description}</div>` : ''
      ].filter(Boolean).join('');
      aiBody.innerHTML = lines;
      aiBox.style.display = lines ? '' : 'none';
    }
    gpFormNodes = (prefill.nodes||[]).map((n, i) => {
      const cid = 'n'+(gpNodeCounter++);
      // tech_id가 있으면 CACHE에서 매칭
      const matched = n.tech_id ? (CACHE.techniques||[]).find(t => t.id === n.tech_id) : null;
      return { clientId: cid, techniqueId: matched ? String(matched.id) : '', label: matched ? '' : (n.label||''), isFinish: !!n.is_finish, note: n.note||'' };
    });
    const clientIds = gpFormNodes.map(n => n.clientId);
    gpFormEdges = (prefill.edges||[]).map(e => ({
      fromClientId: clientIds[e.from_idx] || '',
      toClientId: clientIds[e.to_idx] || '',
      condition: e.condition || ''
    }));
  } else {
    document.getElementById('gp-name').value = '';
    _setGpPos('start', '');
    _setGpPos('end', '');
    document.getElementById('gp-note').value = '';
    gpFormNodes = []; gpFormEdges = [];
  }
  renderGpFormNodes(); renderGpFormEdges();
  // 인라인 추천 패널 초기화
  _inlineRecData = null;
  const inlinePanel = document.getElementById('gp-inline-rec');
  if(inlinePanel) inlinePanel.style.display = 'none';
  document.getElementById('modal-gp').classList.add('show');
}

export function addGpNode(){ const cid = 'n'+(gpNodeCounter++); gpFormNodes.push({ clientId: cid, techniqueId: '', label: '', isFinish: false, note: '' }); renderGpFormNodes(); }
export function removeGpNode(cid){ gpFormNodes = gpFormNodes.filter(n => n.clientId !== cid); gpFormEdges = gpFormEdges.filter(e => e.fromClientId !== cid && e.toClientId !== cid); renderGpFormNodes(); renderGpFormEdges(); renderInlineRecPanel(); }

export function renderGpFormNodes(){
  const wrap = document.getElementById('gp-nodes-wrap');
  if(!gpFormNodes.length){ wrap.innerHTML = ''; return; }
  wrap.innerHTML = gpFormNodes.map((n, i) => {
    const tech = n.techniqueId ? CACHE.techniques.find(t => t.id == n.techniqueId) : null;
    const selectedBadge = tech ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span class="tag tag-tech">${tech.name}${tech.pos?' \u00b7 '+tech.pos.split(' ')[0]:''}</span><button onclick="clearGpNodeTech('${n.clientId}')" style="background:none;border:none;cursor:pointer;color:var(--text2);font-size:18px;line-height:1;padding:0">x</button></div>` : '';
    const inputSection = !tech ? `<div style="position:relative;margin-bottom:6px"><input type="text" placeholder="기술명 검색 또는 직접 입력..." autocomplete="off" value="${(n.label||'').replace(/"/g,'&quot;')}" oninput="filterGpNodeSuggestions('${n.clientId}',this.value)" onkeydown="onGpNodeInputKey(event,'${n.clientId}')" style="width:100%;font-size:13px" id="gp-node-input-${n.clientId}"><div id="gp-node-suggest-${n.clientId}" style="position:absolute;top:100%;left:0;right:0;background:var(--bg2);border:0.5px solid var(--border2);border-radius:var(--radius);max-height:160px;overflow-y:auto;z-index:200;display:none"></div></div>` : '';
    return `<div class="step-row" style="align-items:flex-start"><div class="step-num" style="padding-top:11px">${i+1}</div><div class="step-body">${selectedBadge}${inputSection}<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;margin-top:2px"><input type="checkbox" ${n.isFinish?'checked':''} onchange="gpFormNodes.find(x=>x.clientId==='${n.clientId}').isFinish=this.checked"><span style="color:var(--red)">탭 마무리 (서브미션)</span></label></div><div class="step-actions" style="padding-top:7px"><button class="btn-danger-sm" onclick="removeGpNode('${n.clientId}')">삭제</button></div></div>`;
  }).join('');
}

export function filterGpNodeSuggestions(cid, q){
  const box = document.getElementById(`gp-node-suggest-${cid}`); if(!box) return;
  const n = gpFormNodes.find(x => x.clientId === cid); if(n) n.label = q;
  const trimQ = q.trim().toLowerCase();
  if(!trimQ){ box.style.display='none'; return; }
  const matched = (CACHE.techniques||[]).filter(t => t.name && t.name.toLowerCase().includes(trimQ)).slice(0, 10);
  const exactMatch = (CACHE.techniques||[]).some(t => t.name && t.name.toLowerCase() === trimQ);
  let html = matched.map(t => { const pos = t.pos ? ` <span style="color:var(--text2);font-size:11px">${t.pos.split(' ')[0]}</span>` : ''; return `<div class="tech-suggest-item" data-cid="${cid}" data-techid="${t.id}" onclick="selectGpNodeTech(this.dataset.cid, Number(this.dataset.techid))">${t.name}${pos}</div>`; }).join('');
  if(!exactMatch){ html += `<div class="tech-suggest-item tech-suggest-new" onclick="addNewTechFromGpNode(this.dataset.cid, this.dataset.name)" data-cid="${cid}" data-name="${q.replace(/"/g,'&quot;')}">+ "${q}" 기술트리에 추가</div>`; }
  box.innerHTML = html; box.style.display = html ? '' : 'none';
}

export function selectGpNodeTech(cid, techId){ const n = gpFormNodes.find(x => x.clientId === cid); if(!n) return; n.techniqueId = String(techId); n.label = ''; const box = document.getElementById(`gp-node-suggest-${cid}`); if(box) box.style.display = 'none'; renderGpFormNodes(); renderGpFormEdges(); }
export function clearGpNodeTech(cid){ const n = gpFormNodes.find(x => x.clientId === cid); if(!n) return; n.techniqueId = ''; n.label = ''; renderGpFormNodes(); renderGpFormEdges(); }

export async function addNewTechFromGpNode(cid, name){
  const box = document.getElementById(`gp-node-suggest-${cid}`); if(box) box.style.display = 'none';
  const existing = (CACHE.techniques||[]).find(t => t.name && t.name.toLowerCase() === name.toLowerCase());
  if(existing){ selectGpNodeTech(cid, existing.id); toast(`"${existing.name}"은 이미 기술트리에 있습니다`); return; }
  if(!confirm(`"${name}"을(를) 기술트리에 새로 추가할까요?`)) return;
  try { const t = await api('POST', '/api/techniques', { name }); CACHE.techniques.push({ id: t.id, name, pos:'', category:'', tags:[], links:[], starred:0 }); selectGpNodeTech(cid, t.id); toast(`"${name}" 기술트리에 추가되었습니다`); } catch(e){ toast('추가 실패: '+e.message); }
}

export function onGpNodeInputKey(e, cid){ if(e.key === 'Escape'){ const box = document.getElementById(`gp-node-suggest-${cid}`); if(box) box.style.display = 'none'; } }

export function addGpEdge(){ gpFormEdges.push({ fromClientId: '', toClientId: '', condition: '' }); renderGpFormEdges(); }
export function removeGpEdge(idx){ gpFormEdges.splice(idx,1); renderGpFormEdges(); renderInlineRecPanel(); }

export function renderGpFormEdges(){
  const wrap = document.getElementById('gp-edges-wrap');
  if(!gpFormNodes.length){ wrap.innerHTML = '<div style="font-size:12px;color:var(--text2);padding:4px 0">노드를 먼저 추가해주세요</div>'; return; }
  if(!gpFormEdges.length){ wrap.innerHTML = ''; return; }
  const nodeOptions = gpFormNodes.map((n, i) => { const tech = CACHE.techniques.find(t => t.id == n.techniqueId); const lbl = tech ? tech.name : (n.label || `노드 ${i+1}`); return `<option value="${n.clientId}">${i+1}. ${lbl}</option>`; }).join('');
  wrap.innerHTML = gpFormEdges.map((e, idx) => `<div class="step-row"><div class="step-num">${idx+1}</div><div class="step-body"><div class="row" style="gap:6px;margin-bottom:6px;align-items:center"><select data-edge-idx="${idx}" data-edge-role="from" style="flex:1"><option value="">출발...</option>${nodeOptions}</select><span style="color:var(--text2);flex-shrink:0">\u2192</span><select data-edge-idx="${idx}" data-edge-role="to" style="flex:1"><option value="">도착...</option>${nodeOptions}</select></div><input type="text" placeholder="조건 (예: 성공 시, 상대 방어 시)" value="${e.condition||''}" oninput="gpFormEdges[${idx}].condition=this.value" style="font-size:13px"></div><div class="step-actions"><button class="btn-danger-sm" onclick="removeGpEdge(${idx})">삭제</button></div></div>`).join('');
  wrap.querySelectorAll('select[data-edge-idx]').forEach(sel => {
    const idx = parseInt(sel.dataset.edgeIdx); const role = sel.dataset.edgeRole;
    sel.value = role==='from' ? gpFormEdges[idx].fromClientId : gpFormEdges[idx].toClientId;
    sel.onchange = () => { if(role==='from') gpFormEdges[idx].fromClientId = sel.value; else gpFormEdges[idx].toClientId = sel.value; };
  });
}

export async function saveGameplan(){
  const name = document.getElementById('gp-name').value.trim();
  if(!name){ toast('기술연구 이름을 입력해주세요'); return; }
  if(!gpFormNodes.length){ toast('노드를 1개 이상 추가해주세요'); return; }
  const invalidEdge = gpFormEdges.find(e => !e.fromClientId || !e.toClientId);
  if(invalidEdge){ toast('모든 연결의 출발/도착 노드를 선택해주세요'); return; }
  const id = document.getElementById('gp-edit-id').value;
  const body = { name, startPos: _getGpPos('start'), endPos: _getGpPos('end'), note: document.getElementById('gp-note').value, nodes: gpFormNodes, edges: gpFormEdges };
  setLoading(true);
  try { id ? await api('PUT',`/api/gameplans/${id}`,body) : await api('POST','/api/gameplans',body); await loadAll(); closeModal('gp'); renderResearch(); toast(id ? '수정되었습니다.' : '기술연구가 추가되었습니다.'); } catch(e){ toast('저장 실패: '+e.message); }
  finally{ setLoading(false); }
}

export async function deleteGameplan(id){
  if(!confirm('이 기술연구를 삭제할까요?')) return;
  setLoading(true);
  try { await api('DELETE',`/api/gameplans/${id}`); CACHE.gameplans = CACHE.gameplans.filter(g => g.id !== id); renderResearch(); toast('삭제되었습니다.'); } catch(e){ toast('삭제 실패: '+e.message); }
  finally{ setLoading(false); }
}

export function openGpDetail(id){
  const gp = CACHE.gameplans.find(x=>x.id===id); if(!gp) return;
  gpCurrentId = id;
  document.getElementById('gp-detail-name').textContent = gp.name;
  const posEl = document.getElementById('gp-detail-pos');
  posEl.textContent = gp.start_pos ? '시작: '+gp.start_pos : '';
  posEl.style.display = gp.start_pos ? 'block' : 'none';
  document.getElementById('gp-detail-flow').innerHTML = buildGpFlowHTML(gp);
  const noteEl = document.getElementById('gp-detail-note');
  noteEl.textContent = gp.note || ''; noteEl.style.display = gp.note ? 'block' : 'none';
  gpdUpdateStarBtn(gp.starred);
  document.getElementById('modal-gp-detail').classList.add('show');
}

export function gpdUpdateStarBtn(starred){ const btn = document.getElementById('gpd-star-btn'); btn.textContent = starred ? '\u2605 즐겨찾기' : '\u2606 즐겨찾기'; btn.style.color = starred ? 'var(--amber)' : ''; btn.style.borderColor= starred ? 'var(--amber)' : ''; }

export async function toggleGpStar(id){
  try { const res = await api('PATCH', `/api/gameplans/${id}/star`); const gp = CACHE.gameplans.find(x=>x.id===id); if(gp){ gp.starred = res.starred; renderResearch(); } if(gpCurrentId===id){ gpdUpdateStarBtn(res.starred); } } catch(e){ toast('오류: '+e.message); }
}
export async function gpdToggleStar(){ if(!gpCurrentId) return; await toggleGpStar(gpCurrentId); }
export function gpdEdit(){ closeModal('gp-detail'); openGpModal(gpCurrentId); }
export async function gpdDelete(){
  if(!confirm('이 기술연구를 삭제할까요?')) return;
  closeModal('gp-detail'); setLoading(true);
  try { await api('DELETE', `/api/gameplans/${gpCurrentId}`); CACHE.gameplans = CACHE.gameplans.filter(g=>g.id!==gpCurrentId); renderResearch(); toast('삭제되었습니다.'); } catch(e){ toast('삭제 실패: '+e.message); }
  finally{ setLoading(false); }
}

// ── AI 추천 ──

export function openRecommendModal(){
  _recResults = [];
  showRecommendStep(1);
  const q = document.getElementById('rec-query'); if(q) q.value = '';
  const radios = document.querySelectorAll('input[name="rec-mode"]');
  radios.forEach(r => { r.checked = r.value === 'mine'; });
  ['start','end'].forEach(role => {
    const sel = document.getElementById(`rec-${role}-pos`);
    const cust = document.getElementById(`rec-${role}-pos-custom`);
    if(sel) sel.value = '';
    if(cust){ cust.value = ''; cust.style.display = 'none'; }
  });
  _recStartTechId = null; _recStartTechName = ''; _renderRecStartTechSelected();
  const stSearch = document.getElementById('rec-start-tech-search'); if(stSearch) stSearch.value = '';
  const stSuggest = document.getElementById('rec-start-tech-suggest'); if(stSuggest) stSuggest.style.display = 'none';
  _recTags = []; _renderRecTags();
  document.getElementById('modal-recommend').classList.add('show');
}

export function showRecommendStep(n){
  [1,2,3].forEach(i => {
    const el = document.getElementById(`rec-step-${i}`);
    if(el) el.style.display = i === n ? '' : 'none';
  });
}

export async function runRecommend(){
  const mode = (document.querySelector('input[name="rec-mode"]:checked') || {}).value || 'mine';
  const query = (document.getElementById('rec-query')?.value || '').trim();
  const startPos = _getRecPos('start');
  const endPos = _getRecPos('end');
  showRecommendStep(2);
  try {
    const body = { mode, query, startPos, endPos, startTechId: _recStartTechId, startTech: _recStartTechName, tags: [..._recTags] };
    if(mode === 'mine'){
      body.techniques = (CACHE.techniques||[]).map(t => ({ id: t.id, name: t.name, pos: t.pos||'' }));
      body.gameplans  = (CACHE.gameplans||[]).map(gp => ({
        name: gp.name, start_pos: gp.start_pos||'',
        nodes: (gp.nodes||[]).map(n => ({ id: n.id, label: n.tech_name||n.label, is_finish: n.is_finish })),
        edges: (gp.edges||[]).map(e => ({ from: e.from_node_id, to: e.to_node_id, condition: e.condition }))
      }));
    }
    const res = await fetch('/api/recommend', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || '추천 요청 실패');
    _recResults = data.recommendations || [];
    document.getElementById('rec-results').innerHTML = renderRecResults(_recResults);
    showRecommendStep(3);
  } catch(e) {
    toast('추천 실패: ' + e.message);
    showRecommendStep(1);
  }
}

function renderRecResults(recs){
  if(!recs.length) return '<div class="empty">추천 결과가 없습니다. 다시 시도해주세요.</div>';
  return recs.map((rec, idx) => {
    const nodeFlow = (rec.nodes||[]).map((n, ni) => {
      const label = n.label || '기술 '+ni;
      const finish = n.is_finish ? ' <span style="color:var(--red);font-size:10px">●</span>' : '';
      return label + finish;
    }).join(' → ');
    return `<div style="border:1px solid var(--border2);border-radius:var(--radius);padding:12px;margin-bottom:10px">
      <div style="font-weight:600;font-size:15px;margin-bottom:4px">${rec.title||'추천 '+( idx+1)}</div>
      ${rec.start_pos ? `<div style="font-size:12px;color:var(--text2);margin-bottom:4px">시작: ${rec.start_pos}</div>` : ''}
      <div style="font-size:13px;color:var(--text2);margin-bottom:8px">${rec.description||''}</div>
      <div style="font-size:13px;background:var(--bg2);padding:8px 10px;border-radius:6px;margin-bottom:10px;line-height:1.6">${nodeFlow}</div>
      <button class="btn-primary" style="width:100%" onclick="applyRecommendation(${idx})">이 연계로 추가하기</button>
    </div>`;
  }).join('');
}

export function applyRecommendation(recIdx){
  const rec = _recResults[recIdx];
  if(!rec) return;
  // 추천 모달 닫기 전에 사용자가 입력한 포지션 값을 먼저 읽기
  const userStartPos = _getRecPos('start');
  const userEndPos   = _getRecPos('end');
  closeModal('recommend');
  openGpModal(null, { ...rec, _userStartPos: userStartPos, _userEndPos: userEndPos });
}

// ── 모달 내 인라인 AI 추천 ──

function _getNodeLabel(n) {
  const tech = n.techniqueId ? (CACHE.techniques||[]).find(t => t.id == n.techniqueId) : null;
  return tech ? tech.name : (n.label || '');
}

export async function requestInlineRecommend(){
  if(!gpFormNodes.length){ toast('노드를 1개 이상 추가해야 AI 추천이 가능합니다'); return; }
  const btn = document.getElementById('gp-inline-rec-btn');
  const panel = document.getElementById('gp-inline-rec');
  if(btn){ btn.disabled = true; btn.textContent = '분석 중...'; }
  if(panel){ panel.style.display = ''; panel.innerHTML = '<div style="text-align:center;padding:14px;color:var(--text2);font-size:13px">AI가 분석 중입니다...</div>'; }
  try {
    const currentNodes = gpFormNodes.map(n => ({ label: _getNodeLabel(n), tech_id: n.techniqueId ? Number(n.techniqueId) : null, is_finish: n.isFinish }));
    const body = {
      mode: 'nodes',
      currentNodes,
      name: document.getElementById('gp-name')?.value || '',
      startPos: _getGpPos('start'),
      endPos: _getGpPos('end'),
      comment: document.getElementById('gp-inline-rec-comment')?.value.trim() || ''
    };
    const res = await fetch('/api/recommend', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || '추천 요청 실패');
    _inlineRecData = data;
    renderInlineRecPanel();
  } catch(e){
    toast('추천 실패: ' + e.message);
    if(panel) panel.style.display = 'none';
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = '✨ AI 추천'; }
  }
}

function _isEdgeDup(e) {
  const fl = e.from_label.toLowerCase(), tl = e.to_label.toLowerCase();
  return gpFormEdges.some(fe => {
    const a = _getNodeLabel(gpFormNodes.find(n=>n.clientId===fe.fromClientId)||{}).toLowerCase();
    const b = _getNodeLabel(gpFormNodes.find(n=>n.clientId===fe.toClientId)||{}).toLowerCase();
    return a === fl && b === tl;
  });
}

function renderInlineRecPanel(){
  const panel = document.getElementById('gp-inline-rec');
  if(!panel || !_inlineRecData) return;

  const nodes = _inlineRecData.suggested_nodes || [];
  const edges = _inlineRecData.suggested_edges || [];

  // 실제 gpFormNodes 라벨 기반으로 상태 판단
  const currentLabels = gpFormNodes.map(n => _getNodeLabel(n).toLowerCase());

  const nodesHtml = nodes.map((n, idx) => {
    const added = currentLabels.includes(n.label.toLowerCase());
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;background:var(--bg);border:0.5px solid var(--border2);border-radius:6px;margin-bottom:4px">
      <div style="flex:1;min-width:0">
        <span style="font-size:13px;font-weight:500">${n.label}${n.is_finish?' <span style="color:var(--red);font-size:10px">●TAP</span>':''}</span>
        ${n.note?`<div style="font-size:11px;color:var(--text2);margin-top:2px">${n.note}</div>`:''}
      </div>
      ${added
        ? '<span style="font-size:12px;color:var(--text2);flex-shrink:0">✔ 추가됨</span>'
        : `<button class="btn-sm" style="flex-shrink:0" onclick="addSuggestedNode(${idx})">+ 추가</button>`}
    </div>`;
  }).join('');

  const edgesHtml = edges.map((e, idx) => {
    const edgeAdded = _isEdgeDup(e);
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg);border:0.5px solid var(--border2);border-radius:6px;margin-bottom:4px">
      <div style="flex:1;min-width:0;font-size:13px">
        <span style="font-weight:500">${e.from_label} → ${e.to_label}</span>
        ${e.condition?`<span style="color:var(--text2);font-size:11px"> · ${e.condition}</span>`:''}
        <div style="font-size:10px;color:var(--text2);margin-top:1px">양쪽 기술 + 연결 함께 추가</div>
      </div>
      ${edgeAdded
        ? '<span style="font-size:12px;color:var(--text2);flex-shrink:0">✔ 추가됨</span>'
        : `<button class="btn-sm" style="flex-shrink:0" onclick="addSuggestedEdge(${idx})">+ 추가</button>`}
    </div>`;
  }).join('');

  const hasNodes = nodes.length > 0;
  const hasEdges = edges.length > 0;

  panel.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--amber);border-radius:var(--radius);padding:12px;margin-top:8px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span style="font-size:13px;font-weight:600;color:var(--amber)">✨ AI 추천 결과</span>
      <button onclick="closeInlineRec()" style="background:none;border:none;cursor:pointer;color:var(--text2);font-size:18px;line-height:1;padding:0">×</button>
    </div>
    ${hasNodes?`<div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">추가 추천 노드</div>${nodesHtml}`:''}
    ${hasEdges?`<div style="font-size:11px;font-weight:600;color:var(--text2);margin:${hasNodes?'10px':'0'} 0 6px;text-transform:uppercase;letter-spacing:.5px">추천 연결</div>${edgesHtml}`:''}
    ${!hasNodes&&!hasEdges?'<div style="font-size:13px;color:var(--text2);text-align:center;padding:8px 0">추천할 내용이 없습니다</div>':''}
  </div>`;
  panel.style.display = '';
}

export function closeInlineRec(){
  const panel = document.getElementById('gp-inline-rec');
  if(panel) panel.style.display = 'none';
}

async function _ensureTechnique(label, tech_id) {
  // 1. tech_id로 CACHE 조회
  if(tech_id){
    const t = (CACHE.techniques||[]).find(t => t.id === tech_id);
    if(t) return t;
  }
  // 2. 이름으로 CACHE 조회
  const byName = (CACHE.techniques||[]).find(t => t.name && t.name.toLowerCase() === label.toLowerCase());
  if(byName) return byName;
  // 3. 없으면 신규 기술 카드 생성
  const result = await api('POST', '/api/techniques', { name: label });
  const newTech = { id: result.id, name: label, pos: '', category: '', tags: [], links: [], note: '', starred: false };
  if(!CACHE.techniques) CACHE.techniques = [];
  CACHE.techniques.push(newTech);
  return newTech;
}

async function _addNodeToForm(n) {
  const currentLabels = gpFormNodes.map(x => _getNodeLabel(x).toLowerCase());
  if(currentLabels.includes(n.label.toLowerCase())) return; // 이미 존재
  const tech = await _ensureTechnique(n.label, n.tech_id || null);
  const cid = 'n'+(gpNodeCounter++);
  gpFormNodes.push({ clientId: cid, techniqueId: String(tech.id), label: '', isFinish: !!n.is_finish, note: n.note||'' });
}

export async function addSuggestedNode(idx){
  if(!_inlineRecData) return;
  const n = _inlineRecData.suggested_nodes[idx]; if(!n) return;
  await _addNodeToForm(n);
  renderGpFormNodes(); renderGpFormEdges(); renderInlineRecPanel();
}

export async function addSuggestedEdge(idx){
  if(!_inlineRecData) return;
  const e = _inlineRecData.suggested_edges[idx]; if(!e) return;
  // 양쪽 노드 먼저 추가 (없으면 기술 카드 자동 생성 포함)
  const fromNodeDef = (_inlineRecData.suggested_nodes||[]).find(n => n.label.toLowerCase() === e.from_label.toLowerCase())
    || { label: e.from_label, tech_id: null, is_finish: false, note: '' };
  const toNodeDef = (_inlineRecData.suggested_nodes||[]).find(n => n.label.toLowerCase() === e.to_label.toLowerCase())
    || { label: e.to_label, tech_id: null, is_finish: false, note: '' };
  await _addNodeToForm(fromNodeDef);
  await _addNodeToForm(toNodeDef);
  // 엣지 추가 (중복 방지)
  if(!_isEdgeDup(e)){
    const findCid = label => gpFormNodes.find(n => _getNodeLabel(n).toLowerCase() === label.toLowerCase())?.clientId;
    const fromCid = findCid(e.from_label), toCid = findCid(e.to_label);
    if(fromCid && toCid) gpFormEdges.push({ fromClientId: fromCid, toClientId: toCid, condition: e.condition||'' });
  }
  renderGpFormNodes(); renderGpFormEdges(); renderInlineRecPanel();
}

function buildGpFlowHTML(gp){
  if(!gp.nodes||!gp.nodes.length) return '<div class="empty">노드가 없습니다</div>';
  const children = {}; const parentCnt = {};
  gp.nodes.forEach(n => { children[n.id] = []; parentCnt[n.id] = 0; });
  (gp.edges||[]).forEach(e => { if(children[e.from_node_id]) children[e.from_node_id].push({ toId: e.to_node_id, condition: e.condition||'' }); if(parentCnt[e.to_node_id] !== undefined) parentCnt[e.to_node_id]++; });
  const roots = gp.nodes.filter(n => parentCnt[n.id] === 0).map(n => n.id);
  if(!roots.length) roots.push(gp.nodes[0].id);
  const levelMap = {}; const queue = roots.map(r => ({ id: r, depth: 0 })); const visited = new Set();
  while(queue.length){ const { id, depth } = queue.shift(); if(visited.has(id)) continue; visited.add(id); levelMap[id] = depth; (children[id]||[]).forEach(c => queue.push({ id: c.toId, depth: depth+1 })); }
  gp.nodes.forEach(n => { if(levelMap[n.id] === undefined) levelMap[n.id] = 0; });
  const maxDepth = Math.max(...Object.values(levelMap));
  const levels = [];
  for(let d = 0; d <= maxDepth; d++) levels.push(gp.nodes.filter(n => levelMap[n.id] === d));
  let html = '<div class="gp-tree">';
  levels.forEach((levelNodes, depth) => {
    if(depth > 0){
      html += `<div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap">`;
      levelNodes.forEach(n => { const inEdges = (gp.edges||[]).filter(e => e.to_node_id === n.id); html += `<div style="display:flex;flex-direction:column;align-items:center;min-width:110px"><div class="flow-line" style="height:10px"></div>`; inEdges.forEach(e => { if(e.condition) html += `<div class="flow-condition" style="margin:2px 0">${e.condition}</div>`; }); html += `<div class="flow-arrow-tip">\u25BC</div></div>`; });
      html += `</div>`;
    }
    html += `<div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap">`;
    levelNodes.forEach(n => { const name = n.tech_name || n.label || '(이름 없음)'; const pos = n.tech_pos || ''; const fin = !!n.is_finish; html += `<div class="flow-node${fin?' finish':''}" style="${fin?'border:1px solid var(--red);background:var(--red-bg)':''}"><div class="flow-node-name">${name}</div>${pos?`<div class="flow-node-pos">${pos.split(' ')[0]}</div>`:''}${fin?`<div style="font-size:10px;color:var(--red-text);background:var(--red-bg);border-radius:100px;padding:1px 6px;margin-top:3px;display:inline-block">TAP</div>`:''}</div>`; });
    html += `</div>`;
    if(depth < maxDepth){
      html += `<div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap">`;
      levelNodes.forEach(n => { const outEdges = children[n.id] || []; html += `<div style="display:flex;flex-direction:column;align-items:center;min-width:110px">`; if(outEdges.length > 0){ html += `<div class="flow-line" style="height:10px"></div>`; if(outEdges.length > 1) html += `<div class="flow-condition">${outEdges.length}갈래 분기</div>`; } else { html += `<div style="height:10px"></div>`; } html += `</div>`; });
      html += `</div>`;
    }
  });
  html += '</div>';
  return html;
}
