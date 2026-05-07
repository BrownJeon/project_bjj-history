import React, { useState } from 'react';
import * as classesApi from '../api/classes';
import * as enhanceApi from '../api/enhanceMemo';
import { useUI } from '../contexts/UIContext';

// 단일 ClassEditor 모달 — Calendar에서 호출
export default function ClassEditor({ initial, onClose, onSaved }) {
  const { showToast, setLoading } = useUI();
  const isEdit = !!initial?.id;

  const [date, setDate]       = useState(initial?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [dateEnd, setDateEnd] = useState(initial?.date_end?.slice(0, 10) || '');
  const [theme, setTheme]     = useState(initial?.theme || '');
  const [note, setNote]       = useState(initial?.note || '');
  const [feedback, setFeedback] = useState(initial?.feedback || '');

  const [drillEnabled, setDrillEnabled] = useState(!!initial?.drill);
  const drill0 = initial?.drill || {};
  const [drillPos,    setDrillPos]    = useState(drill0.pos || '');
  const [drillTech,   setDrillTech]   = useState((drill0.tech || []).join(', '));
  const [drillDetail, setDrillDetail] = useState((drill0.detail || []).join(', '));
  const [drillStars,  setDrillStars]  = useState(drill0.stars || 0);

  const [aiBusy, setAiBusy] = useState(null); // 'note' | 'feedback' | null

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
    try {
      const body = {
        date,
        dateEnd: dateEnd || null,
        theme, note, feedback,
        trainedDates: initial?.trained_dates || [],
        drill: drillEnabled ? {
          pos: drillPos,
          tech:   drillTech.split(',').map(s => s.trim()).filter(Boolean),
          detail: drillDetail.split(',').map(s => s.trim()).filter(Boolean),
          stars: parseInt(drillStars) || 0,
          chainIds: drill0.chain_ids || [],
          clipIds: [],
        } : null,
      };
      if (isEdit) await classesApi.updateClass(initial.id, body);
      else await classesApi.createClass(body);
      showToast(isEdit ? '수정되었습니다' : '추가되었습니다');
      onSaved && onSaved();
      onClose();
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-title">{isEdit ? '수업 수정' : '수업 추가'}</div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>시작일 *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>종료일 (기간 수업)</label>
            <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
          </div>
        </div>

        <div className="field"><label>테마</label>
          <input value={theme} onChange={e => setTheme(e.target.value)} placeholder="예: 하프가드 위크" /></div>

        <div className="field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ margin: 0 }}>전체 메모</label>
            <button onClick={() => aiEnhance('note')} disabled={aiBusy === 'note'}
              style={{ background: 'var(--blue-bg)', color: 'var(--blue-text)', border: 'none',
                       padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
              {aiBusy === 'note' ? '보완 중...' : '✨ AI 보완'}
            </button>
          </div>
          <textarea rows={4} value={note} onChange={e => setNote(e.target.value)}
            placeholder="수업 메모, 인사이트, 깨달음" />
        </div>

        <div className="field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ margin: 0 }}>코치 피드백</label>
            <button onClick={() => aiEnhance('feedback')} disabled={aiBusy === 'feedback'}
              style={{ background: 'var(--blue-bg)', color: 'var(--blue-text)', border: 'none',
                       padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
              {aiBusy === 'feedback' ? '보완 중...' : '✨ AI 코치 피드백'}
            </button>
          </div>
          <textarea rows={3} value={feedback} onChange={e => setFeedback(e.target.value)}
            placeholder="원문 피드백 (AI가 자연스러운 코칭 톤으로 보완)" />
        </div>

        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="drill-en" checked={drillEnabled}
            onChange={e => setDrillEnabled(e.target.checked)} />
          <label htmlFor="drill-en" style={{ margin: 0, cursor: 'pointer', fontWeight: 600 }}>
            드릴 정보 입력
          </label>
        </div>

        {drillEnabled && (
          <div style={{ padding: 12, background: 'var(--bg2)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
            <div className="field"><label>포지션</label>
              <input value={drillPos} onChange={e => setDrillPos(e.target.value)}
                placeholder="예: 클로즈드 가드" /></div>
            <div className="field"><label>기술 (콤마 구분)</label>
              <input value={drillTech} onChange={e => setDrillTech(e.target.value)}
                placeholder="예: 힙 범프 스윕, 키무라" /></div>
            <div className="field"><label>디테일 (콤마 구분)</label>
              <input value={drillDetail} onChange={e => setDrillDetail(e.target.value)}
                placeholder="예: 힙 들기, 그립 깨기" /></div>
            <div className="field"><label>난이도/만족도 (★)</label>
              <select value={drillStars} onChange={e => setDrillStars(e.target.value)}>
                <option value={0}>없음</option>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
              </select>
            </div>
          </div>
        )}

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
