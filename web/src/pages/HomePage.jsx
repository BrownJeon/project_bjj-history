import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCache } from '../contexts/CacheContext';
import Card from '../components/Card';
import Tag from '../components/Tag';
import Icon from '../components/Icon';
import ClassEditor from './ClassEditPage';
import * as coachApi from '../api/coach';

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export default function HomePage() {
  const navigate = useNavigate();
  const { classes, techniques, reloadClasses } = useCache();
  const [editingClass, setEditingClass] = useState(null);

  // 어드바이스 데이터 — 최신 리포트·플랜 1개씩
  const [latestReport, setLatestReport] = useState(null);
  const [latestPlan,   setLatestPlan]   = useState(null);

  useEffect(() => {
    coachApi.listReports('report', 1).then(r => setLatestReport(r[0] || null)).catch(() => {});
    coachApi.listReports('plan',   1).then(r => setLatestPlan(r[0]   || null)).catch(() => {});
  }, []);

  const today = new Date();
  const todayStr = ymd(today);

  const trainedSet = useMemo(() => {
    const s = new Set();
    classes.forEach(c => (c.trained_dates || []).forEach(d => s.add((d || '').toString().slice(0, 10))));
    return s;
  }, [classes]);

  const weekDays = useMemo(() => {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const ds = ymd(d);
      return { d, ds, isToday: ds === todayStr, trained: trainedSet.has(ds) };
    });
  }, [trainedSet, todayStr]);

  const streak = useMemo(() => {
    let n = 0;
    const d = new Date(today);
    while (trainedSet.has(ymd(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }, [trainedSet]);

  const stats = useMemo(() => {
    const monthPrefix = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
    const monthClasses = classes.filter(c => (c.date || '').toString().slice(0, 7) === monthPrefix).length;
    return { month: monthClasses, total: classes.length, tech: techniques.length };
  }, [classes, techniques]);

  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];

  // 어드바이스 데이터 파싱
  const adviceFocuses  = (latestPlan?.content?.focuses || []).slice(0, 2);
  const adviceRec      = latestReport?.content?.recommendations || '';
  const hasAdvice      = adviceFocuses.length > 0 || adviceRec;
  const advicePeriod   = latestPlan
    ? `${latestPlan.period_start} ~ ${latestPlan.period_end}`
    : latestReport
      ? `${latestReport.period_start} ~ ${latestReport.period_end}`
      : '';

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 2 }}>오늘도 매트 위에서</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>훈련 기록</div>
        </div>
        <div
          onClick={() => navigate('/me')}
          style={{
            width: 38, height: 38, borderRadius: 12,
            background: 'var(--accent-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Icon name="users" size={20} color="var(--accent)" />
        </div>
      </div>

      {/* 주간 스트립 */}
      <Card style={{ borderRadius: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>이번 주</span>
          {streak > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 9px', borderRadius: 12,
              background: 'var(--amber-dim)', color: 'var(--amber)',
              fontSize: 11, fontWeight: 600,
            }}>
              <Icon name="fire" size={12} color="var(--amber)" filled /> 연속 {streak}일
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {weekDays.map((w, i) => {
            let bg = 'transparent', color = 'var(--text2)', border = '1px solid var(--border)';
            if (w.isToday) { bg = 'var(--accent)'; color = '#fff'; border = 'none'; }
            else if (w.trained) { bg = 'var(--accent-dim)'; color = 'var(--accent)'; border = 'none'; }
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>{dayLabels[i]}</span>
                <div style={{
                  width: 30, height: 30, borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: bg, color, border,
                  fontSize: 12, fontWeight: 600,
                }}>
                  {w.d.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 3열 통계 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <StatCard icon="calendar" iconColor="var(--accent)" iconBg="var(--accent-dim)" value={stats.month} label="이번 달" />
        <StatCard icon="trophy"   iconColor="var(--blue)"   iconBg="var(--blue-dim)"   value={stats.total} label="총 수업" />
        <StatCard icon="book"     iconColor="var(--purple)" iconBg="var(--purple-dim)" value={stats.tech}  label="기술 수" />
      </div>

      {/* 주간 어드바이스 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 7,
              background: 'var(--purple-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="brain" size={14} color="var(--purple)" />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700 }}>이번 주 어드바이스</span>
          </div>
          <span
            onClick={() => navigate('/coach')}
            style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer', fontWeight: 500 }}
          >
            분석 메뉴 →
          </span>
        </div>

        {!hasAdvice ? (
          /* 빈 상태 */
          <Card style={{ padding: 20, textAlign: 'center' }}>
            <div style={{ marginBottom: 6 }}>
              <Icon name="brain" size={28} color="var(--text3)" />
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
              아직 분석 리포트가 없습니다.<br />분석 메뉴에서 리포트나 플랜을 생성하면<br />여기서 바로 확인할 수 있어요.
            </div>
            <button
              onClick={() => navigate('/coach')}
              style={{
                padding: '8px 16px', border: 'none',
                borderRadius: 10, background: 'var(--accent)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              분석 시작하기
            </button>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {/* 날짜 기준 배너 */}
            {advicePeriod && (
              <div style={{
                padding: '8px 14px',
                background: 'var(--purple-dim)',
                borderBottom: '1px solid var(--border)',
                fontSize: 11, color: 'var(--purple)', fontWeight: 600,
              }}>
                📅 분석 기간: {advicePeriod}
              </div>
            )}

            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* 플랜 포커스 항목들 */}
              {adviceFocuses.map((f, i) => (
                <div key={i} style={{
                  padding: 12,
                  background: 'var(--surface-up)',
                  borderRadius: 10,
                  borderLeft: '3px solid var(--accent)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: f.why || f.drillSuggestion ? 6 : 0 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 6,
                      background: 'var(--accent)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 11, flexShrink: 0,
                    }}>{i + 1}</div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{f.title}</span>
                  </div>
                  {(f.why || f.drillSuggestion) && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, paddingLeft: 28 }}>
                      {truncate(f.why || f.drillSuggestion, 80)}
                    </div>
                  )}
                  {(f.techniqueNames || []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, paddingLeft: 28 }}>
                      {f.techniqueNames.slice(0, 3).map((n, j) => (
                        <span key={j} style={{
                          padding: '2px 7px', borderRadius: 8,
                          background: 'var(--accent-dim)', color: 'var(--accent)',
                          fontSize: 10, fontWeight: 600,
                        }}>⊙ {n}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* 리포트 권장 사항 */}
              {adviceRec && (
                <div style={{
                  padding: 12,
                  background: 'var(--surface-up)',
                  borderRadius: 10,
                  borderLeft: '3px solid var(--amber)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', marginBottom: 6 }}>
                    권장 사항
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {adviceRec.replace(/\\n/g, '\n')}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {editingClass && (
        <ClassEditor
          initial={editingClass === 'new' ? null : editingClass}
          onClose={() => setEditingClass(null)}
          onSaved={reloadClasses}
        />
      )}
    </div>
  );
}

function truncate(text, max) {
  if (!text) return '';
  const t = text.replace(/\\n/g, '\n');
  return t.length <= max ? t : t.slice(0, max) + '…';
}

function StatCard({ icon, iconColor, iconBg, value, label }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: 12,
      textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon} size={16} color={iconColor} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text2)' }}>{label}</div>
    </div>
  );
}
