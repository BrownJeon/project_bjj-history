// pages/calendar.js - 캘린더 관련 함수들

import { CACHE } from '../core/cache.js';
import { api } from '../core/api.js';
import { toast, linkDisplay, parseMaybeJson, expandableNote } from '../utils/utils.js';
import { openNewClass, saveNewClass, openSparModal, deleteSparDay } from './class-modal.js';

let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDate = null;
let pickerYear = calYear;

export function calPrevMonth(){ calMonth--; if(calMonth < 0){ calMonth = 11; calYear--; } calSelectedDate = null; renderCalendar(); }
export function calNextMonth(){ calMonth++; if(calMonth > 11){ calMonth = 0; calYear++; } calSelectedDate = null; renderCalendar(); }

export function openMonthPicker(){
  pickerYear = calYear; renderMonthPicker();
  const title = document.getElementById('cal-month-title');
  const rect = title ? title.getBoundingClientRect() : null;
  const picker = document.getElementById('cal-picker');
  if(picker && rect) picker.style.top = (rect.bottom + 8) + 'px';
  document.getElementById('cal-picker-overlay').style.display = 'block';
  document.getElementById('cal-picker').style.display = 'block';
}
export function closeMonthPicker(){
  document.getElementById('cal-picker-overlay').style.display = 'none';
  document.getElementById('cal-picker').style.display = 'none';
}
export function pickerPrevYear(){ pickerYear--; renderMonthPicker(); }
export function pickerNextYear(){ pickerYear++; renderMonthPicker(); }
function renderMonthPicker(){
  document.getElementById('cal-picker-year').textContent = pickerYear + '년';
  const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  document.getElementById('cal-picker-months').innerHTML = months.map((m, i) =>
    `<button class="cal-picker-month-btn${pickerYear===calYear && i===calMonth ? ' active' : ''}" onclick="selectPickerMonth(${i})">${m}</button>`
  ).join('');
}
export function selectPickerMonth(month){ calYear = pickerYear; calMonth = month; calSelectedDate = null; closeMonthPicker(); renderCalendar(); }

function getCalData(dateStr){
  const c = CACHE.classes.find(c => {
    const start = (c.date||'').toString().slice(0,10);
    const end   = (c.date_end||c.date||'').toString().slice(0,10);
    return start <= dateStr && dateStr <= end;
  });
  if(!c) return null;
  const startDate = (c.date||'').toString().slice(0,10);
  const endDate   = (c.date_end||c.date||'').toString().slice(0,10);
  const isRange   = endDate > startDate;
  const trained   = Array.isArray(c.trained_dates) && c.trained_dates.includes(dateStr);
  return { c, isRange, trained, hasDrill: !!c.drill, hasSpar: !!(c.sessions && c.sessions.length > 0), isPeriodStart: dateStr === startDate, isPeriodEnd: dateStr === endDate };
}

export function renderCalendar(){
  const title = document.getElementById('cal-month-title');
  if(title) title.textContent = `${calYear}년 ${calMonth+1}월`;
  const todayD = new Date();
  const todayStr = `${todayD.getFullYear()}-${String(todayD.getMonth()+1).padStart(2,'0')}-${String(todayD.getDate()).padStart(2,'0')}`;
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const daysInPrev  = new Date(calYear, calMonth, 0).getDate();
  const cells = [];
  for(let i = firstDay - 1; i >= 0; i--){
    const d = daysInPrev - i;
    const m = calMonth === 0 ? 12 : calMonth;
    const y = calMonth === 0 ? calYear - 1 : calYear;
    const ds = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push(buildCalCell(d, ds, true, todayStr, getCalData(ds)));
  }
  for(let d = 1; d <= daysInMonth; d++){
    const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push(buildCalCell(d, ds, false, todayStr, getCalData(ds)));
  }
  const total = cells.length;
  const rows  = Math.ceil(total / 7);
  const fill  = rows * 7 - total;
  for(let d = 1; d <= fill; d++){
    const m = calMonth === 11 ? 1 : calMonth + 2;
    const y = calMonth === 11 ? calYear + 1 : calYear;
    const ds = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push(buildCalCell(d, ds, true, todayStr, null));
  }
  const grid = document.getElementById('cal-grid');
  if(grid) grid.innerHTML = cells.join('');
  renderMonthSummary();
}

