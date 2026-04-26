// pages/profile.js - 내정보/벨트 함수들

import { CACHE } from '../core/cache.js';
import { api, setLoading } from '../core/api.js';
import { toast, parseMaybeJson } from '../utils/utils.js';
import { closeModal } from './navigation.js';
import { BELT_COLORS, BELT_NAMES } from '../core/constants.js';

let beltModalSelected = 'white';
let beltModalStripes  = 0;

export function renderMyInfo(){
  const el = document.getElementById('myinfo-content'); if(!el) return;
  const p = CACHE.profile || {}; const belts = CACHE.belts || [];
  let elapsedStr = '-';
  if(p.start_date){ const start = new Date(p.start_date + 'T00:00:00'); const diffDays = Math.floor((new Date() - start) / 86400000); elapsedStr = `${diffDays}일`; }
  let trainingDays = 0;
  (CACHE.classes || []).forEach(c => { const dateEnd = (c.date_end||'').toString().slice(0,10); const dateStart = (c.date||'').toString().slice(0,10); const isRange = c.date_end && dateEnd > dateStart; if(isRange){ trainingDays += Array.isArray(c.trained_dates) ? c.trained_dates.length : 0; } else if(c.drill || (c.sessions && c.sessions.length > 0)){ trainingDays += 1; } });
  const currentBelt = belts[0] || null;
  const headerAvatar = document.getElementById('myinfo-header-avatar');
  if (headerAvatar) {
    headerAvatar.innerHTML = p.avatar
      ? `<img src="${p.avatar}?t=${Date.now()}" style="width:100%;height:100%;object-fit:cover">`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
  }
  el.innerHTML = `<div class="card" style="margin-bottom:12px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div class="info-section-title" style="margin:0">프로필</div><button class="info-edit-btn" onclick="openProfileModal()">수정</button></div><div class="info-grid"><div><div class="info-label">닉네임</div><div class="info-val">${p.nickname||'-'}</div></div><div><div class="info-label">운동 시작일</div><div class="info-val">${p.start_date ? p.start_date.slice(0,10).replace(/-/g,'. '): '-'}</div></div><div style="margin-top:10px"><div class="info-label">체급</div><div class="info-val">${p.weight_class||'-'}</div></div><div style="margin-top:10px"><div class="info-label">소속</div><div class="info-val">${p.network||'-'}</div></div></div></div>
    <div class="card" style="margin-bottom:12px"><div class="info-section-title">훈련 기록</div><div class="myinfo-metric-grid"><div class="myinfo-metric"><div class="myinfo-metric-lbl">운동 시작 후</div><div class="myinfo-metric-val">${elapsedStr}</div></div><div class="myinfo-metric"><div class="myinfo-metric-lbl">훈련 횟수</div><div class="myinfo-metric-val">${trainingDays}회</div></div></div></div>
    <div class="card" style="margin-bottom:12px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><div class="info-section-title" style="margin:0">현재 벨트</div><button class="info-edit-btn" onclick="openBeltModal(null)">+ 승급 기록</button></div>${currentBelt ? renderCurrentBelt(currentBelt) : '<div class="empty" style="padding:1rem 0">승급 기록을 추가해주세요</div>'}</div>
    <div class="card"><div class="info-section-title">승급 히스토리</div>${belts.length ? belts.map(b => renderBeltHistoryRow(b)).join('') : '<div class="empty" style="padding:1rem 0">기록 없음</div>'}</div>`;
}

function renderBeltVisual(belt, stripes){
  const color = BELT_COLORS[belt] || '#e5e5e5'; const isBlack = belt === 'black'; const maxStripes = isBlack ? 6 : 4;
  const grauColor = '#ffffff'; const grauEmpty = 'rgba(255,255,255,0.25)';
  const graus = Array.from({length: maxStripes}, (_,i) => isBlack ? `<div class="belt-degree" style="background:${i<stripes?grauColor:grauEmpty}"></div>` : `<div class="belt-grau" style="background:${i<stripes?grauColor:grauEmpty}"></div>`).join('');
  return `<div class="belt-visual"><div class="belt-bar-wrap"><div class="belt-bar-main" style="background:${color}"></div><div class="belt-bar-tip">${graus}</div></div></div>`;
}

