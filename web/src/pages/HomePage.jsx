import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';
import Card from '../components/Card';
import Tag from '../components/Tag';
import Icon from '../components/Icon';
import Button from '../components/Button';
import ClassEditor from './ClassEditPage';
import SparEditor from './SparEditPage';
import * as classesApi from '../api/classes';
import * as coachApi from '../api/coach';

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function d10(v) { return (v || '').toString().slice(0, 10); }

// 수업 종류 3택은 여기 하드코딩하지 않는다 — 목록의 정본은 backend/src/utils/sessionTypes.js 하나뿐이고
// useCache().sessionTypes 로 받아 온다. 프론트가 따로 적어 두면 목록이 늘어나는 순간 voice.js 의
// "프리셋이면 음성분석 테마로 덮어써도 된다" 판정과 조용히 어긋난다 (task-021 Reviewer 판정 1).
// 값은 그대로 classes.theme 에 저장된다(스키마 변경 없음). theme 는 자유 텍스트라 형식을 강제하지 않는다.

export default function HomePage() {
  const navigate = useNavigate();
  const { classes, techniques, sessionTypes, reloadClasses } = useCache();
  const { showToast, setLoading } = useUI();
  const [editingClass, setEditingClass] = useState(null);

  // 오늘 기록 카드 상태
  const [sessionType, setSessionType] = useState('');
  const [creating, setCreating]       = useState(false);
  const [sparTarget, setSparTarget]   = useState(null);   // { classId, sparDay }
  const creatingRef  = useRef(false);   // 연타 차단 — 같은 tick 내 재진입도 막기 위해 state 가 아닌 ref
  const createdIdRef = useRef(null);    // 이 화면에서 만든 수업 id — 응답 유실 후 재시도 시 재사용

  // 어드바이스 데이터 — 최신 리포트·플랜 1개씩
  const [latestReport, setLatestReport] = useState(null);
  const [latestPlan,   setLatestPlan]   = useState(null);

  useEffect(() => {
    coachApi.listReports('report', 1).then(r => setLatestReport(r[0] || null)).catch(() => {});
    coachApi.listReports('plan',   1).then(r => setLatestPlan(r[0]   || null)).catch(() => {});
  }, []);

  // 목록이 도착하면 첫 항목을 기본 선택. 서버가 목록을 못 주는 상황(= 사실상 수업 생성도 실패하는 상황)에도
  // 버튼은 그대로 동작하고 theme 만 빈 값이 된다 — 빈 theme 는 음성분석이 나중에 채워 준다.
  useEffect(() => {
    if (!sessionType && sessionTypes.length) setSessionType(sessionTypes[0]);
  }, [sessionTypes, sessionType]);

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

  // ── 오늘 기록 판정 ────────────────────────────────────────────────
  // 1순위 trained_dates: 실사용 수업 32건 중 28건이 date~date_end 로 한 주를 덮는 블록이라
  //   classes.date 는 "훈련한 날"이 아니라 주 시작일이다. 주간 스트립도 trained_dates 를 본다.
  // 2순위 date: trained_dates 가 빈 수업이 4건 있어(구형 단일일 기록) 이것까지 합집합으로 봐야
  //   같은 날 수업이 이미 있는데 또 만드는 일이 없다.
  const todayClass = useMemo(() => (
    classes.find(c => (c.trained_dates || []).some(d => d10(d) === todayStr)) ||
    classes.find(c => d10(c.date) === todayStr) ||
    null
  ), [classes, todayStr]);

  // 오늘 날짜의 스파링 일자가 이미 있으면 새로 만들지 않고 그 기록을 이어 쓴다
  const todaySparDay = useMemo(() => (
    (todayClass?.spar_days || []).find(sd => d10(sd.date) === todayStr) || null
  ), [todayClass, todayStr]);

  const todayRounds = (todaySparDay?.sessions || []).length;

  // 중복 생성 방어의 핵심 — 이미 오늘 수업이 있으면 절대 새로 만들지 않는다
  async function ensureTodayClass() {
    if (todayClass) return todayClass.id;
    if (createdIdRef.current) return createdIdRef.current;
    const res = await classesApi.createClass({
      date: todayStr,
      dateEnd: null,
      theme: sessionType,
      note: '',
      feedback: '',
      trainedDates: [todayStr],   // 비우면 주간 스트립·연속일수에 오늘이 안 뜬다
      clipIds: [],
      drill: null,
    });
    const id = res?.id ?? res;
    createdIdRef.current = id;
    return id;
  }

  async function startToday(withSpar) {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setLoading(true);   // .loader 는 inset:0 / z-index:9999 전면 오버레이 — 생성 중 클릭 자체를 막는다
    try {
      const id = await ensureTodayClass();
      await reloadClasses();
      // todayClass 가 이미 있는 경로로 들어와도 그날 스파링을 두 벌 만들지 않는다
      if (withSpar) setSparTarget({ classId: id, sparDay: todayClass ? todaySparDay : null });
      else showToast(`${sessionType || '훈련'} 기록 추가됨`);
    } catch (e) {
      showToast('저장 실패: ' + e.message);
      // 서버에는 만들어졌는데 응답만 실패했을 수 있다 — 캐시를 실제 상태와 맞춰
      // 재시도 시 todayClass 가드에 걸리도록 한다
      await reloadClasses().catch(() => {});
    } finally {
      creatingRef.current = false;
      setCreating(false);
      setLoading(false);
    }
  }

  function openTodaySpar() {
    if (!todayClass) return;
    setSparTarget({ classId: todayClass.id, sparDay: todaySparDay });
  }

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

      {/* 오늘 기록 카드 — 홈에서 3탭 이내로 스파링 저장까지 가는 진입점 (task-021).
          캘린더의 기존 진입 경로는 그대로 남아 있다 */}
      <Card style={{ borderRadius: 16, marginBottom: 12 }}>
        {todayClass ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 9,
                background: 'var(--accent-dim)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name="check" size={15} color="var(--accent)" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>오늘 훈련 기록됨</div>
                <div style={{
                  fontSize: 11, color: 'var(--text2)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {todayClass.theme || '테마 없음'}
                  {todaySparDay ? ` · 스파링 ${todayRounds}라운드` : ''}
                </div>
              </div>
              <span
                onClick={() => setEditingClass(todayClass)}
                style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
              >
                수업 수정
              </span>
            </div>
            <Button full size="sm" variant="primary" onClick={openTodaySpar}>
              {todaySparDay ? '스파링 이어쓰기' : '스파링 추가'}
            </Button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>오늘 훈련했나요?</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 10 }}>
              종류를 고르고 바로 기록하세요
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {sessionTypes.map(t => {
                const on = sessionType === t;
                return (
                  <button
                    key={t}
                    onClick={() => setSessionType(t)}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 20,
                      background: on ? 'var(--accent-dim)' : 'var(--surface-up)',
                      color: on ? 'var(--accent)' : 'var(--text3)',
                      border: on ? '1px solid var(--accent)' : '1px solid var(--border-med)',
                      fontSize: 12, fontWeight: on ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >{t}</button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button full size="sm" variant="outline" disabled={creating} onClick={() => startToday(false)}>
                수업만
              </Button>
              <Button full size="sm" variant="primary" disabled={creating} onClick={() => startToday(true)}>
                스파링까지
              </Button>
            </div>
          </>
        )}
      </Card>

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

      {sparTarget && (
        <SparEditor
          classId={sparTarget.classId}
          sparDay={sparTarget.sparDay}
          initialRounds={1}   /* 홈 진입은 "지금 스파링했다"가 전제 — 라운드 추가 1탭을 없앤다 */
          onClose={() => setSparTarget(null)}
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
