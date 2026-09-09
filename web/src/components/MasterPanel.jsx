// 관장실 대화 패널(task-030) — 🔴 **라우팅이 아니다.** 셸 전체를 덮는 레이어이고,
// 닫으면 보던 화면이 그대로 남는다(스크롤 위치 포함 — 아래 화면을 언마운트하지 않는다).
//
// 상단 바는 패널 맨 위에 `chat` 모드로 다시 붙는다(‹ 제목 ⋯) — 바가 고정이 아니어도
// 대화 중에는 항상 보인다(기획서 §11.1).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MasterBar from './MasterBar';
import MasterThread from './MasterThread';
import MasterComposer from './MasterComposer';
import { useMaster } from '../contexts/MasterContext';
import { useUI } from '../contexts/UIContext';
import { approveAction, getChat, rejectAction } from '../api/master';
import { getProfile, listBelts } from '../api/profile';
import { getTask } from '../api/research';
import { taskSummary } from '../utils/weeklyTask';

const MODEL_DEFAULT = 'opus';

export default function MasterPanel() {
  const navigate = useNavigate();
  const { showToast } = useUI();
  const {
    open, chatId, autoResume, close, refresh, setChatTitle, consumeAutoResume,
    turn, turnEvents, startTurn, adoptChat,
  } = useMaster();

  const [messages, setMessages] = useState([]);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [busyActionId, setBusyActionId] = useState(0);
  // 🔴 "이 chatId 의 복원이 **끝났다**"는 표시. loading 플래그로 대신하면 안 된다 —
  //    같은 커밋에서 도는 아래 자동 시작 이펙트는 setLoading(true) 이전 값(false)을 보고
  //    GET 이 돌아오기 전에 턴을 시작해 버린다. 그러면 나중에 도착한 GET 응답이
  //    관장 답변을 덮어써 화면에서 지운다(jsdom 실행에서 요청 순서로 실측).
  const [loadedId, setLoadedId] = useState(0);
  const [meta, setMeta] = useState({ nickname: '', belt: '', task: '없음', model: MODEL_DEFAULT });

  const metaLoadedRef = useRef(false);
  const threadRef = useRef(null);
  // 🔴 이미 반영한 턴 사건의 마지막 seq. 턴은 MasterContext 가 소유하므로(D-1) 패널은
  //    사건을 **구독해서 목록에 반영만** 한다 — 패널이 닫혀 있어도 사건은 계속 흐른다.
  const seenSeqRef = useRef(0);

  // ── 턴 상태(문맥에서 파생) ────────────────────────────────────────────────
  // 다른 대화의 턴이면 이 패널과 무관하다.
  const mine     = !!chatId && turn.chatId === chatId;
  const detached = mine && turn.phase === 'detached';
  const streaming = mine && (turn.phase === 'streaming' || detached);
  const status   = streaming && turn.label ? { label: turn.label } : null;
  const turnErr  = mine && turn.phase === 'failed' ? (turn.error || '') : '';

  // ── 메타 줄 (처음 열 때 한 번만) ────────────────────────────────────────
  useEffect(() => {
    if (!open || metaLoadedRef.current) return;
    metaLoadedRef.current = true;
    Promise.allSettled([getProfile(), listBelts(), getTask()]).then(([p, b, t]) => {
      const next = { nickname: '', belt: '', task: '없음', model: MODEL_DEFAULT };
      if (p.status === 'fulfilled' && p.value) {
        next.nickname = p.value.nickname || '';
        next.model = p.value.masterModel || MODEL_DEFAULT;
      }
      if (b.status === 'fulfilled' && Array.isArray(b.value) && b.value.length) {
        const top = [...b.value].sort((x, y) =>
          String(y.achieved_date || '').localeCompare(String(x.achieved_date || '')))[0];
        next.belt = `${top.belt || ''}${top.stripes ? ` ${top.stripes}줄` : ''}`.trim();
      }
      if (t.status === 'fulfilled') {
        const s = taskSummary(t.value && t.value.task);
        next.task = s.has ? s.title : '없음';
      }
      setMeta(next);
    });
  }, [open]);

  // ── 대화 복원 ─────────────────────────────────────────────────────────
  // 🔴 열 때·새로고침할 때 응답을 **문맥에도 넘긴다**(adoptChat) — 그 대화에 도는 턴이 있으면
  //    SSE 없이 곧바로 폴링 모드로 붙는다. 앱이 죽었다 살아나도 서버 작업 결과를 받는다(D-1).
  useEffect(() => {
    if (!open || !chatId) return undefined;
    let alive = true;
    setLoading(true); setLoadErr(''); setLoadedId(0);
    getChat(chatId)
      .then((d) => {
        if (!alive) return;
        setMessages(Array.isArray(d && d.messages) ? d.messages : []);
        setActions(Array.isArray(d && d.actions) ? d.actions : []);
        setChatTitle((d && d.chat && d.chat.title) || '');
        setLoadedId(chatId);
        adoptChat(chatId, d);
      })
      .catch((e) => { if (alive) setLoadErr(e.message || '대화를 불러오지 못했어요'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, chatId, setChatTitle, adoptChat]);

  // ── 턴 사건 구독 ───────────────────────────────────────────────────────
  // start(낙관 말풍선) · accepted(임시 id 치환) · done(답변 추가) · replace(폴링 완료 → 통째 교체)
  useEffect(() => {
    if (!turnEvents.length) return;
    const fresh = turnEvents.filter(e => e.seq > seenSeqRef.current);
    if (!fresh.length) return;
    seenSeqRef.current = fresh[fresh.length - 1].seq;
    if (!chatId) return;

    for (const ev of fresh) {
      if (ev.chatId !== chatId) continue;
      if (ev.type === 'start') {
        if (ev.optimisticText) {
          setMessages(ms => [...ms, { id: ev.tmpId, role: 'user', content: ev.optimisticText, status: 'done' }]);
        }
      } else if (ev.type === 'accepted') {
        if (ev.userMessageId) {
          setMessages(ms => ms.map(m => (m.id === ev.tmpId ? { ...m, id: ev.userMessageId } : m)));
        }
        if (ev.model) setMeta(x => ({ ...x, model: ev.model }));
      } else if (ev.type === 'drop') {
        // 서버가 받아 주지 않은 요청(409·400) — 낙관 말풍선은 거짓이므로 지운다.
        setMessages(ms => ms.filter(m => m.id !== ev.tmpId));
      } else if (ev.type === 'done') {
        if (ev.message) setMessages(ms => [...ms, ev.message]);
        if (Array.isArray(ev.actions) && ev.actions.length) setActions(as => [...as, ...ev.actions]);
      } else if (ev.type === 'replace') {
        // 🔴 폴링이 끝을 확인했다 — 서버 상태를 그대로 화면에 앉힌다(낙관 말풍선·중복 정리 포함).
        setMessages(Array.isArray(ev.messages) ? ev.messages : []);
        setActions(Array.isArray(ev.actions) ? ev.actions : []);
        if (ev.title) setChatTitle(ev.title);
        setLoadedId(chatId);
      }
    }
  }, [turnEvents, chatId, setChatTitle]);

  // 상단 바에서 만든 첫 메시지 — 저장만 돼 있으므로 패널이 턴을 시작한다.
  useEffect(() => {
    if (!open || !chatId || !autoResume || loadedId !== chatId) return;
    consumeAutoResume();
    startTurn(chatId, { resumePending: true });
  }, [open, chatId, autoResume, loadedId, consumeAutoResume, startTurn]);

  // 새 말풍선이 생기면 항상 맨 아래를 본다.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, status, turnErr]);

  const handleApprove = useCallback(async (action, opts) => {
    const replace = !!(opts && opts.replace);
    setBusyActionId(action.id);
    try {
      const res = await approveAction(action.id, replace ? { replace: true } : {});
      const updated = (res && res.action) || null;
      if (updated) setActions(as => as.map(a => (a.id === action.id ? updated : a)));
      refresh();
      return 'ok';
    } catch (e) {
      // 열린 과제가 있을 때만 나는 409 — 카드가 "바꿀까요?"를 묻고 replace 로 다시 온다.
      if (e.status === 409 && action.kind === 'weekly_task' && !replace) return 'conflict';
      if (e.action) setActions(as => as.map(a => (a.id === action.id ? e.action : a)));
      showToast(e.message || '실행하지 못했어요');
      return 'error';
    } finally {
      setBusyActionId(0);
    }
  }, [refresh, showToast]);

  const handleReject = useCallback(async (action) => {
    setBusyActionId(action.id);
    try {
      const res = await rejectAction(action.id);
      const updated = (res && res.action) || null;
      if (updated) setActions(as => as.map(a => (a.id === action.id ? updated : a)));
      refresh();
    } catch (e) {
      showToast(e.message || '취소하지 못했어요');
    } finally {
      setBusyActionId(0);
    }
  }, [refresh, showToast]);

  const handleOpenResult = useCallback((action) => {
    close();
    navigate(action.kind === 'weekly_task' ? '/' : '/research');
  }, [close, navigate]);

  if (!open) return null;

  const last = messages.length ? messages[messages.length - 1] : null;
  // 🔴 실패한 턴도 다시 보낼 수 있어야 한다(D-1 폴링이 `failed` 를 확인한 경우 포함).
  //    재시도는 **언제나 `{resumePending:true}` 하나**다 — 서버가 실패한 관장 행을 건너뛰고
  //    그 앞의 질문을 재개 대상으로 삼는다(routes/master.js · Leader 결정 2026-09-09).
  //    예전에는 마지막 질문을 `{text}` 새 턴으로 다시 보내는 우회를 썼는데, 그러면 같은 질문
  //    말풍선이 하나 더 생겼다. `resumePending` 은 사용자 메시지를 새로 만들지 않으므로
  //    낙관 말풍선도 넘기지 않는다(startTurn 의 3번째 인자 없음 = 말풍선 추가 없음).
  const lastFailed = !!last && last.role === 'master' && last.status === 'failed';
  const canResume = !streaming && !!last && (last.role === 'user' || lastFailed);

  const retry = () => { startTurn(chatId, { resumePending: true }); };

  return (
    <section className="bjjm-panel" aria-label="관장실 대화">
      <MasterBar mode="chat" />

      <div className="bjjm-meta">
        <span>🥋 관장</span>
        {meta.nickname && <span>{meta.nickname}님</span>}
        {meta.belt && <span>{meta.belt}</span>}
        <span>과제: {meta.task}</span>
        <span>{meta.model}</span>
      </div>

      <div className="bjjm-thread" ref={threadRef}>
        {loading && <div className="bjjm-msg status"><span className="bjjm-spin" aria-hidden="true" /><span>대화 불러오는 중</span></div>}
        {loadErr && <div className="bjjm-msg failed">{loadErr}</div>}

        <MasterThread
          messages={messages}
          actions={actions}
          status={status}
          streaming={streaming}
          detached={detached}
          model={meta.model}
          busyActionId={busyActionId}
          onApprove={handleApprove}
          onReject={handleReject}
          onOpenResult={handleOpenResult}
        />

        {turnErr && <div className="bjjm-msg failed">{turnErr}</div>}
        {canResume && (
          <button className="bjjm-chip" type="button" style={{ alignSelf: 'flex-start' }}
            onClick={retry}>
            관장님께 다시 보내기
          </button>
        )}
      </div>

      <MasterComposer busy={streaming} onSend={(text) => startTurn(chatId, { text }, text)} />
    </section>
  );
}
