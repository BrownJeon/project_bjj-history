import React from 'react';
import Tag from './Tag';
import Icon from './Icon';
import Button from './Button';

// ═════════════════════════════════════════════════════════════════════════════
// 시작점 재료 — 구멍(추천) + 미연결. **화면 두 곳이 같은 코드를 쓴다.**
//
// task-029 B-2 로 이 재료가 두 자리에 나온다:
//   ① 빈 상태(`ResearchEmptyState`) — 프로젝트가 0개일 때 시작점을 대신 세워 준다.
//   ② 목록 화면(`ResearchPage`)     — 프로젝트가 있어도 **접힌 채로** 상시 노출한다.
// 🔴 복붙으로 두 벌을 만들지 않는다. 두 벌이 되면 다음 문구 수정 때 한쪽만 바뀐다
//    (task-020b 재오염과 같은 실패 방식). 재료 렌더는 여기 **한 벌**뿐이다.
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

/** 사용자 노출 제목. 🔴 두 화면이 같은 말을 쓰도록 문자열 정본을 여기 하나만 둔다(task-029 B-1). */
export const STARTERS_TITLE = '추천 기술연구 목록';
export const UNLINKED_TITLE = '미연결 기술 목록';

/** 구멍/미연결 한 줄. onStart 로 그 기술을 시드로 하는 프로젝트를 만든다. */
export function StarterRow({ h, unlinked, onStart, busy }) {
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

/**
 * 구멍 + 미연결 목록 본문. 제목/틀은 부르는 쪽이 그린다.
 * 🔴 `holes` 가 null 이면 아무것도 그리지 않는다 — 아래에서 `holes.threshold` 를 읽기 때문에
 *    여기서 막지 않으면 부르는 쪽이 한 프레임이라도 null 을 넘기는 순간 흰 화면이 된다
 *    (ResearchEmptyState 의 `:61` 가드와 같은 이유의 크래시다).
 */
export default function ResearchStarters({ holes, busy, onStart }) {
  if (!holes) return null;

  const list = holes.holes || [];
  const unlinked = holes.unlinked || [];

  return (
    <>
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
              {UNLINKED_TITLE} {unlinked.length}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, lineHeight: 1.55 }}>
            실패 횟수가 적어서 빠진 것이 아니라 <b style={{ color: 'var(--text)' }}>이름이 연결되지 않아서</b> 위 목록에
            합쳐지지 않은 이름들입니다. 여기서 시작하면 자유 라벨 노드로 만들어지고, 숙련도는 열리지 않습니다.
          </div>
          {unlinked.map(h => (
            <StarterRow key={`u-${h.normName}`} h={h} unlinked onStart={onStart} busy={busy} />
          ))}
        </div>
      )}
    </>
  );
}
