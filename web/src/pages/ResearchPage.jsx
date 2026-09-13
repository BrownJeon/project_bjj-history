import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';
import { getHoles } from '../api/lab';
import { getPositions } from '../api/techniques';
import { listClips } from '../api/clips';
import { listClasses } from '../api/classes';
import {
  listProjects, createProject, getProject, patchProject, deleteProject,
  patchVersion, deleteVersion, branchVersion,
  createNode, patchNode, deleteNode, moveNode, insertParent,
  getReactionSuggestions, getTask, setTask as apiSetTask, clearTask as apiClearTask,
} from '../api/research';
import Card from '../components/Card';
import Tag from '../components/Tag';
import Icon from '../components/Icon';
import Button from '../components/Button';
import Modal from '../components/Modal';
import ResearchTree, { buildTree } from '../components/ResearchTree';
import ResearchNodeSheet from '../components/ResearchNodeSheet';
import ResearchProjectForm from '../components/ResearchProjectForm';
import ResearchEmptyState from '../components/ResearchEmptyState';
import ResearchStarters, { STARTERS_TITLE, UNLINKED_TITLE } from '../components/ResearchStarters';
import Pagination from '../components/Pagination';
import ResearchSuggestions from '../components/ResearchSuggestions';
import ResearchBranchModal from '../components/ResearchBranchModal';
import ClipDetailModal from '../components/ClipDetailModal';
import ClassDetailModal from '../components/ClassDetailModal';
import {
  splitSuggestions, dismissKey, readDismissed, writeDismissed, taskSummary,
} from '../utils/weeklyTask';
import { openTargetOf } from '../utils/researchLinks';

// ═════════════════════════════════════════════════════════════════════════════
// 연구 화면 — task-026
//
// 복기가 "찾는 길"이라면 연구는 **"빈 곳을 드러내는 판"** 이다.
// 트리를 예쁘게 채우는 화면이 아니라, **대처가 없는 리액션이 눈에 보이게 하는 화면**이다.
// 예쁘게 보이려고 빈 곳을 숨기면 이 화면은 실패한 것이다.
//
// 🔴 이 화면이 에러 없이 조용히 틀릴 수 있는 지점 4가지 (전부 실측된 함정이다):
//
//  1. **사다리를 노드 id 로 캐싱하는 것.** 사다리는 기술 단위(`techniques.id`)다(task-024 계약).
//     이 파일은 mastery 를 한 번도 읽지 않는다 — 노드 시트가 RecallLadder 에 techId 만 넘기고,
//     RecallLadder 가 techId 로 스스로 읽는다. 그래서 같은 기술을 쓰는 두 노드가
//     **저절로** 같은 사다리를 본다. 여기에 노드별 mastery 캐시를 새로 만들면 그게 깨진다.
//
//  2. **2·3단계 체크 후 요약을 다시 안 읽는 것.** 체크하면 사다리 평균이 바뀐다.
//     RecallLadder 는 PATCH 를 자기 안에서 처리하고 콜백을 주지 않는다(수정 금지 파일이라 콜백을
//     추가할 수 없다). → **노드 시트가 닫힐 때마다 프로젝트 상세를 다시 읽는다**(closeNodeSheet).
//     그러지 않으면 화면이 방금 사용자가 한 일과 모순된 숫자를 남긴다.
//
//  3. **대처 없는 리액션을 프론트가 다시 판정하는 것.**
//     서버가 `coverage.uncoveredReactionNodeIds` 를 준다. 그대로 넘겨 쓴다.
//
//  4. **toISOString() 이 날짜를 하루 민다**(KST +9). `createdAt` 은 서버가 만든
//     'YYYY-MM-DD' 문자열이므로 **문자열 그대로** 다룬다. Date 왕복 금지.
//
// 이번 범위 밖(task-027): "+ 분기" 실제 구현 · 리액션 자동 유입 · 이번 주 과제 · 링크 열기.
// 🔴 자리만 만든 버튼은 **비활성으로 그린다.** 눌러도 아무 일 없는 활성 버튼이 제일 나쁘다.
// ═════════════════════════════════════════════════════════════════════════════

/** 프로젝트 목록 페이지당 개수 (task-029 B-5). 공용 `Pagination` 을 그대로 쓴다. */
const PAGE_SIZE = 4;

/**
 * 포커스 복귀 재조회의 최소 간격.
 * 🔴 폴링이 아니다 — 이벤트가 왔을 때만 부르되, alt-tab 연타가 사실상 폴링이 되는 것을 막는 하한이다.
 */
const HOLES_MIN_INTERVAL_MS = 15000;

/** 'YYYY-MM-DD' 표시용. 🔴 Date 를 거치지 않는다. */
function fmtDay(v) {
  if (!v) return '';
  return String(v).slice(0, 10).replace(/-/g, '.');
}

function Hint({ children }) {
  return <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.55 }}>{children}</div>;
}

function SectionTitle({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 2px 8px', gap: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.2px' }}>{children}</span>
      {right}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 진척 2축
// 🔴 표본 0을 `0/0`·`0.0/5` 로 쓰지 않는다. "잴 게 없다"와 "재 봤더니 0이다"는 다른 말이다.
// ─────────────────────────────────────────────────────────────────────────────

export function coverageText(coverage) {
  const c = coverage || {};
  if (!c.reactions) return { value: '리액션 없음', sub: '아직 상대 반응을 적지 않았습니다', empty: true };
  return {
    value: `${c.covered}/${c.reactions}`,
    sub: `리액션 ${c.reactions}개 중 대처가 붙은 것 ${c.covered}개`,
    empty: false,
    warn: c.covered < c.reactions,
  };
}

export function ladderText(ladder) {
  const l = ladder || {};
  if (!l.techniques || l.avgReached == null) {
    return { value: '기록 없음', sub: '기술이 연결된 노드가 없습니다', empty: true };
  }
  return {
    value: `${Number(l.avgReached).toFixed(1)}/5`,
    sub: `기술 ${l.techniques}종 평균 (노드 수가 아니라 고유 기술 수 기준)`,
    empty: false,
  };
}

