import React, { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Tag from './Tag';
import RecallLadder from './RecallLadder';
import { KINDS, KIND_TONE } from './ResearchTree';

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

function emptyForm(kind) {
  return { kind: kind || '포지션', label: '', techniqueId: null, note: '' };
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
}) {
  const isCreate = !node;
  // ① 초기값
  const [form, setForm] = useState(() => (node ? formFromNode(node) : emptyForm(draft?.kind)));
  const [orig, setOrig] = useState(() => (node ? formFromNode(node) : emptyForm(draft?.kind)));
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // ② node/draft 가 바뀌면 폼을 다시 채운다. 안 하면 이전 노드의 값이 남아 다음 노드에 저장된다.
  useEffect(() => {
    const f = node ? formFromNode(node) : emptyForm(draft?.kind);
    setForm(f); setOrig(f);
    setQ(''); setPick(false); setErr('');
  }, [node, draft]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const techName = useMemo(() => {
    if (form.techniqueId == null) return null;
    const t = (techniques || []).find(x => x.id === form.techniqueId);
    // 목록에서 못 찾아도 "연결 없음"으로 되돌리지 않는다 — 연결은 서버에 있다.
    return t ? t.name : (node?.techniqueName || `#${form.techniqueId}`);
  }, [form.techniqueId, techniques, node]);

  const hits = useMemo(() => matchTechniques(techniques, q), [techniques, q]);

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
        <label>사다리</label>
        {form.techniqueId != null ? (
          <div style={{
            padding: 12, borderRadius: 12,
            background: 'var(--surface)', border: '1px solid var(--border)',
          }}>
            {/* 🔴 키는 노드 id 가 아니라 techniqueId 다.
                같은 기술을 쓰는 두 노드는 여기서 **같은 사다리**를 본다. */}
            <RecallLadder techId={form.techniqueId} name={techName} />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>
              사다리는 기술 단위입니다 — 같은 기술을 쓰는 다른 노드에서도 이 상태가 그대로 보입니다.
              2·3단계를 체크하면 프로젝트의 사다리 평균이 바뀝니다.
            </div>
          </div>
        ) : (
          // 🔴 /api/mastery/null 은 404 다. 미연결 노드에 사다리를 열지 않는다.
          <div style={{
            padding: 12, borderRadius: 12,
            border: '1px dashed var(--border-med)',
            fontSize: 12, color: 'var(--text2)', lineHeight: 1.5,
          }}>
            기술을 연결하면 사다리가 열립니다.
          </div>
        )}
      </div>

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
    </Modal>
  );
}