const HISTORY_PREVIEW_MAX = 4;

function renderMonthSummary(){
  const el = document.getElementById('cal-month-summary'); if(!el) return;
  const monthStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}`;
  const classes = (CACHE.classes || []).filter(c => (c.date||'').slice(0,7) === monthStr);
  if(classes.length === 0){ el.innerHTML = `<div class="cal-summary-empty">이번 달 기록 없음</div>`; return; }
  const classCount = classes.length;
  const trainedDayCount = classes.reduce((n, c) => n + (Array.isArray(c.trained_dates) ? c.trained_dates.length : 0), 0);
  const allSessions = classes.flatMap(c => c.sessions || []);
  const sessionCount = allSessions.length;
  const tapGot  = allSessions.reduce((s, ss) => s + (ss.tap_got  || 0), 0);
  const tapGave = allSessions.reduce((s, ss) => s + (ss.tap_gave || 0), 0);
  const totalMin = allSessions.reduce((s, ss) => s + (ss.time_min || 0), 0);
  const techSet = new Set();
  classes.forEach(c => { if(c.drill) parseMaybeJson(c.drill.tech).forEach(t => t && techSet.add(t)); });
  const successSet = new Set();
  allSessions.forEach(ss => {
    parseMaybeJson(ss.success).forEach(x => {
      const name = typeof x === 'string' ? x : x?.name;
      const ok   = typeof x === 'string' ? true : x?.success !== false;
      if(name && ok) successSet.add(name);
    });
  });
  const daysLabel = trainedDayCount > 0 ? ` · 수련 ${trainedDayCount}일` : '';

  function tagPreview(arr, tagFn) {
    const preview = arr.slice(0, HISTORY_PREVIEW_MAX).map(tagFn).filter(Boolean).join('');
    const more = arr.length > HISTORY_PREVIEW_MAX
      ? `<span class="tag" style="color:var(--text2);background:var(--surface2);font-size:11px">+${arr.length - HISTORY_PREVIEW_MAX}</span>`
      : '';
    return preview + more;
  }

  const arrow = `<span class="cal-summary-arrow">›</span>`;
  let html = `<div class="cal-summary-card"><div class="cal-summary-section-title">이번 달</div>
    <div class="cal-summary-row cal-summary-clickable" onclick="openHistorySection('class')">
      <span class="cal-summary-key">수업</span>
      <span class="cal-summary-val">${classCount}회${daysLabel} ${arrow}</span>
    </div>`;
  if(sessionCount > 0){
    let sparParts = [`${sessionCount}세션`];
    sparParts.push(`<span style="color:var(--red)">\u2193${tapGot}</span> <span style="color:var(--green)">\u2191${tapGave}</span>`);
    if(totalMin > 0) sparParts.push(`${totalMin}분`);
    html += `<div class="cal-summary-row cal-summary-clickable" onclick="openHistorySection('spar')">
      <span class="cal-summary-key">스파링</span>
      <span class="cal-summary-val">${sparParts.join(' · ')} ${arrow}</span>
    </div>`;
  }
  if(techSet.size > 0){
    const tags = tagPreview([...techSet], t => `<span class="tag tag-tech">${t}</span>`);
    html += `<div class="cal-summary-tag-row cal-summary-clickable" onclick="openHistorySection('tech')">
      <span class="cal-summary-key">배운 기술</span><div class="cal-summary-tags">${tags}</div>
    </div>`;
  }
  const chainIdSet = new Set();
  classes.forEach(c => { if(c.drill) parseMaybeJson(c.drill.chain_ids).forEach(id => id && chainIdSet.add(Number(id))); });
  if(chainIdSet.size > 0){
    const chainTags = tagPreview([...chainIdSet], id => { const ch = CACHE.chains.find(x => x.id === id); return ch ? `<span class="tag tag-spar">${ch.name}</span>` : ''; });
    if(chainTags) html += `<div class="cal-summary-tag-row cal-summary-clickable" onclick="openHistorySection('chain')">
      <span class="cal-summary-key">연습 체인</span><div class="cal-summary-tags">${chainTags}</div>
    </div>`;
  }
  if(successSet.size > 0){
    const tags = tagPreview([...successSet], t => `<span class="tag tag-ok">${t}</span>`);
    html += `<div class="cal-summary-tag-row cal-summary-clickable" onclick="openHistorySection('success')">
      <span class="cal-summary-key">성공 기술</span><div class="cal-summary-tags">${tags}</div>
    </div>`;
  }
  html += `</div>`;
  el.innerHTML = html;
}

export function openHistorySection(type) {
  const monthStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}`;
  const classes = (CACHE.classes || []).filter(c => (c.date||'').slice(0,7) === monthStr);
  const allSessions = classes.flatMap(c => c.sessions || []);

  let title = '';
  let html = '';

  if (type === 'class') {
    title = '수업 목록';
    if (!classes.length) { html = '<div class="empty">수업 기록이 없습니다</div>'; }
    else {
      const fmt = s => { const p = s.split('-'); return `${+p[1]}/${+p[2]}`; };
      html = classes.map(c => {
        const start = (c.date||'').toString().slice(0,10);
        const end   = (c.date_end||c.date||'').toString().slice(0,10);
        const isRange = end > start;
        const dateLabel = isRange ? `${fmt(start)} ~ ${fmt(end)}` : fmt(start);
        const sparCount = (c.spar_days||[]).length;
        return `<div class="history-list-item history-list-item-clickable" onclick="closeHistoryListModal();selectCalDate('${start}')">
          <div style="font-weight:600;font-size:14px">${c.theme||'수업'}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">${dateLabel}${sparCount ? ` · 스파링 ${sparCount}일` : ''}</div>
        </div>`;
      }).join('');
    }
  } else if (type === 'spar') {
    title = '스파링 기록';
    const sparDaysAll = classes.flatMap(c => (c.spar_days||[]).map(sd => ({ ...sd, classTheme: c.theme })));
    if (!sparDaysAll.length) { html = '<div class="empty">스파링 기록이 없습니다</div>'; }
    else {
      const fmt = s => { const p = s.split('-'); return `${+p[1]}/${+p[2]}`; };
      html = sparDaysAll.map(sd => {
        const sdDate = (sd.date||'').toString().slice(0,10);
        const sessions = sd.sessions || [];
        const tapGot  = sessions.reduce((s,x) => s+(x.tap_got||0), 0);
        const tapGave = sessions.reduce((s,x) => s+(x.tap_gave||0), 0);
        const totalMin = sessions.reduce((s,x) => s+(x.time_min||0), 0);
        return `<div class="history-list-item">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600;font-size:14px">${fmt(sdDate)}</span>
            <span style="font-size:12px;color:var(--text2)">${sessions.length}세션${totalMin ? ` · ${totalMin}분` : ''}</span>
          </div>
          <div style="font-size:13px;margin-top:3px">
            <span style="color:var(--red)">\u2193${tapGot}</span> · <span style="color:var(--green)">\u2191${tapGave}</span>
            ${sd.classTheme ? `<span style="color:var(--text2);margin-left:6px;font-size:12px">${sd.classTheme}</span>` : ''}
          </div>
          ${sd.day_note ? expandableNote(sd.day_note, 'history-sub', 'margin-top:3px') : ''}
        </div>`;
      }).join('');
    }
  } else if (type === 'tech') {
    title = '배운 기술';
    const techSet = new Set();
    classes.forEach(c => { if(c.drill) parseMaybeJson(c.drill.tech).forEach(t => t && techSet.add(t)); });
    if (!techSet.size) { html = '<div class="empty">배운 기술이 없습니다</div>'; }
    else {
      const tags = [...techSet].map(t => {
        const found = (CACHE.techniques||[]).find(x => x.name === t);
        return found
          ? `<span class="tag tag-tech" style="cursor:pointer" onclick="openTechDetail(${found.id});closeHistoryListModal()">${t}</span>`
          : `<span class="tag tag-tech">${t}</span>`;
      }).join(' ');
      html = `<div style="padding:8px 0;line-height:2.2">${tags}</div>`;
    }
  } else if (type === 'chain') {
    title = '연습 체인';
    const chainIdSet = new Set();
    classes.forEach(c => { if(c.drill) parseMaybeJson(c.drill.chain_ids).forEach(id => id && chainIdSet.add(Number(id))); });
    if (!chainIdSet.size) { html = '<div class="empty">연습 체인이 없습니다</div>'; }
    else {
      const tags = [...chainIdSet].map(id => {
        const ch = (CACHE.chains||[]).find(x => x.id === id);
        return ch ? `<span class="tag tag-spar" style="cursor:pointer" onclick="openChainDetail(${id});closeHistoryListModal()">${ch.name}</span>` : '';
      }).filter(Boolean).join(' ');
      html = `<div style="padding:8px 0;line-height:2.2">${tags}</div>`;
    }
  } else if (type === 'success') {
    title = '성공 기술';
    const successSet = new Set();
    allSessions.forEach(ss => {
      parseMaybeJson(ss.success).forEach(x => {
        const name = typeof x === 'string' ? x : x?.name;
        const ok   = typeof x === 'string' ? true : x?.success !== false;
        if(name && ok) successSet.add(name);
      });
    });
    if (!successSet.size) { html = '<div class="empty">성공 기술이 없습니다</div>'; }
    else {
      const tags = [...successSet].map(t => {
        const found = (CACHE.techniques||[]).find(x => x.name === t);
        return found
          ? `<span class="tag tag-ok" style="cursor:pointer" onclick="openTechDetail(${found.id});closeHistoryListModal()">${t}</span>`
          : `<span class="tag tag-ok">${t}</span>`;
      }).join(' ');
      html = `<div style="padding:8px 0;line-height:2.2">${tags}</div>`;
    }
  }

  document.getElementById('history-list-title').textContent = title;
  document.getElementById('history-list-body').innerHTML = html;
  document.getElementById('modal-history-list').classList.add('show');
}

