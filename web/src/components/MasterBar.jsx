// 관장실 상단 바(task-030) — **모든 화면 맨 위**, `.app-content` 안 `<Outlet/>` 앞.
// 🔴 고정(sticky/fixed)이 아니다. 일반 흐름에 있어 내용과 함께 스크롤된다(2026-09-08 사용자 결정).
// 🔴 `.app-content` 의 padding-top 54px 을 이 바가 대신한다(app.css 변경 한 줄).
//
// 두 모드:
//   default — [돋보기] [관장님께 물어보세요] [➤] [말풍선 배지]
//              🔴 양 끝 두 아이콘은 Icon 레지스트리(search·chat)다 — 이모지가 아니다(D-5).
//   chat    — [‹] [대화 제목] [⋯]        (패널이 열렸을 때, 패널 맨 위에 붙는다)
//
// 관장실 CSS 전체를 여기 한 곳에 둔다(바는 항상 마운트돼 있다). app.css 는 계약 F 대로
// 한 줄만 고치고, 나머지는 컴포넌트가 들고 다닌다 — 정적 문자열이라 주입 위험이 없다.

import React, { useState } from 'react';
import Icon from './Icon';
import MasterChatMenu from './MasterChatMenu';
import { useMaster } from '../contexts/MasterContext';

export const BAR_HEIGHT = 54;
// 🔴 0 이다(Leader 결정 2026-09-09 #1). 바 아래 간격을 주면 기존 화면 헤더가 그만큼 내려가
//    Q15("헤더가 한 픽셀도 밀리지 않는다")를 깬다. 구분선 역할은 바의 border-bottom 이 한다.
//    답답하다는 피드백이 오면 여기 한 글자만 되돌린다(하네스가 매 실행 offset 을 검사한다).
export const BAR_GAP = 0;

