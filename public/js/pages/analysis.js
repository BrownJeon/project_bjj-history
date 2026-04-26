// pages/analysis.js - 분석 함수들

import { CACHE } from '../core/cache.js';
import { parseMaybeJson, filterPeriod } from '../utils/utils.js';

let techTimelineView = 'graph';

export function renderAnalysis(){
  const days     = parseInt(document.getElementById('a-period').value);
  const classes  = filterPeriod(CACHE.classes, days);
  const drills   = classes.filter(c=>c.drill).map(c=>c.drill);
  const sessions = classes.flatMap(c=>c.sessions||[]);
  document.getElementById('am-drill').textContent = drills.length;
  document.getElementById('am-spar').textContent  = sessions.length;
  document.getElementById('am-got').textContent   = sessions.reduce((a,s)=>a+(parseInt(s.tap_got ??s.tapGot) ||0),0);
  document.getElementById('am-gave').textContent  = sessions.reduce((a,s)=>a+(parseInt(s.tap_gave??s.tapGave)||0),0);
  const posMap={};
  drills.forEach(d=>{ const k=d.pos||'기타'; posMap[k]=(posMap[k]||0)+1; });
  renderBars('a-pos-chart', posMap, 'var(--green)');
  const techMap={};
  drills.forEach(d=> parseMaybeJson(d.tech).forEach(t=>{ techMap[t]=(techMap[t]||0)+1; }));
  renderBars('a-tech-chart', techMap, 'var(--blue)');
  const sucMap={};
  sessions.forEach(s=> parseMaybeJson(s.success).forEach(x=>{
    const name = typeof x === 'string' ? x : x?.name;
    const ok   = typeof x === 'string' ? true : x?.success !== false;
    if(name && ok) sucMap[name] = (sucMap[name]||0)+1;
  }));
  renderBars('a-success-chart', sucMap, 'var(--green)');
  const wkMap={};
  sessions.forEach(s=> parseMaybeJson(s.weak).forEach(t=>{ wkMap[t]=(wkMap[t]||0)+1; }));
  renderBars('a-weak-chart', wkMap, 'var(--red)');
  renderTechTimeline(classes);
}

export function setTechView(v){
  techTimelineView = v;
  document.getElementById('tech-btn-graph').classList.toggle('active', v==='graph');
  document.getElementById('tech-btn-table').classList.toggle('active', v==='table');
  const days = parseInt(document.getElementById('a-period').value);
  renderTechTimeline(filterPeriod(CACHE.classes, days));
}

function getGroupKey(dateStr, groupBy){
  const d = new Date(dateStr + 'T00:00:00');
  if(groupBy === 'day') return `${d.getMonth()+1}/${d.getDate()}`;
  if(groupBy === 'week'){
    const day = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - (day===0 ? 6 : day-1));
    return `${mon.getMonth()+1}/${mon.getDate()}주`;
  }
  return `${d.getMonth()+1}월`;
}

