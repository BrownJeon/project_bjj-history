import React, { useState } from 'react';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';
import * as gpApi from '../api/gameplans';

export default function GameplanPage() {
  const { gameplans, techniques, reloadGameplans } = useCache();
  const { showToast, setLoading } = useUI();
  const [editing, setEditing] = useState(null);

  async function star(id) {
    try { await gpApi.toggleGpStar(id); await reloadGameplans(); }
    catch (e) { showToast('오류: ' + e.message); }
  }

  async function handleSave(form) {
    setLoading(true);
    try {
      if (editing && editing !== 'new') await gpApi.updateGameplan(editing.id, form);
      else await gpApi.createGameplan(form);
      await reloadGameplans();
      setEditing(null);
      showToast('저장되었습니다');
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  async function handleDelete(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      await gpApi.deleteGameplan(id);
      await reloadGameplans();
      setEditing(null);
      showToast('삭제됨');
    } catch (e) { showToast('오류: ' + e.message); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>기술연구 (게임플랜)</span>
        <button className="btn-sm" onClick={() => setEditing('new')}>+ 추가</button>
      </div>
      {gameplans.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text2)', padding: 40 }}>등록된 기술연구가 없습니다</div>
      ) : gameplans.map(gp => (
        <div key={gp.id} className="card" onClick={() => setEditing(gp)} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{gp.name}</div>
              {gp.start_pos && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>📍 {gp.start_pos}</div>}
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                노드 {(gp.nodes || []).length} · 엣지 {(gp.edges || []).length}
              </div>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(gp.nodes || []).slice(0, 4).map(n => (
                  <span key={n.id} className="tag tag-tech" style={{ fontSize: 11 }}>
                    {n.tech_name || n.label}{n.is_finish ? ' 🏁' : ''}
                  </span>
                ))}
              </div>
            </div>
            <button onClick={e => { e.stopPropagation(); star(gp.id); }}
              style={{ background: 'none', border: 'none', fontSize: 22,
                       color: gp.starred ? 'var(--amber)' : 'var(--border2)', cursor: 'pointer' }}>
              {gp.starred ? '★' : '☆'}
            </button>
          </div>
        </div>
      ))}
      {editing && (
        <GameplanEditor
          initial={editing === 'new' ? null : editing}
          techniques={techniques}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          onDelete={editing !== 'new' ? () => handleDelete(editing.id) : null}
        />
      )}
    </div>
  );
}