export function closeHistoryListModal() {
  document.getElementById('modal-history-list').classList.remove('show');
}

function buildCalCell(dayNum, dateStr, otherMonth, todayStr, data){
  const cls = ['cal-cell'];
  if(otherMonth) cls.push('cal-other-month');
  if(dateStr === todayStr) cls.push('cal-today');
  if(dateStr === calSelectedDate) cls.push('cal-selected');
  if(data && !otherMonth){
    if(data.isRange){ cls.push('cal-in-period'); if(data.isPeriodStart) cls.push('cal-period-start'); if(data.isPeriodEnd) cls.push('cal-period-end'); if(data.trained) cls.push('cal-trained'); }
    else { if(data.hasDrill || data.hasSpar) cls.push('cal-trained'); }
  }
  const showDots = data && !otherMonth && (!data.isRange || data.isPeriodStart);
  const dots = showDots ? [data.hasDrill ? '<span class="cal-dot cal-dot-drill"></span>' : '', data.hasSpar ? '<span class="cal-dot cal-dot-spar"></span>' : ''].join('') : '';
  return `<div class="${cls.join(' ')}" onclick="selectCalDate('${dateStr}')"><span class="cal-cell-num">${dayNum}</span>${dots ? `<div class="cal-dots">${dots}</div>` : ''}</div>`;
}

