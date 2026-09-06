import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { useUI } from '../contexts/UIContext';
import { applyToggle, getStorage, isPairActive, visibleSide } from '../utils/toggleNav';

/**
 * 하단 내비의 "다시 누르면 전환되는" 탭 하나.
 * 짝마다 다른 것은 pair 설정(../utils/toggleNav.js)으로만 표현한다 — 여기에 짝별 분기를 넣지 마라.
 *
 * NavLink가 아니라 <button>이므로 isActive를 직접 계산한다(빠뜨리면 활성 표시가 조용히 죽는다).
 *
 * @param {object}  pair     TOGGLE_PAIRS의 한 항목
 * @param {object}  memo     Layout이 소유한 토스트 메모(createToggleMemo) — 저장소가 막힌
 *                           브라우저에서만 쓰여 "마운트당 토스트 1회"를 지킨다
 * @param {string}  dotColor 아이콘 우상단 점 색 CSS 값 (기본 앰버)
 */
export default function ToggleTab({ pair, memo, dotColor = 'var(--amber)' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useUI();

  const active = isPairActive(pair, location.pathname);
  // 라벨·아이콘은 "지금 어느 쪽에 있는지"를 표시한다. 짝 밖에 있으면 앞쪽.
  const shown = visibleSide(pair, location.pathname);

  function handleClick() {
    const { target, toast } = applyToggle(pair, location.pathname, getStorage(), memo);
    if (toast) showToast(toast);
    navigate(target);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-current={active ? 'page' : undefined}
      className={`nav-item${active ? ' active' : ''}`}
      style={{ background: 'none', border: 'none', font: 'inherit' }}
    >
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <Icon
          name={shown.icon}
          size={21}
          color={active ? 'var(--accent)' : 'var(--text3)'}
          filled={active}
        />
        <span style={{
          position: 'absolute', top: -2, right: -2, width: 6, height: 6,
          borderRadius: '50%', background: dotColor,
        }} />
      </span>
      <span>{shown.label}</span>
    </button>
  );
}
