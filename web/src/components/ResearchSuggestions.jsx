import React, { useState } from 'react';
import Tag from './Tag';
import Button from './Button';
import { sourceText, dismissKey, fmtMD } from '../utils/weeklyTask';

// ═════════════════════════════════════════════════════════════════════════════
// 리액션 자동 유입 — 스파링에서 막힌 리액션이 **제안**으로 올라온다 (task-027)
//
// 🔴 이 구역의 첫 번째 약속: **채택하기 전에는 DB 에 노드가 만들어지지 않는다.**
//    그 약속은 주석이 아니라 구조로 지킨다 —
//      · 조회는 `GET .../reaction-suggestions` 하나뿐이고 서버가 쓰기를 하지 않는다(계약 A)
//      · 채택은 기존 `POST /api/research/nodes` 를 **사용자 클릭에서만** 부른다
//      · 이 파일에는 API 모듈 import 가 하나도 없다 — 콜백만 받는다. 즉 **혼자서는 아무것도 못 만든다.**
//    편의를 위해 여기에 createNode 를 들이지 마라. 그 순간 이 약속을 검사할 방법이 사라진다.
//
// 🔴 두 번째 약속: **근거 없이 나타나지 않는다.** 모든 행은 "매트 ×3 · 최근 6/24" 를 달고,
//    펼치면 어느 라운드에서 왔는지(날짜·적힌 기술명·매칭 방식)를 최대 5건 보여 준다.
//
// 🔴 색 언어 — 새 색을 정의하지 않는다(`tokens.css` 미수정). 기존 3갈래에 겹치지 않게 고른다:
//      · 앰버 배경 + 앰버 점선  = "대처 없는 리액션" **전용** (task-026 Leader 결정)
//      · 중립 점선(--border-med) = 미연결
//      · 실선(--border)          = 일반 노드
//    → 제안은 **블루 점선 + --blue-dim 배경**. 위 셋 어디와도 겹치지 않고, 앰버를 뺏지 않는다.
//    그리고 색에만 기대지 않는다: 제안은 **트리 바깥의 별도 구역**에 있고, "제안" 배지와
//    "아직 트리에 없습니다" 문장을 항상 함께 그린다. 색이 사라져도 구분이 남아야 한다.
//
// 🔴 미매칭(unlinked)을 집계에서 빼지 않는다. 붙일 자리를 못 정할 뿐 사라진 게 아니다
//    (task-024 가 unlinked 를 전량 반환하도록 설계한 이유 그대로).
// ═════════════════════════════════════════════════════════════════════════════

function SourceList({ sources, sourceCount }) {
  const list = Array.isArray(sources) ? sources : [];
  if (list.length === 0) return null;
  const more = Number(sourceCount) - list.length;
  return (
    <div style={{
      marginTop: 7, padding: '8px 9px', borderRadius: 8,
      background: 'var(--surface)', border: '1px solid var(--border)',
    }}>
      {list.map((s, i) => (
        <div key={i} style={{
          fontSize: 11, color: 'var(--text2)', lineHeight: 1.55,
          whiteSpace: 'normal', overflowWrap: 'anywhere',
        }}>
          {/* 🔴 날짜는 서버가 준 'YYYY-MM-DD' 문자열을 잘라 쓴다 — Date 왕복 금지(KST 하루 밀림). */}
          {fmtMD(s.date) || '날짜 없음'} · <b style={{ color: 'var(--text)' }}>{s.itemName || '(이름 없음)'}</b>
          {s.level ? ` · ${s.level}` : ''}
          {s.matchedName && s.matchedName !== s.itemName ? ` → ${s.matchedName}` : ''}
          {s.matchType ? ` (${s.matchType})` : ''}
        </div>
      ))}
      {more > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
          그 밖에 {more}건 더 — 여기는 최근 {list.length}건만 보여 줍니다
        </div>
      )}
    </div>
  );
}

function SuggestRow({ s, unlinked, onAdopt, onDismiss, busy }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      padding: '10px 11px', marginBottom: 7, borderRadius: 10,
      // 제안 = 블루 점선(+dim 배경) / 붙일 자리 없는 미매칭 = 중립 점선.
      // 🔴 앰버는 쓰지 않는다 — 이 화면에서 앰버는 "대처 없는 리액션" 전용이다.
      background: unlinked ? 'transparent' : 'var(--blue-dim)',
      border: unlinked ? '1px dashed var(--border-med)' : '1px dashed var(--blue)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 3 }}>
        <Tag tone={unlinked ? 'neutral' : 'blue'}>제안</Tag>
        {unlinked && <Tag tone="neutral">미연결</Tag>}
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>아직 트리에 없습니다</span>
      </div>

      {/* 🔴 이름은 자르지 않는다. ellipsis / nowrap 금지(340px 요건, task-026 과 같은 규칙). */}
      <div style={{
        fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.45,
        whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word',
      }}>
        {String(s.label || '').trim() || '(내용 없음)'}
      </div>

      <div style={{
        fontSize: 11, color: 'var(--text2)', marginTop: 3, lineHeight: 1.5,
        whiteSpace: 'normal', overflowWrap: 'anywhere',
      }}>
        {/* 🔴 출처 — 근거 없이 나타나면 신뢰하지 않는다. */}
        {sourceText(s)}
        {!unlinked && s.parentLabel ? ` · 붙을 자리 “${s.parentLabel}”` : ''}
        {unlinked && s.itemName ? ` · 적힌 기술명 “${s.itemName}”` : ''}
      </div>

      {unlinked && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, lineHeight: 1.5 }}>
          기술 이름이 기술트리와 연결되지 않아 <b style={{ color: 'var(--text)' }}>붙을 자리를 정할 수 없습니다</b>.
          해당 기술을 연결한 노드를 트리에 만들면 다음부터 제안으로 올라옵니다.
        </div>
      )}

      <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {!unlinked && (
          <Button variant="primary" size="sm" disabled={busy} onClick={() => onAdopt(s)}>
            채택
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onDismiss(s)}>
          무시
        </Button>
        {(s.sources || []).length > 0 && (
          <span
            onClick={() => setOpen(v => !v)}
            style={{ fontSize: 11, color: 'var(--text2)', cursor: 'pointer', marginLeft: 'auto' }}
          >{open ? '근거 닫기' : '근거 보기'}</span>
        )}
      </div>

      {open && <SourceList sources={s.sources} sourceCount={s.sourceCount} />}
    </div>
  );
}

