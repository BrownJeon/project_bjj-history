import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as classesApi from '../api/classes';
import * as enhanceApi from '../api/enhanceMemo';
import * as voiceApi from '../api/voice';
import { useUI } from '../contexts/UIContext';
import { useCache } from '../contexts/CacheContext';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Icon from '../components/Icon';
import TagPicker from '../components/TagPicker';
import {
  BASE_POSITIONS, BASE_TECHNIQUES, mergeUnique,
} from '../utils/baseOptions';
import { uniqueDrillPositions } from '../utils/suggestions';
import { getClipThumb, getPlatformIcon } from '../utils/videoThumb';

export default function ClassEditor({ initial, onClose, onSaved }) {
  const { showToast, setLoading } = useUI();
  const { techniques, classes, clips } = useCache();
  const isEdit = !!initial?.id;

  const drillPosSuggestions = useMemo(
    () => mergeUnique(BASE_POSITIONS, uniqueDrillPositions(classes)),
    [classes]
  );
  const techSuggestions = useMemo(
    () => mergeUnique(BASE_TECHNIQUES, techniques.map(t => t.name)),
    [techniques]
  );

  const [date, setDate]         = useState(initial?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [dateEnd, setDateEnd]   = useState(initial?.date_end?.slice(0, 10) || '');
  const [theme, setTheme]       = useState(initial?.theme || '');
  const [note, setNote]         = useState(initial?.note || '');
  const [feedback, setFeedback] = useState(initial?.feedback || '');

  const drill0 = initial?.drill || {};
  const [drillPos,   setDrillPos]   = useState(drill0.pos ? [drill0.pos] : []);
  const [drillTech,  setDrillTech]  = useState(
    (drill0.tech || []).map(t => typeof t === 'string' ? t : (t.name || ''))
  );
  const [drillStars, setDrillStars] = useState(drill0.stars || 0);

  const [linkedClipIds, setLinkedClipIds] = useState(initial?.clip_ids || []);
  const [clipSearch, setClipSearch] = useState('');
  const [clipPickerOpen, setClipPickerOpen] = useState(false);

  const [aiBusy, setAiBusy] = useState(null);

  // trained_dates local 관리
  const [trainedDates, setTrainedDates] = useState(() => {
    try { return JSON.parse(initial?.trained_dates || '[]'); }
    catch { return initial?.trained_dates || []; }
  });
  // 날짜별 첨부 음성 파일 { "2026-05-20": File } — 저장 시 백그라운드 업로드
  const [dateVoiceFiles, setDateVoiceFiles] = useState({});

  const fileInputRef     = useRef(null);
  const fileInputDateRef = useRef(null);

  // 날짜 범위 계산 (date ~ dateEnd, 최대 60일)
  const displayDates = useMemo(() => {
    if (!date) return [];
    const start = new Date(date + 'T00:00:00');
    const end   = dateEnd ? new Date(dateEnd + 'T00:00:00') : start;
    const result = [];
    const d = new Date(start);
    while (d <= end && result.length < 60) {
      result.push(
        `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      );
      d.setDate(d.getDate() + 1);
    }
    return result;
  }, [date, dateEnd]);

  function fmtDate(ds) {
    const d = new Date(ds + 'T00:00:00');
    return `${d.getMonth()+1}/${d.getDate()}`;
  }

  function toggleDateCheck(ds) {
    setTrainedDates(prev => {
      if (prev.includes(ds)) {
        setDateVoiceFiles(m => { const n = { ...m }; delete n[ds]; return n; });
        return prev.filter(d => d !== ds);
      }
      return [...prev, ds].sort();
    });
  }

  function handleVoiceBtnClick(ds) {
    fileInputDateRef.current = ds;
    fileInputRef.current?.click();
  }

  function handleVoiceFiles(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const targetDate = fileInputDateRef.current;
    if (!targetDate) return;
    setDateVoiceFiles(prev => ({ ...prev, [targetDate]: file }));
  }

  function removeVoiceFile(ds) {
    setDateVoiceFiles(prev => { const n = { ...prev }; delete n[ds]; return n; });
  }

  // 저장 후 음성 파일 백그라운드 업로드
  // files 파라미터: onClose() 전에 캡처한 스냅샷을 받아 React state에 의존하지 않음
  function startVoiceUploads(savedId, files) {
    const entries = Object.entries(files || {});
    if (!entries.length || !savedId) {
      console.log('[voice] upload skip — entries:', entries.length, 'savedId:', savedId);
      return;
    }
    console.log('[voice] uploading', entries.length, 'files for classId', savedId);
    entries.forEach(([ds, file]) => {
      const form = new FormData();
      form.append('audio', file);
      form.append('classId', String(savedId));
      form.append('trainedDate', ds);
      voiceApi.startAnalyze(form)
        .then(() => console.log('[voice] upload ok', ds))
        .catch(err => console.error('[voice] upload failed', ds, err.message));
    });
  }


  function buildBody() {
    const hasDrill = drillPos.length || drillTech.length || drillStars;
    return {
      date, dateEnd: dateEnd || null, theme, note, feedback,
      trainedDates,
      clipIds: linkedClipIds,
      drill: hasDrill ? {
        pos: drillPos[0] || '', tech: drillTech,
        detail: drill0.detail || [],
        stars: parseInt(drillStars) || 0,
        chainIds: drill0.chain_ids || [], clipIds: [],
      } : null,
    };
  }

  async function aiEnhance(field) {
    const text = field === 'note' ? note : feedback;
    if (!text.trim()) { alert('내용을 먼저 입력해주세요'); return; }
    setAiBusy(field);
    try {
      const t = field === 'feedback' ? 'classFeedback' : 'classNote';
      const res = await enhanceApi.enhanceMemo({ text, type: t });
      if (field === 'note') setNote(res.enhanced || text);
      else setFeedback(res.enhanced || text);
      showToast('AI 보완 완료');
    } catch (e) { showToast('AI 보완 실패: ' + e.message); }
    finally { setAiBusy(null); }
  }

  async function save() {
    if (!date) { alert('날짜를 입력해주세요'); return; }
    setLoading(true);
    let savedId = initial?.id;
    try {
      const body = buildBody();
      if (isEdit) {
        await classesApi.updateClass(initial.id, body);
      } else {
        const res = await classesApi.createClass(body);
        savedId = res?.id || res;
      }
      // onClose() 전에 파일 스냅샷 캡처 (언마운트 후 React state 소멸 방지)
      const voiceSnapshot = { ...dateVoiceFiles };
      const hasVoice = Object.keys(voiceSnapshot).length > 0;
      showToast(hasVoice ? '저장됨 — 음성 분석 백그라운드 시작' : (isEdit ? '수정되었습니다' : '추가되었습니다'));
      onSaved && onSaved();
      onClose();
      startVoiceUploads(savedId, voiceSnapshot);
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  async function remove() {
    if (!isEdit) return;
    if (!confirm('이 수업을 삭제하시겠습니까? (드릴·스파링 모두 삭제됩니다)')) return;
    setLoading(true);
    try {
      await classesApi.deleteClass(initial.id);
      showToast('삭제되었습니다');
      onSaved && onSaved();
      onClose();
    } catch (e) { showToast('삭제 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  return (
    <Modal title={isEdit ? '수업 수정' : '수업 추가'} onClose={onClose}>

      {/* 날짜 입력 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>시작일 *</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>종료일</label>
          <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
        </div>
      </div>

      {/* 수련 날짜별 음성 분석 */}
      <div className="field">
        <label style={{ marginBottom: 8, display: 'block' }}>수련 날짜 · 음성 기록</label>
        <input
          ref={fileInputRef} type="file"
          accept="audio/*,video/mp4,video/quicktime"
          style={{ display: 'none' }}
          onChange={handleVoiceFiles}
        />

        {displayDates.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {displayDates.map(ds => {
              const isTrained  = trainedDates.includes(ds);
              const voiceFile  = dateVoiceFiles[ds];
              return (
                <div key={ds} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', background: 'var(--surface)',
                  border: `1px solid ${voiceFile ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 10,
                }}>
                  <input type="checkbox" checked={isTrained} onChange={() => toggleDateCheck(ds)}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1,
                    color: isTrained ? 'var(--text1)' : 'var(--text3)' }}>
                    {fmtDate(ds)}
                  </span>
                  {voiceFile && (
                    <span style={{ fontSize: 11, color: 'var(--accent)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                      🎙 {voiceFile.name}
                    </span>
                  )}
                  {voiceFile ? (
                    <button onClick={() => removeVoiceFile(ds)} title="파일 제거"
                      style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: 'transparent', border: '1px solid var(--border)',
                        color: 'var(--text3)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                  ) : (
                    <button onClick={() => handleVoiceBtnClick(ds)} disabled={!isTrained}
                      title={isTrained ? `${fmtDate(ds)} 음성 파일 첨부` : '날짜를 먼저 체크하세요'}
                      style={{ padding: '5px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        background: isTrained ? 'var(--accent-dim)' : 'var(--surface-up)',
                        color: isTrained ? 'var(--accent)' : 'var(--text3)',
                        border: `1px solid ${isTrained ? 'var(--accent)' : 'var(--border)'}`,
                        cursor: isTrained ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                      🎙
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>
            시작일을 입력하면 날짜별 수련 체크 및 음성 첨부가 가능합니다.
          </p>
        )}
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '6px 0 0', textAlign: 'center' }}>
          날짜 체크 → 🎙 버튼으로 파일 첨부 → 저장 시 백그라운드 분석 · 결과 자동 저장
        </p>
      </div>

      <div className="field">
        <label>테마</label>
        <input value={theme} onChange={e => setTheme(e.target.value)} placeholder="예: 하프가드 위크" />
      </div>

      <div className="field">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label style={{ margin: 0 }}>전체 메모</label>
          <AiBtn busy={aiBusy === 'note'} onClick={() => aiEnhance('note')} label="AI 보완" />
        </div>
        <textarea rows={4} value={note} onChange={e => setNote(e.target.value)}
          placeholder="수업 메모, 인사이트, 깨달음" />
      </div>

      <div className="field">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label style={{ margin: 0 }}>코치 피드백</label>
          <AiBtn busy={aiBusy === 'feedback'} onClick={() => aiEnhance('feedback')} label="AI 코치 피드백" />
        </div>
        <textarea rows={3} value={feedback} onChange={e => setFeedback(e.target.value)}
          placeholder="원문 피드백 (AI가 자연스러운 코칭 톤으로 보완)" />
      </div>

      <div className="field">
        <label>주요 포지션</label>
        <TagPicker value={drillPos} onChange={setDrillPos}
          suggestions={drillPosSuggestions} singleSelect placeholder="포지션 검색·자유 입력" />
      </div>

      <div className="field">
        <label>주요 기술</label>
        <TagPicker value={drillTech} onChange={setDrillTech}
          suggestions={techSuggestions} placeholder="기술명 검색·자유 입력" />
      </div>

      <div className="field">
        <label>난이도/만족도</label>
        <StarRating value={drillStars} onChange={setDrillStars} />
      </div>

      {/* 관련 영상 연결 */}
      <div className="field">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ margin: 0 }}>관련 영상</label>
          <button onClick={() => setClipPickerOpen(o => !o)} style={{
            border: 'none', background: 'var(--surface-up)', color: 'var(--accent)',
            borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            {clipPickerOpen ? '닫기' : '+ 영상 선택'}
          </button>
        </div>

        {/* 선택된 클립 목록 */}
        {linkedClipIds.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {linkedClipIds.map(id => {
              const clip = clips.find(c => c.id === id);
              if (!clip) return null;
              const thumb = getClipThumb(clip);
              return (
                <div key={id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px',
                  background: 'var(--surface-up)', border: '1px solid var(--border)', borderRadius: 10,
                }}>
                  <div style={{
                    width: 48, height: 32, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                    background: 'var(--surface-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {thumb
                      ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 14 }}>{getPlatformIcon(clip.platform)}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {clip.title}
                    </div>
                    {(clip.tech_names?.[0] || clip.tech_name) && (
                      <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 1 }}>
                        {clip.tech_names?.[0] || clip.tech_name}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setLinkedClipIds(ids => ids.filter(i => i !== id))} style={{
                    border: 'none', background: 'transparent', color: 'var(--text3)',
                    cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0,
                  }}>×</button>
                </div>
              );
            })}
          </div>
        )}

        {/* 영상 검색 + 선택 패널 */}
        {clipPickerOpen && (
          <div style={{
            border: '1px solid var(--border)', borderRadius: 12,
            background: 'var(--surface)', overflow: 'hidden',
          }}>
            {drillTech.length > 0 && (() => {
              const suggested = clips.filter(cl => {
                try {
                  const names = JSON.parse(cl.tech_name || '[]');
                  return Array.isArray(names) && names.some(n => drillTech.includes(n)) && !linkedClipIds.includes(cl.id);
                } catch { return false; }
              });
              if (!suggested.length) return null;
              return (
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--accent-dim)' }}>
                  <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, marginBottom: 6 }}>
                    추천 영상 (드릴 기술 일치)
                  </div>
                  {suggested.map(cl => (
                    <button key={cl.id}
                      onClick={() => setLinkedClipIds(ids => [...ids, cl.id])}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '6px 8px', marginBottom: 4,
                        background: 'var(--surface)', border: '1px solid var(--accent)',
                        borderRadius: 8, fontSize: 12, color: 'var(--text)', cursor: 'pointer',
                      }}>
                      + {cl.title}
                    </button>
                  ))}
                </div>
              );
            })()}
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
              <input
                autoFocus
                value={clipSearch}
                onChange={e => setClipSearch(e.target.value)}
                placeholder="영상 제목·기술명 검색"
                style={{
                  width: '100%', border: 'none', outline: 'none',
                  background: 'transparent', fontSize: 13, color: 'var(--text)',
                }}
              />
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {clips
                .filter(c => {
                  if (linkedClipIds.includes(c.id)) return false;
                  if (!clipSearch.trim()) return true;
                  const q = clipSearch.toLowerCase();
                  return (c.title || '').toLowerCase().includes(q) ||
                         (c.tech_names || []).some(t => t.toLowerCase().includes(q)) ||
                         (c.tech_name || '').toLowerCase().includes(q);
                })
                .slice(0, 20)
                .map(c => {
                  const thumb = getClipThumb(c);
                  return (
                    <button key={c.id} onClick={() => {
                      setLinkedClipIds(ids => [...ids, c.id]);
                      setClipSearch('');
                    }} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', padding: '8px 12px',
                      border: 'none', borderBottom: '1px solid var(--border)',
                      background: 'transparent', cursor: 'pointer', textAlign: 'left',
                    }}>
                      <div style={{
                        width: 52, height: 34, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                        background: 'var(--surface-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {thumb
                          ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 14 }}>{getPlatformIcon(c.platform)}</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.title}
                        </div>
                        {(c.tech_names?.[0] || c.tech_name) && (
                          <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 1 }}>
                            {c.tech_names?.[0] || c.tech_name}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              {clips.filter(c => !linkedClipIds.includes(c.id) && (!clipSearch.trim() || (c.title || '').toLowerCase().includes(clipSearch.toLowerCase()))).length === 0 && (
                <div style={{ padding: '14px', textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>
                  검색 결과 없음
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button variant="primary" size="sm" onClick={save}>저장</Button>
        <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
        {isEdit && (
          <Button variant="danger" size="sm" onClick={remove} style={{ marginLeft: 'auto' }}>삭제</Button>
        )}
      </div>
    </Modal>
  );
}

function AiBtn({ busy, onClick, label }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        background: 'var(--purple-dim)',
        color: 'var(--purple)',
        border: 'none',
        padding: '4px 10px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {busy ? '보완 중…' : `✨ ${label}`}
    </button>
  );
}

function StarRating({ value, onChange }) {
  const v = parseInt(value) || 0;
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          onClick={() => onChange(n === v ? 0 : n)}
          style={{ cursor: 'pointer', display: 'inline-flex' }}
        >
          <Icon name="star" size={22}
            color={n <= v ? 'var(--amber)' : 'var(--text3)'}
            filled={n <= v} />
        </span>
      ))}
    </div>
  );
}