function GameplanEditor({ initial, techniques, onSave, onCancel, onDelete }) {
  const [name, setName]     = useState(initial?.name || '');
  const [startPos, setStartPos] = useState(initial?.start_pos || '');
  const [endPos, setEndPos] = useState(initial?.end_pos || '');
  const [note, setNote]     = useState(initial?.note || '');
  // 노드: clientId 부여하여 엣지 매핑
  const [nodes, setNodes] = useState(() =>
    (initial?.nodes || []).map((n, i) => ({
      clientId: `n${i}`,
      techniqueId: n.technique_id || null,
      label: n.tech_name || n.label || '',
      isFinish: !!n.is_finish,
      note: n.note || '',
    }))
  );
  const [edges, setEdges] = useState(() => {
    const idMap = new Map((initial?.nodes || []).map((n, i) => [n.id, `n${i}`]));
    return (initial?.edges || []).map((e, i) => ({
      clientId: `e${i}`,
      fromClientId: idMap.get(e.from_node_id),
      toClientId:   idMap.get(e.to_node_id),
      condition:    e.condition || '',
    })).filter(e => e.fromClientId && e.toClientId);
  });
  const [newEdgeFrom, setNewEdgeFrom] = useState('');
  const [newEdgeTo, setNewEdgeTo]     = useState('');

  function addNode(techId) {
    const t = techniques.find(x => x.id === parseInt(techId));
    if (!t) return;
    const cid = `n${Date.now()}`;
    setNodes([...nodes, { clientId: cid, techniqueId: t.id, label: t.name, isFinish: false, note: '' }]);
  }
  function addCustomNode(label) {
    if (!label.trim()) return;
    const cid = `n${Date.now()}`;
    setNodes([...nodes, { clientId: cid, techniqueId: null, label: label.trim(), isFinish: false, note: '' }]);
  }
  function removeNode(cid) {
    setNodes(nodes.filter(n => n.clientId !== cid));
    setEdges(edges.filter(e => e.fromClientId !== cid && e.toClientId !== cid));
  }
  function toggleFinish(cid) {
    setNodes(nodes.map(n => n.clientId === cid ? { ...n, isFinish: !n.isFinish } : n));
  }
  function addEdge() {
    if (!newEdgeFrom || !newEdgeTo || newEdgeFrom === newEdgeTo) return;
    const cid = `e${Date.now()}`;
    setEdges([...edges, { clientId: cid, fromClientId: newEdgeFrom, toClientId: newEdgeTo, condition: '' }]);
    setNewEdgeFrom(''); setNewEdgeTo('');
  }
  function removeEdge(cid) { setEdges(edges.filter(e => e.clientId !== cid)); }
  function updateEdgeCondition(cid, c) {
    setEdges(edges.map(e => e.clientId === cid ? { ...e, condition: c } : e));
  }

  function nodeName(cid) {
    return nodes.find(n => n.clientId === cid)?.label || cid;
  }

  function submit() {
    if (!name.trim()) return alert('이름을 입력해주세요');
    onSave({ name: name.trim(), startPos, endPos, note, nodes, edges });
  }

  const [customLabel, setCustomLabel] = useState('');

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div className="modal-title">{initial ? '게임플랜 수정' : '게임플랜 추가'}</div>
        <div className="field"><label>이름 *</label>
          <input value={name} onChange={e => setName(e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="field" style={{ flex: 1 }}><label>시작 포지션</label>
            <input value={startPos} onChange={e => setStartPos(e.target.value)} /></div>
          <div className="field" style={{ flex: 1 }}><label>목표 포지션</label>
            <input value={endPos} onChange={e => setEndPos(e.target.value)} /></div>
        </div>
        <div className="field"><label>설명</label>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>

        {/* 노드 편집 */}
        <div className="field">
          <label>노드 ({nodes.length})</label>
          <div style={{ marginBottom: 8 }}>
            {nodes.map(n => (
              <div key={n.clientId} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 13, flex: 1 }}>
                  {n.label}{n.isFinish && ' 🏁'}
                  {n.techniqueId && <span style={{ color: 'var(--text2)', fontSize: 11, marginLeft: 4 }}>(등록 기술)</span>}
                </span>
                <button className="btn-sm" onClick={() => toggleFinish(n.clientId)}>
                  {n.isFinish ? '서브 해제' : '서브'}
                </button>
                <button className="btn-sm" onClick={() => removeNode(n.clientId)}>×</button>
              </div>
            ))}
          </div>
          <select onChange={e => { if (e.target.value) addNode(e.target.value); e.target.value = ''; }}>
            <option value="">+ 등록된 기술에서 추가</option>
            {techniques.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input value={customLabel} onChange={e => setCustomLabel(e.target.value)}
              placeholder="또는 커스텀 노드명" style={{ flex: 1 }} />
            <button className="btn-sm" onClick={() => { addCustomNode(customLabel); setCustomLabel(''); }}>추가</button>
          </div>
        </div>

        {/* 엣지 편집 */}
        <div className="field">
          <label>전환 ({edges.length})</label>
          <div style={{ marginBottom: 8 }}>
            {edges.map(e => (
              <div key={e.clientId} style={{ marginBottom: 6, padding: 6, background: 'var(--bg2)', borderRadius: 6 }}>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  {nodeName(e.fromClientId)} → {nodeName(e.toClientId)}
                  <button className="btn-sm" onClick={() => removeEdge(e.clientId)} style={{ float: 'right' }}>×</button>
                </div>
                <input value={e.condition} onChange={ev => updateEdgeCondition(e.clientId, ev.target.value)}
                  placeholder="전환 조건 (선택)" style={{ width: '100%' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={newEdgeFrom} onChange={e => setNewEdgeFrom(e.target.value)} style={{ flex: 1 }}>
              <option value="">시작 노드</option>
              {nodes.map(n => <option key={n.clientId} value={n.clientId}>{n.label}</option>)}
            </select>
            <span style={{ alignSelf: 'center' }}>→</span>
            <select value={newEdgeTo} onChange={e => setNewEdgeTo(e.target.value)} style={{ flex: 1 }}>
              <option value="">도착 노드</option>
              {nodes.map(n => <option key={n.clientId} value={n.clientId}>{n.label}</option>)}
            </select>
            <button className="btn-sm" onClick={addEdge}>+ 엣지</button>
          </div>
        </div>

        <div className="modal-actions">
          {onDelete && <button className="btn-outline" onClick={onDelete}
            style={{ color: 'var(--red)', marginRight: 'auto' }}>삭제</button>}
          <button className="btn-outline" onClick={onCancel}>취소</button>
          <button className="btn-primary" onClick={submit}>저장</button>
        </div>
      </div>
    </div>
  );
}
