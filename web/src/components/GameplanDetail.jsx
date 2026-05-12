import React, { useState, useMemo } from 'react';
import Modal from './Modal';
import Button from './Button';
import Tag from './Tag';

const NODE_TYPE = {
  start:    { color: '#4B8FE2', dim: 'rgba(75,143,226,0.22)',  label: '시작',    icon: '▶' },
  tech:     { color: '#1D9E75', dim: 'rgba(29,158,117,0.18)',  label: '기술',    icon: '⚡' },
  finish:   { color: '#F0A830', dim: 'rgba(240,168,48,0.22)',  label: '피니시',  icon: '🏁' },
  reaction: { color: '#8B6CE7', dim: 'rgba(139,108,231,0.22)', label: '상대반응', icon: '◎' },
  escape:   { color: '#E05A47', dim: 'rgba(224,90,71,0.20)',   label: '탈출',    icon: '↩' },
};

function nodeKind(n, isRoot) {
  if (n.kind && NODE_TYPE[n.kind]) return n.kind;
  if (n.is_finish) return 'finish';
  if (isRoot) return 'start';
  return 'tech';
}

function edgeStyle(cond) {
  const c = (cond || '').toLowerCase();
  if (c.includes('success') || c.includes('성공')) return { color: '#1D9E75', dash: '0' };
  if (c.includes('fail')    || c.includes('실패')) return { color: '#E05A47', dash: '5,4' };
  return { color: '#7C8098', dash: '0' };
}

// 조건 텍스트 잘라내기 (최대 14자)
function shortCond(cond) {
  const s = (cond || '').trim();
  return s.length > 14 ? s.slice(0, 13) + '…' : s;
}

function calcNodeWidth(nodes) {
  const maxLen = nodes.reduce((m, n) =>
    Math.max(m, (n.tech_name || n.label || '').length), 4);
  return Math.max(100, Math.min(170, maxLen * 8 + 32));
}

function calcCols(count, nodeW) {
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (nodeW > 130) return 2;
  return 3;
}

const NODE_H  = 52;
const COL_GAP = 24;
const ROW_GAP = 100;   // 여유 공간 확보
const PAD_X   = 16, PAD_Y = 14;

function buildTreeLayout(nodes, edges) {
  if (!nodes.length) return { laid: [], W: 300, H: 80 };

  const childMap  = new Map(nodes.map(n => [n.id, []]));
  const parentCnt = new Map(nodes.map(n => [n.id, 0]));
  edges.forEach(e => {
    if (childMap.has(e.from_node_id) && childMap.has(e.to_node_id)) {
      childMap.get(e.from_node_id).push(e.to_node_id);
      parentCnt.set(e.to_node_id, (parentCnt.get(e.to_node_id) || 0) + 1);
    }
  });

  const roots = nodes.filter(n => !parentCnt.get(n.id));
  const root  = roots[0] || nodes[0];

  const depth   = new Map();
  const visited = new Set();
  const queue   = [root.id];
  depth.set(root.id, 0);
  visited.add(root.id);
  while (queue.length) {
    const curr = queue.shift();
    (childMap.get(curr) || []).forEach(cid => {
      if (!visited.has(cid)) {
        visited.add(cid);
        depth.set(cid, (depth.get(curr) || 0) + 1);
        queue.push(cid);
      }
    });
  }
  nodes.forEach(n => { if (!depth.has(n.id)) depth.set(n.id, 0); });

  const byDepth = new Map();
  nodes.forEach(n => {
    const d = depth.get(n.id) ?? 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d).push(n);
  });

  const nodeW  = calcNodeWidth(nodes);
  const maxRow = Math.max(...[...byDepth.values()].map(g => g.length));
  const W = Math.max(PAD_X * 2 + maxRow * nodeW + (maxRow - 1) * COL_GAP, 300);

  const laid = [];
  byDepth.forEach((group, d) => {
    const rowW   = group.length * nodeW + (group.length - 1) * COL_GAP;
    const startX = (W - rowW) / 2;
    group.forEach((n, i) => {
      laid.push({
        ...n,
        _x: startX + i * (nodeW + COL_GAP),
        _y: PAD_Y + d * (NODE_H + ROW_GAP),
        _w: nodeW,
        _h: NODE_H,
        _root: n.id === root.id,
      });
    });
  });

  const maxDepth = Math.max(...[...depth.values()]) + 1;
  const H = PAD_Y * 2 + maxDepth * NODE_H + (maxDepth - 1) * ROW_GAP;
  return { laid, W, H: Math.max(H, 80) };
}

