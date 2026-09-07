import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Tag from './Tag';
import RecallLadder from './RecallLadder';
import ResearchLinkList from './ResearchLinkList';
import ResearchImportSheet from './ResearchImportSheet';
import { KINDS, KIND_TONE } from './ResearchTree';
import { taskSummary } from '../utils/weeklyTask';
import { normalizeLinks } from '../utils/researchLinks';
import { listNodeLinks, addNodeLink, removeNodeLink } from '../api/research';

// ═════════════════════════════════════════════════════════════════════════════
// 노드 시트 — 종류 · 이름 · 기술 연결 · 사다리 · 메모
//
// 🔴 이 파일의 급소는 **사다리 캐시 키**다.
//    사다리는 기술 단위(`techniques.id`)이지 노드 단위가 아니다(task-024 계약).
//    여기서 노드 id 로 mastery 를 캐싱하면 **같은 기술을 쓰는 두 노드가 서로 다른 사다리를 본다.**
//    → 이 파일은 mastery 를 **한 번도 직접 읽지 않는다.** RecallLadder 에 techId 만 넘기고,
//      RecallLadder 가 useEffect(..., [techId]) 로 스스로 읽는다. 캐시를 새로 만들지 마라.
//
// 🔴 두 번째 급소는 **저장 시 필드 유실**(task-017: destroy+reinsert 로 positions 54행 중 36행이 빈 배열).
//    이번엔 PATCH 부분 갱신이라 구조적으로 못 일어나지만, 폼 state 는 여전히 3곳을 맞춰야 한다:
//      ① 시트를 열 때 채우는 초기값        → emptyForm / formFromNode
//      ② 기존 노드 → 폼 매핑              → formFromNode (useEffect 로 node 가 바뀔 때마다)
//      ③ payload 빌더                    → buildPatch / buildCreate
//    필드를 하나 늘릴 때 이 3곳을 전부 고치지 않으면 그 필드는 조용히 사라진다.
//    FIELDS 상수 하나로 세 곳을 묶어 두는 이유가 그것이다.
// ═════════════════════════════════════════════════════════════════════════════

/** 이 시트가 다루는 노드 필드. 🔴 필드를 늘리면 여기에 먼저 추가한다. */
const FIELDS = ['kind', 'label', 'techniqueId', 'note'];

const LIMIT = { label: 100, note: 500 };

/**
 * ① 초기값. draft 는 "이 시트를 어떤 값으로 열어 달라"는 요청이다.
 *
 * 🔴 task-027 에서 **draft 가 label·techniqueId 까지 실어 온다**(리액션 제안 채택).
 *    FIELDS 를 하나씩 명시적으로 읽는다 — draft 를 통째로 스프레드하면 versionId·parentNodeId 같은
 *    컨텍스트 키가 폼에 섞여 들어가 buildPatch 의 비교 대상이 오염된다.
 */
function emptyForm(draft) {
  const d = draft || {};
  return {
    kind: d.kind || '포지션',
    label: typeof d.label === 'string' ? d.label : '',
    techniqueId: d.techniqueId ?? null,
    note: typeof d.note === 'string' ? d.note : '',
  };
}

/** ② 기존 노드 → 폼. FIELDS 전부를 빠짐없이 옮긴다. */
function formFromNode(n) {
  return {
    kind: n.kind || '포지션',
    label: n.label || '',
    techniqueId: n.techniqueId ?? null,
    note: n.note || '',
  };
}

/**
 * ③ payload 빌더(수정) — **바뀐 필드만** 담는다.
 * 🔴 null 로 바뀐 경우(기술 연결 해제)도 "바뀜"이다. undefined 로 빠뜨리면 해제가 저장되지 않는다.
 */
export function buildPatch(form, orig) {
  const body = {};
  for (const f of FIELDS) {
    const a = form[f] ?? null;
    const b = orig[f] ?? null;
    if (a !== b) body[f] = a;
  }
  return body;
}

