// pages/coach.js - AI 훈련 비서
import { api, setLoading } from '../core/api.js';
import { toast } from '../utils/utils.js';

let coachTab    = 'diag';
let coachDays   = 30;
let coachDiag   = null;
let coachReports = [];
let coachPlans   = [];
let coachChats   = [];

function esc(s) { return String(s ?? '').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function nl2br(s) { return esc(s).replace(/\n/g,'<br>'); }

export function setCoachTab(tab) {
  coachTab = tab;
  ['diag','report','plan','chat'].forEach(t => {
    document.getElementById(`coach-tab-${t}`)?.classList.toggle('active', t === tab);
    const pane = document.getElementById(`coach-pane-${t}`);
    if (pane) pane.style.display = t === tab ? '' : 'none';
  });
  renderCoachPane();
}

export function onCoachPeriodChange(v) {
  coachDays = parseInt(v) || 30;
  coachDiag = null;
  renderCoachPane();
}

export async function renderCoach() {
  if (coachTab === 'diag') await renderDiag();
  else if (coachTab === 'report') await renderReports();
  else if (coachTab === 'plan') await renderPlans();
  else if (coachTab === 'chat') await renderChats();
}

function renderCoachPane() { renderCoach(); }

// ───── 진단 ─────
async function renderDiag() {
  const pane = document.getElementById('coach-pane-diag'); if(!pane) return;
  pane.innerHTML = `<div class="empty">진단 집계 중...</div>`;
  try {
    coachDiag = await api('GET', `/api/coach/diagnosis?days=${coachDays}`);
  } catch(e) {
    pane.innerHTML = `<div class="empty">집계 실패: ${esc(e.message)}</div>`;
    return;
  }
  const d = coachDiag;
  const s = d.summary || {};
  const weakTags = (d.weakTop || []).map(w =>
    `<span class="tag tag-bad">${esc(w.name)} <small>×${w.count}</small></span>`).join(' ') || '<span class="empty" style="padding:4px">데이터 없음</span>';
  const failTags = (d.failedTechs || []).map(t =>
    `<span class="tag tag-tried">${esc(t.name)} <small>${t.success}/${t.tried}</small></span>`).join(' ') || '<span class="empty" style="padding:4px">실패 기록 없음</span>';
  const posList = (d.positions || []).map(p =>
    `<div class="coach-row"><span>${esc(p.name)}</span><span>★${p.avg} · ${p.count}회</span></div>`).join('') || '<div class="empty" style="padding:4px">데이터 없음</div>';
  const beltList = (d.byOpponentBelt || []).map(b =>
    `<div class="coach-row"><span>${esc(b.belt)}벨트</span><span>↓${b.tapGot} ↑${b.tapGave} · ${b.sessions}세션</span></div>`).join('') || '<div class="empty" style="padding:4px">데이터 없음</div>';

  pane.innerHTML = `
    <div class="card">
      <div class="section-label">기간 요약</div>
      <div class="coach-row"><span>수업</span><span>${s.classes||0}회</span></div>
      <div class="coach-row"><span>스파링 세션</span><span>${s.sessions||0}회 · ${s.minutes||0}분</span></div>
      <div class="coach-row"><span>수련 일수</span><span>${s.trainedDays||0}일</span></div>
      <div class="coach-row"><span>탭</span><span>↓${s.tapGot||0} ↑${s.tapGave||0}</span></div>
    </div>
    <div class="card">
      <div class="section-label">반복 약점 TOP ${Math.min(5,(d.weakTop||[]).length)}</div>
      <div>${weakTags}</div>
    </div>
    <div class="card">
      <div class="section-label">실패 비율 높은 기술</div>
      <div>${failTags}</div>
    </div>
    <div class="card">
      <div class="section-label">포지션 점유 (평균 ★)</div>
      ${posList}
    </div>
    <div class="card">
      <div class="section-label">상대 벨트별 성과</div>
      ${beltList}
    </div>
  `;
}

// ───── 리포트 ─────
async function renderReports() {
  const pane = document.getElementById('coach-pane-report'); if(!pane) return;
  try {
    coachReports = await api('GET', `/api/coach/reports?type=report&limit=10`);
  } catch(e) { coachReports = []; }

  const list = coachReports.map(r => {
    const c = r.content || {};
    const period = `${(r.period_start||'').slice(0,10)} ~ ${(r.period_end||'').slice(0,10)}`;
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <strong style="font-size:13px">${period}</strong>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="font-size:11px;color:var(--text2)">${new Date(r.created_at).toLocaleString('ko-KR')}</span>
          <button class="del-btn" onclick="deleteCoachReport(${r.id},'report')">삭제</button>
        </div>
      </div>
      ${c.highlights ? `<div class="section-label">하이라이트</div><div class="history-sub" style="margin-bottom:8px">${nl2br(c.highlights)}</div>` : ''}
      ${c.weaknesses ? `<div class="section-label">반복 약점</div><div class="history-sub" style="margin-bottom:8px">${nl2br(c.weaknesses)}</div>` : ''}
      ${c.improvements ? `<div class="section-label">개선된 점</div><div class="history-sub" style="margin-bottom:8px">${nl2br(c.improvements)}</div>` : ''}
      ${c.recommendations ? `<div class="section-label">권장 사항</div><div class="history-sub">${nl2br(c.recommendations)}</div>` : ''}
    </div>`;
  }).join('');

  pane.innerHTML = `
    <button class="btn-primary" style="margin-bottom:12px" onclick="generateCoachReport()">✨ 이 기간 리포트 생성</button>
    ${list || '<div class="empty">저장된 리포트 없음</div>'}
  `;
}

export async function generateCoachReport() {
  setLoading(true);
  try {
    await api('POST', '/api/coach/report', { days: coachDays });
    toast('리포트가 생성되었습니다');
    await renderReports();
  } catch(e) {
    toast('생성 실패: ' + e.message);
  } finally { setLoading(false); }
}

export async function deleteCoachReport(id, type) {
  if (!confirm('삭제하시겠습니까?')) return;
  try {
    await api('DELETE', `/api/coach/reports/${id}`);
    if (type === 'report') await renderReports();
    else if (type === 'plan') await renderPlans();
    else if (type === 'chat') await renderChats();
  } catch(e) { toast('삭제 실패: ' + e.message); }
}

// ───── 계획 ─────
async function renderPlans() {
  const pane = document.getElementById('coach-pane-plan'); if(!pane) return;
  try {
    coachPlans = await api('GET', `/api/coach/reports?type=plan&limit=10`);
  } catch(e) { coachPlans = []; }

  const list = coachPlans.map(p => {
    const c = p.content || {};
    const period = `${(p.period_start||'').slice(0,10)} ~ ${(p.period_end||'').slice(0,10)}`;
    const focusCards = (c.focuses || []).map((f, i) => {
      const techBadges = (f.techniqueIds || []).map((id, k) => {
        const name = (f.techniqueNames && f.techniqueNames[k]) || '';
        return `<span class="tag tag-tech" style="cursor:pointer" onclick="openTechDetail(${id})">${esc(name)}</span>`;
      }).join(' ');
      const chainBadges = (f.chainIds || []).map((id, k) => {
        const name = (f.chainNames && f.chainNames[k]) || '';
        return `<span class="tag tag-spar" style="cursor:pointer" onclick="openChainDetail(${id})">${esc(name)}</span>`;
      }).join(' ');
      const videos = (f.videoLinks || []).map(v =>
        `<a href="${v.url}" class="link-badge" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(v.query)}</a>`
      ).join(' ');
      return `<div class="card-inner" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <strong style="font-size:14px">${i+1}. ${esc(f.title)}</strong>
          <label style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--text2)">
            <input type="checkbox" ${f.done?'checked':''} onchange="toggleCoachFocusDone(${p.id},${i},this.checked)">
            완료
          </label>
        </div>
        ${f.why ? `<div class="history-sub" style="margin-top:4px">${nl2br(f.why)}</div>` : ''}
        ${f.drillSuggestion ? `<div class="section-label" style="margin-top:8px">훈련 드릴</div><div class="history-sub">${nl2br(f.drillSuggestion)}</div>` : ''}
        ${techBadges || chainBadges ? `<div style="margin-top:8px">${techBadges} ${chainBadges}</div>` : ''}
        ${videos ? `<div style="margin-top:6px">${videos}</div>` : ''}
      </div>`;
    }).join('');

    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="font-size:13px">${period}</strong>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="font-size:11px;color:var(--text2)">${new Date(p.created_at).toLocaleString('ko-KR')}</span>
          <button class="del-btn" onclick="deleteCoachReport(${p.id},'plan')">삭제</button>
        </div>
      </div>
      ${focusCards || '<div class="empty">포커스 없음</div>'}
    </div>`;
  }).join('');

  pane.innerHTML = `
    <button class="btn-primary" style="margin-bottom:12px" onclick="generateCoachPlan()">✨ 이 기간 기준 훈련 계획 생성</button>
    ${list || '<div class="empty">저장된 계획 없음</div>'}
  `;
}