const CSS = `
.bjjm-bar { display:flex; align-items:center; gap:8px; padding:8px 12px;
  background:var(--bg); border-bottom:1px solid var(--border); }
.bjjm-ask { flex:1; min-width:0; display:flex; align-items:center; gap:6px;
  padding:3px 3px 3px 12px; background:var(--surface-up); border:1px solid var(--border-med);
  border-radius:999px; transition:box-shadow .2s, border-color .2s; }
.bjjm-ask:focus-within { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-dim); }
.bjjm-ask .bjjm-gi { flex:0 0 auto; display:flex; align-items:center; color:var(--text2); }
.bjjm-ask:focus-within .bjjm-gi { color:var(--accent-lt); }
.bjjm-ask input { flex:1; min-width:0; background:transparent; border:none; outline:none;
  font-size:13.5px; padding:6px 0; color:var(--text); }
.bjjm-ask input::placeholder { color:var(--text3); }
.bjjm-send { width:30px; height:30px; border-radius:999px; background:var(--accent); color:#fff;
  display:flex; align-items:center; justify-content:center; flex:0 0 auto; border:none; cursor:pointer; }
.bjjm-send:disabled { opacity:.5; cursor:default; }
.bjjm-cnt { flex:0 0 auto; position:relative; width:34px; height:34px; border-radius:10px;
  display:flex; align-items:center; justify-content:center; color:var(--text2); font-size:18px;
  background:none; border:none; cursor:pointer; }
.bjjm-cnt.on { background:var(--accent-dim); color:var(--accent-lt); }
.bjjm-cnt .bjjm-badge { position:absolute; top:-2px; right:-2px; }
.bjjm-badge { min-width:18px; height:18px; padding:0 5px; border-radius:9px; background:var(--amber);
  color:#1a1200; font-size:11px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; }
/* 패널이 닫혀 있어도 턴은 계속 돈다(task-030 D-1) — 대화 관리 버튼 옆 최소 표시. */
.bjjm-live { flex:0 0 auto; display:inline-flex; align-items:center; gap:5px; font-size:11px;
  color:var(--text2); white-space:nowrap; }
.bjjm-chatbar { display:flex; flex:1; min-width:0; align-items:center; gap:4px; }
.bjjm-chatbar .bjjm-title { flex:1; min-width:0; font-size:15px; font-weight:700;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bjjm-ib { width:34px; height:34px; border-radius:10px; display:flex; align-items:center;
  justify-content:center; color:var(--text2); font-size:20px; flex:0 0 auto;
  background:none; border:none; cursor:pointer; }
.bjjm-ib:hover { background:var(--surface-hi); color:var(--text); }

/* ── 대화 패널 ─────────────────────────────────────────── */
/* z-index 160 — nav(100) 위이자 **ProfilePage 의 fixed 오버레이(150) 위**.
   "어떤 화면에 있든 대화는 항상 제일 위"(Leader 결정 2026-09-09 #2).
   .app-shell 은 position:relative 지만 z-index:auto 라 쌓임 맥락을 만들지 않는다 —
   그래서 이 160 이 프로필의 150 과 같은 루트 맥락에서 직접 겨룬다. */
.bjjm-panel { position:absolute; inset:0; z-index:160; background:var(--bg);
  display:flex; flex-direction:column; }
.bjjm-meta { display:flex; flex-wrap:wrap; gap:4px 10px; padding:7px 14px; font-size:11px;
  color:var(--text2); border-bottom:1px solid var(--border); background:var(--surface); flex:0 0 auto; }
.bjjm-thread { flex:1; min-height:0; overflow-y:auto; padding:14px 14px 8px;
  display:flex; flex-direction:column; gap:10px; overscroll-behavior:contain; }
.bjjm-msg { max-width:88%; padding:10px 13px; border-radius:16px; line-height:1.55; font-size:14px;
  white-space:pre-wrap; }
.bjjm-msg.user { align-self:flex-end; background:var(--accent); color:#fff; border-bottom-right-radius:6px; }
.bjjm-msg.master { align-self:flex-start; background:var(--surface-up); border:1px solid var(--border);
  border-bottom-left-radius:6px; }
.bjjm-msg.master .bjjm-who { font-size:11px; font-weight:700; color:var(--accent-lt); margin-bottom:4px; }
.bjjm-msg.master .bjjm-who span { color:var(--text3); font-weight:500; margin-left:6px; }
.bjjm-msg.status { align-self:flex-start; background:transparent; border:1px dashed var(--border-med);
  color:var(--text2); font-size:12.5px; display:flex; align-items:center; gap:8px; }
.bjjm-msg.failed { align-self:flex-start; background:var(--red-dim); border:1px solid var(--red);
  color:var(--text); font-size:12.5px; }
.bjjm-spin { width:12px; height:12px; border-radius:50%; border:2px solid var(--border-med);
  border-top-color:var(--accent-lt); animation:bjjm-sp .8s linear infinite; }
@keyframes bjjm-sp { to { transform:rotate(360deg); } }
.bjjm-seen { align-self:flex-start; margin:-4px 0 0 4px; }
.bjjm-seen summary { list-style:none; cursor:pointer; font-size:11px; color:var(--text3); }
.bjjm-seen summary::-webkit-details-marker { display:none; }
.bjjm-seen summary::before { content:'▸ '; }
.bjjm-seen[open] summary::before { content:'▾ '; }
.bjjm-seen .bjjm-tl { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
.bjjm-seen .bjjm-tl span { font-size:11px; color:var(--text2); background:var(--surface);
  border:1px solid var(--border); border-radius:6px; padding:2px 7px; }

/* 영상 카드 */
.bjjm-vid { display:flex; flex-direction:column; gap:3px; margin-top:8px; padding:9px 10px;
  border-radius:10px; background:var(--surface); border:1px solid var(--border); }
.bjjm-vid .bjjm-vt { font-size:13px; font-weight:600; }
.bjjm-vid .bjjm-vw { font-size:12px; color:var(--text2); }
.bjjm-vid .bjjm-pf { font-size:10px; font-weight:700; margin-right:5px; padding:1px 5px; border-radius:4px;
  background:var(--surface-hi); color:var(--text2); vertical-align:1px; }
.bjjm-vid .bjjm-open { display:inline-flex; align-items:center; gap:5px; align-self:flex-start;
  margin-top:5px; font-size:12px; font-weight:700; color:var(--accent-lt); padding:6px 11px;
  border-radius:8px; background:var(--accent-dim); text-decoration:none; }
.bjjm-vid .bjjm-open:hover { background:rgba(29,158,117,0.22); }
.bjjm-vid .bjjm-open .bjjm-host { font-weight:500; color:var(--text2); }

/* 제안 카드 */
.bjjm-prop { align-self:stretch; margin:2px 0 4px; background:var(--surface);
  border:1px solid var(--amber); border-radius:14px; overflow:hidden; }
.bjjm-prop.done { border-color:var(--accent); }
.bjjm-prop.off { border-color:var(--border); opacity:.75; }
.bjjm-prop.fail { border-color:var(--red); }
.bjjm-prop .bjjm-ph { display:flex; align-items:center; gap:8px; padding:10px 13px;
  border-bottom:1px solid var(--border); font-size:12px; font-weight:700; }
.bjjm-prop .bjjm-ph .bjjm-k { color:var(--amber); }
.bjjm-prop.done .bjjm-ph .bjjm-k { color:var(--accent-lt); }
.bjjm-prop.off .bjjm-ph .bjjm-k { color:var(--text3); }
.bjjm-prop.fail .bjjm-ph .bjjm-k { color:var(--red); }
.bjjm-prop .bjjm-ph .bjjm-pt { flex:1; min-width:0; color:var(--text); }
.bjjm-prop .bjjm-pb { padding:10px 13px; display:flex; flex-direction:column; gap:6px; font-size:13px; }
.bjjm-prop .bjjm-pb .bjjm-kv { display:flex; gap:8px; align-items:baseline; }
.bjjm-prop .bjjm-pb .bjjm-kv .bjjm-k { flex:0 0 52px; font-size:11px; color:var(--text2); font-weight:600; }
.bjjm-prop .bjjm-pb .bjjm-kv .bjjm-v { flex:1; min-width:0; }
.bjjm-prop .bjjm-foot { display:flex; gap:8px; justify-content:flex-end; align-items:center; padding:8px 12px 12px; }
.bjjm-prop .bjjm-foot .bjjm-res { flex:1; font-size:12px; color:var(--accent-lt); font-weight:600;
  display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.bjjm-prop .bjjm-foot .bjjm-res.off { color:var(--text3); }
.bjjm-prop .bjjm-foot .bjjm-res.fail { color:var(--red); }
.bjjm-prop .bjjm-warn { font-size:11.5px; color:var(--amber); background:var(--amber-dim);
  padding:6px 10px; border-radius:8px; }
.bjjm-link { background:none; border:none; padding:0; color:var(--accent-lt); font-weight:600;
  font-size:12px; cursor:pointer; }

/* 컴포저 */
.bjjm-composer { flex:0 0 auto; background:rgba(12,13,18,0.95); border-top:1px solid var(--border);
  padding:8px 12px calc(12px + var(--safe-bottom)); }
.bjjm-chips { display:flex; gap:6px; overflow-x:auto; padding-bottom:8px; scrollbar-width:none; }
.bjjm-chips::-webkit-scrollbar { display:none; }
.bjjm-chip { flex:0 0 auto; font-size:12px; padding:6px 11px; border-radius:999px;
  border:1px solid var(--border-med); background:var(--surface); color:var(--text);
  white-space:nowrap; cursor:pointer; }
.bjjm-chip:hover { border-color:var(--accent); color:var(--accent-lt); }
.bjjm-chip:disabled { opacity:.5; cursor:default; }
.bjjm-cin { display:flex; gap:8px; align-items:flex-end; }
.bjjm-cin textarea { flex:1; min-height:40px; max-height:110px; resize:none; padding:10px 13px;
  border-radius:14px; background:var(--surface-up); border:1px solid var(--border-med);
  outline:none; line-height:1.4; color:var(--text); font-size:14px; }
.bjjm-cin textarea:focus { border-color:var(--accent); }
.bjjm-cin textarea::placeholder { color:var(--text3); }
.bjjm-cin .bjjm-csend { width:40px; height:40px; border-radius:12px; background:var(--accent);
  color:#fff; display:flex; align-items:center; justify-content:center; flex:0 0 auto;
  border:none; cursor:pointer; }
.bjjm-cin .bjjm-csend:disabled { opacity:.5; cursor:default; }

/* 홈 한 줄 · 대화 관리 목록 */
.bjjm-recent { display:flex; align-items:center; gap:6px; margin:0 2px 12px; font-size:12px;
  color:var(--text2); min-width:0; }
.bjjm-recent .bjjm-q { flex:1; min-width:0; white-space:nowrap; overflow:hidden;
  text-overflow:ellipsis; color:var(--text); cursor:pointer; background:none; border:none;
  padding:0; text-align:left; font-size:12px; }
.bjjm-row { display:flex; align-items:center; gap:12px; padding:12px 0; border-top:1px solid var(--border); }
.bjjm-row:first-child { border-top:none; }
.bjjm-row .bjjm-b { flex:1; min-width:0; cursor:pointer; }
.bjjm-row .bjjm-t { font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bjjm-row .bjjm-p { font-size:12px; color:var(--text2); white-space:nowrap; overflow:hidden;
  text-overflow:ellipsis; margin-top:2px; }
.bjjm-row .bjjm-r { display:flex; flex-direction:column; align-items:flex-end; gap:4px;
  font-size:11px; color:var(--text3); }
/* D-6: 행 아이콘 묶음 — 행의 gap 12 는 "본문 → 시각 → 이 묶음" 사이에만 남고,
   묶음 **안**의 아이콘끼리는 6(절반)이다. 사용자 지시는 "아이콘들의 간격"이었지
   본문과 시각의 간격이 아니므로, 행의 gap 자체는 12 그대로 둔다.
   flex:0 0 auto — 본문(.bjjm-b flex:1)이 남는 폭을 다 가져가고 묶음은 제 크기만 쓴다. */
.bjjm-row .bjjm-rowacts { display:flex; align-items:center; gap:6px; flex:0 0 auto; }
.bjjm-iconbtn { width:30px; height:30px; border-radius:8px; color:var(--text2); display:inline-flex;
  align-items:center; justify-content:center; font-size:16px; background:none; border:none; cursor:pointer; }
.bjjm-iconbtn:hover { background:var(--surface-hi); color:var(--text); }
/* D-5: 안의 아이콘은 currentColor 라 이 색 규칙이 그대로 선 아이콘에 걸린다.
   삭제만 붉다 — Button variant=danger 와 같은 "파괴적 동작" 신호다(hover 에도 붉은 채로). */
.bjjm-iconbtn.danger { color:var(--red); }
.bjjm-iconbtn.danger:hover { background:var(--red-dim); color:var(--red); }

/* ── 대화 관리 오버레이(D-3) ────────────────────────────────
   🔴 z-index 는 채팅 패널과 **같은 160** 이다(계약 I "동급"). 둘 다 .app-shell 의
   형제이고 목록이 DOM 에서 **앞**이라, 둘이 동시에 열리면 뒤에 있는 채팅이 위에 그려진다.
   (🔴 이 문자열은 템플릿 리터럴이다 — 주석에도 백틱을 쓰지 말 것. 넣으면 문자열이 거기서 끊긴다.)
   (실제로는 목록에서 대화를 고르면 목록이 닫히므로 동시에 열리는 경로는 거의 없다.)
   🔴 top 은 여기서 0 이지만 MasterListPanel 이 인라인으로 BAR_HEIGHT 를 덮어쓴다
   (Leader 결정 2026-09-09 #2, D-3 후속): 오버레이가 상단 바를 덮으면 사용자 지시의
   "같은 아이콘을 다시 누르면 비활성화" 가 화면상 불가능해진다. 채팅 패널(.bjjm-panel)은
   전체를 덮는 지금 동작 그대로다 — 그건 바가 통째로 ‹ 제목 ⋯ 로 바뀌므로 출구가 보인다. */
.bjjm-list { position:absolute; top:0; left:0; right:0; bottom:0; z-index:160;
  background:var(--bg); display:flex; flex-direction:column; }
.bjjm-lhead { display:flex; align-items:center; gap:4px; padding:8px 12px; flex:0 0 auto;
  background:var(--bg); border-bottom:1px solid var(--border); }
.bjjm-lhead .bjjm-lt { flex:1; min-width:0; font-size:15px; font-weight:700;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bjjm-ib.on { background:var(--accent-dim); color:var(--accent-lt); }
.bjjm-lsub { display:flex; align-items:center; gap:8px; padding:10px 14px 0; flex:0 0 auto; }
.bjjm-seg { display:inline-flex; padding:2px; border-radius:999px; background:var(--surface);
  border:1px solid var(--border); }
.bjjm-seg button { border:none; background:none; cursor:pointer; padding:5px 14px; border-radius:999px;
  font-size:12px; font-weight:600; color:var(--text2); }
.bjjm-seg button[aria-pressed="true"] { background:var(--accent); color:#fff; }
.bjjm-lq { display:flex; align-items:center; gap:6px; margin:10px 14px 0; flex:0 0 auto;
  padding:3px 12px; background:var(--surface-up); border:1px solid var(--border-med); border-radius:999px; }
.bjjm-lq input { flex:1; min-width:0; background:transparent; border:none; outline:none;
  font-size:13.5px; padding:7px 0; color:var(--text); }
.bjjm-lq input::placeholder { color:var(--text3); }
/* D-5 후속2: 조회 입력의 ✕ 가 둘로 보이던 것을 하나로 되돌린다.
   type="search" 면 Chrome/Safari 가 입력 오른쪽에 **자기 지우기 버튼을 스스로 그린다** —
   그 파란색은 앱 팔레트(--accent·--text2·--red)에 없는 브라우저 기본색이라 가장 크게 튀었다.
   우리 ✕(.bjjm-iconbtn 안의 Icon name="x")만 남기려고 그 그림만 지운다.
   type 은 search 로 둔다 — 지우는 것은 브라우저가 얹은 장식뿐이고,
   역할(searchbox)·모바일 엔터키 라벨은 그대로 살아 있어야 한다.
   🔴 스코프를 .bjjm-lq 로 묶는다. 지금 앱의 type="search" 는 이 입력 하나뿐이지만
      (grep -rn 'type="search"' web/src → 1건), 전역으로 풀면 나중에 생길 검색 입력이
      말없이 이 규칙을 물려받는다. */
.bjjm-lq input[type="search"]::-webkit-search-cancel-button {
  -webkit-appearance:none; appearance:none; display:none; }
/* D-5: 조회 입력 앞 돋보기 — 상단 바(.bjjm-ask .bjjm-gi)와 같은 Icon 을 쓰고 색만 한 단 낮춘다.
   Icon 에 색을 인라인으로 주지 않는 이유: stroke 가 currentColor 로 남아야 hover·테마가 따라온다. */
.bjjm-lq .bjjm-gi { flex:0 0 auto; display:flex; align-items:center; color:var(--text3); }
.bjjm-lbody { flex:1; min-height:0; overflow-y:auto; padding:6px 14px calc(20px + var(--safe-bottom));
  overscroll-behavior:contain; }
.bjjm-empty { color:var(--text2); padding:22px 0; text-align:center; font-size:13px; line-height:1.7; }
.bjjm-row .bjjm-sn { font-size:12px; color:var(--text2); margin-top:3px; line-height:1.5;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.bjjm-row .bjjm-sn b { color:var(--accent-lt); font-weight:700; }
.bjjm-mini { flex:0 0 auto; font-size:11.5px; font-weight:700; color:var(--accent-lt);
  background:var(--accent-dim); border:none; border-radius:8px; padding:6px 10px; cursor:pointer; }
.bjjm-mini:disabled { opacity:.5; cursor:default; }
/* "전체" 보기에서 보관된 행을 구분하는 작은 태그(D-4). 노란 pendingActions 배지와 헷갈리지
   않도록 무채색이다 — 이건 알림이 아니라 상태 표시다. */
.bjjm-tag { font-size:10px; font-weight:700; line-height:16px; padding:0 6px; border-radius:6px;
  background:var(--surface-hi); color:var(--text3); white-space:nowrap; }

/* 채팅 ⋯ 액션 시트(D-3) — Modal(하단 시트) 안의 세로 버튼 목록 */
.bjjm-act { display:flex; flex-direction:column; gap:2px; }
.bjjm-act button { display:flex; align-items:center; gap:10px; width:100%; text-align:left;
  background:none; border:none; cursor:pointer; padding:13px 6px; border-radius:10px;
  font-size:14px; color:var(--text); }
.bjjm-act button:hover { background:var(--surface-hi); }
.bjjm-act button.danger { color:var(--red); }
/* D-5: 안이 이모지 글자에서 SVG 로 바뀌었다 — text-align 으로는 블록 SVG 가 안 가운데 온다. */
.bjjm-act .bjjm-ai { width:22px; text-align:center; font-size:15px;
  display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; }

@media (prefers-reduced-motion: reduce) {
  .bjjm-spin { animation:none; }
  .bjjm-ask { transition:none; }
}
`;