function renderTechTimeline(classes){
  const el = document.getElementById('a-tech-timeline');
  if(!el) return;
  const sorted = [...classes].sort((a,b)=> a.date > b.date ? 1 : -1);
  const groupBy = sorted.length <= 10 ? 'day' : sorted.length <= 30 ? 'week' : 'month';
  const allKeys = sorted.map(c => getGroupKey((c.date||'').slice(0,10), groupBy));
  const groupKeys = [...new Set(allKeys)].slice(-12);
  const techMap = {};
  sorted.forEach(c => {
    const gk = getGroupKey((c.date||'').slice(0,10), groupBy);
    if(!groupKeys.includes(gk)) return;
    const drillTechs = c.drill ? parseMaybeJson(c.drill.tech) : [];
    const sparTechs  = (c.sessions||[]).flatMap(s => parseMaybeJson(s.success).map(x =>
      typeof x === 'string' ? x : (x?.success !== false ? x?.name : '')
    ).filter(Boolean));
    [...new Set([...drillTechs, ...sparTechs])].forEach(tech => {
      if(!tech) return;
      if(!techMap[tech]) techMap[tech] = { groups:{}, drillCount:0, sparCount:0, firstDate:'', lastDate:'' };
      if(!techMap[tech].groups[gk]) techMap[tech].groups[gk] = { drill:false, spar:false };
    });
    drillTechs.forEach(t => { if(t && techMap[t]){ techMap[t].groups[gk].drill=true; techMap[t].drillCount++; } });
    sparTechs.forEach(t => { if(t && techMap[t]){ techMap[t].groups[gk].spar=true; techMap[t].sparCount++; } });
  });
  sorted.forEach(c => {
    const date = (c.date||'').slice(0,10);
    const drillTechs = c.drill ? parseMaybeJson(c.drill.tech) : [];
    const sparTechs  = (c.sessions||[]).flatMap(s => parseMaybeJson(s.success).map(x =>
      typeof x === 'string' ? x : (x?.success !== false ? x?.name : '')
    ).filter(Boolean));
    [...new Set([...drillTechs, ...sparTechs])].forEach(t => {
      if(!t || !techMap[t]) return;
      if(!techMap[t].firstDate || date < techMap[t].firstDate) techMap[t].firstDate = date;
      if(!techMap[t].lastDate  || date > techMap[t].lastDate)  techMap[t].lastDate  = date;
    });
  });
  const topTechs = Object.entries(techMap)
    .map(([name, d]) => ({ name, ...d, total: d.drillCount + d.sparCount }))
    .sort((a,b) => b.total - a.total)
    .slice(0, 10);
  if(!topTechs.length){ el.innerHTML = '<div class="empty">데이터 없음</div>'; return; }
  const todayStr = new Date().toISOString().slice(0,10);
  el.innerHTML = techTimelineView === 'graph'
    ? buildTechTimelineHTML(topTechs, groupKeys)
    : buildTechTableHTML(topTechs, todayStr);
}

function buildTechTimelineHTML(topTechs, groupKeys){
  const nameW = 72; const metaW = 48;
  const hdrCols = groupKeys.map(k => `<div class="tl-date-col-hdr">${k}</div>`).join('');
  const rows = topTechs.map(t => {
    const dots = groupKeys.map(gk => {
      const g = t.groups[gk];
      let cls = 'tl-dot-none';
      if(g){ cls = (g.drill && g.spar) ? 'tl-dot-both' : g.drill ? 'tl-dot-drill' : 'tl-dot-spar'; }
      return `<div class="tl-dot ${cls}"><div class="tl-dot-inner"></div></div>`;
    }).join('');
    const meta = `${t.drillCount+t.sparCount}회`;
    const name = t.name.length > 8 ? t.name.slice(0,8)+'\u2026' : t.name;
    return `<div class="tl-row">
      <div class="tl-name" style="width:${nameW}px">${name}</div>
      <div class="tl-dots">${dots}</div>
      <div class="tl-meta" style="width:${metaW}px">${meta}</div>
    </div>`;
  }).join('');
  const legend = `<div class="tl-legend">
    <div class="tl-legend-item"><div class="tl-legend-dot" style="background:var(--green)"></div>수업</div>
    <div class="tl-legend-item"><div class="tl-legend-dot" style="background:var(--blue)"></div>스파링</div>
    <div class="tl-legend-item"><div class="tl-legend-dot" style="background:var(--green);opacity:0.4"></div>둘 다</div>
  </div>`;
  return `<div class="tl-header">
    <div class="tl-label-col" style="width:${nameW}px"></div>
    <div class="tl-date-cols">${hdrCols}</div>
    <div style="width:${metaW}px"></div>
  </div>${rows}${legend}`;
}