function renderCurrentBelt(b){
  const name = BELT_NAMES[b.belt] || b.belt; const grauText = b.stripes > 0 ? ` · ${b.stripes}그랄` : '';
  const date = b.achieved_date ? b.achieved_date.slice(0,10).replace(/-/g,'. ') : '';
  return `<div style="font-size:15px;font-weight:600;margin-bottom:4px">${name}${grauText}</div>${renderBeltVisual(b.belt, b.stripes)}<div style="font-size:13px;color:var(--text2)">${date} 승급</div>`;
}

function renderBeltHistoryRow(b){
  const name = BELT_NAMES[b.belt] || b.belt; const color = BELT_COLORS[b.belt] || '#e5e5e5';
  const isBlack = b.belt === 'black'; const maxG = isBlack ? 6 : 4;
  const gc = '#ffffff'; const ge = 'rgba(255,255,255,0.25)';
  const graus = Array.from({length:maxG},(_,i)=> `<div style="width:8px;height:8px;border-radius:50%;background:${i<b.stripes?gc:ge}"></div>`).join('');
  const date = (b.achieved_date||'').slice(0,10).replace(/-/g,'. ');
  return `<div class="belt-history-row"><div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0"><div class="belt-history-bar" style="background:${color};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:4px 2px">${graus}</div></div><div class="belt-history-info"><div class="belt-history-name">${name}${b.stripes > 0 ? ' '+b.stripes+'그랄' : ''}</div><div class="belt-history-sub">${date}</div></div><div class="belt-history-actions"><button class="icon-btn" onclick="openBeltModal(${b.id})">수정</button><button class="icon-btn" style="color:var(--red)" onclick="deleteBelt(${b.id})">삭제</button></div></div>`;
}

export function openProfileModal(){
  const p = CACHE.profile || {};
  document.getElementById('prof-nickname').value = p.nickname || '';
  document.getElementById('prof-startdate').value = p.start_date ? p.start_date.slice(0,10) : '';
  document.getElementById('prof-weight').value = p.weight_class || '';
  document.getElementById('prof-network').value = p.network || '';
  const preview = document.getElementById('prof-avatar-preview');
  const svgPlaceholder = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
  if (preview) preview.innerHTML = p.avatar
    ? `<img src="${p.avatar}?t=${Date.now()}" style="width:100%;height:100%;object-fit:cover">`
    : svgPlaceholder;
  const fileInput = document.getElementById('prof-avatar-input');
  if (fileInput) fileInput.value = '';
  const deleteBtn = document.getElementById('prof-avatar-delete-btn');
  if (deleteBtn) deleteBtn.style.display = p.avatar ? '' : 'none';
  document.getElementById('modal-profile').classList.add('show');
}

export async function deleteProfileAvatar(){
  if (!confirm('프로필 사진을 삭제할까요?')) return;
  setLoading(true);
  try {
    await api('DELETE', '/api/profile/avatar');
    CACHE.profile = { ...CACHE.profile, avatar: null };
    const svgPlaceholder = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
    const preview = document.getElementById('prof-avatar-preview');
    if (preview) preview.innerHTML = svgPlaceholder;
    const fileInput = document.getElementById('prof-avatar-input');
    if (fileInput) fileInput.value = '';
    const deleteBtn = document.getElementById('prof-avatar-delete-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    renderMyInfo();
    toast('사진이 삭제됐습니다');
  } catch(e) { toast('삭제 실패: '+e.message); }
  finally { setLoading(false); }
}

export function onProfAvatarChange(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('prof-avatar-preview');
    if (preview) preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover">`;
  };
  reader.readAsDataURL(file);
}

