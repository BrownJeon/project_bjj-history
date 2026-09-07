import React, { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import Button from './Button';

// ═════════════════════════════════════════════════════════════════════════════
// 프로젝트 생성·수정 시트
//
// 🔴 시작 포지션은 **`GET /api/techniques/positions`(18종)** 에서만 고른다.
//    `web/src/utils/baseOptions.js` 의 하드코딩 목록을 쓰지 마라 —
//    그게 task-020b 의 포지션 병합(25종 → 18종)을 되돌리던 재오염 경로였다(지시 F).
//
// 🔴 정본 12종을 주 목록으로 세우고 나머지 6종은 접힌 보조 그룹에 둔다 — **지우지는 않는다.**
//    끊김 허용 4종(남북 포지션·델라리바·헤드쿼터·스카프홀드)에는 실제 스파링 기록이,
//    B-2 미해결 2종(오픈가드 탑·하프가드 탑)에는 드릴이 붙어 있다.
//    /recall 의 PositionGrid 와 같은 규칙이다(두 화면이 다른 말을 하지 않게).
// ═════════════════════════════════════════════════════════════════════════════

// 정본 12종 — 근거: docs/recall-lab-approvals.md B절.
const CANONICAL_POSITIONS = [
  '가드', '오픈 가드', '클로즈드 가드', '하프 가드', '백', '마운트',
  '사이드 컨트롤', '탑 포지션', '패스', '스탠딩', '터틀', '기타',
];
const CANONICAL_SET = new Set(CANONICAL_POSITIONS.map(n => n.normalize('NFC')));

const FIELDS = ['title', 'startPos', 'goal'];
const LIMIT = { title: 100, startPos: 50, goal: 200 };

function formFromProject(p) {
  return {
    title: p?.title || '',
    startPos: p?.startPos ?? null,
    goal: p?.goal || '',
  };
}

/** 바뀐 필드만. null 로의 변경(포지션 해제)도 "바뀜"이다. */
export function buildProjectPatch(form, orig) {
  const body = {};
  for (const f of FIELDS) {
    const a = form[f] ?? null;
    const b = orig[f] ?? null;
    if (a !== b) body[f] = a;
  }
  return body;
}

function PosChip({ name, count, active, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{
        padding: '7px 10px', borderRadius: 9, cursor: 'pointer',
        fontSize: 12, fontWeight: 700,
        color: active ? 'var(--accent-lt)' : 'var(--text)',
        background: active ? 'var(--accent-dim)' : 'var(--surface)',
        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
        // 340px 에서도 포지션 이름을 자르지 않는다.
        whiteSpace: 'normal', overflowWrap: 'anywhere',
        display: 'inline-flex', alignItems: 'baseline', gap: 5,
      }}
    >
      {name}
      <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>{count}</span>
    </span>
  );
}

export default function ResearchProjectForm({ open, project, positions, onClose, onSave }) {
  const isCreate = !project;
  const [form, setForm] = useState(() => formFromProject(project));
  const [orig, setOrig] = useState(() => formFromProject(project));
  const [openOther, setOpenOther] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const f = formFromProject(project);
    setForm(f); setOrig(f); setErr(''); setOpenOther(false);
  }, [project, open]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const { main, other } = useMemo(() => {
    const m = [], o = [];
    for (const p of (positions || [])) {
      (CANONICAL_SET.has(String(p.name).normalize('NFC')) ? m : o).push(p);
    }
    m.sort((a, b) =>
      CANONICAL_POSITIONS.indexOf(a.name.normalize('NFC')) - CANONICAL_POSITIONS.indexOf(b.name.normalize('NFC')));
    return { main: m, other: o };
  }, [positions]);

  const patch = buildProjectPatch(form, orig);
  const dirty = Object.keys(patch).length > 0;
  const tooLong =
    form.title.length > LIMIT.title ||
    (form.goal || '').length > LIMIT.goal ||
    (form.startPos || '').length > LIMIT.startPos;

  async function save() {
    if (!form.title.trim()) { setErr('제목을 입력하세요'); return; }
    setBusy(true); setErr('');
    try {
      if (isCreate) await onSave({ title: form.title, startPos: form.startPos, goal: form.goal }, true);
      else await onSave(patch, false);
    } catch (e) {
      setErr(e.message || '저장하지 못했습니다');
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  const pick = (name) => set('startPos', form.startPos === name ? null : name);
  const grid = { display: 'flex', flexWrap: 'wrap', gap: 6 };

  return (
    <Modal open={open} onClose={onClose} title={isCreate ? '새 연구 프로젝트' : '프로젝트 수정'}>
      <div className="field">
        <label>제목 <span style={{ color: form.title.length > LIMIT.title ? 'var(--red)' : 'var(--text3)' }}>
          {form.title.length}/{LIMIT.title}
        </span></label>
        <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="예) 클로즈드 가드 암바" />
      </div>

      <div className="field">
        <label>시작 포지션</label>
        {(positions || []).length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>포지션 목록을 불러오지 못했습니다.</div>
        ) : (
          <>
            <div style={grid}>
              {main.map(p => (
                <PosChip key={p.name} name={p.name} count={p.techCount + p.drillCount}
                  active={form.startPos === p.name} onClick={() => pick(p.name)} />
              ))}
            </div>
            {other.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div
                  onClick={() => setOpenOther(v => !v)}
                  style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', cursor: 'pointer' }}
                >{openOther ? '▾' : '▸'} 기타 표기 {other.length}</div>
                {openOther && (
                  <div style={{ ...grid, marginTop: 6 }}>
                    {other.map(p => (
                      <PosChip key={p.name} name={p.name} count={p.techCount + p.drillCount}
                        active={form.startPos === p.name} onClick={() => pick(p.name)} />
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>
              {form.startPos
                ? <>선택: <b style={{ color: 'var(--accent-lt)' }}>{form.startPos}</b> — 다시 누르면 해제됩니다.</>
                : '선택하지 않아도 됩니다.'}
            </div>
          </>
        )}
      </div>

      <div className="field">
        <label>목표 <span style={{ color: (form.goal || '').length > LIMIT.goal ? 'var(--red)' : 'var(--text3)' }}>
          {(form.goal || '').length}/{LIMIT.goal}
        </span></label>
        <input value={form.goal} onChange={e => set('goal', e.target.value)} placeholder="예) 탭 받기" />
      </div>

      {err && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{err}</div>}
      {tooLong && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>
          길이 제한을 넘었습니다 — 서버가 400 으로 거부합니다(잘려서 저장되지 않습니다).
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" onClick={save} disabled={busy || tooLong || (!isCreate && !dirty)}>
          {busy ? '저장 중…' : (isCreate ? '만들기' : '저장')}
        </Button>
        <Button variant="outline" onClick={onClose} disabled={busy}>닫기</Button>
      </div>
    </Modal>
  );
}
