import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from './Icon';
import ToggleTab from './ToggleTab';
import { listReports } from '../api/coach';
import {
  COACH_SEEN_KEY, TOGGLE_PAIRS, createToggleMemo, getStorage, hasUnseenReport, readKey, writeKey,
} from '../utils/toggleNav';

// 하단 5탭. 2·4·5번째는 "다시 누르면 전환"되는 토글 탭이고, 1·3번째는 평범한 링크다.
// 토글 동작·localStorage 키는 전부 ../utils/toggleNav.js의 TOGGLE_PAIRS에 있다.
const tabs = [
  { type: 'link',   key: 'home',     to: '/',         label: '홈',     icon: 'home', end: true },
  { type: 'toggle', key: 'recall',   pair: TOGGLE_PAIRS.recall },
  { type: 'link',   key: 'pickmeup', to: '/pickmeup', label: '픽미업', icon: 'grid' },
  { type: 'toggle', key: 'tech',     pair: TOGGLE_PAIRS.tech },
  { type: 'toggle', key: 'research', pair: TOGGLE_PAIRS.research, coachDot: true },
];

export default function Layout() {
  const location = useLocation();
  // 분석이 5번째 탭 뒤로 밀리면서 생기는 접근성 저하 보완 — 안 본 코치 리포트가 있으면 점을 초록으로.
  const [unseenReport, setUnseenReport] = useState(false);
  // 저장소가 막힌 브라우저에서 토스트 1회 플래그를 남길 수 없을 때만 쓰이는 메모.
  // 마운트당 하나 = 옛 toastShown state 와 같은 수명. 세 짝이 공유해도 toastKey 로 갈린다.
  const toggleMemo = useRef(createToggleMemo());

  // 마운트 시 최신 리포트 1건만 조회. 🔴 실패해도 내비는 절대 깨지지 않는다
  // (Layout은 모든 화면에 있다 — 여기서 던지면 앱 전체가 죽는다). 토스트도 띄우지 않는다.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await listReports('report', 1);
        if (!alive) return;
        const latest = Array.isArray(rows) ? rows[0] : null;
        const seenAt = readKey(getStorage(), COACH_SEEN_KEY);
        setUnseenReport(hasUnseenReport(latest && latest.created_at, seenAt));
      } catch {
        /* 401·네트워크·응답 형태 변화 전부 삼키고 점은 앰버로 둔다 */
      }
    })();
    return () => { alive = false; };
  }, []);

  // /coach에 들어가면 그 시점을 워터마크로 남기고 점을 앰버로 되돌린다.
  // (CoachPage를 고치지 않고 Layout에서 경로만 감지한다)
  useEffect(() => {
    if (location.pathname !== '/coach') return;
    writeKey(getStorage(), COACH_SEEN_KEY, new Date().toISOString());
    setUnseenReport(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <main className="app-content">
        <Outlet />
      </main>
      <nav className="nav">
        {tabs.map(t => {
          if (t.type === 'toggle') {
            return (
              <ToggleTab
                key={t.key}
                pair={t.pair}
                memo={toggleMemo.current}
                dotColor={t.coachDot && unseenReport ? 'var(--accent-lt)' : 'var(--amber)'}
              />
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
