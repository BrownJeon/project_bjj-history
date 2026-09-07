import React, { useEffect, useState, useCallback } from 'react';
import { getMastery, patchMastery } from '../api/lab';
import Icon from './Icon';

// ─────────────────────────────────────────────────────────────────────────────
// 사다리 카드 — GET/PATCH /api/mastery/:techId (task-024·025)
//
// 🔴 이 컴포넌트가 조용히 거짓말할 수 있는 지점이 딱 하나 있다: **연속 막대**.
//    `reached` 는 "done 인 단계 중 최댓값"이지 "연속으로 채운 마지막 칸"이 아니다.
//    실제 데이터에 tid=4 `니슬라이드` 가 있다 — 1단계 ✗(드릴로 배운 적 없음)인데
//    4·5단계 ✓(스파링 성공 8회, 그중 6회가 상위 벨트)다.
//    reached 까지를 통째로 칠하는 진행 막대로 그리면 1단계가 채워진 것처럼 보인다.
//    → 각 칸은 **자기 status 로만** 칠한다. 아래 Rung 은 형제 칸의 상태를 보지 않는다.
//
// 🔴 status 는 done / not_yet / no_record 3값이다. "아직 못 했다"와 "잴 기록이 없다"는
//    다른 말이라 다르게 그린다(실선+✗ vs 점선+—).
//    2·3단계는 사용자가 직접 체크하는 칸이라 서버가 status 를 주지 않는다(done 만 준다) —
//    체크 안 함은 "기록 없음"이 아니라 "아직"이므로 not_yet 으로 읽는다.
// ─────────────────────────────────────────────────────────────────────────────

const TONE = {
  done:      { color: 'var(--accent-lt)', bg: 'var(--accent-dim)', border: '1px solid var(--accent)',    glyph: '✓', word: '완료' },
  not_yet:   { color: 'var(--text2)',     bg: 'var(--surface-up)', border: '1px solid var(--border)',    glyph: '✗', word: '미완료' },
  no_record: { color: 'var(--text3)',     bg: 'transparent',       border: '1px dashed var(--border-med)', glyph: '—', word: '기록 없음' },
};

/** 서버가 status 를 주는 칸(1·4·5)은 그대로, 수동 칸(2·3)은 done 으로 읽는다. */
function statusOf(s) {
  if (s.status) return s.status;
  return s.done ? 'done' : 'not_yet';
}

/** 'YYYY-MM-DD' 는 문자열 그대로 다룬다 — Date 왕복 금지(KST +9 로 하루 밀림). */
function fmtDay(v) {
  if (!v) return '';
  const s = String(v);
  if (s.includes('T')) return fmtStamp(s);        // 타임스탬프가 섞여 들어오면 로컬 기준으로
  return s.slice(0, 10).replace(/-/g, '.');
}

/** 전체 타임스탬프는 로컬(KST) 게터로 읽는다. toISOString() 은 쓰지 않는다. */
function fmtStamp(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/** 각 칸의 근거 한 줄. 표본 0건은 `0/0` 이 아니라 위 word("기록 없음")가 대신한다. */
function evidenceLine(s, status) {
  if (status === 'no_record') return null;
  const e = s.evidence || {};
  if (s.step === 1) return e.drillHits ? `드릴 ${e.drillHits}회${e.lastAt ? ` · 마지막 ${fmtDay(e.lastAt)}` : ''}` : '드릴 기록 0회';
  if (s.step === 4) return e.successItems ? `스파링 성공 ${e.successItems}회${e.lastAt ? ` · 마지막 ${fmtDay(e.lastAt)}` : ''}` : '스파링 성공 0회';
  if (s.step === 5) return e.count ? `상위 벨트 상대 성공 ${e.count}회` : '상위 벨트 상대 성공 0회';
  if (s.step === 2 || s.step === 3) return s.checkedAt ? `체크 ${fmtStamp(s.checkedAt)}` : '탭해서 체크';
  return null;
}

function Rung({ s, onToggle, busy }) {
  const status = statusOf(s);
  const t = TONE[status] || TONE.not_yet;
  const manual = s.auto === false;

  return (
    <div
      onClick={manual && !busy ? onToggle : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 11px',
        marginBottom: 6,
        borderRadius: 10,
        background: t.bg,
        border: t.border,
        cursor: manual && !busy ? 'pointer' : 'default',
        opacity: busy ? 0.55 : 1,
      }}
    >
      <span style={{
        width: 22, height: 22, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6, fontSize: 12, fontWeight: 800,
        color: t.color, background: 'var(--surface)',
      }}>{t.glyph}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: status === 'done' ? 'var(--text)' : 'var(--text2)' }}>
          {s.step}. {s.label}
          {manual && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: 'var(--text3)' }}>탭</span>
          )}
        </div>
        {evidenceLine(s, status) && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{evidenceLine(s, status)}</div>
        )}
      </div>

      <span style={{ fontSize: 11, fontWeight: 700, color: t.color, flexShrink: 0 }}>{t.word}</span>
    </div>
  );
}