function ProgressPair({ coverage, ladder }) {
  const c = coverageText(coverage);
  const l = ladderText(ladder);
  const box = {
    flex: 1, minWidth: 130,
    padding: '10px 11px', borderRadius: 11,
    background: 'var(--surface-up)', border: '1px solid var(--border)',
  };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <div style={box}>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 3 }}>대처 채움률</div>
        <div style={{
          // 🔴 여기 앰버는 **유지한다.** `c.warn` 은 `covered < reactions` — 곧 "대처가 안 채워졌다"이고,
          //    미연결 계열이 아니라 이 화면의 본업 신호 그 자체다(Leader 결정의 앰버 전용 대상).
          fontSize: c.empty ? 13 : 18, fontWeight: 800,
          color: c.empty ? 'var(--text3)' : (c.warn ? 'var(--amber)' : 'var(--accent-lt)'),
          whiteSpace: 'normal', overflowWrap: 'anywhere',
        }}>{c.value}</div>
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, lineHeight: 1.4 }}>{c.sub}</div>
      </div>
      <div style={box}>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 3 }}>숙련도 평균</div>
        <div style={{
          fontSize: l.empty ? 13 : 18, fontWeight: 800,
          color: l.empty ? 'var(--text3)' : 'var(--accent-lt)',
          whiteSpace: 'normal', overflowWrap: 'anywhere',
        }}>{l.value}</div>
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, lineHeight: 1.4 }}>{l.sub}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Confirm({ open, title, body, danger, confirmText = '삭제', onCancel, onConfirm, busy }) {
  if (!open) return null;
  return (
    <Modal open onClose={busy ? undefined : onCancel} title={title}>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 16, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
        {body}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {busy ? '처리 중…' : confirmText}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={busy}>취소</Button>
      </div>
    </Modal>
  );
}

function ProjectCard({ p, onOpen }) {
  return (
    <Card style={{ marginBottom: 10 }} onClick={() => onOpen(p.id)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{
          fontSize: 15, fontWeight: 800,
          whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word',
        }}>{p.title}</span>
        {p.startPos && <Tag tone="blue">{p.startPos}</Tag>}
      </div>
      {p.goal && (
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.5, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
          목표 · {p.goal}
        </div>
      )}
      <ProgressPair coverage={p.coverage} ladder={p.ladder} />
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>
        노드 {p.nodeCount} · 버전 {p.versionCount}
        {p.activeVersion && ` · 활성 v${p.activeVersion.versionNo}${p.activeVersion.name ? ` ${p.activeVersion.name}` : ''}`}
        {p.createdAt && ` · 시작 ${fmtDay(p.createdAt)}`}
      </div>
    </Card>
  );
}

