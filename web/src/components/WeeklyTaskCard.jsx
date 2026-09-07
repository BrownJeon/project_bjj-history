import React from 'react';
import Card from './Card';
import Tag from './Tag';
import Icon from './Icon';
import Button from './Button';
import { taskSummary, openForText, fmtDay } from '../utils/weeklyTask';

// ═════════════════════════════════════════════════════════════════════════════
// 이번 주 과제 카드 — 홈 (task-027)
//
// 이 카드의 목적은 정보 전달이 아니라 **매트에 나가기 전에 한 번 보이는 것**이다.
// 그래서 위치는 "오늘 기록" 카드 바로 아래이고, 문구는 한 줄이다.
//
// 🔴 세 화면(`/research` 시트 · 홈 · 스파링 저장)이 **같은 값**을 보여야 한다.
//    그 보장은 "같은 API(`GET /api/research/task`) + 같은 순수 함수(`taskSummary`)"로 한다.
//    여기서 라벨을 다시 만들지 마라 — 두 곳이 갈리면 어느 쪽이 맞는지 알 수 없다.
//
// 🔴 과제가 없을 때 카드를 **숨기지 않는다.** 숨기면 "이번 주 과제"라는 기능이 있다는 것 자체가
//    보이지 않는다. 대신 한 줄로 `/research` 로 보낸다(지시 C).
//    ↔ 리액션 제안은 반대로 없으면 **아무것도 안 그린다.** 둘의 규칙이 다른 것은 의도된 것이다:
//      과제는 "정해야 하는 것"이고, 제안은 "저절로 올라오는 것"이다.
//
// 🔴 날짜는 서버가 준 'YYYY-MM-DD' 문자열만 자른다. `toISOString()` 은 KST(+9)에서 하루 민다.
// ═════════════════════════════════════════════════════════════════════════════

export default function WeeklyTaskCard({ task, loading, err, onGo, compact }) {
  const t = taskSummary(task);

  if (loading) {
    return (
      <Card style={{ borderRadius: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>이번 주 과제 불러오는 중…</div>
      </Card>
    );
  }

  // 🔴 실패를 "과제 없음"으로 뭉개지 않는다 — 사용자가 정해 둔 과제가 있는데 없는 것처럼
  //    보이면 그날 훈련의 초점이 조용히 사라진다.
  if (err) {
    return (
      <Card style={{ borderRadius: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }}>
          이번 주 과제를 불러오지 못했습니다 — {err}
        </div>
      </Card>
    );
  }

  if (!t.has) {
    return (
      <Card style={{ borderRadius: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: compact ? 0 : 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 9, flexShrink: 0,
            background: 'var(--surface-hi)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="target" size={14} color="var(--text2)" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>이번 주 과제가 없습니다</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
              연구 트리에서 노드 하나를 골라 이번 주에 팔 자리를 정하세요
            </div>
          </div>
        </div>
        {!compact && (
          <Button full size="sm" variant="outline" onClick={onGo}>연구에서 정하기</Button>
        )}
      </Card>
    );
  }

  const closed = !t.open;

  return (
    <Card
      style={{
        borderRadius: 16, marginBottom: 12,
        // 열린 과제는 포인트 컬러 세로 막대로 눈에 걸리게 한다. 마감된 과제는 중립으로 내린다.
        borderLeft: closed ? '3px solid var(--border-med)' : '3px solid var(--accent)',
      }}
      onClick={onGo}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: closed ? 'var(--text2)' : 'var(--accent-lt)' }}>
          이번 주 과제
        </span>
        {closed
          ? <Tag tone="neutral">마감 · {t.outcomeLabel || t.outcome || '완료'}</Tag>
          : (openForText(t.daysOpen) ? <Tag tone="neutral">{openForText(t.daysOpen)}</Tag> : null)}
        {/* 🔴 미연결은 상태이지 결함이 아니다. 감추지 않는다(task-026 과 같은 규칙). */}
        {!t.linked && <Tag tone="neutral">미연결</Tag>}
      </div>

      <div style={{
        fontSize: 16, fontWeight: 800, lineHeight: 1.4,
        color: closed ? 'var(--text2)' : 'var(--text)',
        whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word',
      }}>
        {t.title}
      </div>

      {t.sub && (
        <div style={{
          fontSize: 11, color: 'var(--text2)', marginTop: 3, lineHeight: 1.5,
          whiteSpace: 'normal', overflowWrap: 'anywhere',
        }}>{t.sub}</div>
      )}

      {t.memo && (
        <div style={{
          fontSize: 12, color: 'var(--text2)', marginTop: 6, lineHeight: 1.55,
          whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
        }}>{t.memo}</div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 7 }}>
        {closed
          ? `마감 ${fmtDay(t.closedAt) || ''}`.trim()
          : `정한 날 ${fmtDay(t.createdAt) || ''} · 스파링을 저장할 때 마감합니다`.trim()}
      </div>
    </Card>
  );
}
