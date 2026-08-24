import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { useUI } from '../contexts/UIContext';

// 기술 탭은 /techplan ↔ /study 클릭 토글 특수 탭 — 하단 5탭 구조는 그대로 유지한다
const tabs = [
  { key: 'home',     to: '/',         label: '홈',    icon: 'home',     end: true },
  { key: 'calendar', to: '/calendar', label: '수업',  icon: 'calendar' },
  { key: 'pickmeup', to: '/pickmeup', label: '픽미업', icon: 'grid' },
  { key: 'tech',     special: true },
  { key: 'coach',    to: '/coach',    label: '분석',  icon: 'brain' },
];

const TECH_TAB_LAST_KEY  = 'bjj-tech-last';
const TECH_TOAST_SEEN_KEY = 'bjj-tech-toggle-toast-seen';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useUI();
  const [toastShown, setToastShown] = useState(() => {
    try { return localStorage.getItem(TECH_TOAST_SEEN_KEY) === '1'; } catch { return false; }
  });

  const isStudy = location.pathname === '/study' || location.pathname.startsWith('/study/');
  const isTechplan = location.pathname === '/techplan';
  const onTechOrStudy = isTechplan || isStudy;

  function handleTechTabClick() {
    let target;
    if (isTechplan) target = '/study';
    else if (isStudy) target = '/techplan';
    else {
      let last = '/techplan';
      try { last = localStorage.getItem(TECH_TAB_LAST_KEY) || '/techplan'; } catch { /* ignore */ }
      target = last;
    }
    try { localStorage.setItem(TECH_TAB_LAST_KEY, target); } catch { /* ignore */ }
    if (!toastShown) {
      showToast('탭을 다시 누르면 기술 ↔ 영상분석 화면이 전환돼요');
      try { localStorage.setItem(TECH_TOAST_SEEN_KEY, '1'); } catch { /* ignore */ }
      setToastShown(true);
    }
    navigate(target);
  }

  return (
    <div className="app-shell">
      <main className="app-content">
        <Outlet />
      </main>
      <nav className="nav">
        {tabs.map(t => {
          if (t.special) {
            return (
              <button
                key={t.key}
                type="button"
                onClick={handleTechTabClick}
                className={`nav-item${onTechOrStudy ? ' active' : ''}`}
                style={{ background: 'none', border: 'none', font: 'inherit' }}
              >
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <Icon
                    name={isStudy ? 'video' : 'book'}
                    size={21}
                    color={onTechOrStudy ? 'var(--accent)' : 'var(--text3)'}
                    filled={onTechOrStudy}
                  />
                  <span style={{
                    position: 'absolute', top: -2, right: -2, width: 6, height: 6,
                    borderRadius: '50%', background: 'var(--amber)',
                  }} />
                </span>
                <span>{isStudy ? '영상분석' : '기술'}</span>
              </button>
            );
          }
          return (
            <NavLink
              key={t.key}
              to={t.to}
              end={t.end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    name={t.icon}
                    size={21}
                    color={isActive ? 'var(--accent)' : 'var(--text3)'}
                    filled={isActive}
                  />
                  <span>{t.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