/** ③ payload 빌더(생성) — 서버가 요구하는 컨텍스트 + FIELDS 전부. */
export function buildCreate(form, draft) {
  return {
    versionId: draft.versionId,
    parentNodeId: draft.parentNodeId ?? null,
    kind: form.kind,
    label: form.label,
    techniqueId: form.techniqueId ?? null,
    note: form.note,
  };
}

/** NFC 로 맞춘 뒤 부분 일치. 🔴 신규 매처를 만들지 않는다 — 화면 안 좁히기용 최소 필터다. */
function matchTechniques(techniques, q) {
  const needle = String(q || '').normalize('NFC').trim().toLowerCase();
  const list = Array.isArray(techniques) ? techniques : [];
  if (!needle) return list.slice(0, 12);
  return list
    .filter(t => String(t.name || '').normalize('NFC').toLowerCase().includes(needle))
    .slice(0, 20);
}

function KindPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {KINDS.map(k => {
        const t = KIND_TONE[k];
        const on = value === k;
        return (
          <span
            key={k}
            onClick={() => onChange(k)}
            style={{
              padding: '6px 11px', borderRadius: 8,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              color: on ? t.color : 'var(--text2)',
              background: on ? t.bg : 'var(--surface)',
              border: on ? `1px solid ${t.color}` : '1px solid var(--border)',
            }}
          >{k}</span>
        );
      })}
    </div>
  );
}

