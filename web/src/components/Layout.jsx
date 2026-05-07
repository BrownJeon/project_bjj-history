import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/',          label: '캘린더', icon: '📅', end: true },
  { to: '/techniques',label: '기술',   icon: '🥋' },
  { to: '/chains',    label: '체인',   icon: '🔗' },
  { to: '/gameplan',  label: '게임플랜', icon: '🎯' },
  { to: '/clips',     label: '영상',   icon: '🎬' },
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
            key={t.to} to={t.to} end={t.end}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span style={{ fontSize: 18 }}>{t.icon}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
