import React, { useMemo, useState } from 'react';
import Tag from './Tag';
import Icon from './Icon';

// ═════════════════════════════════════════════════════════════════════════════
// 연구 트리 — task-026
//
// 이 컴포넌트의 본업은 트리를 예쁘게 그리는 것이 아니라
// **대처가 없는 리액션을 눈에 보이게 하는 것**이다. 밀도를 위해 그 표시를 줄이면 실패다.
//
// 🔴 조용히 틀릴 수 있는 지점 3가지
//
//  1. 대처 없는 리액션을 **프론트가 다시 판정**하는 것.
//     서버가 coverage.uncoveredReactionNodeIds 를 준다. 그대로 쓴다.
//     여기서 kind==='리액션' && 자식에 '대처' 없음을 한 번 더 계산하면, 두 곳이 어긋났을 때
//     어느 쪽이 틀렸는지 추적할 수 없다(task-025 "이중 필터 금지"와 같은 원칙).
//
//  2. 라벨을 ellipsis 로 자르는 것. 340px 에서 이름이 잘리면 트리는 읽을 수 없다.
//     → 라벨은 **줄바꿈(wrap)** 한다. 깊이가 깊어질수록 들여쓰기 단위를 줄여서 푼다(indentOf).
//        이 파일에는 text-overflow / white-space:nowrap 이 **하나도 없어야 한다.**
//
//  3. 부모가 목록에 없는 노드·순환에 걸린 노드를 **조용히 버리는 것.**
//     buildTree 는 둘 다 살려서 돌려준다(고아는 루트로 올리고, 순환은 unreached 로 드러낸다).
//     서버가 A-5 로 막지만, 막혔는지 확인할 수 있어야 막힌 것이다.
// ═════════════════════════════════════════════════════════════════════════════

export const KINDS = ['포지션', '그립', '세팅', '엔트리', '리액션', '대처', '피니시'];

// 🔴 색만으로 구분하지 않는다 — 종류 라벨 텍스트를 항상 함께 그린다(KindChip).
//    색맹 대응이자, 340px 에서 색 면적이 작아졌을 때의 가독성 요건이다.
//    이 화면의 핵심 쌍은 **리액션(앰버) ↔ 대처(그린)** 이라 둘은 반드시 명확히 달라야 한다.
//    엔트리·대처는 같은 그린 계열이라 대처에만 실선 테두리를 줘서 색 외 단서를 하나 더 둔다.
export const KIND_TONE = {
  '포지션': { color: 'var(--blue)',      bg: 'var(--blue-dim)',    border: '1px solid transparent' },
  '그립':   { color: 'var(--purple)',    bg: 'var(--purple-dim)',  border: '1px solid transparent' },
  '세팅':   { color: 'var(--text2)',     bg: 'var(--surface-hi)',  border: '1px solid transparent' },
  '엔트리': { color: 'var(--accent-lt)', bg: 'var(--accent-dim)',  border: '1px solid transparent' },
  '리액션': { color: 'var(--amber)',     bg: 'var(--amber-dim)',   border: '1px solid var(--amber)' },
  '대처':   { color: 'var(--accent-lt)', bg: 'var(--accent-dim)',  border: '1px solid var(--accent)' },
  '피니시': { color: 'var(--red)',       bg: 'var(--red-dim)',     border: '1px solid transparent' },
};

const FALLBACK_TONE = { color: 'var(--text2)', bg: 'var(--surface-hi)', border: '1px solid transparent' };

/**
 * 평평한 노드 배열 → 렌더 순서 행 목록. **순수 함수** (QA 하네스가 직접 부른다).
 *
 * 반환: { rows, unreached, roots, childrenOf }
 *   rows[i] = { node, depth, index, siblingCount, childCount, descendantCount, ancestors:number[] }
 */
