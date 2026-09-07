import React from 'react';
import Card from './Card';
import Button from './Button';
import ResearchStarters, { STARTERS_TITLE } from './ResearchStarters';

// ═════════════════════════════════════════════════════════════════════════════
// 빈 상태 — 빈 트리를 마주하지 않게 한다.
//
// 프로젝트가 0개일 때 `GET /api/holes` 의 재료로 **시작점을 대신 세워 준다.**
//
// 🔴 구멍/미연결의 실제 렌더는 `ResearchStarters` 한 벌뿐이다(task-029 B-2).
//    프로젝트가 있을 때의 상시 노출 패널도 같은 컴포넌트를 쓴다 — 여기에 다시 그리지 마라.
//    미연결을 버리면 안 되는 이유·중립 점선 결정 근거는 그 파일 머리말에 그대로 옮겨 두었다.
// ═════════════════════════════════════════════════════════════════════════════

export default function ResearchEmptyState({ holes, err, loading, busy, onStart, onBlank, goCalendar, onRefresh }) {
  // 🔴 loading 이 false 인데 holes 가 아직 null 인 창(요청 시작 직전 한 프레임)이 실제로 있다.
  //    아래에서 holes.threshold 를 읽으므로 여기서 막지 않으면 화면 전체가 흰 화면이 된다
  //    (실행 하네스가 잡은 실제 크래시다 — 코드만 읽었으면 못 봤다).
  if (loading || (!err && !holes)) {
    return <Card><div style={{ fontSize: 13, color: 'var(--text2)' }}>불러오는 중…</div></Card>;
  }

  if (err) {
    return (
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>아직 연구 프로젝트가 없습니다</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.5 }}>
          시작점을 추천하려면 실패 집계가 필요한데 불러오지 못했습니다 — {err}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" size="sm" onClick={onBlank}>빈 프로젝트로 시작</Button>
          {onRefresh && <Button variant="outline" size="sm" onClick={onRefresh}>다시 불러오기</Button>}
        </div>
      </Card>
    );
  }

  const s = holes?.summary || {};

  // 스파링 기록 자체가 0건 — 구멍/미연결을 따질 재료가 없다.
  if (holes?.empty || s.sparSessions === 0) {
    return (
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>아직 스파링 기록이 없습니다</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.5 }}>
          연구는 스파링에서 막힌 자리를 재료로 씁니다. 수업에 스파링 라운드를 한 번 기록하면
          여기에 시작점 후보가 모입니다.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" size="sm" onClick={goCalendar}>기록하러 가기</Button>
          <Button variant="outline" size="sm" onClick={onBlank}>빈 프로젝트로 시작</Button>
          {onRefresh && <Button variant="outline" size="sm" onClick={onRefresh}>새로고침</Button>}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{STARTERS_TITLE}</div>
        {/* 🔴 폴링하지 않는다(개인용 화면 + 스파링 전량 집계). 사용자가 누를 때만 다시 읽는다. */}
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh}>새로고침</Button>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.55 }}>
        연구는 빈 종이에서 시작하지 않습니다. 아래는 스파링에서 실제로 막혔던 자리입니다 —
        하나를 고르면 그 기술을 첫 노드로 둔 프로젝트를 만듭니다.
      </div>

      <ResearchStarters holes={holes} busy={busy} onStart={onStart} />

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <Button variant="outline" size="sm" onClick={onBlank}>목록에 없는 주제로 시작</Button>
      </div>
    </Card>
  );
}
