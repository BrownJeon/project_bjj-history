import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { useUI } from '../contexts/UIContext';
import { applyToggle, getStorage, isPairActive, resolveSide, visibleSide } from '../utils/toggleNav';

/**
 * 하단 내비의 "다시 누르면 전환되는" 탭 하나.
 * 짝마다 다른 것은 pair 설정(../utils/toggleNav.js)으로만 표현한다 — 여기에 짝별 분기를 넣지 마라.
 *
 * NavLink가 아니라 <button>이므로 isActive를 직접 계산한다(빠뜨리면 활성 표시가 조용히 죽는다).
 *
 * 점이 두 개의 서로 다른 것을 말한다(task-042에서 **자리로 분리**했다):
 *   ① 라벨 **아래**의 작은 점 2개 = "지금 앞/뒤 중 어디에 있나" — 활성일 때만. 왼쪽이 front.
 *   ② 아이콘 **우상단** 점 = 알림 배지 — `alert` 가 true 일 때만.
 * 예전에는 ②의 점 하나가 "이 탭은 토글이다"(앰버)와 "새 코치 리포트"(초록)를 색으로 겸했다.
 * 색 하나에 두 의미를 싣는 구조였고, 그래서 위치 정보를 줄 수 없었다.
 *
 * @param {object}  pair  TOGGLE_PAIRS의 한 항목
 * @param {object}  memo  Layout이 소유한 토스트 메모(createToggleMemo) — 저장소가 막힌
 *                        브라우저에서만 쓰여 "마운트당 토스트 1회"를 지킨다
 * @param {boolean} alert 알림 배지를 띄울지(현재 유일한 호출부 = 안 본 코치 리포트). 기본 false.
 */
export default function ToggleTab({ pair, memo, alert = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useUI();

  const active = isPairActive(pair, location.pathname);
  // 활성일 때만 "앞/뒤 중 어디"를 묻는다. 🔴 판정 함수는 utils/toggleNav.js 것만 쓴다 —
  // 여기에 경로 분기를 새로 만들면 짝 설정이 단일 진실이 아니게 된다(task-023 설계).
  const side = active ? resolveSide(pair, location.pathname) : null;
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
      // 🔴 position:relative 는 아래 위치 점의 기준이다. app.css 의 `.nav-item` 을 건드리지 않고
      //    여기(토글 탭)에만 준다 — 일반 NavLink 탭(홈·픽미업)의 배치 기준을 바꾸지 않기 위함.
      style={{ background: 'none', border: 'none', font: 'inherit', position: 'relative' }}
    >
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <Icon
          name={shown.icon}
          size={21}
          color={active ? 'var(--accent)' : 'var(--text3)'}
          filled={active}
        />
        {/* 알림 배지 — 있을 때만 뜬다. 초록은 "안 본 코치 리포트"라는 기존 의미를 그대로 잇는다. */}
        {alert && (
          <span style={{
            position: 'absolute', top: -2, right: -2, width: 6, height: 6,
            borderRadius: '50%', background: 'var(--accent-lt)',
          }} />
        )}
      </span>
      <span>{shown.label}</span>
      {/* 위치 점 2개 — 왼쪽이 front. 🔴 흐름(flow)이 아니라 **절대 배치**다.
          `.nav`는 62px 고정인데 토글 탭 아이템이 이미 56px 이라(실측 2026-09-15, 390x844)
          흐름에 한 줄 더 넣으면 61px 이 되어 여유가 1px 밖에 남지 않고, `.nav`의
          align-items:center 때문에 활성화될 때마다 아이콘이 2.5px 씩 위로 튄다.
          절대 배치는 아이템 높이를 **전혀 바꾸지 않으므로** 62px·--safe-bottom·
          app-content 의 padding-bottom:80px·task-039 [data-native] 여백 계산이 모두 그대로다. */}
      {active && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            display: 'flex', justifyContent: 'center', gap: 3,
          }}
        >
          <span style={{
            width: 4, height: 4, borderRadius: '50%',
            background: side === 'front' ? 'var(--accent)' : 'var(--text3)',
          }} />
          <span style={{
            width: 4, height: 4, borderRadius: '50%',
            background: side === 'back' ? 'var(--accent)' : 'var(--text3)',
          }} />
        </span>
      )}
    </button>
  );
}