/**
 * @param split  utils/weeklyTask.js 의 splitSuggestions() 결과
 * @param onAdopt(s)   채택 — 부모가 노드 시트를 미리 채워 연다(즉시 생성하지 않는다)
 * @param onDismiss(s) 무시 — 이 브라우저에만 남는다(서버 저장 엔드포인트가 계약에 없다)
 * @param onRestore()  무시 전부 되돌리기
 */
export default function ResearchSuggestions({ split, res, onAdopt, onDismiss, onRestore, busy }) {
  const [showSkipped, setShowSkipped] = useState(false);

  // 🔴 보여 줄 게 하나도 없으면 **아무것도 그리지 않는다.** 빈 블록 금지(지시 C).
  if (!split || !split.visible) return null;

  const s = res?.summary || {};
  const total = split.live.length + split.unlinked.length;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        padding: 11, borderRadius: 11,
        background: 'var(--surface)', border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>매트에서 올라온 리액션</span>
          {total > 0 && <Tag tone="blue">{total}</Tag>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.55, marginBottom: 10 }}>
          스파링에서 막혔던 상대 반응입니다. <b style={{ color: 'var(--text)' }}>채택해야 트리에 노드가 만들어집니다</b> —
          여기 있는 동안에는 저장되지 않습니다.
        </div>

        {split.live.map(x => (
          <SuggestRow
            key={dismissKey(x)}
            s={x}
            onAdopt={onAdopt}
            onDismiss={onDismiss}
            busy={busy}
          />
        ))}

        {/* 🔴 미매칭을 여기서 버리면 "매칭이 안 돼서 빠진 것"과 "기록이 없어서 빠진 것"을 구분할 수 없다. */}
        {split.unlinked.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>
              붙일 자리를 못 찾은 리액션 {split.unlinked.length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, lineHeight: 1.55 }}>
              기록에는 있지만 <b style={{ color: 'var(--text)' }}>기술 이름이 연결되지 않아</b> 위 목록에 합쳐지지
              않았습니다. 숫자에서 뺀 것이 아니라 붙일 자리를 정하지 못한 것입니다.
            </div>
            {split.unlinked.map(x => (
              <SuggestRow
                key={dismissKey(x)}
                s={x}
                unlinked
                onAdopt={onAdopt}
                onDismiss={onDismiss}
                busy={busy}
              />
            ))}
          </div>
        )}

        {/* 이미 트리에 있어 제외한 것 — 조용히 지우지 않고 셈만 드러낸다. */}
        {split.skipped.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
            이미 트리에 있어 제외 {split.skipped.length}개
            <span
              onClick={() => setShowSkipped(v => !v)}
              style={{ marginLeft: 6, color: 'var(--text2)', cursor: 'pointer' }}
            >{showSkipped ? '접기' : '보기'}</span>
            {showSkipped && (
              <div style={{ marginTop: 4, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                {split.skipped.map(x => x.label).filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        )}

        {/* 🔴 무시는 이 브라우저에만 남는다(서버 저장이 계약에 없다). 되돌릴 길을 항상 함께 둔다 —
            안 그러면 사용자는 자기가 무엇을 지웠는지 영영 알 수 없다. */}
        {split.hiddenCount > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
            무시함 {split.hiddenCount}개 (이 브라우저에만 저장됩니다)
            <span
              onClick={busy ? undefined : onRestore}
              style={{ marginLeft: 6, color: 'var(--accent-lt)', cursor: 'pointer', fontWeight: 700 }}
            >다시 보기</span>
          </div>
        )}

        {/* 표본이 있는데 제안이 0인 이유를 숫자로 말해 준다. 🔴 `0/0` 을 쓰지 않는다. */}
        {total === 0 && split.hiddenCount === 0 && Number(s.failItemsWithReaction) > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
            리액션이 적힌 실패 {s.failItemsWithReaction}건은 모두 이미 트리에 있습니다.
          </div>
        )}
      </div>
    </div>
  );
}
