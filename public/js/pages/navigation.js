// pages/navigation.js - 페이지 이동, 섹션 토글, 모달 닫기

import { PAGES } from '../core/constants.js';

// history ↔ analysis 토글 버튼에서 마지막으로 활성화된 페이지 기억
let _haCurrent = 'history';

// 토글 버튼 시각 상태 업데이트 (아이콘 + 라벨)
function _updateHaBtn(p) {
  const btn   = document.getElementById('nav-ha');
  const label = document.getElementById('nav-ha-label');
  const svgClass    = btn?.querySelector('.nav-ha-svg-class');
  const svgAnalysis = btn?.querySelector('.nav-ha-svg-analysis');
  if (!btn) return;

  const isHa = (p === 'history' || p === 'analysis');
  btn.classList.toggle('active', isHa);

  if (p === 'history') {
    label.textContent = '기술수업';
    svgClass.style.display    = '';
    svgAnalysis.style.display = 'none';
  } else if (p === 'analysis') {
    label.textContent = '기록';
    svgClass.style.display    = 'none';
    svgAnalysis.style.display = '';
  } else {
    // 다른 페이지가 active → 토글 버튼은 마지막 상태 유지
    label.textContent = _haCurrent === 'history' ? '기술수업' : '기록';
    svgClass.style.display    = _haCurrent === 'history' ? '' : 'none';
    svgAnalysis.style.display = _haCurrent === 'history' ? 'none' : '';
  }
}

export function showPage(p){
  document.getElementById('page-myinfo').classList.remove('active');
  document.getElementById('btn-topright-profile').classList.remove('active');

  PAGES.forEach(n=>{
    document.getElementById('page-'+n).classList.toggle('active', n===p);
    // history/analysis는 nav-ha 하나로 통합 — 개별 nav 버튼 없음
    if (n !== 'history' && n !== 'analysis') {
      document.getElementById('nav-'+n).classList.toggle('active', n===p);
    }
  });

  // history 또는 analysis가 열리면 마지막 상태 갱신
  if (p === 'history' || p === 'analysis') _haCurrent = p;
  _updateHaBtn(p);

  if(p==='analysis') window.renderAnalysis();
  if(p==='history')  window.renderHistory();
  if(p==='ref'){ window.renderRefFilters(); window.renderRef(); }
  if(p==='research') window.renderResearch();
  if(p==='coach')    window.renderCoach();
}

// history ↔ analysis 토글
export function toggleHistoryAnalysis(){
  const historyActive  = document.getElementById('page-history')?.classList.contains('active');
  const analysisActive = document.getElementById('page-analysis')?.classList.contains('active');

  if (historyActive) {
    showPage('analysis');
  } else if (analysisActive) {
    showPage('history');
  } else {
    // 다른 페이지에서 눌렀을 때 → 마지막 활성 페이지로 이동
    showPage(_haCurrent);
  }
}

export function toggleMyInfo(){
  const page = document.getElementById('page-myinfo');
  const btn  = document.getElementById('btn-topright-profile');
  const isOpen = page.classList.contains('active');
  if(isOpen){
    page.classList.remove('active');
    btn.classList.remove('active');
    // 이전 페이지(_haCurrent 포함) 복원 없이 그냥 비활성화만
  } else {
    PAGES.forEach(n=>{
      document.getElementById('page-'+n).classList.remove('active');
      if (n !== 'history' && n !== 'analysis') {
        document.getElementById('nav-'+n).classList.remove('active');
      }
    });
    document.getElementById('nav-ha')?.classList.remove('active');
    ['ref','research','clips'].forEach(n=>{
      document.getElementById('nav-'+n)?.classList.remove('active');
    });
    page.classList.add('active');
    btn.classList.add('active');
    window.renderMyInfo();
  }
}

export function toggleSection(id){
  const section = document.getElementById(id+'-section');
  const arrow   = document.getElementById(id+'-arrow');
  const isOpen  = section.style.display !== 'none';
  section.style.display = isOpen ? 'none' : 'block';
  arrow.textContent = isOpen ? '\u25B6' : '\u25BC';
}

export function closeModal(type){
  document.getElementById('modal-'+type).classList.remove('show');
}