function buildTechTableHTML(topTechs, todayStr){
  const rows = topTechs.map(t => {
    const diffDays = t.lastDate ? Math.round((new Date(todayStr) - new Date(t.lastDate + 'T00:00:00')) / 86400000) : null;
    const gapLabel = diffDays === null ? '-' : diffDays === 0 ? '오늘' : `${diffDays}일 전`;
    const gapClass = diffDays !== null && diffDays <= 7 ? 'gap-recent' : '';
    const first = t.firstDate ? t.firstDate.slice(5).replace('-','/') : '-';
    const last  = t.lastDate  ? t.lastDate.slice(5).replace('-','/')  : '-';
    return `<tr><td>${t.name}</td><td class="num-col">${t.drillCount}</td><td class="num-col">${t.sparCount}</td><td>${first}</td><td>${last}</td><td><span class="gap-badge ${gapClass}">${gapLabel}</span></td></tr>`;
  }).join('');
  return `<table class="tech-table"><thead><tr><th>기술명</th><th class="num-col">수업</th><th class="num-col">스파링</th><th>첫사용</th><th>마지막</th><th>간격</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderBars(id, map, color, maxVal, maxItems = 3){
  const el = document.getElementById(id);
  const all = Object.entries(map).sort((a,b)=>b[1]-a[1]);
  const sorted = all.slice(0, maxItems);
  if(!sorted.length){ el.innerHTML='<div class="empty">데이터 없음</div>'; return; }
  const max = maxVal||Math.max(...all.map(e=>e[1]))||1;
  const moreCount = all.length - maxItems;
  const moreHint = moreCount > 0 ? `<div style="font-size:11px;color:var(--text2);text-align:right;margin-top:2px">+${moreCount}개 더보기</div>` : '';
  el.innerHTML = sorted.map(([k,v])=>`
    <div class="bar-row">
      <div class="bar-label">${k.length>11?k.slice(0,11)+'\u2026':k}</div>
      <div class="bar-wrap"><div class="bar-fill" style="width:${Math.round(v/max*100)}%;background:${color}"></div></div>
      <div class="bar-val">${maxVal?v.toFixed(1):v}</div>
    </div>`).join('') + moreHint;
}

export function openAnalysisSection(type) {
  const days    = parseInt(document.getElementById('a-period').value);
  const classes = filterPeriod(CACHE.classes, days);
  const drills  = classes.filter(c => c.drill).map(c => c.drill);
  const sessions = classes.flatMap(c => c.sessions || []);

  let title = '';
  let map   = {};
  let color = 'var(--blue)';

  if (type === 'pos') {
    title = '포지션별 기술 훈련';
    color = 'var(--green)';
    drills.forEach(d => { const k = d.pos || '기타'; map[k] = (map[k] || 0) + 1; });
  } else if (type === 'tech') {
    title = '기술명 TOP';
    color = 'var(--blue)';
    drills.forEach(d => parseMaybeJson(d.tech).forEach(t => { if(t) map[t] = (map[t] || 0) + 1; }));
  } else if (type === 'success') {
    title = '스파링 성공 기술 TOP';
    color = 'var(--green)';
    sessions.forEach(s => parseMaybeJson(s.success).forEach(t => { if(t) map[t] = (map[t] || 0) + 1; }));
  } else if (type === 'weak') {
    title = '주요 약점 / 개선 필요';
    color = 'var(--red)';
    sessions.forEach(s => parseMaybeJson(s.weak).forEach(t => { if(t) map[t] = (map[t] || 0) + 1; }));
  }

  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  let html = '';
  if (!sorted.length) {
    html = '<div class="empty">데이터 없음</div>';
  } else {
    const max = Math.max(...sorted.map(e => e[1])) || 1;
    html = sorted.map(([k, v]) => `
      <div class="bar-row">
        <div class="bar-label" style="min-width:100px">${k.length > 14 ? k.slice(0, 14) + '\u2026' : k}</div>
        <div class="bar-wrap"><div class="bar-fill" style="width:${Math.round(v/max*100)}%;background:${color}"></div></div>
        <div class="bar-val">${v}</div>
      </div>`).join('');
  }

  document.getElementById('analysis-modal-title').textContent = title;
  document.getElementById('analysis-modal-body').innerHTML = html;
  document.getElementById('modal-analysis-list').classList.add('show');
}

export function closeAnalysisModal() {
  document.getElementById('modal-analysis-list').classList.remove('show');
}
