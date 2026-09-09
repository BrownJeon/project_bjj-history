// 관장실 열림 상태(task-030). 🔴 라우팅이 아니다 — 패널은 Layout 안의 상태다.
// 패널을 닫으면 보던 화면이 그대로 남아야 하므로 화면(라우트)을 바꾸지 않는다.
//
// 열림·활성 대화는 sessionStorage 에만 남긴다(새로고침·화면 이동에는 유지, 브라우저를 닫으면 사라짐).
// 저장소가 막힌 브라우저에서도 절대 throw 하지 않는다 — toggleNav 의 안전 접근 헬퍼를 그대로 쓴다.
//
// 🔴 **턴(관장 답변)의 소유자도 여기다**(task-030 D-1, 계약 G). 예전에는 MasterPanel 이
//    `streamTurn` fetch 를 직접 들고 있어서, 앱이 백그라운드로 가거나 연결이 끊기면
//    `catch(e)` 가 "network error" 를 화면에 찍고 **결과를 다시 가져올 경로가 없었다**.
//    서버는 그 사이에도 턴을 끝내고 DB 에 `done` 으로 저장한다(실측 t+43s). 즉 서버 성공 = 화면 실패.
//    그래서 여기서는 **연결 끊김을 오류로 보지 않는다** — `detached` 로 바꾸고 `GET /chats/:id` 를
//    폴링해 결과를 받아온다. 모바일 브라우저가 백그라운드에서 스트림을 끊는 것은 정상 동작이다.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { readKey, writeKey } from '../utils/toggleNav';
import { useUI } from './UIContext';
import { createChat, getChat, listChats, streamTurn } from '../api/master';

const OPEN_KEY = 'bjj-master-open';
const CHAT_KEY = 'bjj-master-chat';

// ── 재접속 폴링 상수(계약 G) ────────────────────────────────────────────────
const POLL_FAST  = 2500;              // 끊긴 직후 — 빨리 붙는다
const POLL_SLOW  = 5000;              // 오래 걸리는 턴(opus)은 간격을 늘린다
const SLOW_AFTER = 30000;
const POLL_MAX   = 10 * 60 * 1000;    // 이보다 오래 pending 이면 포기하고 재시도 UI 를 준다

export const TURN_FAIL_TEXT = '관장님이 답을 못 했어요 — 다시 보내 주세요';

const IDLE_TURN = {
  chatId: 0,
  phase: 'idle',        // idle | streaming | detached | done | failed
  messageId: 0,
  label: '',
  model: '',
  error: '',
  tmpId: 0,
  optimisticText: '',
};

// toggleNav.getStorage 는 localStorage 전용이다. 열림 상태는 **세션 한정**이라
// 같은 방식(try/catch, 실패 시 null)의 sessionStorage 판을 쓴다.
function getSession() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

/** 마지막 관장 메시지 — 폴링 종료 판정의 근거(백엔드가 `running` 을 안 줘도 이것만으로 판정된다). */
function lastMasterOf(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && m.role === 'master') return m;
  }
  return null;
}

const MasterContext = createContext(null);

export function useMaster() {
  const ctx = useContext(MasterContext);
  if (!ctx) throw new Error('useMaster must be inside MasterProvider');
  return ctx;
}

