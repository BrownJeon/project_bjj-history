import React, { useMemo } from 'react';
import Button from './Button';
import Tag from './Tag';
import Icon from './Icon';
import { normalizeLinks, linkSummary, openTargetOf, NOOPEN_TEXT } from '../utils/researchLinks';

// ═════════════════════════════════════════════════════════════════════════════
// 노드에 붙은 자료 — 목록 · 열기 · 끊김 (task-028 C·D)
//
// 🔴 **끊긴 링크를 목록에서 지우지 않는다.** `research_links.ref_id` 에는 FK 가 없다
//    (실측: `fk_rl_node` 하나뿐 — node_id 만 CASCADE). 클립·수업을 지우면 링크 행은 남고
//    가리키는 대상만 사라진다. 그 행을 화면에서 감추면 사용자는 **자기가 무엇을 연결했는지도,
//    그것을 지울 방법도** 영영 알 수 없다. 미연결과 같은 문법으로 상태를 드러낸다.
//
// 🔴 **끊긴 링크는 열지 않는다.** 눌러도 아무 일이 없어야 한다 — 없는 id 로 모달을 열면
//    흰 화면이나 영원한 스피너가 남는다. "안 깨진다"는 안 여는 것으로 지키지, try/catch 로 지키지 않는다.
//
// 🔴 색 언어 — 이 화면에서 앰버는 "대처 없는 리액션" 전용이다(task-026 Leader 결정).
//    끊김에 앰버를 쓰면 본업 신호를 뺏는다. 빨강도 아니다 — 끊김은 **오류가 아니라 상태**다.
//    → 미연결과 같은 **중립 점선 + 중립 배지**를 쓰고, 존재감은 색이 아니라 **문장**으로 낸다.
//
// 🔴 판정(무엇이 끊겼나 · 무엇을 여나)은 전부 `utils/researchLinks.js` 순수 함수다.
//    QA 하네스가 HTTP 없이 그 판정을 직접 잰다.
// ═════════════════════════════════════════════════════════════════════════════

function LinkRow({ link, busy, onOpen, onDelete }) {
  const target = openTargetOf(link);
  const canOpen = target.kind !== 'none';
  const noOpenText = canOpen ? '' : (NOOPEN_TEXT[target.reason] || '');

  return (
    <div style={{
      padding: '9px 10px', marginBottom: 6, borderRadius: 10,
      // 끊김 = 중립 점선(미연결과 같은 문법). 멀쩡한 자료 = 실선.
      background: link.broken ? 'transparent' : 'var(--surface-up)',
      border: link.broken ? '1px dashed var(--border-med)' : '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 3 }}>
        <Icon name={link.icon} size={12} color="var(--text2)" />
        {/* 출처 이름은 **항상 글자로** 쓴다 — 색·아이콘만으로 구분하지 않는다. */}
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>{link.label}</span>
        {link.sub && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{link.sub}</span>}
        {link.broken && <Tag tone="neutral">끊김</Tag>}
      </div>

      {/* 🔴 이름은 자르지 않는다(340px 요건). */}
      <div style={{
        fontSize: 13, fontWeight: 700, lineHeight: 1.45,
        color: link.broken ? 'var(--text2)' : 'var(--text)',
        whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word',
      }}>
        {link.broken
          ? (link.title || '(지워진 자료)')
          : (String(link.title || '').trim() || '(이름 없음)')}
      </div>

      {!link.broken && link.subtitle && (
        <div style={{
          fontSize: 11, color: 'var(--text2)', marginTop: 2, lineHeight: 1.5,
          whiteSpace: 'normal', overflowWrap: 'anywhere',
        }}>{link.subtitle}</div>
      )}

      {link.broken && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, lineHeight: 1.55 }}>
          {link.brokenText} — 연결 기록은 <b style={{ color: 'var(--text)' }}>지우지 않고 그대로 둡니다.</b>
          {' '}열 수는 없고, 필요 없으면 여기서 지우면 됩니다.
        </div>
      )}

      {!link.broken && noOpenText && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, lineHeight: 1.55 }}>
          {noOpenText}
        </div>
      )}

      {link.memo && link.linkType !== 'url' && (
        <div style={{
          fontSize: 11, color: 'var(--text2)', marginTop: 4, lineHeight: 1.55,
          whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
        }}>{link.memo}</div>
      )}

      <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* 🔴 열 수 없으면 **비활성**으로 그린다. 눌러도 아무 일 없는 활성 버튼이 제일 나쁘다
            (task-026 "+ 분기" 와 같은 규칙). */}
        <Button variant="outline" size="sm" disabled={busy || !canOpen} onClick={() => onOpen(link)}>
          열기
        </Button>
        <span
          onClick={busy ? undefined : () => onDelete(link)}
          style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--red)', cursor: busy ? 'default' : 'pointer' }}
        >연결 지우기</span>
      </div>
    </div>
  );
}

/**
 * @param links   서버 응답 그대로(`GET /nodes/:id/links` 의 `links`)
 * @param onAdd   "검색해서 가져오기"
 * @param onOpen(link)   열기 — 부모가 모달/라우팅을 한다
 * @param onDelete(link) 연결 지우기
 */
export default function ResearchLinkList({ links, loading, err, busy, onAdd, onOpen, onDelete }) {
  const list = useMemo(() => normalizeLinks(links), [links]);
  const sum = linkSummary(list);

  return (
    <div className="field">
      <label>붙은 자료</label>

      {err ? (
        <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 8 }}>
          자료를 불러오지 못했습니다 — {err}
        </div>
      ) : loading ? (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>불러오는 중…</div>
      ) : list.length === 0 ? (
        // 🔴 "비었다"로 끝내지 않는다 — 무엇을 붙일 수 있는지, 어디서 오는지를 말한다(task-028 A 와 같은 원칙).
        <div style={{
          padding: 11, borderRadius: 11, marginBottom: 8,
          border: '1px dashed var(--border-med)',
          fontSize: 11, color: 'var(--text2)', lineHeight: 1.6,
        }}>
          아직 붙은 자료가 없습니다. 수업기록 · 기술트리 · 시뮬레이터 · 참고영상 · 영상분석
          <b style={{ color: 'var(--text)' }}> 다섯 곳</b>에서 한 번에 찾아 붙일 수 있습니다 —
          이 자리에서 무엇을 봤는지 나중에 되짚는 근거가 됩니다.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
            자료 {sum.total}개
            {/* 🔴 끊김을 총계에서 빼지 않는다 — 뺀 숫자는 사용자가 본 목록과 어긋난다. */}
            {sum.broken > 0 && <> · 그중 <b style={{ color: 'var(--text)' }}>끊김 {sum.broken}개</b></>}
          </div>
          {list.map(l => (
            <LinkRow key={l.id} link={l} busy={busy} onOpen={onOpen} onDelete={onDelete} />
          ))}
        </>
      )}

      <Button variant="outline" size="sm" disabled={busy} onClick={onAdd}>＋ 검색해서 가져오기</Button>
    </div>
  );
}
