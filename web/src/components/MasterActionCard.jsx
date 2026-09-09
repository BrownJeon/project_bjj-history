// 관장의 제안 카드(task-030) — 승인 전에는 아무것도 생기지 않는다.
//
// 🔴 카드는 `master_actions` 행 하나를 그린 것이다. 화면이 payload 를 해석해 요약만 보여 주고,
//    실제 생성은 승인 시 서버가 기존 라우트 로직으로 한다(계약 D). 여기서 만드는 것은 없다.
// 🔴 pending 사이에 프로젝트가 지워졌을 수 있으므로 실패(422)도 정상 경로다 — failed 를 그린다.

import React, { useState } from 'react';

const OK_LABEL = {
  research_project: '만들기',
  research_nodes: '추가하기',
  node_links: '추가하기',
  weekly_task: '과제로 정하기',
};

const KIND_TITLE = {
  research_project: '연구 프로젝트 만들기',
  research_nodes: '연구 노드 추가',
  node_links: '노드에 링크 추가',
  weekly_task: '이번 주 과제 설정',
};

function asObject(v) {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
  return {};
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return String(url || '').slice(0, 30); }
}

/** payload → [제목, [[라벨, 값], …]] */
function summarize(kind, p) {
  if (kind === 'research_project') {
    const seeds = Array.isArray(p.seedNodes) ? p.seedNodes : [];
    const rows = [
      ['시작', p.startPos || '(정하지 않음)'],
      ['목표', p.goal || '(정하지 않음)'],
    ];
    if (seeds.length) {
      rows.push(['시드 노드', seeds.map(n => `${n.kind}: ${n.label}`).join(' · ')]);
    }
    return [`${KIND_TITLE[kind]} · ${p.title || '(제목 없음)'}`, rows];
  }

  if (kind === 'research_nodes') {
    const nodes = Array.isArray(p.nodes) ? p.nodes : [];
    const title = `연구 노드 ${nodes.length}개 추가${p.projectTitle ? ` · ${p.projectTitle}` : ''}`;
    return [title, nodes.map(n => [
      n.kind || '노드',
      n.label + (n.parentLabel ? ` (${n.parentLabel} 아래)` : ''),
    ])];
  }

  if (kind === 'node_links') {
    const links = Array.isArray(p.links) ? p.links : [];
    const byHost = {};
    links.forEach(l => { const h = hostOf(l.url); byHost[h] = (byHost[h] || 0) + 1; });
    const rows = [
      ['링크', Object.keys(byHost).map(h => `${h} ${byHost[h]}`).join(' · ') || '(없음)'],
      ['노드', p.nodeLabel || `노드 #${p.nodeId}`],
    ];
    return [`노드에 링크 ${links.length}개 추가`, rows];
  }

  if (kind === 'weekly_task') {
    const rows = [['과제', p.nodeLabel || `노드 #${p.nodeId}`]];
    if (p.memo) rows.push(['메모', p.memo]);
    return [KIND_TITLE[kind], rows];
  }

  return [KIND_TITLE[kind] || '제안', Object.keys(p).map(k => [k, String(p[k])])];
}

function doneText(kind, result) {
  const r = asObject(result);
  if (kind === 'research_project') return '연구 프로젝트를 만들었어요';
  if (kind === 'research_nodes') {
    const n = Array.isArray(r.nodeIds) ? r.nodeIds.length : 0;
    return n ? `연구 트리에 노드 ${n}개를 추가했어요` : '연구 트리에 노드를 추가했어요';
  }
  if (kind === 'node_links') {
    const n = Array.isArray(r.linkIds) ? r.linkIds.length : 0;
    return n ? `노드에 링크 ${n}개를 붙였어요` : '노드에 링크를 붙였어요';
  }
  if (kind === 'weekly_task') return '이번 주 과제로 정했어요';
  return '실행했어요';
}

export default function MasterActionCard({ action, busy, onApprove, onReject, onOpenResult }) {
  const [needReplace, setNeedReplace] = useState(false);
  const payload = asObject(action.payload);
  const [title, rows] = summarize(action.kind, payload);
  const st = action.status;

  const cls = st === 'approved' ? ' done'
    : st === 'rejected' ? ' off'
      : st === 'failed' ? ' fail' : '';
  const badge = st === 'approved' ? '✓ 승인됨'
    : st === 'rejected' ? '취소됨'
      : st === 'failed' ? '실행 실패' : '제안';

  async function approve(replace) {
    if (!onApprove) return;
    const r = await onApprove(action, { replace: !!replace });
    setNeedReplace(r === 'conflict');
  }

  const linkLabel = action.kind === 'weekly_task' ? '과제 보기 ›' : '연구 열기 ›';

  return (
    <div className={`bjjm-prop${cls}`}>
      <div className="bjjm-ph">
        <span className="bjjm-k">{badge}</span>
        <span className="bjjm-pt">{title}</span>
      </div>

      <div className="bjjm-pb">
        {rows.map((r, i) => (
          <div className="bjjm-kv" key={i}>
            <span className="bjjm-k">{r[0]}</span>
            <span className="bjjm-v">{r[1]}</span>
          </div>
        ))}
        {needReplace && (
          <div className="bjjm-warn">
            이미 열린 과제가 있어요 — 바꿀까요? 하나만 파기로 했으니까요.
          </div>
        )}
      </div>

      <div className="bjjm-foot">
        {st === 'pending' && !needReplace && (
          <>
            <button className="bjjm-chip" type="button" disabled={busy}
              onClick={() => onReject && onReject(action)}>취소</button>
            <button className="bjjm-chip" type="button" disabled={busy}
              style={{ background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', fontWeight: 700 }}
              onClick={() => approve(false)}>{OK_LABEL[action.kind] || '실행'}</button>
          </>
        )}

        {st === 'pending' && needReplace && (
          <>
            <button className="bjjm-chip" type="button" disabled={busy}
              onClick={() => setNeedReplace(false)}>그대로 둘게요</button>
            <button className="bjjm-chip" type="button" disabled={busy}
              style={{ background: 'var(--amber)', color: '#1a1200', borderColor: 'var(--amber)', fontWeight: 700 }}
              onClick={() => approve(true)}>바꾸기</button>
          </>
        )}

        {st === 'approved' && (
          <span className="bjjm-res">
            {doneText(action.kind, action.result)}
            <button className="bjjm-link" type="button"
              onClick={() => onOpenResult && onOpenResult(action)}>{linkLabel}</button>
          </span>
        )}

        {st === 'rejected' && (
          <span className="bjjm-res off">취소했어요 — 아무것도 만들지 않았어요</span>
        )}

        {st === 'failed' && (
          <span className="bjjm-res fail">
            {asObject(action.result).error || '실행하지 못했어요'}
          </span>
        )}
      </div>
    </div>
  );
}