export default function GameplanDetail({ gameplan, onClose, onEdit, onDelete }) {
  const nodes = gameplan.nodes || [];
  const edges = gameplan.edges || [];

  const { laid, W, H } = useMemo(() => buildTreeLayout(nodes, edges), [nodes, edges]);
  const nodeMap = useMemo(() => new Map(laid.map(n => [n.id, n])), [laid]);

  const [selectedId, setSelectedId] = useState(null);
  const selected  = selectedId != null ? nodeMap.get(selectedId) : null;
  const connEdges = selected
    ? edges.filter(e => e.from_node_id === selected.id || e.to_node_id === selected.id)
    : [];

  // 엣지 계산 — 경로 + 텍스트 위치를 분리 수집
  const edgeData = useMemo(() => {
    const paths  = [];  // SVG 선
    const labels = [];  // 조건 텍스트 (노드 위에 그려짐)

    // 부모별 그룹핑
    const parentGroups = new Map();
    edges.forEach(e => {
      const a = nodeMap.get(e.from_node_id);
      const b = nodeMap.get(e.to_node_id);
      if (!a || !b) return;
      if (!parentGroups.has(e.from_node_id)) parentGroups.set(e.from_node_id, []);
      parentGroups.get(e.from_node_id).push({ edge: e, a, b });
    });

    parentGroups.forEach((children, fromId) => {
      const a  = nodeMap.get(fromId);
      if (!a) return;
      const ax = a._x + a._w / 2;
      const ay = a._y + a._h + 2;

      if (children.length === 1) {
        const { edge, b } = children[0];
        const bx   = b._x + b._w / 2;
        const by   = b._y - 8;
        const mid  = ay + (by - ay) * 0.5;
        const st   = edgeStyle(edge.condition);
        const mId  = st.color === '#1D9E75' ? 'gp-acc'
          : st.color === '#E05A47' ? 'gp-red' : 'gp-gry';
        const path = Math.abs(ax - bx) < 3
          ? `M${ax},${ay} L${bx},${by}`
          : `M${ax},${ay} L${ax},${mid} L${bx},${mid} L${bx},${by}`;

        paths.push({ d: path, color: st.color, dash: st.dash, mId, key: `${fromId}-0` });

        const cond = shortCond(edge.condition);
        if (cond) {
          // 텍스트: 수직선 오른쪽 상단 (선 중간 기준)
          labels.push({ cond, color: st.color, x: ax + 6, y: mid - 8, key: `lbl-${fromId}-0` });
        }
      } else {
        // T자 팬아웃
        const firstBy = Math.min(...children.map(c => c.b._y)) - 8;
        const hLineY  = ay + (firstBy - ay) * 0.5;
        const leftX   = Math.min(...children.map(c => c.b._x + c.b._w / 2));
        const rightX  = Math.max(...children.map(c => c.b._x + c.b._w / 2));
        const gray    = '#7C8098';

        // 부모 → 수평선
        paths.push({ d: `M${ax},${ay} L${ax},${hLineY}`, color: gray, dash: '0', mId: null, key: `${fromId}-stem` });
        paths.push({ d: `M${leftX},${hLineY} L${rightX},${hLineY}`, color: gray, dash: '0', mId: null, key: `${fromId}-hline` });

        children.forEach(({ edge, b }, ci) => {
          const bx  = b._x + b._w / 2;
          const by  = b._y - 8;
          const st  = edgeStyle(edge.condition);
          const mId = st.color === '#1D9E75' ? 'gp-acc'
            : st.color === '#E05A47' ? 'gp-red' : 'gp-gry';

          paths.push({
            d: `M${bx},${hLineY} L${bx},${by}`,
            color: st.color, dash: st.dash, mId,
            key: `${fromId}-${ci}`,
          });

          const cond = shortCond(edge.condition);
          if (cond) {
            // 텍스트: 수직선 오른쪽, 수평선 아래 12px
            labels.push({
              cond, color: st.color,
              x: bx + 5,
              y: hLineY + 14,
              key: `lbl-${fromId}-${ci}`,
            });
          }
        });
      }
    });

    return { paths, labels };
  }, [edges, nodeMap]);

  return (
    <Modal title={gameplan.name} onClose={onClose}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {gameplan.start_pos && <Tag tone="blue">▷ {gameplan.start_pos}</Tag>}
        {gameplan.end_pos   && <Tag tone="amber">🏁 {gameplan.end_pos}</Tag>}
        <Tag tone="neutral">{nodes.length}노드 · {edges.length}전환</Tag>
      </div>

      {gameplan.note && (
        <div style={{
          padding: '6px 10px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 8,
          fontSize: 12, color: 'var(--text2)',
          marginBottom: 10, whiteSpace: 'pre-wrap',
        }}>
          {gameplan.note}
        </div>
      )}

      {/* 범례 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {Object.entries(NODE_TYPE).map(([k, v]) => (
          <span key={k} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, color: v.color, fontWeight: 600,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: v.color, display: 'inline-block' }} />
            {v.label}
          </span>
        ))}
      </div>

      {nodes.length === 0 ? (
        <div style={{
          padding: 24, textAlign: 'center', color: 'var(--text3)',
          border: '1px dashed var(--border-med)', borderRadius: 10, marginBottom: 10,
        }}>노드가 없습니다</div>
      ) : (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '8px 4px', marginBottom: 10,
        }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
            <defs>
              {[['acc','#1D9E75'],['red','#E05A47'],['gry','#7C8098']].map(([id, fill]) => (
                <marker key={id} id={`gp-${id}`}
                  viewBox="0 0 8 8" refX="8" refY="4"
                  markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                  <path d="M 0 1 L 8 4 L 0 7 z" fill={fill} />
                </marker>
              ))}
            </defs>

            {/* 레이어 1: 엣지 경로 */}
            {edgeData.paths.map(p => (
              <path key={p.key} d={p.d}
                stroke={p.color} strokeWidth="1.4"
                strokeDasharray={p.dash} fill="none"
                markerEnd={p.mId ? `url(#${p.mId})` : undefined}
                opacity={0.85}
              />
            ))}

            {/* 레이어 2: 노드 */}
            {laid.map((n, i) => {
              const k   = nodeKind(n, n._root);
              const t   = NODE_TYPE[k];
              const sel = selectedId === n.id;
              const lbl = n.tech_name || n.label || '';
              return (
                <g key={n.id || i}
                  transform={`translate(${n._x},${n._y})`}
                  onClick={() => setSelectedId(sel ? null : n.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {sel && (
                    <rect x="-3" y="-3" width={n._w + 6} height={n._h + 6} rx="10"
                      fill="none" stroke="#fff" strokeWidth="2" opacity="0.2" />
                  )}
                  <rect width={n._w} height={n._h} rx="8"
                    fill={t.dim} stroke={sel ? '#fff' : t.color}
                    strokeWidth={sel ? 2 : 1.4} />
                  <rect width={n._w} height={18} rx="8" fill={t.color} opacity="0.22" />
                  <rect y="12" width={n._w} height={6} fill={t.color} opacity="0.1" />
                  <text x="10" y="12.5" fontSize="9" fontWeight="700" fill={t.color}>
                    {t.icon} {t.label}
                  </text>
                  <text x={n._w / 2} y={n._h - 13}
                    textAnchor="middle" fontSize="11.5" fontWeight="700"
                    fill={sel ? '#fff' : '#EEEEF2'}
                    style={{ userSelect: 'none' }}>
                    {lbl}
                  </text>
                </g>
              );
            })}

            {/* 레이어 3: 조건 텍스트 (최상위 — 노드 위에 그려짐) */}
            {edgeData.labels.map(lb => {
              const tw = lb.cond.length * 6 + 12;
              return (
                <g key={lb.key} transform={`translate(${lb.x},${lb.y})`}>
                  <rect width={tw} height={16} rx="4"
                    fill="var(--bg)" stroke={lb.color}
                    strokeWidth="0.9" opacity="1" />
                  <text x={tw / 2} y="11.5"
                    textAnchor="middle" fontSize="9" fontWeight="700"
                    fill={lb.color}>
                    {lb.cond}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* 선택 노드 상세 */}
      {selected && (
        <div style={{
          background: 'var(--surface-up)', border: '1px solid var(--border-med)',
          borderRadius: 10, padding: 10, marginBottom: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            {selected.tech_name || selected.label}
            {selected.is_finish && (
              <span style={{ marginLeft: 6, fontSize: 10, color: '#F0A830', fontWeight: 700 }}>
                🏁 피니시
              </span>
            )}
          </div>
          {selected.note && (
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, whiteSpace: 'pre-wrap' }}>
              {selected.note}
            </div>
          )}
          {connEdges.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {connEdges.map((e, i) => {
                const other = e.from_node_id === selected.id
                  ? nodeMap.get(e.to_node_id) : nodeMap.get(e.from_node_id);
                if (!other) return null;
                const dir = e.from_node_id === selected.id ? '→' : '←';
                const st  = edgeStyle(e.condition);
                return (
                  <div key={i} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: st.color, fontWeight: 700, fontSize: 13 }}>{dir}</span>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{other.tech_name || other.label}</span>
                    {e.condition && (
                      <span style={{
                        padding: '1px 6px', borderRadius: 4,
                        background: st.color + '22', color: st.color,
                        fontSize: 10, fontWeight: 700,
                      }}>
                        {(e.condition || '').trim()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="danger" size="sm" onClick={onDelete}>삭제</Button>
        <Button variant="outline" size="sm" onClick={onEdit}>수정</Button>
        <Button variant="primary" size="sm" onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  );
}
