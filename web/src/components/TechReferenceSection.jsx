import React, { useId } from 'react';
import {
  cardState, reviewLabel, mistakesBasisLabel,
  EMPTY_RELATION_TEXT, EMPTY_RELATED_TEXT,
} from '../utils/techReferenceModel';

// task-054 — 기술 상세 모달 안의 관장 설명 / 앞뒤 연결 / 함께 보는 기술.
// 데이터 조회·이동 상태는 부모(TechDetailModal)가 갖고, 여기서는 그리기만 한다.
// status: 'loading' | 'error' | 'ready'

function StatusLine({ status, loadingText, errorText, onRetry }) {
  if (status === 'loading') return <p className="tech-ref-copy" role="status">{loadingText}</p>;
  return (
    <div role="alert">
      <p className="tech-ref-copy">{errorText}</p>
      <button type="button" className="tech-ref-retry" onClick={onRetry}>다시 시도</button>
    </div>
  );
}

function DetailBlock({ title, items, note }) {
  if (!items.length && !note) return null;
  return (
    <div className="tech-ref-detail">
      <strong>{title}</strong>
      {items.length > 0 && (
        <ul>
          {items.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}
      {note && <p className="tech-ref-note">{note}</p>}
    </div>
  );
}

/** 관장 설명 — 요약은 항상, 나머지는 기본 접힘. 개인 메모(note)와 섞지 않는다. */
export function TechDescriptionSection({ status, sections, onRetry }) {
  const headingId = useId();
  const d = status === 'ready' ? sections?.description : null;
  const basisLabel = d ? mistakesBasisLabel(d.mistakesBasis) : null;
  const hasMore = d && (d.conditions.length || d.principles.length || d.mistakes.length || d.next.length || d.nextNote);
  return (
    <section className="tech-ref-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="tech-ref-heading">
        관장 설명{d ? <small> {reviewLabel(d.review)}</small> : null}
      </h3>
      {status !== 'ready' ? (
        <StatusLine status={status} loadingText="설명을 불러오는 중…" errorText="설명을 불러오지 못했어요." onRetry={onRetry} />
      ) : !d ? (
        <p className="tech-ref-copy">아직 준비된 설명이 없어요. 개인 메모와 기록은 계속 볼 수 있어요.</p>
      ) : (
        <>
          <p className="tech-ref-copy">{d.summary}</p>
          {d.kindNote && <p className="tech-ref-note">{d.kindNote}</p>}
          {hasMore ? (
            <details className="tech-ref-more">
              <summary>자세히 보기 · 조건과 핵심 원리</summary>
              <DetailBlock title="성립 조건" items={d.conditions} />
              <DetailBlock title="핵심 원리" items={d.principles} />
              <DetailBlock
                title={basisLabel ? `흔한 실수 (${basisLabel})` : '흔한 실수'}
                items={d.mistakes}
              />
              <DetailBlock title="다음 연결" items={d.next} note={d.nextNote} />
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function RelationCard({ card, onNavigate }) {
  const st = cardState(card);
  return (
    <li>
      <button
        type="button"
        className="tech-ref-card"
        disabled={st.disabled}
        aria-disabled={st.disabled ? 'true' : undefined}
        onClick={st.disabled ? undefined : () => onNavigate(card)}
      >
        <span className="tech-ref-card-name">
          {card.name}{!st.disabled && <span aria-hidden="true"> ›</span>}
        </span>
        <span className="tech-ref-card-cond">{st.conditionLabel}</span>
        {st.label && <span className="tech-ref-card-state">{st.label}</span>}
      </button>
    </li>
  );
}

function RelationList({ cards, emptyText, onNavigate }) {
  if (!cards.length) return <p className="tech-ref-copy">{emptyText}</p>;
  return (
    <ul className="tech-ref-list">
      {cards.map((c) => <RelationCard key={c.key} card={c} onNavigate={onNavigate} />)}
    </ul>
  );
}

/** 앞뒤 연결(들어오는 → 현재 → 이어지는) + 함께 보는 기술. 서버 순서 그대로 세로 반복. */
export function TechRelationSections({ status, sections, currentName, onNavigate, onRetry }) {
  const flowId = useId();
  const relatedId = useId();
  const ready = status === 'ready' && sections;
  return (
    <>
      <section className="tech-ref-section" aria-labelledby={flowId}>
        <h3 id={flowId} className="tech-ref-heading">앞뒤 연결</h3>
        {!ready ? (
          <StatusLine status={status} loadingText="연결을 불러오는 중…" errorText="연결을 불러오지 못했어요." onRetry={onRetry} />
        ) : (
          <>
            <p className="tech-ref-copy">조건이 맞을 때 가능한 전환이에요.</p>
            <h4 className="tech-ref-sub">들어오는 기술 →</h4>
            <RelationList cards={sections.incoming} emptyText={EMPTY_RELATION_TEXT} onNavigate={onNavigate} />
            <div className="tech-ref-current">현재 기술 · {currentName}</div>
            <h4 className="tech-ref-sub">→ 이어지는 기술</h4>
            <RelationList cards={sections.outgoing} emptyText={EMPTY_RELATION_TEXT} onNavigate={onNavigate} />
          </>
        )}
      </section>
      <section className="tech-ref-section" aria-labelledby={relatedId}>
        <h3 id={relatedId} className="tech-ref-heading">함께 보는 기술</h3>
        {!ready ? (
          <StatusLine status={status} loadingText="관련 기술을 불러오는 중…" errorText="관련 기술을 불러오지 못했어요." onRetry={onRetry} />
        ) : (
          <>
            <p className="tech-ref-copy">비교·같은 계열의 학습 관계이며 수행 순서가 아니에요.</p>
            <RelationList cards={sections.related} emptyText={EMPTY_RELATED_TEXT} onNavigate={onNavigate} />
          </>
        )}
      </section>
    </>
  );
}

export default TechRelationSections;
