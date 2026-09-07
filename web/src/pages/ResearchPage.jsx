import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';
import { getHoles } from '../api/lab';
import { getPositions } from '../api/techniques';
import {
  listProjects, createProject, getProject, patchProject, deleteProject,
  patchVersion, deleteVersion,
  createNode, patchNode, deleteNode, moveNode, insertParent,
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
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 3 }}>사다리 평균</div>
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

function VersionTabs({ versions, activeVersionId, onSwitch, onRename, onDelete, busy }) {
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

        {/* 🔴 자리만 만든 버튼. 누르면 아무 일 없는 **활성** 버튼이 제일 나쁘므로 disabled 로 둔다. */}
        <Button variant="outline" size="sm" disabled>＋ 분기</Button>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>task-027에서 열립니다</span>

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
  const { techniques } = useCache();
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
  const holesStarted = useRef(false);

  const [projForm, setProjForm] = useState(null);   // {project|null}
  const [nodeSheet, setNodeSheet] = useState(null); // {node|null, draft|null}
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => { reloadList(); }, [reloadList]);

  useEffect(() => {
    let alive = true;
    getPositions()
      .then(d => { if (alive) setPositions(Array.isArray(d) ? d : []); })
      .catch(e => { if (alive) fail('positions')(e); });
    return () => { alive = false; };
  }, []);

  // 빈 상태에서만 구멍 목록을 읽는다 — 프로젝트가 있으면 필요 없는 요청이다.
  //
  // 🔴 "이미 시작했다" 플래그는 **ref** 여야 한다. state 로 두고 deps 에 넣으면
  //    setHolesLoading(true) 가 곧바로 이 이펙트를 재실행시키고, 그 정리(cleanup)가
  //    첫 요청의 응답을 버린다 → 요청은 200 인데 화면은 영원히 "불러오는 중…" 이다.
  //    (실행 하네스가 실제로 잡은 결함. HTTP 로그만 보면 정상이라 코드 검토로는 안 보인다.)
  useEffect(() => {
    if (listLoading || projects.length > 0 || holesStarted.current) return;
    holesStarted.current = true;
    setHolesLoading(true);
    getHoles()
      .then(setHoles)
      .catch(fail('holes'))
      .finally(() => setHolesLoading(false));
  }, [listLoading, projects.length]);

  useEffect(() => {
    if (openId == null) { setDetail(null); return; }
    reloadDetail(openId);
  }, [openId, reloadDetail]);

  const tree = useMemo(() => buildTree(detail?.nodes), [detail]);
  const rowById = useMemo(() => {
    const m = new Map();
    for (const r of tree.rows) m.set(r.node.id, r);
    return m;
  }, [tree]);

  const activeVersionId = detail?.activeVersionId ?? null;

  // ── 프로젝트 ────────────────────────────────────────────────────────────────

  async function saveProject(body, isCreate) {
    if (isCreate) {
      const created = await createProject(body);
      const id = created?.id ?? created?.project?.id ?? null;
      setProjForm(null);
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
        await reloadList();
        showToast(`삭제: 버전 ${r?.deletedVersions ?? 0} · 노드 ${r?.deletedNodes ?? 0} · 자료 ${r?.deletedLinks ?? 0}`);
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

  function askDeleteVersion(v) {
    setConfirm({
      title: `v${v.versionNo} 삭제`,
      body: `이 버전의 노드와 붙은 자료가 함께 사라집니다. 되돌릴 수 없습니다.`,
      danger: true,
      run: async () => {
        const r = await deleteVersion(v.id);
        await Promise.all([reloadDetail(openId), reloadList()]);
        showToast(`삭제: 노드 ${r?.deletedNodes ?? 0} · 자료 ${r?.deletedLinks ?? 0}`);
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
  }, [openId, reloadDetail, reloadList]);

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
      body: descendants > 0
        ? `"${node.label || '(이름 없음)'}" 과(와) 그 아래 자손 노드 ${descendants}개가 함께 사라집니다. 자손만 남기는 삭제는 없습니다. 되돌릴 수 없습니다.`
        : `"${node.label || '(이름 없음)'}" 을(를) 지웁니다. 되돌릴 수 없습니다.`,
      danger: true,
      run: async () => {
        const r = await deleteNode(node.id);
        setNodeSheet(null);
        await Promise.all([reloadDetail(openId), reloadList()]);
        showToast(`삭제: 노드 ${r?.deletedNodes ?? 1} · 자료 ${r?.deletedLinks ?? 0}`);
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

        <Card>
          <ResearchTree
            nodes={detail.nodes}
            uncoveredIds={uncovered}
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
        />
      ) : (
        <>
          {projects.map(p => <ProjectCard key={p.id} p={p} onOpen={setOpenId} />)}
          <Button variant="outline" size="sm" onClick={() => setProjForm({ project: null })}>＋ 새 프로젝트</Button>
        </>
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
