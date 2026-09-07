import React from 'react';
import Card from './Card';
import Tag from './Tag';
import Icon from './Icon';
import Button from './Button';

// ═════════════════════════════════════════════════════════════════════════════
// 빈 상태 — 빈 트리를 마주하지 않게 한다.
//
// 프로젝트가 0개일 때 `GET /api/holes` 의 재료로 **시작점을 대신 세워 준다.**
//
// 🔴 미연결 13종을 여기서 버리면 안 된다.
//    실측 13종은 전부 실패 1건씩이라 구멍 threshold(2)에 걸려 holes 에 들어오지 않는다.
//    task-024 가 `unlinked` 를 threshold 무관 **전량** 반환하도록 설계한 유일한 이유가
//    "매칭이 안 돼서 빠진 것"과 "횟수가 낮아서 빠진 것"을 화면이 구분하게 하려는 것이다.
//    → **중립 점선 + "미연결" 배지**로 별도 소제목 아래 그린다.
//      🔴 이 화면에서 앰버는 "대처 없는 리액션" 전용이다(Leader 결정, task-026) —
//         /recall 은 미연결이 그 화면의 본업이라 앰버를 그대로 쓴다. 화면마다 앰버의 뜻이 다른 게 정상이다.
//      🔴 색을 낮춘 것이지 **존재감을 낮춘 것이 아니다.** 소제목·개수·설명 문장은 그대로 둔다.
//
// 🔴 미연결은 techniqueId 가 null 이다. 시드 노드를 자유 라벨로 만들고, 사다리는 열지 않는다
//    (/api/mastery/null 은 404).
// ═════════════════════════════════════════════════════════════════════════════

/** 구멍/미연결 한 줄. onStart 로 그 기술을 시드로 하는 프로젝트를 만든다. */
function StarterRow({ h, unlinked, onStart, busy }) {
  return (
    <div style={{
      padding: '10px 11px', marginBottom: 6, borderRadius: 10,
      background: unlinked ? 'transparent' : 'var(--surface-up)',
      // 🔴 미연결 = **중립** 점선. 이 화면에서 앰버는 "대처 없는 리액션" 전용이다(Leader 결정, task-026).
      //    한 화면 안에서 앰버가 두 뜻을 가지면 본업 신호가 묻힌다.
      border: unlinked ? '1px dashed var(--border-med)' : '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 13, fontWeight: 700, color: 'var(--text)',
          whiteSpace: 'normal', overflowWrap: 'anywhere',
        }}>{h.name}</span>
        <Tag tone="red">실패 {h.failCount}</Tag>
        {h.successCount > 0 && <Tag tone="accent">성공 {h.successCount}</Tag>}
        {unlinked && <Tag tone="neutral">미연결</Tag>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
        {h.lastFailedAt ? `최근 실패 ${String(h.lastFailedAt).slice(0, 10).replace(/-/g, '.')}` : '최근 실패일 없음'}
        {unlinked && ' · 기술 목록과 이름이 연결되지 않아 자유 라벨로 시작합니다'}
      </div>
      <div style={{ marginTop: 8 }}>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onStart(h)}>
          이 기술로 연구 시작
        </Button>
      </div>
    </div>
  );
}

export default function ResearchEmptyState({ holes, err, loading, busy, onStart, onBlank, goCalendar }) {
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
        <Button variant="primary" size="sm" onClick={onBlank}>빈 프로젝트로 시작</Button>
      </Card>
    );
  }

  const list = holes?.holes || [];
  const unlinked = holes?.unlinked || [];
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
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>어디부터 팔지 정해 드립니다</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.55 }}>
        연구는 빈 종이에서 시작하지 않습니다. 아래는 스파링에서 실제로 막혔던 자리입니다 —
        하나를 고르면 그 기술을 첫 노드로 둔 프로젝트를 만듭니다.
      </div>

      {list.length > 0 ? (
        <>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
            실패 {holes.threshold}회 이상 — {list.length}종
          </div>
          {list.map(h => (
            <StarterRow key={h.normName} h={h} onStart={onStart} busy={busy} />
          ))}
        </>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          실패 {holes.threshold}회 이상 반복된 기술은 없습니다.
        </div>
      )}

      {/* 🔴 미연결은 실패 1건씩이라 위 목록에 들어오지 않는다. 여기서 사라지면
          "매칭이 안 돼서 빠진 것"과 "횟수가 낮아서 빠진 것"을 구분할 수 없다. */}
      {unlinked.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            {/* 🔴 색은 낮추되 **존재감은 줄이지 않는다.** 이 구역이 task-024 가 `unlinked` 를
                threshold 무관 전량 반환하도록 설계한 유일한 이유다.
                존재감은 색이 아니라 **구조**(소제목·개수·설명 문장)로 유지한다.
                `--text2`/`--text3` 로 흐리면 "꺼진 것"으로 읽히므로 `--text` 를 쓴다. */}
            <Icon name="link" size={13} color="var(--text)" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              기술트리에 연결되지 않은 이름 {unlinked.length}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, lineHeight: 1.55 }}>
            실패 횟수가 적어서 빠진 것이 아니라 <b style={{ color: 'var(--text)' }}>이름이 연결되지 않아서</b> 위 목록에
            합쳐지지 않은 이름들입니다. 여기서 시작하면 자유 라벨 노드로 만들어지고, 사다리는 열리지 않습니다.
          </div>
          {unlinked.map(h => (
            <StarterRow key={`u-${h.normName}`} h={h} unlinked onStart={onStart} busy={busy} />
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <Button variant="outline" size="sm" onClick={onBlank}>목록에 없는 주제로 시작</Button>
      </div>
    </Card>
  );
}
