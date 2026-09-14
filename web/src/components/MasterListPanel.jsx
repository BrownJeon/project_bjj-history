// 대화 관리 오버레이(task-030 D-3) — 예전 `/master` 라우트(`pages/MasterListPage.jsx`)를 대신한다.
//
// 🔴 라우팅이 아니다. 상단 바의 대화 아이콘 · 홈 "대화 관리 ›" 가 **토글**하고, 닫으면 보던 화면과
//    스크롤 위치가 그대로 남는다(아래 화면을 언마운트하지 않는다 — 채팅 패널과 같은 층위·같은 규칙).
//
// 보기가 한 컴포넌트에 있다:
//   진행 중  — MasterContext 의 `chats`(archived=0). 배지·홈 한 줄과 **같은 값**을 본다.
//   보관됨  — `GET /chats?archived=1`. 항목마다 복원.
//   전체    — `GET /chats?archived=all`(task-030 D-4). 둘이 섞이므로 보관된 행에 "보관됨" 태그.
//   조회    — 돋보기 토글이 켜져 있을 때만. 300ms 디바운스 → `GET /chats?q=`. 제목 + match.snippet.
//
// 🔴 아이콘은 전부 `Icon`(선 아이콘 레지스트리)이다 — 이모지를 쓰지 않는다(D-5 사용자 지시 2).
//    앱의 나머지 화면이 전부 24×24 선 아이콘이라 이모지는 OS 고유 컬러·굵기로 렌더돼 튄다.
//    색은 `.bjjm-iconbtn` 의 CSS(currentColor)가 정하고, 삭제만 `.danger` 로 붉다.
//
// 🔴 보기(`tab`)는 목록과 조회에 **똑같이** 걸린다 — 하나의 `archived` 파라미터가 두 요청에
//    같이 실린다(D-4 사용자 지시: "검색시에도 조건에 동일하게 적용되게"). 보기를 바꾸면
//    조회 중이어도 같은 검색어로 다시 친다.
// 🔴 기본은 **진행 중** 이다. 사용자가 늘 보던 화면이 이 변경으로 바뀌지 않아야 한다.
//
// 🔴 백엔드(dev-030-d3a)가 아직 `q`·`archived`·`match` 를 모를 수 있다 — 그때도 깨지지 않는다.
//    파라미터를 모르면 서버는 그냥 기본 목록을 준다(빈 화면·오류가 아니라 목록이 나온다).
//    `match` 가 없으면 스니펫 자리에 기존 미리보기를 그린다.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Button from './Button';
import Card from './Card';
import Icon from './Icon';
import { BAR_HEIGHT } from './MasterBar';
import Modal from './Modal';
import Pagination from './Pagination';
import { useMaster } from '../contexts/MasterContext';
import { useUI } from '../contexts/UIContext';
import { archiveChat, deleteChat, listChats, renameChat } from '../api/master';
import { relTime } from '../utils/relTime';
import useBackHandler from '../native/useBackHandler';

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 300;

/** 보기 → `GET /chats` 의 `archived` 값. 🔴 목록과 조회가 **같은 표**를 쓴다(D-4). */
const ARCH_PARAM = { open: 0, archived: 1, all: 'all' };
const TABS = [
  { key: 'all',      label: '전체' },
  { key: 'open',     label: '진행 중' },
  { key: 'archived', label: '보관됨' },
];

/**
 * 스니펫을 검색어 기준으로 굵게.
 * 🔴 서버가 준 문자열을 **조각내서 텍스트 노드로만** 그린다 — HTML 주입 API 를 쓰지 않는다.
 *    스니펫 본문은 사용자·관장이 쓴 대화 내용이라 마크업이 섞여 있을 수 있다.
 */
function Snippet({ text, q }) {
  const needle = (q || '').trim();
  if (!text) return null;
  const i = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (i < 0) return <div className="bjjm-sn">{text}</div>;
  return (
    <div className="bjjm-sn">
      {text.slice(0, i)}
      <b>{text.slice(i, i + needle.length)}</b>
      {text.slice(i + needle.length)}
    </div>
  );
}