export default function ResearchNodeSheet({
  open, node, draft, techniques, onClose, onSave, onDelete, descendantCount = 0,
  // task-027 — 이번 주 과제 지정. 세 화면 중 **정하는 곳**이 여기다.
  task, taskErr, onSetTask, onClearTask, taskBusy,
  // task-028 — 자료 링크. 여는 것은 페이지가 한다(모달·라우팅은 페이지 소관).
  onOpenLink, onLinksChanged, showToast,
}) {
  const isCreate = !node;
  // ① 초기값
  const [form, setForm] = useState(() => (node ? formFromNode(node) : emptyForm(draft)));
  const [orig, setOrig] = useState(() => (node ? formFromNode(node) : emptyForm(draft)));
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // ── task-028 자료 링크 ────────────────────────────────────────────────────
  // 🔴 링크는 **노드가 이미 있어야** 붙는다. 생성 시트에서는 그리지 않는다 —
  //    아직 없는 노드에 자료를 붙일 수 없고, "저장하면 붙여 드릴게요"라고 약속하면
  //    저장 실패 시 사용자가 고른 자료가 조용히 사라진다.
  const [links, setLinks] = useState([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linksErr, setLinksErr] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const reloadLinks = useCallback(async (nodeId) => {
    if (nodeId == null) { setLinks([]); return; }
    setLinksLoading(true);
    try {
      const d = await listNodeLinks(nodeId);
      setLinks(Array.isArray(d?.links) ? d.links : []);
      setLinksErr('');
    } catch (e) {
      // 🔴 실패를 "자료 없음"으로 뭉개지 않는다 — 붙여 둔 자료가 있는데 없는 것처럼 보이면
      //    사용자는 같은 것을 또 붙인다.
      setLinks([]);
      setLinksErr(e.message || '불러오지 못했습니다');
    } finally {
      setLinksLoading(false);
    }
  }, []);

  // ② node/draft 가 바뀌면 폼을 다시 채운다. 안 하면 이전 노드의 값이 남아 다음 노드에 저장된다.
  useEffect(() => {
    const f = node ? formFromNode(node) : emptyForm(draft);
    setForm(f); setOrig(f);
    setQ(''); setPick(false); setErr('');
    // 🔴 링크도 함께 초기화한다. 안 하면 **이전 노드의 자료가 다음 노드에 붙어 보인다**
    //    (그 상태에서 "연결 지우기"를 누르면 남의 노드 자료를 지운다).
    setImportOpen(false); setLinksErr('');
    setLinks([]);
    if (node) reloadLinks(node.id);
  }, [node, draft, reloadLinks]);

  async function pickLink(body, item) {
    setLinkBusy(true);
    try {
      await addNodeLink(node.id, body);
      await reloadLinks(node.id);
      onLinksChanged && onLinksChanged();
      showToast && showToast(`가져왔습니다 — ${item?.title || ''}`.trim());
    } catch (e) {
      showToast && showToast(e.message || '가져오지 못했습니다');
    } finally { setLinkBusy(false); }
  }

  async function dropLink(link) {
    setLinkBusy(true);
    try {
      await removeNodeLink(node.id, link.id);
      await reloadLinks(node.id);
      onLinksChanged && onLinksChanged();
    } catch (e) {
      showToast && showToast(e.message || '지우지 못했습니다');
    } finally { setLinkBusy(false); }
  }

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const techName = useMemo(() => {
    if (form.techniqueId == null) return null;
    const t = (techniques || []).find(x => x.id === form.techniqueId);
    // 목록에서 못 찾아도 "연결 없음"으로 되돌리지 않는다 — 연결은 서버에 있다.
    return t ? t.name : (node?.techniqueName || `#${form.techniqueId}`);
  }, [form.techniqueId, techniques, node]);

  const hits = useMemo(() => matchTechniques(techniques, q), [techniques, q]);

  const tSum = useMemo(() => taskSummary(task), [task]);
  // 가져오기 시트가 "이미 붙어 있음"을 판정할 때 쓰는 목록 — 목록 컴포넌트와 **같은 정규화**를 쓴다.
  const normLinks = useMemo(() => normalizeLinks(links), [links]);
  const dirty = useMemo(() => Object.keys(buildPatch(form, orig)).length > 0, [form, orig]);
  const tooLong = form.label.length > LIMIT.label || (form.note || '').length > LIMIT.note;

  async function save() {
    setBusy(true); setErr('');
    try {
      if (isCreate) await onSave(buildCreate(form, draft), { create: true });
      else await onSave(buildPatch(form, orig), { create: false, node });
    } catch (e) {
      setErr(e.message || '저장하지 못했습니다');
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? '노드 추가' : '노드'}
    >
      <div className="field">
        <label>종류</label>
        <KindPicker value={form.kind} onChange={v => set('kind', v)} />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
          7종 전부 어느 깊이에나 놓을 수 있습니다 — 수업이 실제로 중간에 포지션을 바꾸기 때문입니다.
        </div>
      </div>

      <div className="field">
        <label>이름 <span style={{ color: form.label.length > LIMIT.label ? 'var(--red)' : 'var(--text3)' }}>
          {form.label.length}/{LIMIT.label}
        </span></label>
        <input
          value={form.label}
          onChange={e => set('label', e.target.value)}
          placeholder="예) 상대가 팔을 뺀다"
        />
      </div>

      <div className="field">
        <label>기술 연결</label>
        {form.techniqueId != null ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '9px 11px', borderRadius: 10,
            background: 'var(--surface)', border: '1px solid var(--border-med)',
          }}>
            <span style={{
              fontSize: 13, fontWeight: 700,
              whiteSpace: 'normal', overflowWrap: 'anywhere',
            }}>{techName}</span>
            <span
              onClick={() => { set('techniqueId', null); setPick(false); }}
              style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}
            >연결 해제</span>
          </div>
        ) : (
          <>
            {/* 🔴 미연결은 결함이 아니라 상태다. 숨기지 않고 그대로 드러내되,
                이 화면에서 **앰버는 "대처 없는 리액션" 전용**이라 중립 점선으로 낮춘다
                (Leader 결정, task-026). /recall 의 미연결 앰버는 그대로 둔다 — 거기선 그게 본업 신호다. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              padding: '9px 11px', borderRadius: 10,
              background: 'transparent', border: '1px dashed var(--border-med)',
            }}>
              <Tag tone="neutral">미연결</Tag>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>기술을 고르지 않은 자유 라벨입니다</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <input
                value={q}
                onChange={e => { setQ(e.target.value); setPick(true); }}
                onFocus={() => setPick(true)}
                placeholder="기술 이름으로 검색"
              />
            </div>
            {pick && (
              <div style={{
                marginTop: 6, maxHeight: 190, overflowY: 'auto',
                border: '1px solid var(--border)', borderRadius: 10,
              }}>
                {hits.length === 0 ? (
                  <div style={{ padding: 10, fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                    일치하는 기술이 없습니다. 그대로 두면 <b style={{ color: 'var(--text)' }}>미연결</b> 노드가 됩니다
                    — 사라지지 않고 트리에 그대로 남습니다.
                  </div>
                ) : hits.map(t => (
                  <div
                    key={t.id}
                    onClick={() => { set('techniqueId', t.id); setPick(false); setQ(''); }}
                    style={{
                      padding: '9px 11px', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 13,
                      whiteSpace: 'normal', overflowWrap: 'anywhere',
                    }}
                  >
                    {t.name}
                    {t.pos && <span style={{ color: 'var(--text3)', fontSize: 11 }}> · {t.pos}</span>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="field">
        <label>숙련도</label>
        {form.techniqueId != null ? (
          <div style={{
            padding: 12, borderRadius: 12,
            background: 'var(--surface)', border: '1px solid var(--border)',
          }}>
            {/* 🔴 키는 노드 id 가 아니라 techniqueId 다.
                같은 기술을 쓰는 두 노드는 여기서 **같은 사다리**를 본다. */}
            <RecallLadder techId={form.techniqueId} name={techName} />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>
              숙련도는 기술 단위입니다 — 같은 기술을 쓰는 다른 노드에서도 이 상태가 그대로 보입니다.
              2·3단계를 체크하면 숙련도 평균이 바뀝니다.
            </div>
          </div>
        ) : (
          // 🔴 /api/mastery/null 은 404 다. 미연결 노드에 사다리를 열지 않는다.
          <div style={{
            padding: 12, borderRadius: 12,
            border: '1px dashed var(--border-med)',
            fontSize: 12, color: 'var(--text2)', lineHeight: 1.5,
          }}>
            기술을 연결하면 숙련도가 열립니다.
          </div>
        )}
      </div>

      {/* ── 붙은 자료 (task-028 C·D) ──────────────────────────────────────────
          🔴 생성 시트에는 그리지 않는다 — 아직 없는 노드에 자료를 붙일 수 없다.
          🔴 "열기"는 여기서 하지 않는다. 모달·라우팅은 페이지 소관이라 콜백으로 올린다 —
             이 컴포넌트가 react-router 를 알게 되면 QA 하네스가 시트만 따로 띄울 수 없다. */}
      {!isCreate && (
        <ResearchLinkList
          links={links}
          loading={linksLoading}
          err={linksErr}
          busy={linkBusy || busy}
          onAdd={() => setImportOpen(true)}
          onOpen={(l) => onOpenLink && onOpenLink(l)}
          onDelete={dropLink}
        />
      )}

      {/* ── 이번 주 과제 (task-027) ────────────────────────────────────────────
          🔴 **앱 전체에 1개만.** 다른 노드가 이미 과제면 바꾸기 전에 무엇이 내려가는지 이름으로 말해 준다
             — "덮어씁니다" 같은 추상어로 넘기면 사용자가 무엇을 잃는지 모른 채 누른다.
          🔴 아직 만들지 않은 노드(생성 시트)에는 그리지 않는다. 존재하지 않는 노드를 과제로 삼을 수 없다.
          🔴 세 화면이 같은 값을 보여야 하므로 여기서도 taskSummary() 하나만 쓴다. */}
      {!isCreate && onSetTask && (
        <div className="field">
          <label>이번 주 과제</label>
          {/* 🔴 조회 실패를 "과제 없음"으로 뭉개면, 이미 과제가 있는데도 지정 버튼이 그대로 보여
              누르는 순간 서버가 409 로 막는다 — 사용자는 이유를 모른 채 실패만 본다. */}
          {taskErr && (
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.55 }}>
              지금 과제를 불러오지 못했습니다 — {taskErr}. 이미 정해 둔 과제가 있으면 지정이 거부될 수 있습니다.
            </div>
          )}
          {tSum.has && tSum.nodeId === node.id ? (
            <div style={{
              padding: 12, borderRadius: 12,
              background: 'var(--accent-dim)', border: '1px solid var(--accent)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-lt)' }}>
                {tSum.open ? '이번 주 과제입니다' : `마감함 · ${tSum.outcomeLabel || tSum.outcome}`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>
                {tSum.open
                  ? '홈에서도 보이고, 스파링을 저장할 때 3택으로 마감합니다.'
                  : '이미 마감된 과제입니다 — 다시 정하려면 해제한 뒤 지정하세요.'}
              </div>
              {tSum.open && (
                <div style={{ marginTop: 10 }}>
                  <Button variant="outline" size="sm" disabled={taskBusy} onClick={onClearTask}>
                    과제 해제
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div style={{
              padding: 12, borderRadius: 12,
              border: '1px dashed var(--border-med)',
            }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }}>
                이 노드를 이번 주에 팔 자리로 정합니다. 홈과 스파링 저장 화면에 함께 나타납니다.
              </div>
              {tSum.has && tSum.open && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.55 }}>
                  🔴 지금 과제는 <b style={{ color: 'var(--text)' }}>{tSum.title}</b> 입니다 —
                  과제는 앱 전체에 하나뿐이라 바꾸면 그 과제는 <b style={{ color: 'var(--text)' }}>마감되지 않은 채 내려갑니다.</b>
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <Button variant="primary" size="sm" disabled={taskBusy} onClick={() => onSetTask(node)}>
                  {tSum.has && tSum.open ? '이 노드로 바꾸기' : '이 노드를 이번 주 과제로'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="field">
        <label>메모 <span style={{ color: (form.note || '').length > LIMIT.note ? 'var(--red)' : 'var(--text3)' }}>
          {(form.note || '').length}/{LIMIT.note}
        </span></label>
        <textarea
          value={form.note}
          onChange={e => set('note', e.target.value)}
          placeholder="이 자리에서 놓치는 디테일"
        />
      </div>

      {err && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{err}</div>}
      {tooLong && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>
          길이 제한을 넘었습니다 — 서버가 400 으로 거부합니다(잘려서 저장되지 않습니다).
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button
          variant="primary"
          onClick={save}
          disabled={busy || tooLong || (!isCreate && !dirty)}
        >{busy ? '저장 중…' : '저장'}</Button>
        <Button variant="outline" onClick={onClose} disabled={busy}>닫기</Button>
        {!isCreate && (
          <span
            onClick={busy ? undefined : () => onDelete(node, descendantCount)}
            style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--red)', cursor: 'pointer' }}
          >삭제</span>
        )}
      </div>

      {!isCreate && !dirty && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
          바뀐 내용이 없습니다. 저장하면 바뀐 필드만 서버로 갑니다 — 건드리지 않은 값은 그대로 남습니다.
        </div>
      )}

      {/* 🔴 가져오기 시트는 이 시트 **위에** 뜬다. 노드 시트를 닫지 않는 이유는,
          닫으면 부모가 상세를 다시 읽어(closeNodeSheet) 사용자가 있던 자리를 잃기 때문이다. */}
      {!isCreate && importOpen && (
        <ResearchImportSheet
          open
          nodeLabel={form.label || node?.label}
          links={normLinks}
          busy={linkBusy}
          onClose={() => setImportOpen(false)}
          onPick={pickLink}
        />
      )}
    </Modal>
  );
}
