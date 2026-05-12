import React, { useState, useMemo } from 'react';
import Modal from './Modal';
import Button from './Button';
import Icon from './Icon';
import TagPicker from './TagPicker';
import { BASE_POSITIONS, mergeUnique } from '../utils/baseOptions';

const NODE_KINDS = [
  { id: 'start',    label: '시작',     color: 'var(--blue)' },
  { id: 'tech',     label: '기술',     color: 'var(--accent)' },
  { id: 'finish',   label: '피니시',   color: 'var(--amber)' },
  { id: 'reaction', label: '상대반응', color: 'var(--purple)' },
  { id: 'escape',   label: '탈출',     color: 'var(--red)' },
];

const EDGE_CONDS = [
  { id: 'success', label: '성공', color: 'var(--accent)' },
  { id: 'fail',    label: '실패', color: 'var(--red)' },
  { id: 'default', label: '기본', color: 'var(--text2)' },
];

export default function GameplanEditor({ initial, techniques, onSave, onCancel, onDelete }) {
  const [name, setName] = useState(initial?.name || '');
  const [startPos, setStartPos] = useState(initial?.start_pos ? [initial.start_pos] : []);
  const [endPos, setEndPos]     = useState(initial?.end_pos ? [initial.end_pos] : []);
  const [note, setNote]         = useState(initial?.note || '');

  const posSuggestions = useMemo(() => mergeUnique(BASE_POSITIONS), []);

  // 노드 — clientId로 엣지 매핑
  const [nodes, setNodes] = useState(() =>
    (initial?.nodes || []).map((n, i) => ({
      clientId: `n${i}`,
      techniqueId: n.technique_id || null,
      label: n.tech_name || n.label || '',
      kind: n.kind || (n.is_finish ? 'finish' : (i === 0 ? 'start' : 'tech')),
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
      condition:    e.condition || 'default',
    })).filter(e => e.fromClientId && e.toClientId);
  });

  const [search, setSearch] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [newKind, setNewKind] = useState('tech');
  const [newEdgeFrom, setNewEdgeFrom] = useState('');
  const [newEdgeTo, setNewEdgeTo] = useState('');
  const [newEdgeCond, setNewEdgeCond] = useState('default');

  function addTechNode(t) {
    const cid = `n${Date.now()}`;
    setNodes([...nodes, {
      clientId: cid, techniqueId: t.id, label: t.name,
      kind: newKind, isFinish: newKind === 'finish', note: '',
    }]);
    setSearch('');
  }
  function addCustomNode() {
    if (!customLabel.trim()) return;
    const cid = `n${Date.now()}`;
    setNodes([...nodes, {
      clientId: cid, techniqueId: null, label: customLabel.trim(),
      kind: newKind, isFinish: newKind === 'finish', note: '',
    }]);
    setCustomLabel('');
  }
  function removeNode(cid) {
    setNodes(nodes.filter(n => n.clientId !== cid));
    setEdges(edges.filter(e => e.fromClientId !== cid && e.toClientId !== cid));
  }
  function updateNode(cid, k, v) {
    setNodes(nodes.map(n => n.clientId === cid ? { ...n, [k]: v } : n));
  }
  function addEdge() {
    if (!newEdgeFrom || !newEdgeTo || newEdgeFrom === newEdgeTo) return;
    const cid = `e${Date.now()}`;
    setEdges([...edges, {
      clientId: cid,
      fromClientId: newEdgeFrom,
      toClientId: newEdgeTo,
      condition: newEdgeCond,
    }]);
    setNewEdgeFrom(''); setNewEdgeTo('');
  }
  function removeEdge(cid) { setEdges(edges.filter(e => e.clientId !== cid)); }
  function updateEdgeCond(cid, c) {
    setEdges(edges.map(e => e.clientId === cid ? { ...e, condition: c } : e));
  }

  function nodeName(cid) {
    return nodes.find(n => n.clientId === cid)?.label || cid;
  }

  const filteredTech = useMemo(() => {
    const q = search.trim().toLowerCase();
    return techniques.filter(t => !q || t.name.toLowerCase().includes(q)).slice(0, 12);
  }, [techniques, search]);

  function submit() {
    if (!name.trim()) return alert('이름을 입력해주세요');
    onSave({
      name: name.trim(),
      startPos: startPos[0] || '',
      endPos:   endPos[0] || '',
      note,
      nodes: nodes.map(n => ({ ...n })),
      edges: edges.map(e => ({ ...e })),
    });
  }

  return (
    <Modal title={initial ? '게임플랜 수정' : '게임플랜 추가'} onClose={onCancel}>
      <div className="field">
        <label>이름 *</label>
        <input value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>시작 포지션</label>
          <TagPicker value={startPos} onChange={setStartPos} suggestions={posSuggestions} singleSelect placeholder="포지션 선택" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>목표 포지션</label>
          <TagPicker value={endPos} onChange={setEndPos} suggestions={posSuggestions} singleSelect placeholder="포지션 선택" />
        </div>
      </div>
      <div className="field">
        <label>설명</label>
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} />
      </div>

      {/* 노드 추가 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
          노드 ({nodes.length})
        </div>

        {/* 노드 목록 */}
        {nodes.map(n => {
          const kindMeta = NODE_KINDS.find(k => k.id === n.kind) || NODE_KINDS[1];
          return (
            <div key={n.clientId} style={{
              padding: 8,
              background: 'var(--surface-up)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              marginBottom: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{
                  fontSize: 9, fontWeight: 800,
                  color: kindMeta.color,
                  padding: '2px 6px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 4,
                  border: `1px solid ${kindMeta.color}`,
                }}>{kindMeta.label}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{n.label}</span>
                <select
                  value={n.kind}
                  onChange={e => updateNode(n.clientId, 'kind', e.target.value)}
                  style={selectStyle()}
                >
                  {NODE_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
                <button
                  onClick={() => removeNode(n.clientId)}
                  style={{
                    background: 'transparent', border: '1px solid var(--border-med)',
                    color: 'var(--red)', borderRadius: 6, padding: '3px 6px',
                    fontSize: 11, cursor: 'pointer',
                  }}
                >
                  <Icon name="x" size={11} color="var(--red)" />
                </button>
              </div>
              <input
                value={n.note}
                onChange={e => updateNode(n.clientId, 'note', e.target.value)}
                placeholder="노드 메모 (선택)"
                style={{
                  width: '100%', fontSize: 12, padding: '5px 8px',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text)', outline: 'none',
                }}
              />
            </div>
          );
        })}

        {/* 신규 노드 입력 */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-med)',
          borderRadius: 10,
          padding: 8,
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            {NODE_KINDS.map(k => (
              <button
                key={k.id}
                onClick={() => setNewKind(k.id)}
                style={{
                  padding: '4px 10px',
                  background: newKind === k.id ? k.color : 'var(--surface-up)',
                  color: newKind === k.id ? '#fff' : 'var(--text2)',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 8px', background: 'var(--surface-up)',
            borderRadius: 8, marginBottom: 6,
          }}>
            <Icon name="search" size={13} color="var(--text3)" />
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8, maxHeight: 100, overflowY: 'auto' }}>
            {filteredTech.map(t => (
              <button
                key={t.id}
                onClick={() => addTechNode(t)}
                style={{
                  background: 'var(--surface-hi)', border: '1px solid var(--border)',
                  color: 'var(--text)', borderRadius: 6, padding: '3px 8px',
                  fontSize: 11, cursor: 'pointer',
                }}
              >
                + {t.name}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={customLabel}
              onChange={e => setCustomLabel(e.target.value)}
              placeholder="커스텀 노드명"
              style={{
                flex: 1, padding: '6px 10px',
                background: 'var(--surface-up)', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--text)', fontSize: 12, outline: 'none',
              }}
            />
            <Button size="sm" variant="outline" onClick={addCustomNode}>+ 추가</Button>
          </div>
        </div>
      </div>

      {/* 엣지 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
          전환 ({edges.length})
        </div>
        {edges.map(e => {
          const condMeta = EDGE_CONDS.find(c => c.id === e.condition) || EDGE_CONDS[2];
          return (
            <div key={e.clientId} style={{
              padding: 8, marginBottom: 6,
              background: 'var(--surface-up)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, flex: 1 }}>
                  {nodeName(e.fromClientId)}
                  <span style={{ color: condMeta.color, fontWeight: 700, margin: '0 6px' }}>→</span>
                  {nodeName(e.toClientId)}
                </span>
                <select
                  value={e.condition}
                  onChange={ev => updateEdgeCond(e.clientId, ev.target.value)}
                  style={selectStyle()}
                >
                  {EDGE_CONDS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <button
                  onClick={() => removeEdge(e.clientId)}
                  style={{
                    background: 'transparent', border: '1px solid var(--border-med)',
                    color: 'var(--red)', borderRadius: 6, padding: '3px 6px',
                    fontSize: 11, cursor: 'pointer',
                  }}
                >
                  <Icon name="x" size={11} color="var(--red)" />
                </button>
              </div>
            </div>
          );
        })}
        <div style={{
          display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
          background: 'var(--surface)',
          border: '1px solid var(--border-med)',
          borderRadius: 10,
          padding: 8,
        }}>
          <select
            value={newEdgeFrom}
            onChange={e => setNewEdgeFrom(e.target.value)}
            style={{ ...selectStyle(), flex: 1, minWidth: 90 }}
          >
            <option value="">시작</option>
            {nodes.map(n => <option key={n.clientId} value={n.clientId}>{n.label}</option>)}
          </select>
          <span style={{ color: 'var(--text3)' }}>→</span>
          <select
            value={newEdgeTo}
            onChange={e => setNewEdgeTo(e.target.value)}
            style={{ ...selectStyle(), flex: 1, minWidth: 90 }}
          >
            <option value="">도착</option>
            {nodes.map(n => <option key={n.clientId} value={n.clientId}>{n.label}</option>)}
          </select>
          <select
            value={newEdgeCond}
            onChange={e => setNewEdgeCond(e.target.value)}
            style={selectStyle()}
          >
            {EDGE_CONDS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <Button size="sm" variant="outline" onClick={addEdge}>+</Button>
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

function selectStyle() {
  return {
    padding: '5px 8px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
    fontSize: 12,
    outline: 'none',
  };
}
