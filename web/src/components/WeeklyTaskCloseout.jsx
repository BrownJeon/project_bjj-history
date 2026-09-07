import React from 'react';
import Tag from './Tag';
import { taskSummary } from '../utils/weeklyTask';

// ═════════════════════════════════════════════════════════════════════════════
// 이번 주 과제 마감 3택 — 스파링 저장 화면 (task-027)
//
// 매트에서 내려와 스파링을 적는 그 자리에서 과제를 닫는다. 화면을 옮기지 않는 것이 요점이다.
//
// 🔴 **task-017 함정과 이 화면의 관계 — 반드시 읽을 것**
//    이 앱의 스파링 저장은 `SparSession.destroy` + `insertSessions` 의 **destroy+reinsert** 다.
//    그래서 "프론트가 안 보낸 필드는 재저장마다 사라진다"(실제로 positions 54행 중 36행이 그렇게 비었다).
//    → dev-027a 는 그 함정을 **구조적으로 피했다**: 마감 값은 `spar_sessions` 가 아니라
//      `research_tasks` 에 있고, 전용 엔드포인트(`POST /api/research/task/:id/close`)로 저장된다.
//      즉 **스파링 페이로드에 실리지 않는다.**
//    🔴 그러므로 여기서 `EMPTY_SESSION` / 기존값 매핑 / `buildPayload()` 에 마감 필드를 넣지 마라.
//      백엔드 `insertSessions()` 는 그 필드를 읽지 않으므로 넣어도 저장되지 않고, 다음 사람에게
//      "저장되는 필드"라는 **거짓 신호**만 남긴다. 함정을 피한 방식이 다른 것이지 무시한 것이 아니다.
//      (재저장으로 마감이 지워지지 않는다는 것은 QA 하네스가 실제 재저장으로 확인한다.)
//
// 🔴 3택 라벨을 여기에 적지 않는다. 정본은 `GET /api/research/task` 의 `outcomeOptions[]` 다(계약 B).
//    서버가 라벨까지 주는 이유가 두 곳이 갈리지 않게 하려는 것인데 프론트가 또 적으면 그 장치가 죽는다.
//
// 🔴 "아직 안 고름"을 기본값으로 둔다. 기본값을 `not_tried` 로 두면 아무것도 안 한 저장이
//    "시도 못 함"이라는 **기록을 만든다** — outcome 에 기본값을 두지 않은 task-017 과 같은 이유다.
// ═════════════════════════════════════════════════════════════════════════════

export default function WeeklyTaskCloseout({ task, options, fromServer, value, onChange, disabled, err }) {
  const t = taskSummary(task);

  // 🔴 조회 실패를 "과제 없음"으로 뭉개지 않는다. 열린 과제가 있는데 3택이 안 뜨는 상황과
  //    정말로 과제가 없는 상황이 화면에서 같아 보이면, 사용자는 마감을 못 하고도 이유를 모른다.
  if (err) {
    return (
      <div style={{
        margin: '0 0 12px', padding: 10, borderRadius: 10,
        background: 'var(--surface)', border: '1px solid var(--border)',
        fontSize: 11, color: 'var(--text2)', lineHeight: 1.55,
      }}>
        이번 주 과제를 불러오지 못해 마감 3택을 띄우지 못했습니다 — {err}.
        스파링 저장은 그대로 됩니다.
      </div>
    );
  }

  // 과제가 없거나 이미 마감된 상태면 여기서 할 일이 없다 — 빈 블록을 그리지 않는다.
  if (!t.has || !t.open) return null;

  const list = Array.isArray(options) ? options : [];

  return (
    <div style={{
      margin: '0 0 12px', padding: 12, borderRadius: 12,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: '3px solid var(--accent)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-lt)' }}>이번 주 과제</span>
        {!t.linked && <Tag tone="neutral">미연결</Tag>}
      </div>

      <div style={{
        fontSize: 14, fontWeight: 800, lineHeight: 1.4,
        whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word',
      }}>{t.title}</div>

      {t.sub && (
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, lineHeight: 1.5 }}>{t.sub}</div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text3)', margin: '8px 0 7px', lineHeight: 1.55 }}>
        오늘 이 자리는 어땠나요? 고르면 저장할 때 과제가 마감됩니다 — 고르지 않으면 그대로 열어 둡니다.
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {list.map(o => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={!!disabled}
              onClick={() => onChange(on ? null : o.value)}   // 다시 누르면 해제 — 되돌릴 길을 남긴다
              style={{
                padding: '8px 13px', borderRadius: 9,
                fontSize: 12, fontWeight: on ? 800 : 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: on ? 'var(--accent-lt)' : 'var(--text2)',
                background: on ? 'var(--accent-dim)' : 'var(--surface-up)',
                border: on ? '1px solid var(--accent)' : '1px solid var(--border-med)',
                whiteSpace: 'normal', overflowWrap: 'anywhere',
              }}
            >{o.label}</button>
          );
        })}
      </div>

      {/* 🔴 서버가 3택 목록을 못 줘서 프론트 최후 수단으로 그린 상황을 감추지 않는다.
          감추면 서버·화면의 3택이 갈렸을 때 아무도 알아채지 못한다. */}
      {fromServer === false && (
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 7, lineHeight: 1.5 }}>
          서버가 3택 목록을 주지 않아 기본 목록으로 그렸습니다.
        </div>
      )}

      {value && (
        <div style={{ fontSize: 11, color: 'var(--accent-lt)', marginTop: 8, fontWeight: 600 }}>
          저장하면 이 과제를 마감합니다
        </div>
      )}
    </div>
  );
}
