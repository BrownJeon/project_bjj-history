import React, { useState, useMemo } from 'react';
import * as classesApi from '../api/classes';
import * as enhanceApi from '../api/enhanceMemo';
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

export default function ClassEditor({ initial, onClose, onSaved }) {
  const { showToast, setLoading } = useUI();
  const { techniques, classes } = useCache();
  const isEdit = !!initial?.id;

  const drillPosSuggestions = useMemo(
    () => mergeUnique(BASE_POSITIONS, uniqueDrillPositions(classes)),
    [classes]
  );
  const techSuggestions = useMemo(
    () => mergeUnique(BASE_TECHNIQUES, techniques.map(t => t.name)),
    [techniques]
  );

  const [date, setDate]       = useState(initial?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [dateEnd, setDateEnd] = useState(initial?.date_end?.slice(0, 10) || '');
  const [theme, setTheme]     = useState(initial?.theme || '');
  const [note, setNote]       = useState(initial?.note || '');
  const [feedback, setFeedback] = useState(initial?.feedback || '');

  const drill0 = initial?.drill || {};
  const [drillPos,   setDrillPos]   = useState(drill0.pos ? [drill0.pos] : []);
  const [drillTech,  setDrillTech]  = useState(
    (drill0.tech || []).map(t => typeof t === 'string' ? t : (t.name || ''))
  );
  const [drillStars, setDrillStars] = useState(drill0.stars || 0);

  const [aiBusy, setAiBusy] = useState(null);

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
      const hasDrill = drillPos.length || drillTech.length || drillStars;
      const body = {
        date,
        dateEnd: dateEnd || null,
        theme, note, feedback,
        trainedDates: initial?.trained_dates || [],
        drill: hasDrill ? {
          pos: drillPos[0] || '',
          tech: drillTech,
          detail: drill0.detail || [],
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
    <Modal title={isEdit ? '수업 수정' : '수업 추가'} onClose={onClose}>
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

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        {isEdit && (
          <Button variant="danger" size="sm" onClick={remove} style={{ marginRight: 'auto' }}>삭제</Button>
        )}
        <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
        <Button variant="primary" size="sm" onClick={save}>저장</Button>
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
