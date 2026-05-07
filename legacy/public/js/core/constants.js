// core/constants.js - 상수 정의

export const PAGES = ['history','ref','research','analysis','clips','coach'];

export const BELT_COLORS = { white:'#e5e5e5', blue:'#1a6bbf', purple:'#7b4f9e', brown:'#8b4513', black:'#1c1c1c' };
export const BELT_NAMES  = { white:'화이트', blue:'파랑', purple:'보라', brown:'브라운', black:'블랙' };

export const POS_STANDARD      = ['가드 (Guard)','패스 (Pass)','마운트 (Mount)','백 (Back)','사이드 컨트롤','하프가드','스탠딩 / 테이크다운'];
export const POS_LIST          = [...POS_STANDARD, '기타'];
export const CATEGORY_STANDARD = ['관절기','초크','스윕','테이크다운','포지셔닝'];
export const CATEGORY_LIST     = [...CATEGORY_STANDARD, '기타'];

export const CATEGORY_STYLE = {
  '관절기': 'background:#FFF0E6;color:#C05A00',
  '초크':   'background:#F0F0FF;color:#3A2DAA',
  '스윕':   'background:var(--green-bg);color:var(--green-text)',
  '테이크다운': 'background:var(--blue-bg);color:var(--blue-text)',
  '포지셔닝':   'background:var(--bg3);color:var(--text2)',
  '기타':   'background:var(--bg3);color:var(--text2)',
};
