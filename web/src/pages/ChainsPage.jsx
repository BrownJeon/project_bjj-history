import React, { useState } from 'react';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';
import * as chainsApi from '../api/chains';

export default function ChainsPage() {
  const { chains, techniques, reloadChains } = useCache();
  const { showToast, setLoading } = useUI();
  const [editing, setEditing] = useState(null);

  async function handleSave(form) {
    setLoading(true);
    try {
      if (editing && editing !== 'new') await chainsApi.updateChain(editing.id, form);
      else await chainsApi.createChain(form);
      await reloadChains();
      setEditing(null);
      showToast('저장되었습니다');
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  async function handleDelete(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    try { await chainsApi.deleteChain(id); await reloadChains(); showToast('삭제됨'); }
    catch (e) { showToast('오류: ' + e.message); }
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>기술 체인</span>
        <button className="btn-sm" onClick={() => setEditing('new')}>+ 추가</button>
      </div>
      {chains.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text2)', padding: 40 }}>등록된 체인이 없습니다</div>
      ) : chains.map(c => (
        <div key={c.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
              {c.note && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{c.note}</div>}
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(c.steps || []).map((s, i) => (
                  <span key={i} className="tag tag-tech" style={{ fontSize: 11 }}>
                    {i + 1}. {s.tech_name || `#${s.technique_id}`}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-sm" onClick={() => setEditing(c)}>수정</button>
              <button className="btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleDelete(c.id)}>삭제</button>
            </div>
          </div>
        </div>
      ))}
      {editing && <ChainEditor initial={editing === 'new' ? null : editing}
        techniques={techniques} onSave={handleSave} onCancel={() => setEditing(null)} />}
    </div>
  );
}

function ChainEditor({ initial, techniques, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [note, setNote] = useState(initial?.note || '');
  const [steps, setSteps] = useState(
    (initial?.steps || []).map(s => ({ techniqueId: s.technique_id, transitionNote: s.transition_note || '' }))
  );

  function addStep(techId) {
    setSteps([...steps, { techniqueId: techId, transitionNote: '' }]);
  }
  function removeStep(i) { setSteps(steps.filter((_, idx) => idx !== i)); }

  function submit() {
    if (!name.trim()) return alert('이름을 입력해주세요');
    if (steps.length === 0) return alert('최소 1개 기술을 추가해주세요');
    onSave({ name: name.trim(), note, steps });
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{initial ? '체인 수정' : '체인 추가'}</div>
        <div className="field"><label>이름 *</label>
          <input value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><label>설명</label>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>
        <div className="field">
          <label>단계 ({steps.length})</label>
          <div style={{ marginBottom: 8 }}>
            {steps.map((s, i) => {
              const t = techniques.find(x => x.id === s.techniqueId);
              return (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, flex: 1 }}>{i + 1}. {t?.name || `#${s.techniqueId}`}</span>
                  <button className="btn-sm" onClick={() => removeStep(i)}>×</button>
                </div>
              );
            })}
          </div>
          <select onChange={e => { if (e.target.value) addStep(parseInt(e.target.value)); e.target.value = ''; }}>
            <option value="">+ 기술 추가</option>
            {techniques.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn-outline" onClick={onCancel}>취소</button>
          <button className="btn-primary" onClick={submit}>저장</button>
        </div>
      </div>
    </div>
  );
}