function SendArrow({ size = 14, width = 2.6 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff"
      strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function MasterBar({ mode = 'default' }) {
  const {
    open, chatTitle, pendingCount, startChat, starting, backToList, barInputRef, turnRunning,
    listOpen, toggleList,
  } = useMaster();
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);      // 채팅 ⋯ 액션 시트

  const chat = mode === 'chat';
  // 패널이 열려 있으면 흐름에 남은 기본 바는 패널에 가려 보이지 않는다.
  // 시각적으로는 사라졌는데 탭 이동으로는 닿는 상태를 막는다(자리는 그대로 둔다 — 스크롤 위치 유지).
  const reachable = chat || !open;
  const tab = reachable ? undefined : -1;

  function submit(e) {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    setText('');
    startChat(v);
  }

  return (
    <>
      <div
        className="bjjm-bar"
        data-master-bar={chat ? 'chat' : 'default'}
        style={{ height: BAR_HEIGHT, margin: chat ? 0 : `0 -20px ${BAR_GAP}px`, flex: chat ? '0 0 auto' : undefined }}
      >
        {chat ? (
          <div className="bjjm-chatbar">
            {/* 🔴 D-7(사용자 지시): 닫기가 아니라 **한 단계 위**다. 예전에는 close() 라
                패널이 통째로 사라지고 아래 화면(홈 등)이 나왔다 — 목록에서 들어온 사용자는
                찾던 자리를 잃었다. backToList 는 패널 닫기와 목록 열기를 한 커밋으로 한다
                (컴포넌트에서 둘로 나눠 부르면 그 사이 아래 화면이 한 프레임 비친다).
                닫는 수단은 그대로 둘이다 — 목록 헤더의 ‹ 와 상단 바 아이콘. */}
            <button className="bjjm-ib" type="button" data-chat-back="1"
              onClick={backToList} aria-label="대화 목록으로">‹</button>
            <div className="bjjm-title">{chatTitle || '새 대화'}</div>
            {/* 🔴 예전에는 이 버튼이 대화 관리로 **이동**해서 좌측 ‹ 와 사실상 같은 일을 했다(D-3 지시 3).
                지금은 제목 수정·보관·삭제 시트를 연다. ‹ 는 그대로 닫기다. */}
            <button className="bjjm-ib" type="button" data-chat-more="1"
              aria-haspopup="dialog" aria-expanded={menu}
              onClick={() => setMenu(true)} aria-label="대화 메뉴">⋯</button>
          </div>
        ) : (
          <>
            <form className="bjjm-ask" onSubmit={submit} autoComplete="off">
              <span className="bjjm-gi" aria-hidden="true"><Icon name="search" size={17} /></span>
              <input
                ref={barInputRef}
                type="text"
                value={text}
                maxLength={2000}
                tabIndex={tab}
                onChange={(e) => setText(e.target.value)}
                placeholder="관장님께 물어보세요"
                aria-label="관장님께 물어보기"
              />
              <button className="bjjm-send" type="submit" tabIndex={tab}
                disabled={starting || !text.trim()} aria-label="보내기">
                <SendArrow />
              </button>
            </form>
            {/* 🔴 패널을 닫아도 관장은 계속 답을 만든다(task-030 D-1) — 진행 중임을 여기서 알린다. */}
            {turnRunning && !open && (
              <span className="bjjm-live" role="status">
                <span className="bjjm-spin" aria-hidden="true" />
                답변 중…
              </span>
            )}
            {/* 🔴 라우팅이 아니라 **토글**이다(D-3 지시 2) — 다시 누르면 보던 화면이 그대로 돌아온다.
                예전에는 navigate('/master') 라 뒤로 가기를 눌러야 원래 화면으로 왔다. */}
            <button className={`bjjm-cnt${listOpen ? ' on' : ''}`} type="button" tabIndex={tab}
              data-list-toggle="1" aria-expanded={listOpen}
              onClick={toggleList} aria-label={listOpen ? '대화 관리 닫기' : '대화 관리 열기'}>
              {/* 🔴 D-5 후속(Leader 결정 #3): 이모지 말풍선 → Icon 레지스트리의 chat.
                  색은 인라인으로 박지 않는다 — .bjjm-cnt / .bjjm-cnt.on 의 색이 currentColor 로
                  그대로 걸려야 열린 상태(accent)가 아이콘에도 따라온다. */}
              <Icon name="chat" size={19} />
              {pendingCount > 0 && <span className="bjjm-badge">{pendingCount}</span>}
            </button>
          </>
        )}
      </div>
      {/* 액션 시트는 Modal(fixed z-index 1000) 이라 패널(160) 위에서 열린다. */}
      {chat && menu && <MasterChatMenu onClose={() => setMenu(false)} />}
      {/* 🔴 바 **뒤**에 둔다 — `.app-content` 의 첫 요소는 언제나 바여야 한다(레이아웃 회귀 검사).
          chat 모드(패널 안)에서는 다시 넣지 않는다 — 흐름의 기본 바가 항상 마운트돼 있다. */}
      {!chat && <style>{CSS}</style>}
    </>
  );
}