export async function generateCoachPlan() {
  setLoading(true);
  try {
    await api('POST', '/api/coach/plan', { days: coachDays });
    toast('훈련 계획이 생성되었습니다');
    await renderPlans();
  } catch(e) {
    toast('생성 실패: ' + e.message);
  } finally { setLoading(false); }
}

export async function toggleCoachFocusDone(reportId, focusIndex, done) {
  try {
    await api('PATCH', `/api/coach/reports/${reportId}/focus-done`, { focusIndex, done });
  } catch(e) { toast('저장 실패: ' + e.message); }
}

// ───── 대화 ─────
async function renderChats() {
  const pane = document.getElementById('coach-pane-chat'); if(!pane) return;
  try {
    coachChats = await api('GET', `/api/coach/reports?type=chat&limit=20`);
  } catch(e) { coachChats = []; }

  const list = coachChats.map(r => {
    const c = r.content || {};
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:11px;color:var(--text2)">${new Date(r.created_at).toLocaleString('ko-KR')}</span>
        <button class="del-btn" onclick="deleteCoachReport(${r.id},'chat')">삭제</button>
      </div>
      <div class="section-label">질문</div>
      <div class="history-sub" style="margin-bottom:8px">${nl2br(r.question || '')}</div>
      <div class="section-label">답변</div>
      <div class="history-sub" style="white-space:pre-wrap">${nl2br(c.answer || '')}</div>
    </div>`;
  }).join('');

  pane.innerHTML = `
    <div class="card">
      <div class="field">
        <label>질문</label>
        <textarea id="coach-chat-input" placeholder="예: 최근 스파링에서 반복되는 약점이 뭐야?" rows="3"></textarea>
      </div>
      <button class="btn-primary" onclick="askCoachChat()">✨ 질문하기</button>
    </div>
    ${list || '<div class="empty">이전 질의 없음</div>'}
  `;
}

export async function askCoachChat() {
  const inp = document.getElementById('coach-chat-input');
  const q = inp?.value.trim();
  if (!q) { toast('질문을 입력해주세요'); return; }
  setLoading(true);
  try {
    await api('POST', '/api/coach/chat', { question: q, days: coachDays });
    inp.value = '';
    toast('답변이 생성되었습니다');
    await renderChats();
  } catch(e) {
    toast('질문 실패: ' + e.message);
  } finally { setLoading(false); }
}