export default function MasterListPanel() {
  const { listOpen, listSession, closeList, chats, openChat, refresh } = useMaster();
  // 안드로이드 앱 뒤로가기 → 대화 관리 닫기(목록 헤더 `‹` 와 같은 동작) — task-039 A-6.
  useBackHandler(listOpen, closeList);
  const { showToast } = useUI();

  const [tab, setTab] = useState('open');        // all | open | archived  (기본 = 진행 중)
  const [searching, setSearching] = useState(false);   // 🔍 조회 토글
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);  // null = 아직 안 침 · [] = 결과 없음
  // 🔴 `open` 만 문맥(`chats`)에서 오고, `archived`·`all` 은 이 컴포넌트가 직접 읽는다.
  const [remote, setRemote] = useState([]);
  const [busyId, setBusyId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [renaming, setRenaming] = useState(null);   // chat
  const [titleInput, setTitleInput] = useState('');
  const [deleting, setDeleting] = useState(null);   // chat
  // 🔴 보관 확인(D-5 지시 3). 삭제와 **같은 컴포넌트·같은 문형**이다 — 새 패턴을 만들지 않는다.
  //    다만 보관은 되돌릴 수 있으므로 확인 버튼이 danger 가 아니라 primary 다.
  const [archiving, setArchiving] = useState(null); // chat
  // 🔴 보관·삭제·이름변경이 끝나면 조회 결과도 낡는다. `q` 는 그대로이므로 디바운스 이펙트가
  //    스스로 다시 돌지 않는다 — 이 값을 올려서 "같은 검색어로 한 번 더" 를 만든다.
  //    (예전 판은 결과를 null 로 비우기만 해서 "찾는 중…" 에서 멈췄다.)
  const [tick, setTick] = useState(0);

  const searchRef = useRef(null);
  const seqRef = useRef(0);                      // 늦게 온 응답이 최신 결과를 덮지 않게(조회)
  // 🔴 목록(보기 전환)에도 같은 보호가 필요하다 — 탭을 빠르게 연타하면 먼저 보낸 요청이
  //    나중에 도착해 지금 탭에 엉뚱한 목록이 잠깐 그려진다(Reviewer D-4 MEDIUM).
  //    카운터를 조회와 **따로** 두는 이유: 보기를 바꾸면 이 이펙트와 조회 디바운스가 둘 다
  //    돌기 때문에, 하나를 공유하면 서로의 응답을 취소해 목록이 빈 채로 남는다.
  const listSeqRef = useRef(0);                  // 〃 목록 — 조회와 같은 방식, 카운터만 따로
  // 🔴 D-7: 목록 본문의 스크롤 위치. 오버레이는 닫히면 DOM 에서 통째로 사라지므로
  //    (아래 `if (!listOpen) return null`) 브라우저가 위치를 기억해 주지 않는다 — 우리가 들고
  //    있다가 다시 열릴 때 되돌린다. 채팅에 다녀와도 찾던 자리를 잃지 않게 하는 장치다.
  const bodyRef = useRef(null);
  const scrollRef = useRef(0);

  // 🔴 D-7: **치웠을 때만** 처음 상태로 되돌린다. 예전에는 `listOpen` 이 false 가 되면 무조건
  //    비웠는데, 채팅 ‹ 로 돌아오는 길에서는 목록이 "닫힌" 것이 아니라 잠깐 **물러난** 것이라
  //    그대로 비우면 사용자가 보던 탭·검색어·스크롤을 전부 잃는다. 문맥이 그 둘을 구분해
  //    `listSession` 으로 알려 준다(치움 = 카운터 증가, 대화 열기 = 그대로).
  //    지난번 검색어가 남아 "왜 목록이 비지?" 가 되는 것은 여전히 막는다 — 치우면 초기화된다.
  useEffect(() => {
    if (listSession === 0) return;               // 첫 마운트 — 이미 기본 상태다
    setSearching(false); setQ(''); setResults(null); setTab('open'); setPage(1);
    scrollRef.current = 0;
  }, [listSession]);

  // 다시 나타날 때 스크롤을 되돌린다. 그리기 전(useLayoutEffect)에 넣어야 위에서 아래로
  // 훑고 내려가는 것이 보이지 않는다.
  useLayoutEffect(() => {
    if (!listOpen) return;
    const el = bodyRef.current;
    if (el) el.scrollTop = scrollRef.current;
  }, [listOpen]);

  useEffect(() => { setPage(1); }, [tab, searching]);

  // 🔴 보기를 바꾸면 이전 보기의 목록을 그대로 그리지 않는다 — 새 목록이 오기 전 잠깐
  //    "전체" 자리에 보관함이 비치는 식의 어긋남을 없앤다.
  useEffect(() => { setRemote([]); }, [tab]);

  // 조회 토글 ON → 입력에 포커스. OFF → 검색어·결과를 버리고 기본 목록으로 돌아간다.
  useEffect(() => {
    if (!listOpen) return;
    if (searching) {
      const el = searchRef.current;
      if (el && el.focus) el.focus();
    } else {
      setQ(''); setResults(null);
    }
  }, [searching, listOpen]);

  /** 보관됨·전체 — 그 보기를 열 때만 읽는다(진행 중 목록은 문맥이 이미 갖고 있다). */
  const loadRemote = useCallback(async () => {
    const my = (listSeqRef.current += 1);
    setLoading(true);
    try {
      const rows = await listChats({ archived: ARCH_PARAM[tab], limit: 50 });
      if (listSeqRef.current !== my) return;     // 더 최근 보기 전환이 이미 나갔다
      setRemote(Array.isArray(rows) ? rows : []);
    } catch {
      // 🔴 오류로 화면을 깨지 않는다 — 빈 목록으로 떨어진다. 단, 낡은 요청의 실패로
      //    지금 보기의 목록을 지우지는 않는다.
      if (listSeqRef.current === my) setRemote([]);
    } finally {
      if (listSeqRef.current === my) setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (!listOpen || tab === 'open') return;
    loadRemote();
  }, [listOpen, tab, loadRemote]);

  // ── 조회(디바운스 300ms) ────────────────────────────────────────────────
  useEffect(() => {
    if (!listOpen || !searching) return undefined;
    const term = q.trim();
    if (!term) { setResults(null); return undefined; }
    const my = (seqRef.current += 1);
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        // 🔴 보기가 조회에도 그대로 걸린다(D-4) — `tab` 이 deps 에 있으므로 보기를 바꾸면
        //    같은 검색어로 자동 재조회된다.
        const rows = await listChats({ q: term, archived: ARCH_PARAM[tab], limit: 50 });
        if (seqRef.current !== my) return;         // 더 최근 입력이 이미 나갔다
        setResults(Array.isArray(rows) ? rows : []);
      } catch {
        if (seqRef.current === my) setResults([]);
      } finally {
        if (seqRef.current === my) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, searching, tab, listOpen, tick]);

  // ── 행 동작 ─────────────────────────────────────────────────────────────
  const withBusy = useCallback(async (id, fn, okMsg, failMsg) => {
    setBusyId(id);
    try {
      await fn();
      await refresh();
      if (tab !== 'open') await loadRemote();
      if (searching && q.trim()) setTick(n => n + 1);   // 목록이 바뀌었다 — 같은 검색어로 다시 친다
      showToast(okMsg);
    } catch (e) {
      showToast((e && e.message) || failMsg);
    } finally { setBusyId(0); }
  }, [refresh, loadRemote, showToast, tab, searching, q]);

  const onRestore = (c) => withBusy(c.id, () => archiveChat(c.id, false), '복원했어요', '복원하지 못했어요');
  const onArchive = (c) => withBusy(c.id, () => archiveChat(c.id, true), '보관했어요', '보관하지 못했어요');

  // 🔴 native prompt/confirm 을 쓰지 않는다 — 앱의 나머지가 전부 Modal(하단 시트)이고,
  //    브라우저 기본 대화상자는 스타일·포커스·모바일 동작이 제각각이다.
  async function saveTitle() {
    const v = titleInput.trim().slice(0, 100);
    if (!renaming || !v) { setRenaming(null); return; }
    const c = renaming;
    setRenaming(null);
    await withBusy(c.id, () => renameChat(c.id, v), '제목을 바꿨어요', '제목을 바꾸지 못했어요');
  }

  async function confirmArchive() {
    if (!archiving) return;
    const c = archiving;
    setArchiving(null);
    await onArchive(c);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const c = deleting;
    setDeleting(null);
    await withBusy(c.id, () => deleteChat(c.id), '삭제했어요', '삭제하지 못했어요');
  }

  // ── 지금 그릴 목록 ──────────────────────────────────────────────────────
  const base = tab === 'open' ? (Array.isArray(chats) ? chats : []) : remote;
  const searchOn = searching && !!q.trim();
  const rows = useMemo(() => (searchOn ? (results || []) : base), [searchOn, results, base]);
  const shown = searchOn ? rows : rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!listOpen) return null;

  const emptyText = searchOn
    ? (results === null ? '찾는 중…' : '찾는 말이 들어간 대화가 없어요')
    : (tab === 'archived' ? '보관한 대화가 없어요'
      : tab === 'all' ? '대화가 하나도 없어요'
        : '아직 대화가 없어요 — 위 검색창에 첫 마디를 적어 보세요');

  return (
    // 🔴 상단 바 **아래**에서 시작한다(Leader 결정 2026-09-09 #2 · D-3 후속).
    //    사용자 지시가 "같은 아이콘을 다시 누르면 비활성화" 인데, 예전처럼 inset:0 으로
    //    바까지 덮으면 그 버튼이 가려져 지시가 글자 그대로 성립하지 않았다.
    //    top 을 인라인으로 주는 이유: 바 높이는 MasterBar 의 BAR_HEIGHT 하나가 정본이고,
    //    CSS 문자열에 54 를 또 적으면 둘이 갈라진다. 하네스도 이 값을 그대로 읽어 잰다.
    //    바가 스크롤로 밀려 나가면 이 54px 띠에는 아래 화면이 비친다 — 그때는 어차피
    //    아이콘이 안 보이므로 헤더 ‹ 가 출구다(보조 수단으로 남긴다).
    <section className="bjjm-list" aria-label="대화 관리" data-master-list="1"
      style={{ top: BAR_HEIGHT }}>
      <div className="bjjm-lhead">
        <button className="bjjm-ib" type="button" onClick={closeList} aria-label="대화 관리 닫기">‹</button>
        <div className="bjjm-lt">대화 관리</div>
        {/* 🔴 "새 대화" 는 없앴다(D-3 지시 1) — 그 자리가 조회 토글이다.
            새 대화는 상단 바 입력창 하나로만 시작한다(입구가 둘이면 어느 쪽이 정본인지 흐려진다). */}
        <button className={`bjjm-ib${searching ? ' on' : ''}`} type="button"
          data-search-toggle="1" aria-pressed={searching}
          onClick={() => setSearching(v => !v)}
          aria-label={searching ? '대화 조회 닫기' : '대화 조회'}>
          {/* 🔴 채팅창 상단 바의 돋보기와 **같은 글리프**다(D-5 지시 1) — 둘 다 Icon name="search". */}
          <Icon name="search" size={17} />
        </button>
      </div>

      <div className="bjjm-lsub">
        {/* 🔴 순서는 전체 → 진행 중 → 보관됨 이지만 **기본 선택은 진행 중** 이다(D-4).
            사용자가 늘 보던 화면이 이 변경으로 바뀌지 않아야 한다. */}
        <div className="bjjm-seg" role="group" aria-label="보기 선택">
          {TABS.map(t => (
            <button key={t.key} type="button" data-seg={t.key}
              aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>

      {searching && (
        <div className="bjjm-lq">
          <span className="bjjm-gi" aria-hidden="true"><Icon name="search" size={17} /></span>
          <input
            ref={searchRef}
            /* 🔴 D-5 후속2: type 은 search 그대로다(역할 searchbox·모바일 엔터키 라벨을 지킨다).
               브라우저가 스스로 그리던 파란 지우기 버튼은 MasterBar CSS 의
               .bjjm-lq input[type="search"]::-webkit-search-cancel-button 에서 숨긴다 —
               지우기는 아래 우리 ✕ 버튼 하나만 있어야 한다. */
            type="search"
            value={q}
            maxLength={100}
            onChange={(e) => setQ(e.target.value)}
            placeholder="대화 제목·내용 조회"
            aria-label="대화 조회"
            data-search-input="1"
          />
          {/* 🔴 D-5 후속(Leader 결정 #4): 텍스트 ✕ → Modal 이 이미 쓰는 Icon name="x".
              크기는 옆의 행 아이콘 버튼들과 같은 16 — 같은 .bjjm-iconbtn 안에 산다.
              strokeWidth 를 따로 주지 않는다(레지스트리에서 x·plus·check 는 2다). */}
          {!!q && (
            <button className="bjjm-iconbtn" type="button" onClick={() => setQ('')} aria-label="조회어 지우기">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
      )}

      {/* 🔴 D-7: 스크롤할 때마다 위치를 적어 둔다(상태가 아니라 ref — 매 스크롤 리렌더는
          목록을 무겁게 만든다). 다시 열릴 때 위 useLayoutEffect 가 이 값을 도로 넣는다. */}
      <div className="bjjm-lbody" ref={bodyRef} data-list-body="1"
        onScroll={(e) => { scrollRef.current = e.currentTarget.scrollTop; }}>
        <Card padding="4px 14px">
          {shown.length === 0 ? (
            <div className="bjjm-empty">{loading ? '찾는 중…' : emptyText}</div>
          ) : shown.map(c => (
            <div className="bjjm-row" key={c.id}>
              <div className="bjjm-b" role="button" tabIndex={0}
                onClick={() => openChat(c.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChat(c.id); } }}>
                <div className="bjjm-t">{c.title || '새 대화'}</div>
                {/* 조회 결과면 일치 스니펫, 아니면 기존 미리보기. `match` 가 없는 백엔드에서도 안 깨진다. */}
                {searchOn && c.match && c.match.snippet
                  ? <Snippet text={c.match.snippet} q={q} />
                  : <div className="bjjm-p">{c.preview || ''}</div>}
              </div>
              <div className="bjjm-r">
                <span>{relTime(c.lastMessageAt)}</span>
                {/* 🔴 "전체" 에는 보관된 것과 아닌 것이 섞인다 — 태그로 구분한다(D-4).
                    "보관됨" 보기에서는 전부 보관이라 태그가 소음이므로 달지 않는다. */}
                {tab !== 'archived' && c.archivedAt
                  && <span className="bjjm-tag" data-archived-badge="1">보관됨</span>}
                {Number(c.pendingActions) > 0 && <span className="bjjm-badge">{c.pendingActions}</span>}
              </div>
              {/* 🔴 행 버튼은 **탭이 아니라 그 행의 상태**로 고른다 — "전체" 에서는 한 화면에
                  보관된 행(복원)과 진행 중 행(수정·보관·삭제)이 나란히 놓인다. 상태에 맞는 것 하나만. */}
              {c.archivedAt ? (
                <button className="bjjm-mini" type="button" disabled={busyId === c.id}
                  data-restore="1" onClick={() => onRestore(c)}>복원</button>
              ) : (
                /* 🔴 D-6: 세 아이콘을 한 묶음으로 감싼다 — 행의 gap 12 는 "본문↔시각↔묶음" 에만
                   걸리고, 아이콘끼리는 .bjjm-rowacts 의 gap 6 으로 절반이 된다(사용자 지시
                   "아이콘들의 간격을 반으로"). 조각(<>)이었을 때는 셋이 행의 직계라 12 를 그대로
                   물려받아, 아이콘 간격만 줄이려면 음수 마진밖에 없었다. 버튼 자체(30×30·hover
                   영역)는 손대지 않는다 — 줄이는 것은 사이 여백뿐이다. */
                <div className="bjjm-rowacts">
                  <button className="bjjm-iconbtn" type="button" aria-label="제목 수정"
                    disabled={busyId === c.id}
                    onClick={() => { setRenaming(c); setTitleInput(c.title || ''); }}>
                    <Icon name="edit" size={16} />
                  </button>
                  {/* 🔴 보관은 **바로 실행하지 않는다**(D-5 지시 3) — 확인 창을 먼저 띄운다.
                      취소하면 PATCH 가 한 건도 나가지 않는다. 복원은 되돌리는 동작이라 즉시. */}
                  <button className="bjjm-iconbtn" type="button" aria-label="보관"
                    disabled={busyId === c.id} onClick={() => setArchiving(c)}>
                    <Icon name="archive" size={16} />
                  </button>
                  <button className="bjjm-iconbtn danger" type="button" aria-label="삭제"
                    disabled={busyId === c.id} onClick={() => setDeleting(c)}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </Card>

        {!searchOn && <Pagination total={rows.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />}

        <div style={{ fontSize: 11, color: 'var(--text3)', margin: '10px 4px 0', lineHeight: 1.6 }}>
          {searching
            ? '제목과 대화 내용에서 찾아요. 지금 고른 보기 안에서만 찾으니, 보관한 대화까지 찾으려면 “전체”를 고르세요.'
            : '미승인 제안이 남은 대화는 노란 숫자로 표시돼요. 보관하면 목록에서 빠지고 “보관됨”에서 되살릴 수 있어요. “전체”는 보관한 대화까지 함께 보여줘요.'}
        </div>
      </div>

      {renaming && (
        <Modal title="제목 수정" onClose={() => setRenaming(null)} footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>취소</Button>
            <Button size="sm" variant="primary" disabled={busyId === renaming.id} onClick={saveTitle}>저장</Button>
          </div>
        }>
          <input
            value={titleInput}
            maxLength={100}
            autoFocus
            onChange={(e) => setTitleInput(e.target.value)}
            aria-label="제목"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 10,
              background: 'var(--surface-up)', border: '1px solid var(--border-med)',
              color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </Modal>
      )}

      {/* 🔴 보관 확인(D-5 지시 3). 확인 버튼은 primary — 보관은 파괴적 동작이 아니다. */}
      {archiving && (
        <Modal title="대화 보관" onClose={() => setArchiving(null)} footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button size="sm" variant="ghost" onClick={() => setArchiving(null)}>취소</Button>
            <Button size="sm" variant="primary" disabled={busyId === archiving.id} onClick={confirmArchive}>보관</Button>
          </div>
        }>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text2)' }}>
            “{archiving.title || '새 대화'}” 대화를 보관할까요?<br />
            <span style={{ color: 'var(--text3)' }}>
              보관해도 지워지지 않아요 — 목록에서만 빠지고 “보관됨”에서 되살릴 수 있어요.
            </span>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="대화 삭제" onClose={() => setDeleting(null)} footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button size="sm" variant="ghost" onClick={() => setDeleting(null)}>취소</Button>
            <Button size="sm" variant="danger" disabled={busyId === deleting.id} onClick={confirmDelete}>삭제</Button>
          </div>
        }>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text2)' }}>
            “{deleting.title || '새 대화'}” 대화를 삭제할까요?<br />
            대화에 남은 제안 카드도 함께 사라져요. 이미 승인해서 만들어진 연구·과제는 그대로 남습니다.<br />
            지우지 않고 목록에서만 치우려면 <b style={{ color: 'var(--text)' }}>보관</b>을 쓰세요.
          </div>
        </Modal>
      )}
    </section>
  );
}
