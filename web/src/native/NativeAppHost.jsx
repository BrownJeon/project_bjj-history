import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import { appExchange } from '../api/auth';
import { closeExternal, exitApp, isNativeApp, onAuthDeepLink, onBackButton } from './bridge';
import { createAppLoginHandler } from './appLogin';
import { handleNativeBack } from './backStack';
import { downloadFile, uploadsLinkTarget } from '../utils/download';

function getSession() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function hasToken() {
  try {
    return !!localStorage.getItem('bjj_token');
  } catch {
    return false;
  }
}

/**
 * 안드로이드 앱(Capacitor WebView)에서만 켜지는 전역 연결부 — task-039 A-3·A-4·A-5·A-6.
 * 웹 브라우저에서는 **아무것도 등록하지 않고** 아무것도 그리지 않는다(`isNativeApp()` false).
 *
 *  1. 로그인 딥링크 → 코드 교환 → 로그인 → 홈 (native/appLogin.js)
 *  2. 하드웨어 뒤로가기 → 맨 위 모달/패널 닫기 → 뒤로 → 종료 (native/backStack.js)
 *  3. 같은 도메인 `/uploads/…` 링크 클릭 → WebView 이동 대신 기기 저장 (utils/download.js)
 *
 * `<html data-native>` 표시는 첫 페인트 전에 필요해서 여기가 아니라 main.jsx 에서 붙인다.
 * BrowserRouter · AuthProvider · UIProvider **안쪽**에 마운트해야 한다(navigate·login·toast 를 쓴다).
 */
export default function NativeAppHost() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useUI();
  // 딥링크·뒤로가기 구독은 마운트 1회만 한다(중복 교환 방지 Set 이 앱 수명 동안 유지돼야 한다).
  // 그래서 navigate·login·showToast 는 ref 로 **호출 시점의 최신값**을 부른다.
  const live = useRef({ navigate, login, showToast });
  live.current = { navigate, login, showToast };

  // 1. 로그인 딥링크
  useEffect(() => {
    if (!isNativeApp()) return undefined;
    const handle = createAppLoginHandler({
      exchange: appExchange,
      login: (token) => live.current.login(token, null),
      navigate: (path, opts) => live.current.navigate(path, opts),
      notify: (msg) => live.current.showToast(msg, 3500),
      closeExternal,
      hasToken,
      storage: getSession(),
    });
    return onAuthDeepLink((url, meta) => {
      handle(url, meta).catch((e) => console.error('[native-login]', e && e.message));
    });
  }, []);

  // 2. 뒤로가기
  useEffect(() => {
    if (!isNativeApp()) return undefined;
    return onBackButton((data) => {
      handleNativeBack(data, {
        goBack: () => window.history.back(),
        exitApp: () => { exitApp(); },
        historyLength: window.history.length,
      });
    });
  }, []);

  // 3. `/uploads/…` 링크 → 기기 저장 (캡처 단계에서 가로채 WebView 이동을 막는다)
  useEffect(() => {
    if (!isNativeApp()) return undefined;
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const anchor = e.target && typeof e.target.closest === 'function' ? e.target.closest('a[href]') : null;
      const target = uploadsLinkTarget(anchor, window.location.origin);
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      live.current.showToast('기기에 저장하는 중…', 1500);
      downloadFile(target.url, target.filename, { notify: (m, ms) => live.current.showToast(m, ms) });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // 4. 키보드가 열려 WebView 가 줄어들면(MainActivity 가 키보드만큼 margin 을 준다) 입력 중인 칸을 **화면 가운데**로 —
  //    브라우저 기본 스크롤은 칸이 겨우 보이는 데서 멈춰, 그 아래 검색 목록이 키보드 경계에 잘린다(2026-09-14 실기기).
  //    모든 input·textarea·select·contenteditable 공통. 키보드가 이미 열린 채 다른 칸으로 옮겨도 같은 처리.
  useEffect(() => {
    if (!isNativeApp()) return undefined;
    const isEditable = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    let fullHeight = window.innerHeight;   // 키보드 없는 높이(회전·첫 로드 때 갱신)
    let lastHeight = window.innerHeight;
    let raf = 0;
    const centerActive = () => {
      const el = document.activeElement;
      if (!isEditable(el) || typeof el.scrollIntoView !== 'function') return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    };
    const keyboardOpen = () => window.innerHeight < fullHeight * 0.85;
    const onResize = () => {
      const h = window.innerHeight;
      if (h > fullHeight) fullHeight = h;
      if (h < lastHeight && keyboardOpen()) centerActive();
      lastHeight = h;
    };
    const onFocusIn = (e) => {
      if (!isEditable(e.target) || !keyboardOpen()) return;
      setTimeout(centerActive, 50);
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);

  return null;
}
