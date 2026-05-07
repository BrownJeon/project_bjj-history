import React, { useState } from 'react';
import * as classesApi from '../api/classes';
import * as enhanceApi from '../api/enhanceMemo';
import { useUI } from '../contexts/UIContext';

const EMPTY_SESSION = {
  level: '', opponent: '', tapGot: 0, tapGave: 0, time: '',
  positions: [], success: [], weak: [], note: '', positionScore: 0,
};

export default function SparEditor({ classId, sparDay, onClose, onSaved }) {
  const { showToast, setLoading } = useUI();
  const isEdit = !!sparDay?.id;

  const [date, setDate] = useState(sparDay?.date?.toString().slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [dayNote, setDayNote] = useState(sparDay?.day_note || '');
  const [sessions, setSessions] = useState(
    (sparDay?.sessions || []).map(s => ({
      level: s.level || '',
      opponent: s.opponent || '',
      tapGot: s.tap_got || 0,
      tapGave: s.tap_gave || 0,
      time: s.time_min || '',
      successText: (s.success || []).map(a => `${a.success === false ? '✗' : '✓'} ${a.name}`).join(', '),
      weakText: (s.weak || []).join(', '),
      note: s.note || '',
      positionScore: s.position_score || 0,
    })) || []
  );
  const [aiBusy, setAiBusy] = useState(false);

  function addSession() {
    setSessions([...sessions, { ...EMPTY_SESSION, successText: '', weakText: '' }]);
  }
  function removeSession(i) { setSessions(sessions.filter((_, idx) => idx !== i)); }
  function updateSession(i, key, val) {
    setSessions(sessions.map((s, idx) => idx === i ? { ...s, [key]: val } : s));
  }

  function buildPayload() {
    return {
      date,
      dayNote,
      sessions: sessions.map(s => ({
        level: s.level,
        opponent: s.opponent,
        tapGot: parseInt(s.tapGot) || 0,
        tapGave: parseInt(s.tapGave) || 0,
        time: parseInt(s.time) || 0,
        positionScore: parseInt(s.positionScore) || 0,
        success: s.successText.split(',').map(t => t.trim()).filter(Boolean).map(t => {
          const ok = !t.startsWith('✗');
          return { name: t.replace(/^[✓✗]\s*/, ''), success: ok };
        }),
        weak: s.weakText.split(',').map(t => t.trim()).filter(Boolean),
        positions: [],
        note: s.note,
      })),
    };
  }

  async function aiEnhance() {
    if (!sessions.length) { alert('세션이 비어있습니다'); return; }
    const text = sessions.map((s, i) => {
      const parts = [];
      parts.push(`세션${i + 1}`);
      if (s.level) parts.push(`${s.level}벨트`);
      if (s.opponent) parts.push(s.opponent);
      parts.push(`탭 ${s.tapGot}:${s.tapGave}`);
      if (s.time) parts.push(`${s.time}분`);
      let line = `[${parts.join(' · ')}]`;
      if (s.successText) line += `\n  시도: ${s.successText}`;
      if (s.weakText) line += `\n  약점: ${s.weakText}`;
      if (s.note) line += `\n  메모: ${s.note}`;
      return line;
    }).join('\n\n');
    setAiBusy(true);
    try {
      const res = await enhanceApi.enhanceMemo({ text, type: 'spar' });
      setDayNote((dayNote ? dayNote + '\n\n' : '') + (res.enhanced || ''));
      showToast('AI 코칭 분석 완료');
    } catch (e) { showToast('AI 분석 실패: ' + e.message); }
    finally { setAiBusy(false); }
  }

  async function save() {
    if (!date) { alert('날짜를 입력해주세요'); return; }
    setLoading(true);
    try {
      const payload = buildPayload();
      if (isEdit) await classesApi.updateSpar(classId, sparDay.id, payload);
      else await classesApi.createSpar(classId, payload);
      showToast('저장되었습니다');
      onSaved && onSaved();
      onClose();
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  async function remove() {
    if (!isEdit || !confirm('스파링 일자를 삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      await classesApi.deleteSpar(classId, sparDay.id);
      showToast('삭제되었습니다');
      onSaved && onSaved();
      onClose();
    } catch (e) { showToast('삭제 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div className="modal-title">{isEdit ? '스파링 수정' : '스파링 추가'}</div>
        <div className="field"><label>날짜 *</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontWeight: 600 }}>세션 ({sessions.length})</label>
            <button className="btn-sm" onClick={addSession}>+ 세션 추가</button>
          </div>
          {sessions.map((s, i) => (
            <div key={i} style={{ padding: 10, background: 'var(--bg2)', borderRadius: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <strong>세션 {i + 1}</strong>
                <button className="btn-sm" onClick={() => removeSession(i)}>×</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                <div className="field" style={{ marginBottom: 6 }}><label>벨트</label>
                  <input value={s.level} onChange={e => updateSession(i, 'level', e.target.value)}
                    placeholder="예: 블루" /></div>
                <div className="field" style={{ marginBottom: 6 }}><label>상대</label>
                  <input value={s.opponent} onChange={e => updateSession(i, 'opponent', e.target.value)} /></div>
                <div className="field" style={{ marginBottom: 6 }}><label>탭 받음</label>
                  <input type="number" value={s.tapGot} onChange={e => updateSession(i, 'tapGot', e.target.value)} /></div>
                <div className="field" style={{ marginBottom: 6 }}><label>탭 줌</label>
                  <input type="number" value={s.tapGave} onChange={e => updateSession(i, 'tapGave', e.target.value)} /></div>
                <div className="field" style={{ marginBottom: 6 }}><label>시간(분)</label>
                  <input type="number" value={s.time} onChange={e => updateSession(i, 'time', e.target.value)} /></div>
                <div className="field" style={{ marginBottom: 6 }}><label>포지션 점수</label>
                  <input type="number" value={s.positionScore} onChange={e => updateSession(i, 'positionScore', e.target.value)} /></div>
              </div>
              <div className="field" style={{ marginBottom: 6 }}><label>시도 기술 (✓/✗ 콤마 구분)</label>
                <input value={s.successText} onChange={e => updateSession(i, 'successText', e.target.value)}
                  placeholder="예: ✓ 트라이앵글, ✗ 암바" /></div>
              <div className="field" style={{ marginBottom: 6 }}><label>약점/부족했던 부분</label>
                <input value={s.weakText} onChange={e => updateSession(i, 'weakText', e.target.value)}
                  placeholder="예: 패스 디펜스, 그립 파이팅" /></div>
              <div className="field" style={{ marginBottom: 0 }}><label>세션 메모</label>
                <textarea rows={2} value={s.note} onChange={e => updateSession(i, 'note', e.target.value)} /></div>
            </div>
          ))}
        </div>

        <div className="field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ margin: 0 }}>전체 메모 / AI 코칭 분석</label>
            <button onClick={aiEnhance} disabled={aiBusy || !sessions.length}
              style={{ background: 'var(--blue-bg)', color: 'var(--blue-text)', border: 'none',
                       padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
              {aiBusy ? '분석 중...' : '✨ AI 코칭 분석'}
            </button>
          </div>
          <textarea rows={4} value={dayNote} onChange={e => setDayNote(e.target.value)}
            placeholder="스파링 전체 메모 / AI 분석 결과" />
        </div>

        <div className="modal-actions">
          {isEdit && <button className="btn-outline" onClick={remove}
            style={{ color: 'var(--red)', marginRight: 'auto' }}>삭제</button>}
          <button className="btn-outline" onClick={onClose}>취소</button>
          <button className="btn-primary" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}
