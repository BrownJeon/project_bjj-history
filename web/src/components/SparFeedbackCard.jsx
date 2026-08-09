import React, { useMemo } from 'react';
import Button from './Button';

function pad(n) { return String(n).padStart(2, '0'); }

export default function SparFeedbackCard({ sessions, classes, onClose }) {
  const stats = useMemo(() => {
    // 오늘 잘 된 기술
    const goodTechs = [...new Set(
      sessions.flatMap(s => s.successTried.filter(t => t.success).map(t => t.name))
    )];

    // 오늘 아쉬웠던 점
    const todayWeaks = [...new Set(sessions.flatMap(s => s.weak || []))];

    // 상대 벨트 카운트
    const beltCounts = {};
    sessions.forEach(s => {
      if (s.level) beltCounts[s.level] = (beltCounts[s.level] || 0) + 1;
    });
    const beltStr = Object.entries(beltCounts).map(([b, c]) => `${b} ×${c}`).join('  ·  ');

    // 누적 약점 빈도 (전체 기록 기반)
    const weakFreq = {};
    classes.forEach(c => {
      (c.spar_days || []).forEach(sd => {
        (sd.sessions || []).forEach(s => {
          (s.weak || []).forEach(w => { if (w) weakFreq[w] = (weakFreq[w] || 0) + 1; });
        });
      });
    });
    // 오늘 기록도 합산
    sessions.forEach(s => {
      (s.weak || []).forEach(w => { if (w) weakFreq[w] = (weakFreq[w] || 0) + 1; });
    });
    const repeatWeaks = Object.entries(weakFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);

    // 이번 주 누적 라운드 (과거 기록 + 오늘)
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

    return { goodTechs, todayWeaks, beltStr, repeatWeaks, weekRounds };
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
          <div style={{ fontSize: 28, marginBottom: 6 }}>⚔️</div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>스파링 기록 완료!</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
            {sessions.length} 라운드
            {stats.beltStr && (
              <span style={{ marginLeft: 8 }}>· {stats.beltStr}</span>
            )}
          </div>
        </div>

        {/* 오늘 잘 된 기술 */}
        {stats.goodTechs.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              오늘 잘 된 기술
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {stats.goodTechs.map(t => (
                <span key={t} style={{
                  padding: '4px 11px', borderRadius: 14,
                  background: 'var(--accent-dim)', color: 'var(--accent)',
                  fontSize: 12, fontWeight: 600,
                }}>✓ {t}</span>
              ))}
            </div>
          </div>
        )}

        {/* 오늘 아쉬웠던 점 */}
        {stats.todayWeaks.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              오늘 아쉬웠던 점
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {stats.todayWeaks.map(w => (
                <span key={w} style={{
                  padding: '4px 11px', borderRadius: 14,
                  background: 'var(--red-dim, #fde8e8)', color: 'var(--red)',
                  fontSize: 12, fontWeight: 600,
                }}>{w}</span>
              ))}
            </div>
          </div>
        )}

        {/* 반복 약점 */}
        {stats.repeatWeaks.length > 0 && (
          <div style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--surface-up)',
            border: '1px solid var(--border)',
            borderRadius: 12,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>
              반복 약점 (누적 기록 기준)
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
              {stats.repeatWeaks.map((w, i) => (
                <span key={w}>
                  <span style={{ color: 'var(--text3)', fontSize: 11, marginRight: 3 }}>{i + 1}.</span>
                  {w}
                  {i < stats.repeatWeaks.length - 1 && <span style={{ color: 'var(--border-med)', margin: '0 8px' }}>·</span>}
                </span>
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
