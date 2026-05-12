import React, { useState, useMemo } from 'react';
import Modal from './Modal';
import Button from './Button';
import Icon from './Icon';

export default function ChainEditor({ initial, techniques, onSave, onCancel, onDelete }) {
  const [name, setName] = useState(initial?.name || '');
  const [note, setNote] = useState(initial?.note || '');
  const [steps, setSteps] = useState(
    (initial?.steps || []).map(s => ({
      techniqueId: s.technique_id,
      transitionNote: s.transition_note || '',
    }))
  );
  const [search, setSearch] = useState('');

  const techMap = useMemo(() => new Map(techniques.map(t => [t.id, t])), [techniques]);
  const filtered = useMemo(() => {
    const sel = new Set(steps.map(s => s.techniqueId));
    const q = search.trim().toLowerCase();
    return techniques.filter(t => !sel.has(t.id) && (!q || t.name.toLowerCase().includes(q)));
  }, [techniques, steps, search]);

  function addStep(id) {
    setSteps([...steps, { techniqueId: id, transitionNote: '' }]);
    setSearch('');
  }
  function removeStep(i) { setSteps(steps.filter((_, idx) => idx !== i)); }
  function updateStep(i, k, v) {
    setSteps(steps.map((s, idx) => idx === i ? { ...s, [k]: v } : s));
  }
  function moveStep(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  }

  function submit() {
    if (!name.trim()) return alert('이름을 입력해주세요');
    if (steps.length === 0) return alert('최소 1개 기술을 추가해주세요');
    onSave({ name: name.trim(), note, steps });
  }

  return (
    <Modal title={initial ? '체인 수정' : '체인 추가'} onClose={onCancel}>
      <div className="field">
        <label>이름 *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 가드에서 백테이크" />
      </div>
      <div className="field">
        <label>설명</label>
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
          placeholder="이 체인의 목적·요약" />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, fontWeight: 500 }}>
          단계 ({steps.length})
        </div>
        {steps.length === 0 && (
          <div style={{
            padding: 14, textAlign: 'center',
            border: '1px dashed var(--border-med)', borderRadius: 10,
            color: 'var(--text3)', fontSize: 12, marginBottom: 8,
          }}>
            아래에서 기술을 검색해 추가하세요
          </div>
        )}
        {steps.map((s, i) => {
          const t = techMap.get(s.techniqueId);
          return (
            <div key={i} style={{
              padding: 10,
              background: 'var(--surface-up)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              marginBottom: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: 6,
                  background: 'var(--accent-dim)', color: 'var(--accent)',
                  fontSize: 11, fontWeight: 800,
                }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>
                  {t?.name || `#${s.techniqueId}`}
                </span>
                <button
                  onClick={() => moveStep(i, -1)}
                  disabled={i === 0}
                  style={iconBtnStyle(i === 0)}
                  title="위로"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveStep(i, +1)}
                  disabled={i === steps.length - 1}
                  style={iconBtnStyle(i === steps.length - 1)}
                  title="아래로"
                >
                  ▼
                </button>
                <button
                  onClick={() => removeStep(i)}
                  style={{
                    background: 'transparent', border: '1px solid var(--border-med)',
                    color: 'var(--red)', borderRadius: 6, padding: '3px 6px',
                    fontSize: 11, cursor: 'pointer',
                  }}
                >
                  <Icon name="x" size={12} color="var(--red)" />
                </button>
              </div>
              <input
                value={s.transitionNote}
                onChange={e => updateStep(i, 'transitionNote', e.target.value)}
                placeholder="전환 노트 (선택)"
                style={{
                  width: '100%', fontSize: 12,
                  padding: '6px 10px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text)',
                  outline: 'none',
                }}
              />
            </div>
          );
        })}

        {/* 기술 검색 + 추가 */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-med)',
          borderRadius: 10,
          padding: 8,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 8px',
            background: 'var(--surface-up)',
            borderRadius: 8,
            marginBottom: 6,
          }}>
            <Icon name="search" size={14} color="var(--text3)" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="등록된 기술 검색"
              style={{
                flex: 1, background: 'transparent', border: 'none',
                color: 'var(--text)', fontSize: 13, outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text3)', padding: 6 }}>
                추가할 기술이 없습니다
              </div>
            )}
            {filtered.slice(0, 30).map(t => (
              <button
                key={t.id}
                onClick={() => addStep(t.id)}
                style={{
                  background: 'var(--surface-hi)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12, fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                + {t.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onDelete && <Button variant="danger" size="sm" onClick={onDelete} style={{ marginRight: 'auto' }}>삭제</Button>}
        <Button variant="outline" size="sm" onClick={onCancel}>취소</Button>
        <Button variant="primary" size="sm" onClick={submit}>저장</Button>
      </div>
    </Modal>
  );
}

function iconBtnStyle(disabled) {
  return {
    background: 'transparent',
    border: '1px solid var(--border-med)',
    color: disabled ? 'var(--text3)' : 'var(--text)',
    borderRadius: 6, padding: '3px 6px',
    fontSize: 10, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  };
}