export default function RecallLadder({ techId, name, onClose }) {
  const [m, setM] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setM(null); setErr('');
    getMastery(techId)
      .then(d => { if (alive) setM(d); })
      .catch(e => { if (alive) setErr(e.message || '숙련도를 불러오지 못했습니다'); });
    return () => { alive = false; };
  }, [techId]);

  // 🔴 PATCH 응답이 GET 과 같은 형태다 — 갱신 후 GET 을 다시 부르지 않는다.
  const toggle = useCallback(async (field, next) => {
    setBusy(true);
    try {
      setM(await patchMastery(techId, { [field]: next }));
      setErr('');
    } catch (e) {
      setErr(e.message || '저장하지 못했습니다');
    } finally {
      setBusy(false);
    }
  }, [techId]);

  if (err && !m) return <div style={{ fontSize: 13, color: 'var(--red)' }}>{err}</div>;
  if (!m) return <div style={{ fontSize: 13, color: 'var(--text2)' }}>불러오는 중…</div>;

  const doneSteps = (m.steps || []).filter(s => s.done).map(s => s.step);
  const gap = doneSteps.length > 0 && doneSteps.length !== Math.max(...doneSteps);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 800 }}>{m.name || name}</span>
        <span style={{ fontSize: 12, color: 'var(--accent-lt)', fontWeight: 700 }}>
          최고 {m.reached}단계
        </span>
      </div>
      {/* 🔴 "최고"라고 쓴 이유를 화면에도 남긴다 — reached 를 진행률로 읽으면 오해가 생긴다. */}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
        칸마다 따로 판정합니다. 아래를 다 채운 상태가 아니어도 위 칸이 켜질 수 있습니다.
        {gap && ' — 실제로 지금 건너뛴 칸이 있습니다.'}
      </div>

      {(m.steps || []).map(s => (
        <Rung
          key={s.step}
          s={s}
          busy={busy}
          onToggle={() => toggle(s.key, !s.done)}
        />
      ))}

      {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{err}</div>}

      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
        스파링 {m.sample?.sparSessions ?? 0}세션 · 성공 {m.sample?.successItems ?? 0} · 실패 {m.sample?.failItems ?? 0} · 드릴 {m.sample?.drillHits ?? 0}
        {(m.matchedNames || []).length > 0 && (
          <> · 매칭된 이름 {m.matchedNames.join(', ')}</>
        )}
      </div>

      {/* 새 벨트 표기가 유입되면 5단계 판정에서 조용히 빠진다 — 화면에 드러낸다. */}
      {(m.unknownBelts || []).length > 0 && (
        <div style={{
          marginTop: 10, padding: 9, borderRadius: 8,
          background: 'var(--amber-dim)', fontSize: 11, color: 'var(--amber)', lineHeight: 1.5,
        }}>
          <Icon name="target" size={12} color="var(--amber)" />{' '}
          <b>모르는 벨트 표기 {m.unknownBelts.length}종</b> — 5단계(상위 벨트) 판정에서 제외됐습니다:{' '}
          {m.unknownBelts.map(u => `${u.value}(${u.source} ${u.count}회)`).join(', ')}
        </div>
      )}

      {onClose && (
        <div style={{ marginTop: 14, textAlign: 'right' }}>
          <span onClick={onClose} style={{ fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>닫기</span>
        </div>
      )}
    </div>
  );
}