export function selectCalDate(dateStr){ calSelectedDate = dateStr; renderCalendar(); openCalSheet(dateStr); }

export function openCalSheet(dateStr){
  const titleEl = document.getElementById('cal-sheet-title');
  if(titleEl) titleEl.textContent = formatCalDate(dateStr);
  renderCalDetail(dateStr);
  document.getElementById('cal-sheet-overlay').classList.add('show');
  document.getElementById('cal-sheet').classList.add('show');
}
export function closeCalSheet(){
  document.getElementById('cal-sheet-overlay').classList.remove('show');
  document.getElementById('cal-sheet').classList.remove('show');
}
export function calAddClass(dateStr){ openNewClass(dateStr); }

export async function toggleTrainedDate(classId, dateStr){
  try {
    const r = await api('PATCH', `/api/classes/${classId}/toggle-date`, { date: dateStr });
    const c = CACHE.classes.find(x => x.id == classId);
    if(c) c.trained_dates = r.trained_dates;
    renderCalendar(); renderCalDetail(dateStr);
    toast(r.trained_dates.includes(dateStr) ? '수련 기록 추가!' : '수련 기록 해제');
  } catch(e){ toast('오류: ' + e.message); }
}

export { openNewClass, saveNewClass, openSparModal, deleteSparDay };

