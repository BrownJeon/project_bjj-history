import React, { useMemo, useState } from 'react';
import Button from './Button';
import * as picksApi from '../api/picks';
import { getClipThumb, getPlatformIcon } from '../utils/videoThumb';

function pad(n) { return String(n).padStart(2, '0'); }

const textareaStyle = {
  width: '100%',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border-med)',
  borderRadius: 8,
  padding: '6px 8px',
  fontSize: 12,
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'inherit',
};

export default function SparFeedbackCard({ sessions, classes, sparDayId, todayPicks = [], onClose }) {
  const stats = useMemo(() => {
    const goodTechs = [...new Set(
      sessions.flatMap(s => s.successTried.filter(t => t.success).map(t => t.name))
    )];

    const todayGrowth = [...new Set(sessions.flatMap(s => s.weak || []))];

    const beltCounts = {};
    sessions.forEach(s => {
      if (s.level) beltCounts[s.level] = (beltCounts[s.level] || 0) + 1;
    });
    const beltStr = Object.entries(beltCounts).map(([b, c]) => `${b} ×${c}`).join('  ·  ');

    // 반복 성장 포인트 (전체 기록 기반 빈도)
    const growthFreq = {};
    classes.forEach(c => {
      (c.spar_days || []).forEach(sd => {
        (sd.sessions || []).forEach(s => {
          (s.weak || []).forEach(w => { if (w) growthFreq[w] = (growthFreq[w] || 0) + 1; });
        });
      });
    });
    sessions.forEach(s => {
      (s.weak || []).forEach(w => { if (w) growthFreq[w] = (growthFreq[w] || 0) + 1; });
    });
    const repeatGrowth = Object.entries(growthFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);

    // 이번 주 누적 라운드
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = `${weekStart.getFullYear()}-${pad(weekStart.getMonth() + 1)}-${pad(weekStart.getDate())}`;
    let weekRounds = sessions.length;
    classes.forEach(c => {
      (c.spar_days || []).forEach(sd => {
        const date = (sd.date || '').toString().slice(0, 10);
        if (date >= weekStartStr) weekRounds += (sd.sessions || []).length;
      });
    });

    return { goodTechs, todayGrowth, beltStr, repeatGrowth, weekRounds };
  }, [sessions, classes]);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 20,
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20, padding: 24,
        maxWidth: 360, width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      }}>
        {/* 헤더 */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>
            이기거나 배우거나 ✊
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            오늘 {sessions.length}라운드
            {stats.beltStr && (
              <span style={{ marginLeft: 8 }}>· {stats.beltStr}</span>
            )}
          </div>
        </div>

        {/* 성공한 기술 */}
        {stats.goodTechs.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#B8860B', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              성공한 기술
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {stats.goodTechs.map(t => (
                <span key={t} style={{
                  padding: '4px 11px', borderRadius: 14,
                  background: '#FEF3E2', color: '#B8860B',
                  fontSize: 12, fontWeight: 600,
                }}>✓ {t}</span>
              ))}
            </div>
          </div>
        )}

        {/* 오늘 성장 포인트 */}
        {stats.todayGrowth.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              오늘 성장 포인트
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {stats.todayGrowth.map(w => (
                <span key={w} style={{
                  padding: '4px 11px', borderRadius: 14,
                  background: 'var(--accent-dim)', color: 'var(--accent)',
                  fontSize: 12, fontWeight: 600,
                }}>{w}</span>
              ))}
            </div>
          </div>
        )}

        {/* 반복 성장 포인트 */}
        {stats.repeatGrowth.length > 0 && (
          <div style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--surface-up)',
            border: '1px solid var(--border)',
            borderRadius: 12,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>
              반복 성장 포인트 (누적 기록 기준)
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
              {stats.repeatGrowth.map((w, i) => (
                <span key={w}>
                  <span style={{ color: 'var(--text3)', fontSize: 11, marginRight: 3 }}>{i + 1}.</span>
                  {w}
                  {i < stats.repeatGrowth.length - 1 && <span style={{ color: 'var(--border-med)', margin: '0 8px' }}>·</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 오늘 픽미업에서 뽑은 기술 — 사용 여부 + 구조화 피드백 */}
        {todayPicks.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              오늘 픽미업에서 뽑은 기술
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {todayPicks.map(pick => (
                <PickFeedbackItem key={pick.id} pick={pick} sparDayId={sparDayId} />
              ))}
            </div>
          </div>
        )}

        {/* 주간 누적 */}
        <div style={{
          borderTop: '1px solid var(--border)',
          paddingTop: 12, marginBottom: 18,
          textAlign: 'center', fontSize: 12, color: 'var(--text2)',
        }}>
          이번 주 누적 <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>{stats.weekRounds}</span> 라운드
        </div>

        <Button variant="primary" size="sm" onClick={onClose} style={{ width: '100%' }}>
          확인
        </Button>
      </div>
    </div>
  );
}

// 픽미업 카드 1건에 대한 사용 여부 + 구조화 피드백 입력 (3-state: 미확인 / 사용함 / 사용 안함)
function PickFeedbackItem({ pick, sparDayId }) {
  const clip = pick.clip || {};
  const [used, setUsed] = useState(pick.used ?? null);
  const [situation, setSituation]     = useState(pick.situation || '');
  const [problem, setProblem]         = useState(pick.problem || '');
  const [improvement, setImprovement] = useState(pick.improvement || '');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [dirty, setDirty]     = useState(false);

  async function persist(next) {
    setSaving(true);
    try {
      await picksApi.updatePickFeedback(pick.id, {
        spar_day_id: sparDayId,
        used: next.used,
        situation: next.situation,
        problem: next.problem,
        improvement: next.improvement,
      });
      setSaved(true);
      setDirty(false);
    } catch (e) {
      console.error('픽 피드백 저장 실패:', e);
      alert('피드백 저장에 실패했습니다: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  }

  function toggleUsed(val) {
    const next = used === val ? null : val; // 같은 값 다시 클릭 → 미확인으로 복귀
    setUsed(next);
    setSaved(false);
    persist({ used: next, situation, problem, improvement });
  }

  function saveText() {
    persist({ used, situation, problem, improvement });
  }

  const thumb = getClipThumb(clip);

  return (
    <div style={{
      padding: 10,
      background: 'var(--surface-up)',
      border: '1px solid var(--border)',
      borderRadius: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 8, flexShrink: 0,
          background: 'var(--surface-hi)', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {thumb
            ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 16 }}>{getPlatformIcon(clip.platform)}</span>}
        </div>
        <div style={{
          flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {clip.title || '(제목 없음)'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button onClick={() => toggleUsed(1)} disabled={saving} style={{
          flex: 1, padding: '6px 0', borderRadius: 8,
          border: used === 1 ? '1px solid var(--accent)' : '1px solid var(--border-med)',
          background: used === 1 ? 'var(--accent-dim)' : 'var(--surface)',
          color: used === 1 ? 'var(--accent)' : 'var(--text2)',
          fontSize: 12, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
        }}>
          ✓ 사용함
        </button>
        <button onClick={() => toggleUsed(0)} disabled={saving} style={{
          flex: 1, padding: '6px 0', borderRadius: 8,
          border: used === 0 ? '1px solid var(--red)' : '1px solid var(--border-med)',
          background: used === 0 ? 'var(--red-dim)' : 'var(--surface)',
          color: used === 0 ? 'var(--red)' : 'var(--text2)',
          fontSize: 12, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
        }}>
          사용 안함
        </button>
      </div>

      {used === 1 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            rows={2}
            value={situation}
            onChange={e => { setSituation(e.target.value); setDirty(true); setSaved(false); }}
            placeholder="어떤 상황에서 사용했나요?"
            style={textareaStyle}
          />
          <textarea
            rows={2}
            value={problem}
            onChange={e => { setProblem(e.target.value); setDirty(true); setSaved(false); }}
            placeholder="어떤 문제가 있었나요?"
            style={textareaStyle}
          />
          <textarea
            rows={2}
            value={improvement}
            onChange={e => { setImprovement(e.target.value); setDirty(true); setSaved(false); }}
            placeholder="다음엔 어떻게 보완할까요?"
            style={textareaStyle}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={saveText} disabled={saving || !dirty} style={{
              padding: '5px 12px', borderRadius: 8, border: 'none',
              background: dirty ? 'var(--accent)' : 'var(--surface)',
              color: dirty ? '#fff' : 'var(--text3)',
              fontSize: 11.5, fontWeight: 700,
              cursor: (saving || !dirty) ? 'not-allowed' : 'pointer',
            }}>
              {saving ? '저장 중…' : '메모 저장'}
            </button>
            {saved && !dirty && (
              <span style={{ fontSize: 11, color: 'var(--accent)' }}>✓ 저장됨</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