export function buildTree(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  const byId = new Map(list.map(n => [n.id, n]));
  const childrenOf = new Map();
  const roots = [];

  for (const n of list) {
    const pid = n.parentNodeId;
    // 🔴 부모가 목록에 없으면 버리지 않고 루트로 올린다. 화면에서 사라지는 것이 가장 나쁘다.
    if (pid == null || !byId.has(pid) || pid === n.id) { roots.push(n); continue; }
    if (!childrenOf.has(pid)) childrenOf.set(pid, []);
    childrenOf.get(pid).push(n);
  }

  const cmp = (a, b) => ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)) || (a.id - b.id);
  roots.sort(cmp);
  for (const arr of childrenOf.values()) arr.sort(cmp);

  const rows = [];
  const seen = new Set();

  // 서버가 순환을 400 으로 막지만(A-5-1), 그게 뚫렸을 때 **브라우저가 멈추는 것**은 별개 문제다.
  // seen 과 깊이 상한으로 프론트에서도 무한 재귀를 구조적으로 차단한다.
  const walk = (n, depth, ancestors) => {
    if (seen.has(n.id) || depth > 64) return 0;
    seen.add(n.id);
    const kids = childrenOf.get(n.id) || [];
    const row = {
      node: n, depth, ancestors,
      index: 0, siblingCount: 0,
      childCount: kids.length,
      descendantCount: 0,
    };
    rows.push(row);
    const nextAnc = ancestors.concat(n.id);
    let total = 0;
    kids.forEach((k, i) => {
      const before = rows.length;
      const sub = walk(k, depth + 1, nextAnc);
      if (rows.length > before) {
        rows[before].index = i;
        rows[before].siblingCount = kids.length;
      }
      total += sub;
    });
    row.descendantCount = total;
    return total + 1;
  };

  roots.forEach((r, i) => {
    const before = rows.length;
    walk(r, 0, []);
    if (rows.length > before) {
      rows[before].index = i;
      rows[before].siblingCount = roots.length;
    }
  });

  // 순환 때문에 못 그린 노드도 숨기지 않고 돌려준다.
  const unreached = list.filter(n => !seen.has(n.id));
  return { rows, unreached, roots, childrenOf };
}

/** 접힌 조상이 하나라도 있으면 감춘다. **순수 함수**. */
export function visibleRows(rows, collapsed) {
  if (!collapsed || collapsed.size === 0) return rows;
  return rows.filter(r => !r.ancestors.some(a => collapsed.has(a)));
}

/**
 * 깊이별 들여쓰기 폭.
 * 🔴 340px 에서 라벨을 자르지 않기 위해 깊이가 깊어질수록 **단위를 줄인다.**
 *    ellipsis 로 자르는 대신 여기서 공간을 되찾는 것이 이 화면의 해법이다.
 *    깊이 상한 12(A-5-3)에서 최대 84px → 340px 기준 라벨에 240px 이상 남는다.
 */
export function indentOf(depth) {
  const d = Math.max(0, depth | 0);
  const px = d <= 3 ? d * 14 : 42 + (d - 3) * 7;
  return Math.min(px, 84);
}

function KindChip({ kind }) {
  const t = KIND_TONE[kind] || FALLBACK_TONE;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: 6,
      fontSize: 10, fontWeight: 800, letterSpacing: '-0.2px',
      color: t.color, background: t.bg, border: t.border,
      flexShrink: 0,
    }}>{kind}</span>
  );
}