export function MasterProvider({ children }) {
  const { showToast } = useUI();

  const [chatId, setChatId] = useState(() => {
    const n = Number(readKey(getSession(), CHAT_KEY));
    return Number.isInteger(n) && n > 0 ? n : null;
  });
  const [open, setOpen] = useState(() => {
    const n = Number(readKey(getSession(), CHAT_KEY));
    // 대화 id 없이 "열림"만 남아 있으면 닫힌 것으로 본다.
    return readKey(getSession(), OPEN_KEY) === '1' && Number.isInteger(n) && n > 0;
  });
  const [chatTitle, setChatTitle] = useState('');
  const [chats, setChats] = useState([]);          // 목록 요약 — 배지·홈 한 줄 공용
  // 🔴 대화 관리(D-3)도 **라우팅이 아니다**. 상단 바 아이콘·홈 링크가 이 하나를 토글하고,
  //    닫으면 보던 화면·스크롤이 그대로 남는다(오버레이는 아래 화면을 언마운트하지 않는다).
  //    세션에 남기지 않는다 — 새로고침하면 원래 화면으로 돌아오는 편이 "토글"의 기대에 맞다.
  const [listOpen, setListOpen] = useState(false);
  // 🔴 D-7: **목록을 치웠을 때만** 오르는 카운터다. 채팅으로 들어가느라 목록이 잠깐 물러난
  //    것(openChat)은 세지 않는다 — 그래야 채팅 헤더 ‹ 로 돌아왔을 때 보던 탭·검색어·스크롤이
  //    그대로 남는다. 목록 컴포넌트는 `listOpen` 이 아니라 이 값이 바뀔 때 초기화한다.
  const [listSession, setListSession] = useState(0);
  const [autoResume, setAutoResume] = useState(0); // 상단 바에서 만든 첫 메시지의 id
  const [starting, setStarting] = useState(false);

  // ── 턴 소유(D-1) ─────────────────────────────────────────────────────────
  // `turn` 은 "지금 어떤 상태인가", `turnEvents` 는 "패널이 메시지 목록에 반영할 사건"이다.
  // 🔴 사건은 **배열 큐**여야 한다. 한 청크에 SSE 프레임 두 개가 들어오면(accepted+done)
  //    같은 배치에서 setState 가 두 번 불리는데, 단일 값이면 뒤엣것이 앞엣것을 덮어써
  //    패널이 `accepted` 를 놓친다.
  const [turn, setTurn] = useState(IDLE_TURN);
  const [turnEvents, setTurnEvents] = useState([]);

  const turnRef = useRef(IDLE_TURN);
  const seqRef  = useRef(0);
  const pollRef = useRef({ chatId: 0, timer: 0, busy: false, startedAt: 0 });
  const loopRef = useRef(null);
  const barInputRef = useRef(null);

  const persist = useCallback((isOpen, id) => {
    const s = getSession();
    writeKey(s, OPEN_KEY, isOpen ? '1' : '0');
    if (id) writeKey(s, CHAT_KEY, String(id));
  }, []);

  /** 대화 목록 요약 재조회 — 미승인 배지·홈 한 줄이 같은 값을 본다. 실패는 조용히. */
  const refresh = useCallback(async () => {
    try {
      const rows = await listChats(50);
      setChats(Array.isArray(rows) ? rows : []);
    } catch {
      /* 내비·홈이 절대 깨지지 않는다 */
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /** turn 을 ref 와 state 에 **같이** 반영한다 — 폴링 루프는 ref 로 즉시 읽는다. */
  const applyTurn = useCallback((patch) => {
    const next = { ...turnRef.current, ...patch };
    turnRef.current = next;
    setTurn(next);
  }, []);

  const pushTurnEvent = useCallback((ev) => {
    seqRef.current += 1;
    const e = { ...ev, seq: seqRef.current };
    setTurnEvents(list => (list.length >= 40 ? [...list.slice(-39), e] : [...list, e]));
  }, []);

  // ── 폴링 ────────────────────────────────────────────────────────────────
  const stopPoll = useCallback(() => {
    const p = pollRef.current;
    if (p.timer) clearTimeout(p.timer);
    p.timer = 0;
    p.chatId = 0;
  }, []);

  /**
   * `GET /chats/:id` 한 번. 진행 중이면 라벨만 갱신하고, 끝났으면(마지막 관장 메시지가
   * done/failed) **응답의 messages·actions 로 통째로 교체**하고 폴링을 멈춘다.
   * 🔴 백엔드가 아직 `running` 키를 안 줄 수도 있다 — 그때도 깨지지 않게 마지막 관장 메시지
   *    status 만으로 판정한다.
   */
  const pollOnce = useCallback(async () => {
    const p = pollRef.current;
    if (!p.chatId || p.busy) return;
    const id = p.chatId;
    p.busy = true;
    try {
      const d = await getChat(id);
      if (pollRef.current.chatId !== id) return;      // 그 사이 다른 턴으로 갈아탔다
      const hasField = !!d && Object.prototype.hasOwnProperty.call(d, 'running');
      const running  = hasField ? d.running : null;
      const messages = Array.isArray(d && d.messages) ? d.messages : [];
      const lastMaster = lastMasterOf(messages);

      if (running && running.messageId) {
        applyTurn({ phase: 'detached', messageId: Number(running.messageId) || 0,
          label: running.label || '', error: '' });
        return;
      }
      if (lastMaster && (lastMaster.status === 'done' || lastMaster.status === 'failed')) {
        const failed = lastMaster.status === 'failed';
        stopPoll();
        applyTurn({ phase: failed ? 'failed' : 'done', label: '',
          error: failed ? (lastMaster.content || TURN_FAIL_TEXT) : '' });
        pushTurnEvent({
          type: 'replace',
          chatId: id,
          messages,
          actions: Array.isArray(d && d.actions) ? d.actions : [],
          title: (d && d.chat && d.chat.title) || '',
        });
        refresh();
        return;
      }
      // 아직 pending — 계속 기다린다. 다만 영원히 돌지는 않는다.
      if (Date.now() - p.startedAt > POLL_MAX) {
        stopPoll();
        applyTurn({ phase: 'failed', label: '', error: TURN_FAIL_TEXT });
      }
    } catch {
      /* 오프라인·일시 오류 — 오류로 끝내지 않고 다음 주기에 다시 친다 */
    } finally {
      pollRef.current.busy = false;
    }
  }, [applyTurn, pushTurnEvent, refresh, stopPoll]);

  const pollLoop = useCallback(async () => {
    await pollOnce();
    const p = pollRef.current;
    if (!p.chatId) return;                            // 끝났다
    if (p.timer) clearTimeout(p.timer);
    const gap = (Date.now() - p.startedAt) > SLOW_AFTER ? POLL_SLOW : POLL_FAST;
    p.timer = setTimeout(() => {
      p.timer = 0;
      if (loopRef.current) loopRef.current();
    }, gap);
  }, [pollOnce]);
  loopRef.current = pollLoop;                         // 최신 루프를 타이머가 부른다

  const startPoll = useCallback((id, opts) => {
    const n = Number(id) || 0;
    if (!n) return;
    const p = pollRef.current;
    if (p.chatId === n) return;                       // 이미 이 대화를 폴링 중
    stopPoll();
    p.chatId = n;
    p.startedAt = Date.now();
    if (opts && opts.immediate) {
      if (loopRef.current) loopRef.current();
    } else {
      // 방금 GET 을 읽고 붙은 경우 — 곧바로 또 치지 않는다.
      p.timer = setTimeout(() => { p.timer = 0; if (loopRef.current) loopRef.current(); }, POLL_FAST);
    }
  }, [stopPoll]);

  /** 화면이 다시 보이거나 네트워크가 돌아오면 기다리지 않고 즉시 한 번 친다(계약 G). */
  const pokePoll = useCallback(() => {
    const p = pollRef.current;
    if (!p.chatId) return;
    if (p.timer) { clearTimeout(p.timer); p.timer = 0; }
    if (loopRef.current) loopRef.current();
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') pokePoll();
    };
    window.addEventListener('online', pokePoll);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', pokePoll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pokePoll]);

  useEffect(() => () => stopPoll(), [stopPoll]);

  // ── 턴 시작 ─────────────────────────────────────────────────────────────
  /**
   * 🔴 패널이 아니라 **여기**가 fetch 를 소유한다. 패널 닫힘·화면 이동·프로필 진입에도
   *    abort 하지 않는다(abort 는 로그아웃 = 페이지 이탈뿐이다).
   */
  const startTurn = useCallback(async (id, body, optimisticText) => {
    const chat = Number(id) || 0;
    if (!chat) return;
    const cur = turnRef.current;
    if (cur.chatId === chat && (cur.phase === 'streaming' || cur.phase === 'detached')) return;

    stopPoll();
    const tmpId = -Date.now();
    applyTurn({ ...IDLE_TURN, chatId: chat, phase: 'streaming', tmpId, optimisticText: optimisticText || '' });
    pushTurnEvent({ type: 'start', chatId: chat, tmpId, optimisticText: optimisticText || '' });

    try {
      await streamTurn(chat, body, {
        onEvent: (name, data) => {
          if (turnRef.current.chatId !== chat) return;
          if (name === 'accepted') {
            applyTurn({ messageId: Number(data && data.masterMessageId) || 0, model: (data && data.model) || '' });
            pushTurnEvent({ type: 'accepted', chatId: chat, tmpId,
              userMessageId: Number(data && data.userMessageId) || 0, model: (data && data.model) || '' });
          } else if (name === 'status') {
            applyTurn({ label: (data && data.label) || '' });
          } else if (name === 'done') {
            applyTurn({ phase: 'done', label: '', error: '' });
            pushTurnEvent({ type: 'done', chatId: chat,
              message: (data && data.message) || null,
              actions: (data && Array.isArray(data.actions)) ? data.actions : [] });
          } else if (name === 'error') {
            applyTurn({ phase: 'failed', label: '', error: (data && data.message) || TURN_FAIL_TEXT });
            pushTurnEvent({ type: 'error', chatId: chat, message: (data && data.message) || TURN_FAIL_TEXT });
          }
        },
      });

      // 스트림이 done/error 없이 조용히 끝났다 = 중간에 잘렸다. 오류가 아니라 **재접속**이다.
      if (turnRef.current.chatId === chat && turnRef.current.phase === 'streaming') {
        applyTurn({ phase: 'detached' });
        startPoll(chat, { immediate: true });
      } else {
        refresh();
      }
    } catch (e) {
      if (turnRef.current.chatId !== chat) return;
      const status  = e && e.status;
      const running = (e && e.running) || null;

      // 409 + running — 이미 도는 턴이 있다. 오류가 아니라 그 턴에 **붙는다**.
      if (status === 409 && running) {
        const rid = Number(running.chatId) || chat;
        // 이 요청의 사용자 메시지는 서버가 저장하지 않았다(409 는 SSE 시작 전이다) — 낙관 말풍선을 거둔다.
        pushTurnEvent({ type: 'drop', chatId: chat, tmpId });
        // 도는 턴이 **다른 대화**의 것이면 이 화면에는 아무 표시도 남지 않는다 — 그 사실을 말해 준다.
        if (rid !== chat) showToast('관장님이 다른 대화에 답하는 중이에요 — 끝나면 다시 보내 주세요');
        applyTurn({ ...IDLE_TURN, chatId: rid, phase: 'detached',
          messageId: Number(running.messageId) || 0, label: running.label || '' });
        startPoll(rid, { immediate: true });
        return;
      }

      if (status) {
        // 진짜 오류(400·404·409-without-running·401). 서버가 메시지를 저장하지 않았으므로 말풍선도 거둔다.
        const msg = (e && e.message) || '관장님께 말을 전하지 못했어요';
        pushTurnEvent({ type: 'drop', chatId: chat, tmpId });
        applyTurn({ phase: 'failed', label: '', error: msg });
        pushTurnEvent({ type: 'error', chatId: chat, message: msg });
        refresh();
        return;
      }

      // 🔴 status 가 없다 = TypeError(네트워크·백그라운드 전환). **오류가 아니다** —
      //    서버는 계속 답을 만들고 있다. 재접속 모드로 바꾸고 폴링으로 결과를 받는다.
      applyTurn({ phase: 'detached', error: '' });
      startPoll(chat, { immediate: true });
    }
  }, [applyTurn, pushTurnEvent, refresh, showToast, startPoll, stopPoll]);

  /**
   * 패널 열기·앱 재진입·새로고침 — `GET /chats/:id` 응답을 그대로 넘기면
   * 진행 중 턴이 있을 때 SSE 없이 폴링 모드로 붙는다(계약 G).
   */
  const adoptChat = useCallback((id, d) => {
    const chat = Number(id) || 0;
    if (!chat || !d) return;
    const cur = turnRef.current;
    if (cur.chatId === chat && cur.phase === 'streaming') return;   // 이 세션이 지금 스트리밍 중

    const hasField = Object.prototype.hasOwnProperty.call(d, 'running');
    const running  = hasField ? d.running : null;
    const lastMaster = lastMasterOf(d.messages);

    if (running && running.messageId) {
      applyTurn({ ...IDLE_TURN, chatId: chat, phase: 'detached',
        messageId: Number(running.messageId) || 0, label: running.label || '' });
      startPoll(chat);
      return;
    }
    // 백엔드가 아직 `running` 을 안 줄 때의 대비 — 마지막 관장 메시지가 pending 이면 진행 중이다.
    if (!hasField && lastMaster && lastMaster.status === 'pending') {
      applyTurn({ ...IDLE_TURN, chatId: chat, phase: 'detached', messageId: Number(lastMaster.id) || 0 });
      startPoll(chat);
      return;
    }
    // 진행 중이 아니다 — 이 대화에 남아 있던 "답변 중" 표시를 거둔다.
    if (cur.chatId === chat && cur.phase === 'detached') {
      stopPoll();
      applyTurn({ ...IDLE_TURN });
    }
  }, [applyTurn, startPoll, stopPoll]);

  // ── 대화 관리 오버레이(D-3) ──────────────────────────────────────────────
  /**
   * 상단 바 아이콘·홈 "대화 관리 ›" 가 부르는 하나. 열려 있으면 닫는다.
   * 🔴 닫는 쪽에서는 `listSession` 을 올린다 = "치웠다". 다음에 열면 기본 상태(진행 중)다.
   */
  const toggleList = useCallback(() => {
    if (listOpen) { setListOpen(false); setListSession(n => n + 1); }
    else setListOpen(true);
  }, [listOpen]);
  const closeList  = useCallback(() => {
    setListOpen(false);
    setListSession(n => n + 1);
  }, []);

  const openChat = useCallback((id) => {
    if (!id) return;
    setChatId(id);
    setOpen(true);
    // 목록에서 대화를 고르면 목록은 물러난다(채팅이 그 자리를 대신한다).
    // 🔴 D-7: 여기서는 `listSession` 을 **올리지 않는다** — 이건 "치운" 것이 아니라
    //    "한 단계 아래로 내려간" 것이다. 채팅 ‹ 로 돌아오면 그 목록을 그대로 다시 본다.
    setListOpen(false);
    persist(true, id);
  }, [persist]);

  const close = useCallback(() => {
    setOpen(false);
    persist(false, null);
    // 🔴 여기서 턴을 멈추지 않는다 — 닫아도 관장은 계속 답을 만들고, 결과는 폴링·재오픈으로 받는다.
  }, [persist]);

  /**
   * 채팅 헤더 `‹` (D-7, 사용자 지시) — 화면을 닫는 것이 아니라 **한 단계 위**인 대화 목록으로.
   * 🔴 컴포넌트에서 `close()` 와 목록 열기를 이어 부르지 않는 이유: 두 갱신이 갈라지면
   *    그 사이에 패널도 목록도 없는 상태가 생겨 **아래 화면(홈 등)이 한 프레임 번쩍인다**.
   *    여기서 한 핸들러 안에 묶어 한 번의 커밋으로 바꾼다.
   * 🔴 `listSession` 은 건드리지 않는다 — 목록에서 들어왔다면 그때 보던 탭·검색어·스크롤이
   *    그대로 살아 있어야 하고, 상단 바에서 시작한 새 대화라면 이미 그때 올라가 기본 상태다.
   */
  const backToList = useCallback(() => {
    setOpen(false);
    setListOpen(true);
    persist(false, null);
  }, [persist]);

  /** 상단 바 제출 — 첫 메시지를 **저장만** 하고(턴은 패널이 시작한다) 패널을 연다. */
  const startChat = useCallback(async (text) => {
    const body = (text || '').trim();
    if (!body || starting) return;
    setStarting(true);
    try {
      const res = await createChat({ firstMessage: body.slice(0, 2000) });
      const chat = (res && res.chat) || null;
      if (!chat || !chat.id) throw new Error('대화를 만들지 못했어요');
      setChatTitle(chat.title || body.slice(0, 40));
      setAutoResume(Number(res.pendingMessageId) || 0);
      setChatId(chat.id);
      setOpen(true);
      // 🔴 D-7: 목록을 거치지 않고 들어온 길이다 — 여기서는 `listSession` 을 올려 "치웠다"로
      //    본다. 그래야 이 대화에서 ‹ 를 눌렀을 때 목록이 **기본 상태(진행 중)** 로 열린다.
      setListOpen(false);
      setListSession(n => n + 1);
      persist(true, chat.id);
    } catch (e) {
      showToast(e.message || '대화를 시작하지 못했어요');
    } finally {
      setStarting(false);
    }
  }, [persist, showToast, starting]);

  const consumeAutoResume = useCallback(() => {
    setAutoResume(0);
  }, []);

  const focusBar = useCallback(() => {
    const el = barInputRef.current;
    if (el && el.focus) el.focus();
  }, []);

  const pendingCount = chats.reduce((sum, c) => sum + (Number(c.pendingActions) || 0), 0);
  const turnRunning = turn.phase === 'streaming' || turn.phase === 'detached';

  const value = {
    open, chatId, chatTitle, chats, pendingCount, autoResume, starting,
    barInputRef,
    openChat, startChat, close, refresh, focusBar, consumeAutoResume,
    setChatTitle,
    // 대화 관리 오버레이(D-3) · 채팅 ‹ 로 목록 복귀(D-7)
    listOpen, listSession, toggleList, closeList, backToList,
    // 턴(D-1)
    turn, turnEvents, turnRunning, startTurn, adoptChat,
  };

  return <MasterContext.Provider value={value}>{children}</MasterContext.Provider>;
}
