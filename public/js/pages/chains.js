// pages/chains.js - 체인 CRUD, 상세 뷰

import { CACHE } from '../core/cache.js';
import { api, setLoading } from '../core/api.js';
import { loadAll } from '../core/cache.js';
import { toast } from '../utils/utils.js';
import { closeModal } from './navigation.js';
import { renderRef } from './techniques.js';

let chainFormSteps = [];
let cdCurrentId = null;

export { chainFormSteps };

export function renderChainCard(c){
  const preview = c.steps.map(s=>s.tech_name||'?').join(' \u2192 ');
  const notePreview = c.note ? `<div style="font-size:13px;color:var(--text2);margin-top:4px">${c.note.length>60?c.note.slice(0,60)+'\u2026':c.note}</div>` : '';
  return `<div class="card" onclick="openChainDetail(${c.id})" style="cursor:pointer">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span class="tag tag-spar" style="font-size:11px">체인</span>
          <span style="font-weight:600;font-size:15px">${c.name}</span>
        </div>
        <div style="font-size:12px;color:var(--text2)">${c.steps.length}단계</div>
        ${notePreview}
      </div>
    </div>
    <div style="font-size:13px;color:var(--text2);line-height:1.7;margin-top:6px">${preview||'단계 없음'}</div>
  </div>`;
}

export function openChainModal(id){
  const isEdit=id!=null;
  document.getElementById('chain-modal-title').textContent=isEdit?'체인 수정':'체인 추가';
  document.getElementById('chain-edit-id').value=isEdit?id:'';
  if(isEdit){
    const c=CACHE.chains.find(x=>x.id===id); if(!c) return;
    document.getElementById('chain-name').value=c.name||'';
    document.getElementById('chain-note').value=c.note||'';
    chainFormSteps=c.steps.map(s=>({techniqueId:s.technique_id, transitionNote:s.transition_note||''}));
  } else {
    document.getElementById('chain-name').value='';
    document.getElementById('chain-note').value='';
    chainFormSteps=[];
  }
  renderChainFormSteps();
  document.getElementById('modal-chain').classList.add('show');
}

export function addChainStep(){ chainFormSteps.push({techniqueId:'',transitionNote:''}); renderChainFormSteps(); }
export function removeChainStep(i){ chainFormSteps.splice(i,1); renderChainFormSteps(); }
export function moveChainStep(i,dir){
  const j=i+dir;
  if(j<0||j>=chainFormSteps.length) return;
  [chainFormSteps[i],chainFormSteps[j]]=[chainFormSteps[j],chainFormSteps[i]];
  renderChainFormSteps();
}

export function renderChainFormSteps(){
  const wrap=document.getElementById('chain-steps-wrap');
  if(!chainFormSteps.length){ wrap.innerHTML=''; return; }
  if(!CACHE.techniques.length){
    wrap.innerHTML='<div style="font-size:13px;color:var(--text2);padding:8px 0">먼저 기술 카드를 추가해주세요.</div>';
    return;
  }
  wrap.innerHTML=chainFormSteps.map((s,i)=>`
    <div class="step-row">
      <div class="step-num">${i+1}</div>
      <div class="step-body">
        <select onchange="chainFormSteps[${i}].techniqueId=this.value" style="margin-bottom:6px">
          <option value="">기술 선택...</option>
          ${CACHE.techniques.map(t=>`<option value="${t.id}"${s.techniqueId==t.id?' selected':''}>${t.name}</option>`).join('')}
        </select>
        ${i<chainFormSteps.length-1?`
          <input type="text" placeholder="전환 조건 (선택) 예: 팔을 당겨 방어 시" value="${s.transitionNote||''}"
            oninput="chainFormSteps[${i}].transitionNote=this.value" style="font-size:13px">
        `:''}
      </div>
      <div class="step-actions">
        ${i>0?`<button class="btn-sm" onclick="moveChainStep(${i},-1)" style="padding:5px 8px">\u2191</button>`:''}
        ${i<chainFormSteps.length-1?`<button class="btn-sm" onclick="moveChainStep(${i},1)" style="padding:5px 8px">\u2193</button>`:''}
        <button class="btn-danger-sm" onclick="removeChainStep(${i})">삭제</button>
      </div>
    </div>
  `).join('');
}

export async function saveChain(){
  const name=document.getElementById('chain-name').value.trim();
  if(!name){ toast('체인 이름을 입력해주세요'); return; }
  if(chainFormSteps.length&&chainFormSteps.some(s=>!s.techniqueId)){ toast('모든 단계의 기술을 선택해주세요'); return; }
  const id=document.getElementById('chain-edit-id').value;
  const body={name, note:document.getElementById('chain-note').value, steps:chainFormSteps};
  setLoading(true);
  try {
    id ? await api('PUT',`/api/chains/${id}`,body) : await api('POST','/api/chains',body);
    await loadAll();
    closeModal('chain'); renderRef();
    toast(id?'수정되었습니다.':'체인이 추가되었습니다.');
  } catch(e){ toast('저장 실패: '+e.message); }
  finally{ setLoading(false); }
}

export async function deleteChain(id){
  if(!confirm('이 체인을 삭제할까요?')) return;
  setLoading(true);
  try {
    await api('DELETE',`/api/chains/${id}`);
    CACHE.chains=CACHE.chains.filter(c=>c.id!==id);
    renderRef(); toast('삭제되었습니다.');
  } catch(e){ toast('삭제 실패: '+e.message); }
  finally{ setLoading(false); }
}

/* ── 체인 상세 ── */
export function openChainDetail(id){
  const c=CACHE.chains.find(x=>x.id===id); if(!c) return;
  cdCurrentId = id;
  document.getElementById('chain-detail-name').textContent=c.name;
  const flowEl=document.getElementById('chain-detail-flow');
  if(!c.steps.length){ flowEl.innerHTML='<div class="empty">단계가 없습니다</div>'; }
  else {
    flowEl.innerHTML=c.steps.map((s,i)=>`
      <div class="flow-node" onclick="closeModal('chain-detail');setTimeout(()=>highlightTech(${s.technique_id}),250)">
        <div class="flow-node-name">${s.tech_name||'(삭제된 기술)'}</div>
        ${s.tech_pos?`<div class="flow-node-pos">${s.tech_pos.split(' ')[0]}</div>`:''}
      </div>
      ${i<c.steps.length-1?`
        <div class="flow-conn">
          <div class="flow-line"></div>
          ${s.transition_note?`<div class="flow-condition">${s.transition_note}</div>`:''}
          <div class="flow-arrow-tip">\u25BC</div>
        </div>
      `:''}
    `).join('');
  }
  const noteEl=document.getElementById('chain-detail-note');
  noteEl.textContent=c.note||'';
  noteEl.style.display=c.note?'block':'none';
  document.getElementById('modal-chain-detail').classList.add('show');
}

export function cdEdit(){ closeModal('chain-detail'); openChainModal(cdCurrentId); }
export async function cdDelete(){
  if(!confirm('이 체인을 삭제할까요?')) return;
  closeModal('chain-detail');
  setLoading(true);
  try {
    await api('DELETE',`/api/chains/${cdCurrentId}`);
    CACHE.chains=CACHE.chains.filter(c=>c.id!==cdCurrentId);
    renderRef(); toast('삭제되었습니다.');
  } catch(e){ toast('삭제 실패: '+e.message); }
  finally{ setLoading(false); }
}
