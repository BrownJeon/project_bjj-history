import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from './Icon';
import ToggleTab from './ToggleTab';
import MasterBar from './MasterBar';
import MasterListPanel from './MasterListPanel';
import MasterPanel from './MasterPanel';
import { MasterProvider } from '../contexts/MasterContext';
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
  // 🔴 /me 만 예외 — ProfilePage 는 `.app-content` 가 아니라 자기 fixed 오버레이(z-index 150)라
  //    Layout 의 바를 덮어 버린다. 그래서 그 안에 바를 직접 하나 올린다(Leader 결정 2026-09-09 #2).
  //    여기서도 렌더하면 화면 하나에 바가 **2개**가 되고, 가려진 쪽이 눈에는 안 보이는데
  //    Tab 으로는 닿는다(WCAG 2.4.3 포커스 순서 · 4.1.2). 가리는 것보다 인스턴스를 하나로 만든다.
  //    열림·chatId 는 MasterContext(Provider 1개)에 있으니 어느 바가 렌더되든 동작은 같다.
  const barInLayout = location.pathname.replace(/\/+$/, '') !== '/me';
  // 분석이 5번째 탭 뒤로 밀리면서 생기는 접근성 저하 보완 — 안 본 코치 리포트가 있으면 5번째 탭에 알림 배지.
  // 🔴 task-042 이후: 배지는 **안 본 리포트가 있을 때만** 뜬다(예전엔 앰버 점이 늘 떠 있고 색만 초록으로 바뀌었다).
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
        /* 401·네트워크·응답 형태 변화 전부 삼키고 배지는 띄우지 않는다 */
      }
    })();
    return () => { alive = false; };
  }, []);

  // /coach에 들어가면 그 시점을 워터마크로 남기고 알림 배지를 내린다.
  // (CoachPage를 고치지 않고 Layout에서 경로만 감지한다)
  useEffect(() => {
    if (location.pathname !== '/coach') return;
    writeKey(getStorage(), COACH_SEEN_KEY, new Date().toISOString());
    setUnseenReport(false);
  }, [location.pathname]);

  return (
    // 🔴 관장실(task-030)은 **추가만** 한다 — 아래 하단 5탭 블록은 한 줄도 바뀌지 않았다.
    //    MasterProvider 는 Layout 안에서만 감싼다(로그인·회원가입 화면엔 없다).
    <MasterProvider>
    <div className="app-shell">
      <main className="app-content">
        {/* 상단 바 — `.app-content` 안 <Outlet/> 앞. 고정이 아니라 내용과 함께 스크롤된다. */}
        {/* 🔴 /me 에서는 렌더하지 않는다(위 barInLayout 주석) — 프로필 오버레이 안의 바 하나만 남는다.
            아래 줄은 들여쓰기까지 그대로 둔다(이 파일의 diff 를 "추가만"으로 유지하기 위함). */}
        {barInLayout && (
        <MasterBar />
        )}
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
                alert={!!(t.coachDot && unseenReport)}
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
      {/* 대화 관리 오버레이(D-3) — 예전 `/master` 라우트를 대신한다. 상단 바 💬 가 토글한다.
          🔴 채팅 패널보다 **앞**에 둔다: 둘의 z-index 가 같아(160) DOM 뒤엣것이 위에 그려진다.
             = 목록에서 대화를 열면 채팅이 목록 위로 온다(계약 I "채팅이 위"). */}
      <MasterListPanel />
      {/* 대화 패널 — 셸 전체를 덮는다(z-index 160 > 프로필 오버레이 150 > nav 100).
          닫으면 보던 화면 그대로. z-index 는 MasterBar.jsx 의 `.bjjm-panel` 규칙에 있다. */}
      <MasterPanel />
    </div>
    </MasterProvider>
  );
}