function VersionTabs({ versions, activeVersionId, onSwitch, onRename, onDelete, onBranch, busy }) {
  const [manage, setManage] = useState(false);
  const list = Array.isArray(versions) ? versions : [];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {list.map(v => {
          const on = v.id === activeVersionId;
          return (
            <span
              key={v.id}
              onClick={on || busy ? undefined : () => onSwitch(v)}
              style={{
                padding: '6px 12px', borderRadius: 9,
                fontSize: 12, fontWeight: 700,
                cursor: on || busy ? 'default' : 'pointer',
                color: on ? 'var(--accent-lt)' : 'var(--text2)',
                background: on ? 'var(--accent-dim)' : 'var(--surface)',
                border: on ? '1px solid var(--accent)' : '1px solid var(--border)',
                whiteSpace: 'normal', overflowWrap: 'anywhere',
              }}
            >v{v.versionNo}{v.name ? ` · ${v.name}` : ''}</span>
          );
        })}

        {/* task-028 B — 실제로 연결됐다. 🔴 **바로 만들지 않고 확인 모달을 연다.**
            무엇이 복제되는지(노드 N · 자료 M)와 원본이 남는다는 사실을 먼저 말해야 하기 때문이다.
            버전이 없으면(=열 수 없으면) 비활성 — 눌러도 아무 일 없는 활성 버튼을 만들지 않는다. */}
        <Button
          variant="outline" size="sm"
          disabled={busy || activeVersionId == null}
          onClick={onBranch}
        >＋ 분기</Button>

        <span
          onClick={() => setManage(v => !v)}
          style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text2)', cursor: 'pointer' }}
        >{manage ? '닫기' : '버전 관리'}</span>
      </div>

      {manage && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {list.map(v => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 28 }}>v{v.versionNo}</span>
              <input
                defaultValue={v.name || ''}
                placeholder="버전 이름"
                onBlur={e => {
                  const val = e.target.value;
                  if ((v.name || '') !== val) onRename(v, val);
                }}
                style={{
                  flex: 1, minWidth: 120,
                  background: 'var(--surface-up)', color: 'var(--text)',
                  border: '1px solid var(--border-med)', borderRadius: 8,
                  padding: '6px 9px', fontSize: 12, outline: 'none',
                }}
              />
              {list.length > 1 ? (
                <span onClick={() => onDelete(v)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', cursor: 'pointer' }}>삭제</span>
              ) : (
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>마지막 버전은 지울 수 없습니다</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════

export default function ResearchPage() {
  const navigate = useNavigate();
  const { techniques, clips, classes, reloadClips, reloadClasses } = useCache();
  const { showToast } = useUI();

  const [projects, setProjects] = useState([]);
  const [warnOverload, setWarnOverload] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [errs, setErrs] = useState({});           // 하나가 죽어도 나머지는 뜬다

  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [positions, setPositions] = useState([]);
  const [holes, setHoles] = useState(null);
  const [holesLoading, setHolesLoading] = useState(false);
  // 🔴 요청 세대. 마지막으로 시작한 요청만 응답을 커밋한다(task-029 B-3 경합 방지).
  const holesSeq = useRef(0);
  const holesAt = useRef(0);        // 마지막 조회 시각 — 포커스 재조회 최소 간격용
  const [startersOpen, setStartersOpen] = useState(false);  // 🔴 기본 접힘 — 목록이 본업이다(B-2)

  // task-029 — 목록 검색 · 페이징
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  // task-027 — 리액션 제안 · 이번 주 과제
  const [suggest, setSuggest] = useState(null);
  const [dismissed, setDismissed] = useState({});
  const [task, setTaskState] = useState(null);
  const [taskBusy, setTaskBusy] = useState(false);

  const [projForm, setProjForm] = useState(null);   // {project|null}
  const [nodeSheet, setNodeSheet] = useState(null); // {node|null, draft|null}
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  // task-028 — 분기 · 링크 열기
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchBusy, setBranchBusy] = useState(false);
  const [branchErr, setBranchErr] = useState('');
  const [openClip, setOpenClip] = useState(null);    // 참고영상 상세
  const [openClass, setOpenClass] = useState(null);  // 수업 상세

  const fail = (k) => (e) => setErrs(prev => ({ ...prev, [k]: e.message || '불러오지 못했습니다' }));

  const reloadList = useCallback(async () => {
    setListLoading(true);
    try {
      const d = await listProjects();
      setProjects(Array.isArray(d?.projects) ? d.projects : []);
      setWarnOverload(!!d?.warnOverload);
      setErrs(prev => ({ ...prev, list: undefined }));
    } catch (e) {
      fail('list')(e);
    } finally {
      setListLoading(false);
    }
  }, []);

  const reloadDetail = useCallback(async (id) => {
    const target = id ?? openId;
    if (target == null) return;
    setDetailLoading(true);
    try {
      setDetail(await getProject(target));
      setErrs(prev => ({ ...prev, detail: undefined }));
    } catch (e) {
      fail('detail')(e);
    } finally {
      setDetailLoading(false);
    }
  }, [openId]);

  /**
   * 리액션 제안 — 🔴 **조회만 한다.** 서버도 쓰기를 하지 않는다(계약 A).
   *    실패해도 트리는 그대로 떠야 하므로 errs 에만 담고 화면을 막지 않는다.
   */
  const reloadSuggest = useCallback(async (id) => {
    const target = id ?? openId;
    if (target == null) return;
    try {
      const d = await getReactionSuggestions(target);
      setSuggest(d);
      setErrs(prev => ({ ...prev, suggest: undefined }));
    } catch (e) {
      setSuggest(null);
      fail('suggest')(e);
    }
  }, [openId]);

  /**
   * 이번 주 과제 — 세 화면이 같은 값을 보게 하는 단 하나의 출처.
   * 🔴 과제가 없으면 `{task:null}` 이고 **404 가 아니다**(계약 B). 없는 것을 오류로 그리지 마라.
   */
  const reloadTask = useCallback(async () => {
    try {
      const d = await getTask();
      setTaskState(d?.task ?? null);
      setErrs(prev => ({ ...prev, task: undefined }));
    } catch (e) {
      fail('task')(e);
    }
  }, []);

  useEffect(() => { reloadTask(); }, [reloadTask]);

  useEffect(() => { reloadList(); }, [reloadList]);

  useEffect(() => {
    let alive = true;
    getPositions()
      .then(d => { if (alive) setPositions(Array.isArray(d) ? d : []); })
      .catch(e => { if (alive) fail('positions')(e); });
    return () => { alive = false; };
  }, []);

  // 구멍 목록은 **프로젝트가 있어도** 읽는다(task-029 B-2 — 추천/미연결 상시 노출).
  //
  // 이전 설계(task-026)와 그 이유는 기록으로 남긴다:
  //   > 빈 상태에서만 구멍 목록을 읽는다 — 프로젝트가 있으면 필요 없는 요청이다.
  //   > 🔴 "이미 시작했다" 플래그는 **ref** 여야 한다. state 로 두고 deps 에 넣으면
  //   >    setHolesLoading(true) 가 곧바로 이 이펙트를 재실행시키고, 그 정리(cleanup)가
  //   >    첫 요청의 응답을 버린다 → 요청은 200 인데 화면은 영원히 "불러오는 중…" 이다.
  //   >    (실행 하네스가 실제로 잡은 결함. HTTP 로그만 보면 정상이라 코드 검토로는 안 보인다.)
  //
  // 🔴 그 1회 가드(`holesStarted`)가 **우연히** 응답 덮어쓰기까지 막고 있었다. 재조회를 여는 순간
  //    그 보호가 사라지므로, 대신 **요청 세대(sequence)** 로 막는다:
  //    마지막으로 시작한 요청만 커밋한다 → 느린 옛 응답이 빠른 새 응답을 덮지 못한다.
  //    (이펙트 cleanup 으로 취소하는 방식은 위 기록 그대로 "영원히 불러오는 중" 을 재현하므로 쓰지 않는다.)
  // 🔴 폴링 금지 — 개인용 화면이고 /api/holes 는 스파링 전량 집계다. 이벤트에서만 부른다.
  const reloadHoles = useCallback(async () => {
    const seq = ++holesSeq.current;
    holesAt.current = Date.now();
    setHolesLoading(true);
    try {
      const d = await getHoles();
      if (seq !== holesSeq.current) return;   // 더 늦게 시작한 요청이 있다 → 이 응답은 버린다
      setHoles(d);
      setErrs(prev => ({ ...prev, holes: undefined }));
    } catch (e) {
      if (seq !== holesSeq.current) return;
      fail('holes')(e);
    } finally {
      if (seq === holesSeq.current) setHolesLoading(false);
    }
  }, []);

  // 화면 진입 시 재조회 — 마운트(holesAt=0) 와 **상세에서 목록으로 돌아온 순간**을 같이 덮는다.
  // 🔴 최소 간격을 걸어 상세를 여닫을 때마다 집계가 다시 도는 것을 막는다.
  useEffect(() => {
    if (openId != null) return;
    if (holesAt.current && Date.now() - holesAt.current < HOLES_MIN_INTERVAL_MS) return;
    reloadHoles();
  }, [openId, reloadHoles]);

  // 포커스 복귀 시 재조회 — 다른 탭에서 스파링을 고치고 돌아오는 경우.
  // 🔴 포커스 이벤트는 alt-tab 마다 뜬다. 최소 간격을 두지 않으면 사실상 폴링이 된다.
  useEffect(() => {
    const onWake = () => {
      if (openId != null) return;                 // 상세를 보는 중에는 목록 재료를 다시 읽지 않는다
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - holesAt.current < HOLES_MIN_INTERVAL_MS) return;
      reloadHoles();
    };
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [openId, reloadHoles]);

  useEffect(() => {
    if (openId == null) { setDetail(null); setSuggest(null); return; }
    reloadDetail(openId);
    reloadSuggest(openId);
    // 무시 목록은 프로젝트별로 다르다. 🔴 저장소가 막힌 브라우저에서도 죽지 않는다(util 안에서 try/catch).
    setDismissed(readDismissed(openId));
  }, [openId, reloadDetail, reloadSuggest]);

  const tree = useMemo(() => buildTree(detail?.nodes), [detail]);
  const rowById = useMemo(() => {
    const m = new Map();
    for (const r of tree.rows) m.set(r.node.id, r);
    return m;
  }, [tree]);

  const activeVersionId = detail?.activeVersionId ?? null;

  // ── 목록 검색 (task-029 B-4) ────────────────────────────────────────────────
  // 🔴 `.normalize('NFC')` 를 **양쪽에** 건다. 한글은 완성형(NFC)과 자모분리형(NFD) 두 표현이 있고,
  //    검색어는 항상 키보드 입력이라 NFC 인데 저장된 제목/목표에 NFD 가 섞여 들어올 수 있다.
  //    정규화가 없으면 눈에 보이는 프로젝트가 검색으로 안 잡히고 **에러도 안 난다**(task-010·014 실측).
  const filtered = useMemo(() => {
    const needle = String(q || '').normalize('NFC').trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter(p =>
      [p.title, p.goal, p.startPos].some(v =>
        String(v ?? '').normalize('NFC').toLowerCase().includes(needle)));
  }, [projects, q]);

  // ── 페이징 (task-029 B-5) ───────────────────────────────────────────────────
  // 🔴 `page` 를 그대로 쓰지 않고 항상 clamp 한다. 검색·삭제로 목록이 줄면 현재 페이지가
  //    범위 밖이 되는데, `Pagination` 은 totalPages <= 1 이면 null 을 반환하므로
  //    되돌아갈 UI 조차 없이 빈 화면이 된다.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  // ── 프로젝트 ────────────────────────────────────────────────────────────────

  async function saveProject(body, isCreate) {
    if (isCreate) {
      const created = await createProject(body);
      const id = created?.id ?? created?.project?.id ?? null;
      setProjForm(null);
      // 🔴 여기서 reloadHoles() 를 부르지 않는다 — /api/holes 는 spar_sessions·drills·techniques·
      //    belt_history·spar_causes 만 읽고 research_* 는 한 번도 참조하지 않는다(labAnalytics.js FROM 전수 확인).
      //    프로젝트 CRUD 로는 구멍 집계가 바뀔 수 없다. 구멍이 바뀌는 계기는 **다른 화면**(수업·스파링·기술트리)의
      //    데이터 변경이고, 그건 진입·포커스 복귀 재조회가 잡는다(task-029 — dev-029b 반박 수용, Leader 독립 확인).
      await reloadList();
      if (id != null) setOpenId(id);
      else showToast('만들었습니다 — 목록에서 열어 주세요');
      return;
    }
    await patchProject(openId, body);
    setProjForm(null);
    await Promise.all([reloadDetail(openId), reloadList()]);
    showToast('저장했습니다');
  }

  /** 구멍/미연결에서 바로 시작 — 프로젝트 + 시드 노드 하나. */
  async function startFromHole(h) {
    setBusy(true);
    try {
      const created = await createProject({ title: h.name, startPos: null, goal: '' });
      const id = created?.id ?? created?.project?.id ?? null;
      if (id == null) { await reloadList(); showToast('만들었습니다 — 목록에서 열어 주세요'); return; }

      // 실측: POST 응답이 상세와 같은 형태라 activeVersionId 가 이미 들어 있다.
      // 그래도 상세 GET 으로 fallback 을 둔다 — 응답 형태는 계약에 명시되지 않은 부분이라
      // 여기에 의존하면 백엔드가 바뀔 때 시드 노드가 조용히 안 만들어진다.
      const vid = created?.activeVersionId ?? (await getProject(id))?.activeVersionId ?? null;
      if (vid != null) {
        await createNode({
          versionId: vid,
          parentNodeId: null,
          kind: '피니시',                    // 구멍 4종·미연결 13종 실측이 전부 서브미션이다. 시트에서 바꿀 수 있다.
          label: h.name,
          techniqueId: h.techniqueId ?? null, // 🔴 미연결(null)은 자유 라벨로 남는다 — 버리지 않는다.
          note: '',
        });
      }
      await reloadList();
      setOpenId(id);
    } catch (e) {
      showToast(e.message || '만들지 못했습니다');
    } finally {
      setBusy(false);
    }
  }

  function askDeleteProject() {
    setConfirm({
      title: '프로젝트 삭제',
      body: `"${detail.title}" 을(를) 지웁니다. 버전 ${detail.versions?.length ?? 0}개와 그 안의 노드 ${detail.nodes?.length ?? 0}개, 붙은 자료가 전부 함께 사라집니다. 되돌릴 수 없습니다.`,
      danger: true,
      run: async () => {
        const r = await deleteProject(detail.id);
        setOpenId(null);
        // 🔴 노드가 사라지면 그 노드를 가리키던 이번 주 과제도 함께 사라진다
        //    (`research_tasks.node_id` FK CASCADE — dev-027a 기록). 다시 읽지 않으면
        //    홈 카드가 **이미 없는 과제**를 계속 보여 준다. 세 삭제 경로 전부에서 다시 읽는다.
        await Promise.all([reloadList(), reloadTask()]);
        showToast(`삭제: 버전 ${r?.deletedVersions ?? 0} · 노드 ${r?.deletedNodes ?? 0} · 자료 ${r?.deletedLinks ?? 0}`
          + (r?.deletedTasks ? ` · 이번 주 과제 ${r.deletedTasks}` : ''));
      },
    });
  }

  // ── 버전 ────────────────────────────────────────────────────────────────────

  async function switchVersion(v) {
    setBusy(true);
    try {
      await patchVersion(v.id, { isActive: true });
      await Promise.all([reloadDetail(openId), reloadList()]);
    } catch (e) {
      showToast(e.message || '전환하지 못했습니다');
    } finally { setBusy(false); }
  }

  async function renameVersion(v, name) {
    try {
      await patchVersion(v.id, { name });
      await reloadDetail(openId);
    } catch (e) { showToast(e.message || '이름을 저장하지 못했습니다'); }
  }

  /**
   * 분기 (task-028 B) — `POST /research/versions/:activeVersionId/branch`.
   *
   * 🔴 **뒤이어 PATCH {isActive:true} 를 부르지 않는다.** 서버가 한 트랜잭션에서 새 버전을
   *    활성으로 만든다(계약). 여기서 또 부르면 같은 일을 두 번 하는 것이고, 그 사이에 실패하면
   *    활성 버전이 0개인 상태 — 화면이 표현할 수 없는 상태 — 가 남는다.
   *
   * 🔴 응답의 `copied.complete` 가 false 면 **덜 복제된 것**이다. 성공 토스트로 덮지 않는다.
   *    원본이 남는 기능에서 "복제됐다고 믿었는데 일부가 없다"가 제일 나쁜 결말이다.
   *
   * 🔴 원본이 화면에서 사라지지 않는지는 `detail.versions` 로 확인된다 —
   *    서버가 돌려준 `project` 상세를 그대로 그리므로 버전 탭에 원본이 그대로 남는다.
   */
  async function doBranch({ name }) {
    if (activeVersionId == null) return;
    setBranchBusy(true); setBranchErr('');
    try {
      const r = await branchVersion(activeVersionId, name ? { name } : {});
      // 서버가 상세를 함께 준다 — 다시 GET 하지 않고 그대로 그린다(왕복 1회 절약, 그리고
      // "방금 만든 것과 화면이 어긋날 창"이 없어진다).
      if (r?.project) setDetail(r.project);
      else await reloadDetail(openId);
      await reloadList();
      // 새 버전에는 아직 제안 계산 대상이 달라질 수 있다 — 함께 다시 읽는다.
      reloadSuggest(openId);
      setBranchOpen(false);

      const c = r?.copied || {};
      if (c.complete === false) {
        showToast(`⚠️ 분기했지만 일부만 복제됐습니다 — 노드 ${c.nodes}/${c.sourceNodes} · 자료 ${c.links}/${c.sourceLinks}`);
      } else {
        showToast(`v${r?.version?.versionNo ?? ''} 로 분기 — 노드 ${c.nodes ?? 0} · 자료 ${c.links ?? 0} 복제 (원본은 그대로)`);
      }
    } catch (e) {
      setBranchErr(e.message || '분기하지 못했습니다');
    } finally { setBranchBusy(false); }
  }

  /**
   * 링크 열기 (task-028 D).
   *
   * 🔴 무엇을 여는지는 `openTargetOf()` 순수 함수가 정한다 — 화면이 linkType 을 다시 훑지 않는다.
   *    끊긴 링크는 `{kind:'none'}` 이라 **여기 도달해도 아무 일이 없다**(버튼도 이미 비활성이다).
   *    이중 방어인 이유: 버튼 비활성만 믿으면 키보드·프로그램 클릭에서 뚫린다.
   *
   * 🔴 캐시에 없으면 **한 번 다시 읽고**, 그래도 없으면 열지 않고 그 사실을 말한다.
   *    없는 대상으로 모달을 열면 흰 화면이 남고, 사용자는 앱이 깨진 것으로 읽는다.
   */
  async function openLink(link) {
    const t = openTargetOf(link);
    if (t.kind === 'none') {
      if (t.reason === 'broken') showToast('연결 대상이 사라져 열 수 없습니다 — 연결 기록은 남아 있습니다');
      else if (t.reason === 'no-video') showToast('어느 영상의 챕터인지 알 수 없어 열지 못합니다');
      else showToast('열 수 있는 대상이 없습니다');
      return;
    }
    if (t.kind === 'route') { navigate(t.route); return; }
    if (t.kind === 'url') { window.open(t.route, '_blank', 'noopener,noreferrer'); return; }

    // 🔴 캐시가 낡았을 때의 재조회는 **반환값을 직접 받아** 쓴다.
    //    `reloadClips()` 는 컨텍스트 state 를 바꿀 뿐이고, 이 함수 안의 `clips` 는
    //    이번 렌더에 닫힌 옛 배열이라 아무리 기다려도 갱신되지 않는다
    //    (에러 없이 "항상 못 찾음"이 되는 종류의 함정이다).
    if (t.kind === 'clip') {
      let found = (clips || []).find(c => c.id === t.refId);
      if (!found) {
        try {
          const fresh = await listClips();
          found = (Array.isArray(fresh) ? fresh : []).find(c => c.id === t.refId);
          reloadClips().catch(() => {});   // 캐시도 따라오게 한다(실패해도 이번 열기에는 영향 없다)
        } catch { /* 아래에서 말한다 */ }
      }
      if (!found) { showToast('참고영상을 찾지 못했습니다 — 목록을 새로 고친 뒤 다시 시도해 주세요'); return; }
      setOpenClip(found);
      return;
    }
    if (t.kind === 'class') {
      let found = (classes || []).find(c => c.id === t.refId);
      if (!found) {
        try {
          const fresh = await listClasses();
          found = (Array.isArray(fresh) ? fresh : []).find(c => c.id === t.refId);
          reloadClasses().catch(() => {});
        } catch { /* 아래에서 말한다 */ }
      }
      if (!found) { showToast('수업 기록을 찾지 못했습니다 — 목록을 새로 고친 뒤 다시 시도해 주세요'); return; }
      setOpenClass(found);
    }
  }

  function askDeleteVersion(v) {
    setConfirm({
      title: `v${v.versionNo} 삭제`,
      body: `이 버전의 노드와 붙은 자료가 함께 사라집니다. 되돌릴 수 없습니다.`,
      danger: true,
      run: async () => {
        const r = await deleteVersion(v.id);
        await Promise.all([reloadDetail(openId), reloadList(), reloadSuggest(openId), reloadTask()]);
        showToast(`삭제: 노드 ${r?.deletedNodes ?? 0} · 자료 ${r?.deletedLinks ?? 0}`
          + (r?.deletedTasks ? ` · 이번 주 과제 ${r.deletedTasks}` : ''));
      },
    });
  }

  // ── 노드 ────────────────────────────────────────────────────────────────────

  /**
   * 🔴 시트를 닫을 때마다 상세를 다시 읽는다.
   *    시트 안의 RecallLadder 가 2·3단계를 PATCH 했을 수 있고(콜백이 없다 — 수정 금지 파일),
   *    그러면 사다리 평균이 바뀐다. 안 읽으면 방금 한 일과 모순된 숫자가 화면에 남는다.
   */
  const closeNodeSheet = useCallback(() => {
    setNodeSheet(null);
    reloadDetail(openId);
    reloadList();
    // 🔴 제안도 함께 다시 읽는다 — 채택으로 노드가 생기면 그 제안은 `skipped`(이미 트리에 있음)로
    //    옮겨간다. 안 읽으면 방금 채택한 항목이 화면에 "아직 트리에 없습니다"로 남는다.
    reloadSuggest(openId);
  }, [openId, reloadDetail, reloadList, reloadSuggest]);

  // ── 리액션 제안 (task-027 A) ────────────────────────────────────────────────

  /**
   * 채택 — 🔴 **여기서 노드를 만들지 않는다.** 종류·이름·기술·부모가 미리 채워진 **시트를 연다.**
   *   task-026 의 "대처 추가"와 같은 규칙이다. 즉시 만들면 사용자가 확인하기 전에 DB 가 바뀌고,
   *   "제안은 채택 전에는 저장되지 않는다"는 이 기능의 약속이 클릭 한 번으로 깨진다.
   *   실제 생성은 시트의 저장 → saveNode → createNode 경로 하나뿐이다.
   */
  function adoptSuggestion(sg) {
    setNodeSheet({
      node: null,
      draft: {
        versionId: activeVersionId,
        parentNodeId: sg.parentNodeId ?? null,
        kind: sg.kind || '리액션',
        label: sg.label || '',
        techniqueId: sg.techniqueId ?? null,
      },
    });
  }

  /** 무시 — 🔴 서버 저장 엔드포인트가 계약에 없다. 이 브라우저에만 남고 화면이 그 사실을 말한다. */
  function dismissSuggestion(sg) {
    setDismissed(writeDismissed(openId, dismissKey(sg), true));
  }

  function restoreDismissed() {
    const st = typeof localStorage !== 'undefined' ? localStorage : null;
    let next = readDismissed(openId, st);
    for (const k of Object.keys(next)) next = writeDismissed(openId, k, false, st);
    setDismissed(next);
  }

  // ── 이번 주 과제 (task-027 B) ───────────────────────────────────────────────

  /**
   * 🔴 앱 전체에 1개. 이미 열린 과제가 있으면 서버가 **409** 로 막는다.
   *    이 앱의 axios 인터셉터는 비-2xx 의 본문을 버리므로 409 에 동봉된 현재 과제를 읽을 수 없다
   *    (`api/client.js:26-31`). → **바꾸기 전에 먼저 해제**하고 새로 지정한다.
   *    시트가 무엇이 내려가는지 이름으로 이미 경고한 뒤라 여기서 또 묻지 않는다.
   */
  async function setNodeAsTask(node) {
    setTaskBusy(true);
    try {
      const cur = taskSummary(task);
      if (cur.has && cur.open && cur.id != null && cur.nodeId !== node.id) {
        await apiClearTask(cur.id);
      }
      await apiSetTask({ nodeId: node.id });
      await reloadTask();
      showToast('이번 주 과제로 정했습니다');
    } catch (e) {
      showToast(e.message || '과제를 정하지 못했습니다');
      await reloadTask();   // 서버 상태가 정본이다 — 실패했을 때 화면이 낙관적으로 남지 않게 다시 읽는다
    } finally { setTaskBusy(false); }
  }

  async function clearCurrentTask() {
    const cur = taskSummary(task);
    if (!cur.has || cur.id == null) return;
    setTaskBusy(true);
    try {
      await apiClearTask(cur.id);
      await reloadTask();
      showToast('과제를 해제했습니다');
    } catch (e) {
      showToast(e.message || '해제하지 못했습니다');
      await reloadTask();
    } finally { setTaskBusy(false); }
  }

  async function saveNode(body, ctx) {
    if (ctx.create) {
      const draft = nodeSheet?.draft || {};
      if (draft.mode === 'insertParent') {
        // B-1: target 위쪽에 끼워 넣는다. versionId·parentNodeId 는 서버가 target 에서 유도한다.
        await insertParent(draft.targetId, {
          kind: body.kind, label: body.label, techniqueId: body.techniqueId, note: body.note,
        });
      } else {
        await createNode(body);
      }
    } else {
      if (Object.keys(body).length === 0) { closeNodeSheet(); return; }
      // 🔴 부분 갱신 — 보내지 않은 필드는 서버에 그대로 남는다(task-017 함정 차단).
      await patchNode(ctx.node.id, body);
    }
    closeNodeSheet();
    showToast('저장했습니다');
  }

  function askDeleteNode(node, descendants) {
    setConfirm({
      title: '노드 삭제',
      body: (descendants > 0
        ? `"${node.label || '(이름 없음)'}" 과(와) 그 아래 자손 노드 ${descendants}개가 함께 사라집니다. 자손만 남기는 삭제는 없습니다. 되돌릴 수 없습니다.`
        : `"${node.label || '(이름 없음)'}" 을(를) 지웁니다. 되돌릴 수 없습니다.`)
        // 🔴 이 노드가 이번 주 과제면 과제와 그 마감 이력까지 함께 사라진다. 누르기 전에 말해 준다.
        + (taskSummary(task).nodeId === node.id
            ? ' 🔴 이 노드는 지금 이번 주 과제입니다 — 과제와 마감 이력도 함께 사라집니다.'
            : ''),
      danger: true,
      run: async () => {
        const r = await deleteNode(node.id);
        setNodeSheet(null);
        await Promise.all([reloadDetail(openId), reloadList(), reloadSuggest(openId), reloadTask()]);
        showToast(`삭제: 노드 ${r?.deletedNodes ?? 1} · 자료 ${r?.deletedLinks ?? 0}`
          + (r?.deletedTasks ? ` · 이번 주 과제 ${r.deletedTasks}` : ''));
      },
    });
  }

  async function doMove(row, delta) {
    const target = row.index + delta;
    if (target < 0 || target >= row.siblingCount) return;
    setBusy(true);
    try {
      await moveNode(row.node.id, {
        parentNodeId: row.node.parentNodeId ?? null,
        sortOrder: target,
      });
      // 🔴 낙관적으로 그리지 않는다 — 서버가 정한 순서를 다시 읽어 그린다.
      await reloadDetail(openId);
    } catch (e) {
      showToast(e.message || '옮기지 못했습니다');
    } finally { setBusy(false); }
  }

  // ── 렌더 ────────────────────────────────────────────────────────────────────

  if (openId != null) {
    if (errs.detail) {
      return (
        <div>
          <h1 className="page-header">연구</h1>
          <Card>
            <Hint>프로젝트를 불러오지 못했습니다 — {errs.detail}</Hint>
            <div style={{ marginTop: 10 }}>
              <Button variant="outline" size="sm" onClick={() => setOpenId(null)}>목록으로</Button>
            </div>
          </Card>
        </div>
      );
    }
    if (!detail) {
      return (
        <div>
          <h1 className="page-header">연구</h1>
          <Card><Hint>불러오는 중…</Hint></Card>
        </div>
      );
    }

    const uncovered = detail.coverage?.uncoveredReactionNodeIds || [];
    // 🔴 순수 함수로 갈라 둔다 — QA 하네스가 HTTP 없이 이 분류를 직접 잴 수 있어야 한다.
    const split = splitSuggestions(suggest, dismissed);

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span onClick={() => setOpenId(null)} style={{ cursor: 'pointer', display: 'flex' }}>
            <Icon name="chevL" size={20} color="var(--text2)" />
          </span>
          <h1 className="page-header" style={{ margin: 0, flex: 1, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
            {detail.title}
          </h1>
        </div>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {detail.startPos && <Tag tone="blue">{detail.startPos}</Tag>}
            {detail.goal && <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>목표 · {detail.goal}</span>}
            <span
              onClick={() => setProjForm({ project: detail })}
              style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--accent-lt)', cursor: 'pointer' }}
            >수정</span>
            <span onClick={askDeleteProject} style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', cursor: 'pointer' }}>삭제</span>
          </div>
          <ProgressPair coverage={detail.coverage} ladder={detail.ladder} />
          {detail.createdAt && (
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>시작 {fmtDay(detail.createdAt)}</div>
          )}
        </Card>

        <SectionTitle>버전</SectionTitle>
        <Card>
          <VersionTabs
            versions={detail.versions}
            activeVersionId={activeVersionId}
            onSwitch={switchVersion}
            onRename={renameVersion}
            onDelete={askDeleteVersion}
            onBranch={() => { setBranchErr(''); setBranchOpen(true); }}
            busy={busy}
          />
        </Card>

        <SectionTitle right={detailLoading ? <span style={{ fontSize: 11, color: 'var(--text3)' }}>갱신 중…</span> : null}>
          트리
        </SectionTitle>

        {/* 이 화면의 본업 — 대처 없는 리액션이 몇 개인지를 트리 위에서 먼저 말한다. */}
        {uncovered.length > 0 && (
          <div style={{
            margin: '0 0 10px', padding: 10, borderRadius: 10,
            background: 'var(--amber-dim)', border: '1px dashed var(--amber)',
            fontSize: 12, color: 'var(--amber)', lineHeight: 1.55,
          }}>
            <b>대처가 없는 리액션 {uncovered.length}개</b> — 아래 트리에서 앰버 점선으로 표시했습니다.
            상대가 그렇게 반응했을 때 할 일이 아직 정해지지 않은 자리입니다.
          </div>
        )}

        {/* 리액션 자동 유입 (task-027 A) — 🔴 보여 줄 게 없으면 컴포넌트가 **null 을 돌려준다.**
            빈 블록("제안 0개")을 그리지 않는다. 여기서 조건을 또 쓰면 두 곳이 갈린다. */}
        {errs.suggest ? (
          <div style={{
            margin: '0 0 10px', padding: 10, borderRadius: 10,
            background: 'var(--surface)', border: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text2)', lineHeight: 1.55,
          }}>
            매트에서 올라온 리액션을 불러오지 못했습니다 — {errs.suggest}
          </div>
        ) : (
          <ResearchSuggestions
            split={split}
            res={suggest}
            busy={busy}
            onAdopt={adoptSuggestion}
            onDismiss={dismissSuggestion}
            onRestore={restoreDismissed}
            // task-028 A — 재료가 없어서 비어 있을 때 **재료를 만드는 길**로 보낸다.
            onGo={(to) => navigate(to)}
          />
        )}

        <Card>
          <ResearchTree
            nodes={detail.nodes}
            uncoveredIds={uncovered}
            techniques={techniques}
            onOpen={(n) => setNodeSheet({ node: n, draft: null })}
            onAddRoot={() => setNodeSheet({ node: null, draft: { versionId: activeVersionId, parentNodeId: null, kind: '포지션' } })}
            onAddChild={(n) => setNodeSheet({ node: null, draft: { versionId: activeVersionId, parentNodeId: n.id, kind: '리액션' } })}
            onAddCoverage={(n) => setNodeSheet({ node: null, draft: { versionId: activeVersionId, parentNodeId: n.id, kind: '대처' } })}
            onInsertParent={(n) => setNodeSheet({ node: null, draft: { versionId: activeVersionId, mode: 'insertParent', targetId: n.id, kind: '세팅' } })}
            onMove={doMove}
            onDelete={(row) => askDeleteNode(row.node, row.descendantCount)}
          />
        </Card>

        <div style={{ height: 20 }} />

        {nodeSheet && (
          <ResearchNodeSheet
            open
            node={nodeSheet.node}
            draft={nodeSheet.draft}
            techniques={techniques}
            descendantCount={nodeSheet.node ? (rowById.get(nodeSheet.node.id)?.descendantCount ?? 0) : 0}
            onClose={closeNodeSheet}
            onSave={saveNode}
            onDelete={askDeleteNode}
            task={task}
            taskErr={errs.task}
            onSetTask={setNodeAsTask}
            onClearTask={clearCurrentTask}
            taskBusy={taskBusy}
            // task-028 C·D — 자료 가져오기·열기
            onOpenLink={openLink}
            // 🔴 링크가 바뀌면 트리의 자료 개수(`nodeView.linkCount`·`brokenLinkCount`)도 바뀐다.
            //    다시 읽지 않으면 시트를 닫는 순간 화면이 방금 한 일과 모순된 숫자를 보여 준다.
            onLinksChanged={() => { reloadDetail(openId); reloadList(); }}
            showToast={showToast}
          />
        )}

        {projForm && (
          <ResearchProjectForm
            open
            project={projForm.project}
            positions={positions}
            onClose={() => setProjForm(null)}
            onSave={saveProject}
          />
        )}

        {/* task-028 B — 분기 확인. 🔴 무엇이 복제되는지·원본이 남는지를 먼저 말한다. */}
        <ResearchBranchModal
          open={branchOpen}
          detail={detail}
          busy={branchBusy}
          err={branchErr}
          onClose={() => { setBranchOpen(false); setBranchErr(''); }}
          onConfirm={doBranch}
        />

        {/* task-028 D — 링크 열기. 기존 모달을 그대로 재사용한다(새 상세 화면을 만들지 않는다).
            🔴 읽기 전용으로 연다 — onEdit/onDelete 를 넘기지 않는다. 연구 화면에서 남의 맥락으로
               들어온 자료를 수정·삭제하게 하면, 사용자가 어디를 고치고 있는지 잃는다. */}
        {openClip && (
          <ClipDetailModal c={openClip} onClose={() => setOpenClip(null)} />
        )}
        {openClass && (
          <ClassDetailModal initial={openClass} onClose={() => setOpenClass(null)} />
        )}

        <Confirm
          open={!!confirm}
          title={confirm?.title}
          body={confirm?.body}
          danger={confirm?.danger}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setBusy(true);
            try { await confirm.run(); setConfirm(null); }
            catch (e) { showToast(e.message || '처리하지 못했습니다'); }
            finally { setBusy(false); }
          }}
        />
      </div>
    );
  }

  // ── 목록 ────────────────────────────────────────────────────────────────────

  return (
    <div>
      <h1 className="page-header">연구</h1>

      {errs.list && (
        <Card style={{ marginBottom: 10 }}>
          <Hint>프로젝트 목록을 불러오지 못했습니다 — {errs.list}</Hint>
        </Card>
      )}

      {/* 🔴 막지 않는다. 에러처럼 보이지 않게 권고 문구로만 쓴다. */}
      {warnOverload && (
        <div style={{
          marginBottom: 10, padding: 10, borderRadius: 10,
          background: 'var(--surface-up)', border: '1px solid var(--border-med)',
          fontSize: 12, color: 'var(--text2)', lineHeight: 1.55,
        }}>
          지금 {projects.length}개를 동시에 연구 중입니다 — <b style={{ color: 'var(--text)' }}>2개 이하</b>를 권합니다.
          막지는 않습니다.
        </div>
      )}

      {listLoading ? (
        <Card><Hint>불러오는 중…</Hint></Card>
      ) : projects.length === 0 && !errs.list ? (
        <ResearchEmptyState
          holes={holes}
          err={errs.holes}
          loading={holesLoading}
          busy={busy}
          onStart={startFromHole}
          onBlank={() => setProjForm({ project: null })}
          goCalendar={() => navigate('/calendar')}
          onRefresh={reloadHoles}
        />
      ) : (
        <>
          {/* 검색 + ＋ (task-029 B-4). 🔴 `＋` 만 남기므로 aria-label·title 이 필수다 —
              없으면 스크린리더에서 "버튼"으로만 읽혀 정체를 알 수 없다. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              flex: 1, minWidth: 0,
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
            }}>
              <Icon name="search" size={16} color="var(--text3)" />
              <input
                value={q}
                onChange={e => { setQ(e.target.value); setPage(1); }}
                placeholder="제목·목표·시작 포지션 검색"
                aria-label="프로젝트 검색"
                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 14, outline: 'none' }}
              />
            </div>
            <button
              type="button"
              onClick={() => setProjForm({ project: null })}
              aria-label="새 프로젝트"
              title="새 프로젝트"
              style={{
                flex: '0 0 auto', width: 40, height: 40,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--surface)', color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 10,
                fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: 'pointer',
              }}
            >＋</button>
          </div>

          {filtered.length === 0 ? (
            <Card><Hint>검색과 맞는 프로젝트가 없습니다 — 전체 {projects.length}개 중 0개</Hint></Card>
          ) : (
            <>
              {paged.map(p => <ProjectCard key={p.id} p={p} onOpen={setOpenId} />)}
              {/* 🔴 `page` 가 아니라 clamp 한 `safePage` 를 넘긴다 — 목록이 줄어 범위를 벗어난 뒤에도
                  현재 페이지 표시와 실제로 그린 목록이 어긋나지 않게 한다. */}
              <Pagination total={filtered.length} page={safePage} pageSize={PAGE_SIZE} onPageChange={setPage} />
            </>
          )}
        </>
      )}

      {/* 추천/미연결 상시 노출 (task-029 B-2).
          🔴 **기본 접힘.** 이 화면의 본업은 프로젝트 목록이고, 추천이 목록을 밀어내면 안 된다.
          🔴 프로젝트가 0개일 때는 빈 상태가 이미 같은 재료를 펼쳐 보여 준다 — 여기서 또 그리지 않는다. */}
      {!listLoading && projects.length > 0 && (
        <Card style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setStartersOpen(v => !v)}
              aria-expanded={startersOpen}
              style={{
                flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6,
                background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                textAlign: 'left', color: 'var(--text)', fontSize: 13, fontWeight: 700,
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{startersOpen ? '▾' : '▸'}</span>
              <span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                {holes
                  ? `${STARTERS_TITLE} ${(holes.holes || []).length} · ${UNLINKED_TITLE} ${(holes.unlinked || []).length}`
                  : errs.holes
                    ? `${STARTERS_TITLE} · ${UNLINKED_TITLE} — 불러오지 못했습니다`
                    : `${STARTERS_TITLE} · ${UNLINKED_TITLE} 불러오는 중…`}
              </span>
            </button>
            {/* 🔴 폴링하지 않는다. 사용자가 누를 때만 다시 읽는다(B-3). */}
            <Button variant="outline" size="sm" disabled={holesLoading} onClick={reloadHoles}>
              {holesLoading ? '읽는 중…' : '새로고침'}
            </Button>
          </div>

          {startersOpen && (
            <div style={{ marginTop: 10 }}>
              {errs.holes && !holes ? (
                <Hint>추천을 불러오지 못했습니다 — {errs.holes}</Hint>
              ) : !holes ? (
                <Hint>불러오는 중…</Hint>
              ) : (
                <ResearchStarters holes={holes} busy={busy} onStart={startFromHole} />
              )}
            </div>
          )}
        </Card>
      )}

      <div style={{ height: 20 }} />

      {projForm && (
        <ResearchProjectForm
          open
          project={projForm.project}
          positions={positions}
          onClose={() => setProjForm(null)}
          onSave={saveProject}
        />
      )}
    </div>
  );
}
