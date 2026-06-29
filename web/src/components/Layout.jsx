import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import Icon from './Icon';

const tabs = [
  { to: '/',         label: '홈',   icon: 'home',     end: true },
  { to: '/calendar', label: '수업', icon: 'calendar' },
  { to: '/techplan', label: '기술', icon: 'book' },
  { to: '/coach',    label: '분석', icon: 'brain' },
];

export default function Layout() {
  return (
    <div className="app-shell">
      <main className="app-content">
        <Outlet />
      </main>
      <nav className="nav">
        {tabs.map(t => (
          <NavLink
            key={t.to}
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
        ))}
      </nav>
    </div>
  );
}