export function renderCalDetail(dateStr){
  const el = document.getElementById('cal-sheet-body'); if(!el) return;
  const data = getCalData(dateStr);
  if(!data){ el.innerHTML = `<div class="cal-detail-empty">이 날짜의 기록이 없습니다</div><div style="margin-top:10px;display:flex;flex-direction:column;gap:8px"><button class="btn-primary" onclick="calAddClass('${dateStr}')">+ 수업 기간 등록</button></div>`; return; }
  el.innerHTML = buildCalDetailHTML(dateStr, data);
}

function formatCalDate(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일','월','화','수','목','금','토'];
  return `${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function buildCalDetailHTML(dateStr, data){
  const { c, isRange, trained, hasDrill } = data;
  const drill = c.drill; const sparDays = c.spar_days || [];
  let html = '';
  if(isRange){
    const start = (c.date||'').toString().slice(0,10); const end = (c.date_end||'').toString().slice(0,10);
    const fmt = s => { const p=s.split('-'); return `${+p[1]}/${+p[2]}`; };
    const dayN = Math.floor((new Date(dateStr)-new Date(start))/(86400000))+1;
    const totalDays = Math.floor((new Date(end)-new Date(start))/(86400000))+1;
    html += `<div class="period-banner"><div class="period-banner-body"><div class="period-banner-clickable" onclick="openEditClass(${c.id})" title="클릭하여 상세/편집"><div class="period-banner-theme">${c.theme||'수업 기간'} <span style="color:var(--text2);font-size:11px">›</span></div><div class="period-banner-range">${fmt(start)} ~ ${fmt(end)} · ${dayN}/${totalDays}일</div></div></div><div style="display:flex;gap:6px"><button class="edit-btn" onclick="openEditClass(${c.id})">수정</button><button class="del-btn" onclick="deleteClass(${c.id})">삭제</button></div></div>`;
  }
  // 수련 체크 버튼 — 단일일자/기간 모두에서 표시
  {
    const trainedStyle = trained ? 'background:var(--green);color:#fff;border-color:var(--green)' : '';
    const trainedLabel = trained ? '&#10003; 오늘 수련했어요' : '+ 오늘 수련 체크';
    html += `<button class="btn-primary" style="margin-bottom:14px;${trainedStyle}" onclick="toggleTrainedDate(${c.id},'${dateStr}')">${trainedLabel}</button>`;
  }
  if(drill){
    const stars = drill.stars ? '&#9733;'.repeat(drill.stars) : '';
    const techs = parseMaybeJson(drill.tech).map(t => { const found = CACHE.techniques.find(x => x.name === t); return found ? `<span class="tag tag-tech" style="cursor:pointer" onclick="openTechDetail(${found.id})">${t}</span>` : `<span class="tag tag-tech">${t}</span>`; }).join('');
    const details = parseMaybeJson(drill.detail).map(t=>`<span class="tag tag-detail">${t}</span>`).join('');
    const links = parseMaybeJson(drill.links).map(l=>{ const {url, label} = linkDisplay(l); return `<a href="${url}" class="link-badge">${label}</a>`; }).join('');
    const chains = parseMaybeJson(drill.chain_ids).map(id => { const ch = CACHE.chains.find(x => x.id === Number(id)); return ch ? `<span class="tag tag-spar" style="cursor:pointer" onclick="openChainDetail(${ch.id})">${ch.name}</span>` : ''; }).filter(Boolean).join('');
    html += `<div class="cal-section-title${!html?' cal-section-first':''}">기술 수업</div>
      <div style="font-size:12px;font-weight:500;color:var(--green-text);background:var(--green-bg);display:inline-block;padding:2px 8px;border-radius:100px;margin-bottom:4px">${drill.pos||''}${stars?' <span style="color:var(--amber)">'+stars+'</span>':''}</div>
      ${techs?`<div style="margin-top:3px">${techs}</div>`:''}
      ${chains?`<div style="margin-top:3px">${chains}</div>`:''}
      ${details?`<div style="margin-top:3px">${details}</div>`:''}
      ${links?`<div style="margin-top:4px">${links}</div>`:''}
      ${drill.note ? expandableNote(drill.note, 'history-sub', 'margin-top:3px') : ''}`;
  }
  // 스파링 섹션 (날짜별)
  {
    const sparDaysHtml = sparDays.map(sd => {
      const sdDate = (sd.date || '').toString().slice(0, 10);
      const fmt = s => { const p = s.split('-'); return `${+p[1]}/${+p[2]}`; };
      const sessHtml = (sd.sessions || []).map((s, si) => {
        const tGot = s.tap_got || 0; const tGave = s.tap_gave || 0;
        const tapStr = `<span style="color:var(--red)">${tGot}</span>:<span style="color:var(--green)">${tGave}</span>`;
        const min = s.time_min ? s.time_min + '분' : '';
        const opp = s.opponent ? ` · ${s.opponent}` : '';
        const attempts = parseMaybeJson(s.success).map(x => {
          const name = typeof x === 'string' ? x : (x?.name || '');
          const okFlag = typeof x === 'string' ? true : (x?.success !== false);
          if(!name) return '';
          const found = (CACHE.techniques||[]).find(t=>t.name===name);
          const cls   = okFlag ? 'tag-ok' : 'tag-tried';
          const click = (found && okFlag) ? ` style="cursor:pointer" onclick="openTechDetail(${found.id})"` : '';
          return `<span class="tag ${cls}"${click}>${name}</span>`;
        }).filter(Boolean).join('');
        const bad = parseMaybeJson(s.weak).map(t => `<span class="tag tag-bad">${t}</span>`).join('');
        const legacyPosScore = parseInt(s.position_score ?? s.positionScore) || 0;
        const positions = parseMaybeJson(s.positions).map(p =>
          typeof p === 'string'
            ? { name: p, score: legacyPosScore }
            : { name: p.name || '', score: parseInt(p.score) || 0 }
        );
        let posLine = '';
        if (positions.length) {
          const posTags = positions.map(p => {
            const sc = p.score || 0;
            const stars = sc ? ` <span style="color:var(--amber);font-size:10px">${'★'.repeat(sc)}</span>` : '';
            return `<span class="tag tag-detail">${p.name}${stars}</span>`;
          }).join('');
          posLine = `<div style="margin-top:3px"><span style="font-size:11px;color:var(--text2)">점유</span> ${posTags}</div>`;
        }
        return `<div style="font-size:13px;margin-top:3px"><span style="color:var(--text2)">세션${si+1}</span> ${s.level||''}${opp} · ${tapStr}${min?' · '+min:''}${posLine}${attempts||bad?`<div style="margin-top:3px">${attempts}${bad}</div>`:''}${s.note ? expandableNote(s.note, 'history-sub', 'margin-top:2px') : ''}</div>`;
      }).join('');
      return `<div style="margin-top:8px;padding:8px 10px;background:var(--bg2);border-radius:8px;position:relative">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:12px;font-weight:600;color:var(--text2)">${fmt(sdDate)}</span>
          <div style="display:flex;gap:4px">
            <button class="edit-btn" onclick="openSparModal(${c.id},${sd.id})" style="font-size:11px;padding:2px 7px">수정</button>
            <button class="del-btn" onclick="deleteSparDay(${c.id},${sd.id})" style="font-size:11px;padding:2px 7px">삭제</button>
          </div>
        </div>
        ${sessHtml}
        ${sd.day_note ? expandableNote(sd.day_note, 'history-sub', 'margin-top:4px') : ''}
      </div>`;
    }).join('');
    html += `<div class="cal-section-title">스파링</div>${sparDaysHtml}
      <button class="add-session-btn" style="margin-top:6px;width:100%" onclick="openSparModal(${c.id})">+ 스파링 추가</button>`;
  }
  if(!isRange){
    html += `<div class="item-actions" style="margin-top:12px;display:flex;gap:6px;justify-content:flex-end"><button class="edit-btn" onclick="openEditClass(${c.id})">수정</button><button class="del-btn" onclick="deleteClass(${c.id})">삭제</button></div>`;
  }
  if(c.note && !isRange){
    html += expandableNote(c.note, 'history-sub', 'margin-top:10px;padding-top:8px;border-top:0.5px solid var(--border)');
  }
  return html;
}

export function renderHistory(){
  renderCalendar();
  const sheet = document.getElementById('cal-sheet');
  if(sheet && sheet.classList.contains('show') && calSelectedDate) renderCalDetail(calSelectedDate);
}
