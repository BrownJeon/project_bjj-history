import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';
import * as classesApi from '../api/classes';
import * as voiceApi from '../api/voice';
import ClassEditor from './ClassEditPage';
import SparEditor from './SparEditPage';
import Card from '../components/Card';
import Tag from '../components/Tag';
import Icon from '../components/Icon';
import Button from '../components/Button';
import { getClipThumb, getPlatformIcon, getPlatformLabel } from '../utils/videoThumb';

function pad(n) { return String(n).padStart(2, '0'); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const TYPE_TONE = { gi: 'accent', nogi: 'blue', open: 'purple', comp: 'amber' };
const TYPE_LABEL = { gi: 'Gi', nogi: 'No-Gi', open: '오픈매트', comp: '대회' };

export default function CalendarPage() {
  const { classes, clips, reloadClasses } = useCache();
  const { showToast, setLoading } = useUI();
  const [year, setYear]   = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selected, setSelected] = useState(todayStr());
  const [editingClass, setEditingClass] = useState(null);
  const [editingSpar, setEditingSpar]   = useState(null);
  const [pendingVoice, setPendingVoice] = useState(new Map()); // classId → {transcriptLen}
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('bjj_cal_view') || 'calendar');
  const [listSearch, setListSearch] = useState('');
  const prevPendingRef   = useRef(new Map());
  const pendingCountRef  = useRef(0);
  const pollTimerRef     = useRef(null);
  const checkJobsRef     = useRef(null);

  useEffect(() => { localStorage.setItem('bjj_cal_view', viewMode); }, [viewMode]);

  // 음성 분석 잡 폴링 — pending 있으면 10초, 없으면 30초 간격
  // checkJobsRef.current() 로 외부에서 즉시 재실행 가능
  useEffect(() => {
    async function checkJobs() {
      try {
        const jobs = await voiceApi.listJobs();
        const pendingMap = new Map();
        jobs.filter(j => j.status === 'pending').forEach(j => {
          pendingMap.set(String(j.class_id), { transcriptLen: Number(j.transcript_len) || 0 });
        });
        const justCompleted = [...prevPendingRef.current.keys()].some(id => !pendingMap.has(id));
        if (pendingMap.size > 0 || justCompleted) reloadClasses();
        setPendingVoice(pendingMap);
        prevPendingRef.current = pendingMap;
        pendingCountRef.current = pendingMap.size;
      } catch {}
      pollTimerRef.current = setTimeout(checkJobs, pendingCountRef.current > 0 ? 10000 : 30000);
    }
    checkJobsRef.current = () => { clearTimeout(pollTimerRef.current); checkJobs(); };
    checkJobs();
    return () => clearTimeout(pollTimerRef.current);
  }, []);

  const dataByDate = useMemo(() => {
    const map = new Map();
    classes.forEach(c => {
      const start = (c.date || '').toString().slice(0, 10);
      const end   = (c.date_end || c.date || '').toString().slice(0, 10);
      if (!start) return;
      const sd = new Date(start), ed = new Date(end);
      for (let d = new Date(sd); d <= ed; d.setDate(d.getDate() + 1)) {
        const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        if (!map.has(ds)) map.set(ds, []);
        map.get(ds).push({ ...c, isStart: ds === start, isEnd: ds === end });
      }
    });
    return map;
  }, [classes]);

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result = [];
    for (let i = 0; i < firstDay; i++) result.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${pad(month + 1)}-${pad(d)}`;
      const cls = dataByDate.get(ds);
      const trained = cls && cls.some(c => (c.trained_dates || []).includes(ds));
      result.push({ day: d, ds, hasClass: !!cls, trained });
    }
    return result;
  }, [year, month, dataByDate]);

  // 월 요약
  const monthSummary = useMemo(() => {
    const prefix = `${year}-${pad(month + 1)}`;
    let cls = 0, trained = 0, spar = 0;
    classes.forEach(c => {
      const date = (c.date || '').toString().slice(0, 10);
      if (date.startsWith(prefix)) cls++;
      (c.trained_dates || []).forEach(d => { if ((d || '').toString().slice(0, 10).startsWith(prefix)) trained++; });
      (c.spar_days || []).forEach(sd => {
        const ds = (sd.date || '').toString().slice(0, 10);
        if (ds.startsWith(prefix)) spar += (sd.sessions || []).length;
      });
    });
    return { cls, trained, spar };
  }, [classes, year, month]);

  function changeMonth(delta) {
    const m = month + delta;
    if (m < 0) { setYear(year - 1); setMonth(11); }
    else if (m > 11) { setYear(year + 1); setMonth(0); }
    else setMonth(m);
  }

  async function toggleTrain(c, date) {
    setLoading(true);
    try {
      await classesApi.toggleTrainedDate(c.id, date);
      await reloadClasses();
      showToast('수련 기록 업데이트');
    } catch (e) { showToast('오류: ' + e.message); }
    finally { setLoading(false); }
  }

  const td = todayStr();
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const selectedItems = selected ? (dataByDate.get(selected) || []) : [];

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>캘린더</span>
        <Button size="sm" variant="outline" onClick={() => setEditingClass('new')}>+ 수업 추가</Button>
      </div>

      {/* 뷰 탭 */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 14,
        background: 'var(--surface-up)', borderRadius: 10, padding: 3,
        border: '1px solid var(--border)',
      }}>
        {[['calendar', '📅 캘린더'], ['list', '≡ 목록']].map(([mode, label]) => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{
            flex: 1, padding: '7px 0', borderRadius: 8, border: 'none',
            background: viewMode === mode ? 'var(--accent)' : 'transparent',
            color: viewMode === mode ? '#fff' : 'var(--text2)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            transition: 'background 0.15s, color 0.15s',
          }}>{label}</button>
        ))}
      </div>

      {viewMode === 'calendar' && (<>
      {/* 월 네비 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button
          onClick={() => changeMonth(-1)}
          style={{ background: 'var(--surface-up)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'inline-flex' }}
        >
          <Icon name="chevL" size={16} color="var(--text)" />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{year}년 {month + 1}월</span>
        <button
          onClick={() => changeMonth(+1)}
          style={{ background: 'var(--surface-up)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'inline-flex' }}
        >
          <Icon name="chevR" size={16} color="var(--text)" />
        </button>
      </div>

      {/* 캘린더 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 16 }}>
        {dayLabels.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', padding: 4 }}>{d}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} />;
          const isToday = cell.ds === td;
          const isSelected = cell.ds === selected;
          let bg = 'transparent';
          let color = 'var(--text)';
          let border = '1px solid transparent';
          if (isSelected) { bg = 'var(--accent)'; color = '#fff'; border = 'none'; }
          else if (isToday) { bg = 'var(--accent-dim)'; }
          else if (cell.trained) { bg = 'var(--surface-up)'; }
          if (cell.hasClass && !isSelected) {
            border = '1px solid rgba(29,158,117,0.5)';
          }
          return (
            <button
              key={i}
              onClick={() => setSelected(cell.ds)}
              style={{
                aspectRatio: '1',
                position: 'relative',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: bg, color,
                border, borderRadius: 10,
                padding: 4, cursor: 'pointer',
                fontSize: 13,
                fontWeight: cell.hasClass ? 600 : 500,
              }}
            >
              <div>{cell.day}</div>
              {cell.trained && !isSelected && (
                <div style={{
                  position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
                  width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)',
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* 월 요약 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <SummaryCell label="수업" value={monthSummary.cls} color="var(--accent)" />
        <SummaryCell label="수련일" value={monthSummary.trained} color="var(--blue)" />
        <SummaryCell label="스파링" value={monthSummary.spar} color="var(--red)" />
      </div>

      {/* 선택일 상세 */}
      {selected && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
            {(() => {
              const d = new Date(selected + 'T00:00:00');
              return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dayLabels[d.getDay()]})`;
            })()}
          </div>
          {selectedItems.length === 0 ? (
            <Card style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>
              이 날짜의 기록이 없습니다
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedItems.map(c => {
                const trained = (c.trained_dates || []).includes(selected);
                const sparOnDay = (c.spar_days || []).find(sd => (sd.date || '').toString().slice(0, 10) === selected);
                const tone = TYPE_TONE[c.type] || 'accent';
                const label = TYPE_LABEL[c.type] || 'Gi';
                return (
                  <Card key={c.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      <Tag tone={tone}>{label}</Tag>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{c.theme || '수업'}</span>
                      {pendingVoice.has(String(c.id)) && (
                        <span style={{ fontSize: 14 }}>⏳</span>
                      )}
                      {c.voice_transcript && !pendingVoice.has(String(c.id)) && (
                        <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>🎙</span>
                      )}
                      <button
                        onClick={() => setEditingClass(c)}
                        style={{ background: 'transparent', border: '1px solid var(--border-med)', color: 'var(--text2)', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
                      >
                        수정
                      </button>
                    </div>
                    {pendingVoice.has(String(c.id)) && (() => {
                      const { transcriptLen } = pendingVoice.get(String(c.id));
                      return (
                        <div style={{ marginBottom: 10, padding: '7px 10px',
                                      background: 'var(--surface-up)', border: '1px solid var(--border)',
                                      borderRadius: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between',
                                        alignItems: 'center', marginBottom: 5 }}>
                            <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>음성 분석 중</span>
                            {transcriptLen > 0 && (
                              <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                                전사 {transcriptLen.toLocaleString()}자
                              </span>
                            )}
                          </div>
                          <div className="voice-progress-bar" />
                        </div>
                      );
                    })()}

                    {c.drill && (c.drill.pos || (c.drill.tech || []).length > 0) && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                        {c.drill.pos && <Tag tone="blue">{c.drill.pos}</Tag>}
                        {(c.drill.tech || []).map((t, i) => (
                          <span key={i} style={{
                            padding: '2px 8px', borderRadius: 6,
                            background: 'var(--surface-hi)', color: 'var(--text2)',
                            fontSize: 11, fontWeight: 500,
                          }}>{typeof t === 'string' ? t : t.name}</span>
                        ))}
                      </div>
                    )}

                    {/* 연결된 영상 */}
                    {(c.clip_ids || []).length > 0 && (() => {
                      const linked = (c.clip_ids || [])
                        .map(id => clips.find(cl => cl.id === id))
                        .filter(Boolean);
                      if (!linked.length) return null;
                      return (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6, fontWeight: 600 }}>
                            관련 영상 ({linked.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {linked.map(clip => {
                              const thumb = getClipThumb(clip);
                              return (
                                <a key={clip.id} href={clip.video_file || clip.url} target="_blank" rel="noreferrer"
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none',
                                           padding: '6px 8px', background: 'var(--surface-up)',
                                           border: '1px solid var(--border)', borderRadius: 10 }}>
                                  <div style={{
                                    width: 56, height: 36, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                                    background: 'var(--surface-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}>
                                    {thumb
                                      ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      : <span style={{ fontSize: 16 }}>{getPlatformIcon(clip.platform)}</span>}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)',
                                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {clip.title}
                                    </div>
                                    {(clip.tech_names?.[0] || clip.tech_name) && (
                                      <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 1 }}>
                                        {clip.tech_names?.[0] || clip.tech_name}
                                      </div>
                                    )}
                                  </div>
                                  {clip.video_file && (
                                    <span style={{ fontSize: 10, color: 'var(--accent)', flexShrink: 0 }}>📥</span>
                                  )}
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 기술 관련 영상 (드릴 기술명 자동 매칭) */}
                    {(() => {
                      const techNames = (c.drill?.tech || [])
                        .map(t => typeof t === 'string' ? t : (t.name || '')).filter(Boolean);
                      if (!techNames.length) return null;
                      const manualIds = new Set(c.clip_ids || []);
                      const matched = clips.filter(cl => {
                        try {
                          const names = JSON.parse(cl.tech_name || '[]');
                          return Array.isArray(names) && names.some(n => techNames.includes(n)) && !manualIds.has(cl.id);
                        } catch { return false; }
                      });
                      if (!matched.length) return null;
                      return (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6, fontWeight: 600 }}>
                            기술 관련 영상 ({matched.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {matched.map(clip => {
                              const thumb = getClipThumb(clip);
                              return (
                                <a key={clip.id} href={clip.video_file || clip.url} target="_blank" rel="noreferrer"
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none',
                                           padding: '6px 8px', background: 'var(--surface-up)',
                                           border: '1px solid var(--border)', borderRadius: 10 }}>
                                  <div style={{
                                    width: 56, height: 36, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                                    background: 'var(--surface-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}>
                                    {thumb
                                      ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      : <span style={{ fontSize: 16 }}>{getPlatformIcon(clip.platform)}</span>}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)',
                                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {clip.title}
                                    </div>
                                    {clip.video_file && <span style={{ fontSize: 10, color: 'var(--accent)' }}>📥 오프라인</span>}
                                  </div>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => toggleTrain(c, selected)}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          border: trained ? 'none' : '1px solid var(--border-med)',
                          background: trained ? 'var(--accent)' : 'transparent',
                          color: trained ? '#fff' : 'var(--text)',
                          borderRadius: 10,
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        }}
                      >
                        <Icon name={trained ? 'check' : 'plus'} size={14} color={trained ? '#fff' : 'var(--text)'} />
                        {trained ? '오늘 수련함' : '수련 체크'}
                      </button>
                      <button
                        onClick={() => setEditingSpar({ classId: c.id, sparDay: sparOnDay || { date: selected } })}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          border: '1px solid var(--border-med)',
                          background: sparOnDay ? 'var(--red-dim)' : 'transparent',
                          color: sparOnDay ? 'var(--red)' : 'var(--text)',
                          borderRadius: 10,
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        }}
                      >
                        <Icon name="sparring" size={14} color={sparOnDay ? 'var(--red)' : 'var(--text)'} />
                        {sparOnDay ? `스파링 ${(sparOnDay.sessions || []).length}` : '스파링 추가'}
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      </>)}

      {/* 목록 뷰 */}
      {viewMode === 'list' && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <input
              value={listSearch}
              onChange={e => setListSearch(e.target.value)}
              placeholder="테마·노트 검색"
              style={{
                width: '100%', padding: '8px 12px', border: '1px solid var(--border)',
                borderRadius: 10, background: 'var(--surface-up)', color: 'var(--text)',
                fontSize: 13, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...classes]
              .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
              .filter(c => {
                if (!listSearch.trim()) return true;
                const q = listSearch.toLowerCase();
                return (c.theme || '').toLowerCase().includes(q) ||
                       (c.note || '').toLowerCase().includes(q);
              })
              .map(c => (
                <ClassListCard key={c.id} c={c} clips={clips}
                  onEdit={() => setEditingClass(c)}
                  voiceProgress={pendingVoice.get(String(c.id))} />
              ))}
          </div>
        </div>
      )}

      {editingClass && (
        <ClassEditor
          initial={editingClass === 'new' ? null : editingClass}
          onClose={() => setEditingClass(null)}
          onSaved={() => { reloadClasses(); setTimeout(() => checkJobsRef.current?.(), 1500); }}
        />
      )}
      {editingSpar && (
        <SparEditor
          classId={editingSpar.classId}
          sparDay={editingSpar.sparDay}
          onClose={() => setEditingSpar(null)}
          onSaved={reloadClasses}
        />
      )}
    </div>
  );
}

function ClassListCard({ c, clips, onEdit, voiceProgress }) {
  const tone = TYPE_TONE[c.type] || 'accent';
  const label = TYPE_LABEL[c.type] || 'Gi';
  const techNames = (c.drill?.tech || [])
    .map(t => typeof t === 'string' ? t : (t.name || '')).filter(Boolean);
  const linkedCount = (c.clip_ids || []).length;
  const matchedCount = clips.filter(cl => {
    try {
      const names = JSON.parse(cl.tech_name || '[]');
      return Array.isArray(names) && names.some(n => techNames.includes(n)) && !(c.clip_ids || []).includes(cl.id);
    } catch { return false; }
  }).length;
  const sparCount = (c.spar_days || []).reduce((s, sd) => s + (sd.sessions || []).length, 0);
  const dateStr = (c.date || '').toString().slice(0, 10);
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{dateStr}</span>
            <Tag tone={tone}>{label}</Tag>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.theme || '수업'}</span>
          </div>
          {c.drill && (c.drill.pos || techNames.length > 0) && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
              {c.drill.pos && <Tag tone="blue">{c.drill.pos}</Tag>}
              {techNames.map((t, i) => (
                <span key={i} style={{ padding: '2px 7px', borderRadius: 6,
                  background: 'var(--surface-hi)', color: 'var(--text2)', fontSize: 11 }}>{t}</span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: c.note ? 6 : 0 }}>
            {sparCount > 0 && <span style={{ fontSize: 11, color: 'var(--red)' }}>⚔ 스파링 {sparCount}</span>}
            {(linkedCount + matchedCount) > 0 && (
              <span style={{ fontSize: 11, color: 'var(--accent)' }}>
                🎬 영상 {linkedCount}{matchedCount > 0 ? `+${matchedCount}` : ''}
              </span>
            )}
            {(c.trained_dates || []).length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>✓ 수련 {(c.trained_dates || []).length}회</span>
            )}
          </div>
          {c.note && (
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4,
              overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' }}>
              {c.note}
            </div>
          )}
          {voiceProgress && (
            <div style={{ marginTop: 8, padding: '6px 10px',
                          background: 'var(--surface-up)', border: '1px solid var(--border)',
                          borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>⏳ 음성 분석 중</span>
                {voiceProgress.transcriptLen > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                    전사 {voiceProgress.transcriptLen.toLocaleString()}자
                  </span>
                )}
              </div>
              <div className="voice-progress-bar" />
            </div>
          )}
        </div>
        <button onClick={onEdit} style={{
          background: 'transparent', border: '1px solid var(--border-med)',
          color: 'var(--text2)', borderRadius: 6, padding: '4px 8px',
          fontSize: 11, cursor: 'pointer', flexShrink: 0,
        }}>수정</button>
      </div>
    </Card>
  );
}

function SummaryCell({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 12,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{label}</div>
    </div>
  );
}