export async function saveProfile(){
  setLoading(true);
  try {
    const fileInput = document.getElementById('prof-avatar-input');
    if (fileInput && fileInput.files[0]) {
      const fd = new FormData();
      fd.append('avatar', fileInput.files[0]);
      const uploadRes = await fetch('/api/profile/avatar', { method: 'POST', body: fd });
      if (!uploadRes.ok) throw new Error('사진 업로드 실패');
      const { avatar } = await uploadRes.json();
      CACHE.profile = { ...CACHE.profile, avatar };
    }
    const body = { nickname: document.getElementById('prof-nickname').value, startDate: document.getElementById('prof-startdate').value, weightClass: document.getElementById('prof-weight').value, network: document.getElementById('prof-network').value };
    await api('PUT','/api/profile', body);
    CACHE.profile = { ...CACHE.profile, nickname: body.nickname, start_date: body.startDate, weight_class: body.weightClass, network: body.network };
    closeModal('profile'); renderMyInfo(); toast('프로필이 저장됐습니다');
  } catch(e){ toast('저장 실패: '+e.message); }
  finally{ setLoading(false); }
}

export function selectBelt(belt){ beltModalSelected = belt; document.querySelectorAll('.belt-select-btn').forEach(b=>{ b.classList.toggle('active', b.dataset.belt === belt); }); renderGrauSelect(belt); }
function renderGrauSelect(belt){ const isBlack = belt === 'black'; const max = isBlack ? 6 : 4; document.getElementById('grau-label').textContent = isBlack ? '(0~6단)' : '(0~4그랄)'; const row = document.getElementById('grau-select-row'); row.innerHTML = Array.from({length:max+1},(_,i)=> `<button class="grau-dot-btn${i===beltModalStripes?' active':''}" onclick="setBeltStripes(${i})">${i}</button>`).join(''); }
export function setBeltStripes(n){ beltModalStripes = n; document.querySelectorAll('.grau-dot-btn').forEach((b,i)=>b.classList.toggle('active', i===n)); }

export function openBeltModal(id){
  const isEdit = id != null;
  document.getElementById('belt-modal-title').textContent = isEdit ? '승급 기록 수정' : '승급 기록 추가';
  document.getElementById('belt-edit-id').value = isEdit ? id : '';
  if(isEdit){ const b = CACHE.belts.find(x=>x.id===id); if(!b) return; beltModalSelected = b.belt; beltModalStripes = b.stripes || 0; document.getElementById('belt-date').value = (b.achieved_date||'').slice(0,10); document.getElementById('belt-note').value = b.note || ''; }
  else { beltModalSelected = 'white'; beltModalStripes = 0; document.getElementById('belt-date').value = new Date().toISOString().slice(0,10); document.getElementById('belt-note').value = ''; }
  document.querySelectorAll('.belt-select-btn').forEach(b=>{ b.classList.toggle('active', b.dataset.belt === beltModalSelected); });
  renderGrauSelect(beltModalSelected);
  document.getElementById('modal-belt').classList.add('show');
}

export async function saveBelt(){
  const id = document.getElementById('belt-edit-id').value;
  const date = document.getElementById('belt-date').value;
  if(!date){ toast('승급 일자를 선택해주세요'); return; }
  const body = { belt: beltModalSelected, stripes: beltModalStripes, achievedDate: date, note: document.getElementById('belt-note').value };
  setLoading(true);
  try { if(id) await api('PUT', `/api/belts/${id}`, body); else await api('POST', '/api/belts', body); CACHE.belts = await api('GET', '/api/belts'); closeModal('belt'); renderMyInfo(); toast(id ? '수정됐습니다' : '승급 기록이 추가됐습니다'); } catch(e){ toast('저장 실패: '+e.message); }
  finally{ setLoading(false); }
}

export async function deleteBelt(id){
  if(!confirm('이 승급 기록을 삭제할까요?')) return;
  setLoading(true);
  try { await api('DELETE', `/api/belts/${id}`); CACHE.belts = CACHE.belts.filter(b=>b.id!==id); renderMyInfo(); toast('삭제됐습니다'); } catch(e){ toast('삭제 실패: '+e.message); }
  finally{ setLoading(false); }
}