function IconBtn({ label, onClick, tone = 'var(--text2)', disabled }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={!!disabled}
      style={{
        background: 'transparent',
        border: '1px solid var(--border-med)',
        borderRadius: 7,
        color: tone,
        fontSize: 11, fontWeight: 700,
        padding: '4px 8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >{label}</button>
  );
}

function NodeRow({
  row, uncovered, collapsed, onToggleCollapse,
  onOpen, onAddChild, onAddCoverage, onMove, onInsertParent, onDelete,
}) {
  const [actions, setActions] = useState(false);
  const n = row.node;
  const kids = row.childCount;
  const isCollapsed = collapsed.has(n.id);

  // 🔴 미연결 판정은 서버의 `linked` 를 그대로 쓴다(계약 B-3).
  //    여기서 techniqueId != null 을 다시 판정하면 두 곳이 갈린다.
  const unlinked = n.linked === false;

  return (
    <div style={{ paddingLeft: indentOf(row.depth), marginBottom: 5 }}>
      <div style={{
        borderRadius: 10,
        padding: '8px 9px',
        // 🔴 이 화면에서 **앰버는 "대처 없는 리액션" 전용**이다 (Leader 결정, task-026).
        //    /recall 에서는 미연결이 그 화면의 본업 신호라 앰버가 맞다. 여기는 다르다 —
        //    트리의 포지션·그립·세팅은 대부분 자유 라벨이라 `linked:false` 가 다수가 되고,
        //    미연결까지 앰버로 그리면 앰버가 화면을 덮어 **이 화면의 본업("대처 없음")이 묻힌다.**
        //    → 미연결은 중립 점선(`--border-med`)으로 낮춘다. 숨기는 게 아니라 덜 시끄럽게 하는 것이다.
        //      (텍스트는 그대로 `--text` — 흐리게 낮추면 "꺼진 것"으로 읽힌다. 미연결은 결함이 아니라 상태다.)
        //    🔴 세 갈래다. **uncovered 가 unlinked 를 이긴다** — 둘 다인 노드는 앰버로 그린다.
        //       되돌리려거든 왜 갈랐는지부터 읽어라. 화면마다 앰버가 가리키는 것이 다른 게 정상이다.
        background: uncovered ? 'var(--amber-dim)' : 'var(--surface-up)',
        border: uncovered
          ? '1px dashed var(--amber)'
          : (unlinked ? '1px dashed var(--border-med)' : '1px solid var(--border)'),
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          <span
            onClick={kids > 0 ? () => onToggleCollapse(n.id) : undefined}
            style={{
              width: 18, flexShrink: 0, textAlign: 'center',
              fontSize: 12, lineHeight: '18px', fontWeight: 800,
              color: kids > 0 ? 'var(--text2)' : 'var(--text3)',
              cursor: kids > 0 ? 'pointer' : 'default',
            }}
          >{kids > 0 ? (isCollapsed ? '▸' : '▾') : '·'}</span>

          <div style={{ flex: 1, minWidth: 0 }} onClick={() => onOpen(n)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 2 }}>
              <KindChip kind={n.kind} />
              {/* 미연결 = 중립 배지(문구는 그대로 남는다). 앰버는 "대처 없음" 전용이다. */}
              {unlinked && <Tag tone="neutral">미연결</Tag>}
              {uncovered && <Tag tone="amber">대처 없음</Tag>}
              {n.linkCount > 0 && <Tag tone="blue">자료 {n.linkCount}</Tag>}
            </div>

            {/* 🔴 이름은 절대 자르지 않는다. ellipsis 도 nowrap 도 쓰지 않는다. */}
            <div style={{
              fontSize: 13, fontWeight: 700, color: 'var(--text)',
              lineHeight: 1.45,
              whiteSpace: 'normal',
              overflowWrap: 'anywhere', wordBreak: 'break-word',
              cursor: 'pointer',
            }}>
              {n.label || <span style={{ color: 'var(--text3)', fontWeight: 500 }}>(이름 없음)</span>}
            </div>

            {(n.techniqueName || n.note) && (
              <div style={{
                fontSize: 11, color: 'var(--text3)', marginTop: 2, lineHeight: 1.45,
                whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word',
              }}>
                {n.techniqueName && <>기술 · {n.techniqueName}</>}
                {n.techniqueName && n.note ? ' · ' : ''}
                {n.note}
              </div>
            )}

            {isCollapsed && kids > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>
                하위 {row.descendantCount}개 접힘
              </div>
            )}
          </div>

          <span
            onClick={() => setActions(v => !v)}
            style={{
              flexShrink: 0, padding: '2px 6px', cursor: 'pointer',
              fontSize: 13, fontWeight: 800,
              color: actions ? 'var(--accent-lt)' : 'var(--text3)',
            }}
          >⋯</span>
        </div>

        {/* 🔴 빈 곳을 보여주기만 하고 메울 길을 안 주면 절반만 한 것이다. */}
        {uncovered && (
          <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onAddCoverage(n)}
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none',
                borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >+ 대처 추가</button>
            <span style={{ fontSize: 11, color: 'var(--amber)' }}>
              이 리액션에 대한 대처가 아직 없습니다
            </span>
          </div>
        )}

        {actions && (
          <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <IconBtn label="＋ 자식" onClick={() => onAddChild(n)} tone="var(--accent-lt)" />
            <IconBtn label="▲ 위로" onClick={() => onMove(row, -1)} disabled={row.index <= 0} />
            <IconBtn label="▼ 아래로" onClick={() => onMove(row, +1)} disabled={row.index >= row.siblingCount - 1} />
            <IconBtn label="↥ 위에 삽입" onClick={() => onInsertParent(n)} />
            <IconBtn label="삭제" onClick={() => onDelete(row)} tone="var(--red)" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResearchTree({
  nodes,
  uncoveredIds,
  onOpen, onAddChild, onAddRoot, onAddCoverage, onMove, onInsertParent, onDelete,
}) {
  const [collapsed, setCollapsed] = useState(() => new Set());

  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const rows = useMemo(() => visibleRows(tree.rows, collapsed), [tree, collapsed]);

  // 🔴 서버가 준 목록을 그대로 쓴다. 여기서 다시 판정하지 않는다.
  const uncoveredSet = useMemo(
    () => new Set(Array.isArray(uncoveredIds) ? uncoveredIds : []),
    [uncoveredIds]
  );

  const toggle = (id) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (!Array.isArray(nodes) || nodes.length === 0) {
    return (
      <div style={{
        padding: 16, borderRadius: 12,
        border: '1px dashed var(--border-med)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>
          이 버전에는 아직 노드가 없습니다
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.5 }}>
          시작 포지션이나 그립을 첫 노드로 두고, 상대 반응을 <b style={{ color: 'var(--amber)' }}>리액션</b>으로,
          그에 대한 답을 <b style={{ color: 'var(--accent-lt)' }}>대처</b>로 붙여 나갑니다.
        </div>
        <button
          type="button"
          onClick={() => onAddRoot()}
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >＋ 첫 노드 추가</button>
      </div>
    );
  }

  return (
    <div>
      {rows.map(r => (
        <NodeRow
          key={r.node.id}
          row={r}
          uncovered={uncoveredSet.has(r.node.id)}
          collapsed={collapsed}
          onToggleCollapse={toggle}
          onOpen={onOpen}
          onAddChild={onAddChild}
          onAddCoverage={onAddCoverage}
          onMove={onMove}
          onInsertParent={onInsertParent}
          onDelete={onDelete}
        />
      ))}

      {/* 순환에 걸려 트리에 못 붙은 노드를 조용히 버리지 않는다.
          정상 상태에서는 절대 뜨지 않는다 — 뜨면 서버 A-5-1 이 뚫린 것이다. */}
      {tree.unreached.length > 0 && (
        <div style={{
          marginTop: 10, padding: 10, borderRadius: 10,
          background: 'var(--red-dim)', border: '1px solid var(--red)',
          fontSize: 11, color: 'var(--red)', lineHeight: 1.5,
        }}>
          <Icon name="target" size={12} color="var(--red)" />{' '}
          <b>트리에 붙지 못한 노드 {tree.unreached.length}개</b> — 부모 관계에 순환이 있습니다.
          화면이 이 노드들을 그리지 못했습니다: {tree.unreached.map(n => `#${n.id} ${n.label}`).join(', ')}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          onClick={() => onAddRoot()}
          style={{
            background: 'transparent', color: 'var(--text)',
            border: '1px solid var(--border-med)', borderRadius: 10,
            padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >＋ 루트 노드 추가</button>
      </div>
    </div>
  );
}
