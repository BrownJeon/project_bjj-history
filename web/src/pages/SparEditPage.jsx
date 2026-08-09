import React, { useState, useMemo } from 'react';
import * as classesApi from '../api/classes';
import * as enhanceApi from '../api/enhanceMemo';
import { useUI } from '../contexts/UIContext';
import { useCache } from '../contexts/CacheContext';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Icon from '../components/Icon';
import {
  BELT_LEVELS, BASE_TECHNIQUES, BASE_WEAKNESSES, mergeUnique,
} from '../utils/baseOptions';
import { uniqueOpponents } from '../utils/suggestions';
import SparFeedbackCard from '../components/SparFeedbackCard';

const EMPTY_SESSION = {
  level: '', opponent: '', tapGot: 0, tapGave: 0, time: '',
  successTried: [], weak: [], note: '', positionScore: 0,
};

const BELT_PILL = {
  '화이트': { bg: '#e8e8e8', active: '#999',    text: '#666',    activeText: '#fff' },
  '블루':   { bg: '#c8dff0', active: '#1e6fa0', text: '#1e6fa0', activeText: '#fff' },
  '퍼플':   { bg: '#e0d0ef', active: '#7b4f9e', text: '#7b4f9e', activeText: '#fff' },
  '브라운': { bg: '#eeddd0', active: '#8B5E3C', text: '#8B5E3C', activeText: '#fff' },
  '블랙':   { bg: '#ccc',    active: '#222',    text: '#555',    activeText: '#fff' },
};

export default function SparEditor({ classId, sparDay, onClose, onSaved }) {
  const { showToast, setLoading } = useUI();
  const { techniques, classes } = useCache();
  const isEdit = !!sparDay?.id;

  const [feedbackData, setFeedbackData] = useState(null);

  // Frequency-sorted suggestions from past records
  const weakFreqSuggestions = useMemo(() => {
    const freq = {};
    classes.forEach(c => {
      (c.spar_days || []).forEach(sd => {
        (sd.sessions || []).forEach(s => {
          (s.weak || []).forEach(w => { if (w) freq[w] = (freq[w] || 0) + 1; });
        });
      });
    });
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return mergeUnique(sorted, BASE_WEAKNESSES);
  }, [classes]);

  const successFreqSuggestions = useMemo(() => {
    const freq = {};
    classes.forEach(c => {
      (c.spar_days || []).forEach(sd => {
        (sd.sessions || []).forEach(s => {
          (s.success || []).forEach(t => {
            if (t?.success !== false && t?.name) freq[t.name] = (freq[t.name] || 0) + 1;
          });
        });
      });
    });
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return mergeUnique(sorted, BASE_TECHNIQUES, techniques.map(t => t.name));
  }, [classes, techniques]);

  const tapTechSuggestions = useMemo(() => {
    const freq = {};
    classes.forEach(c => {
      (c.spar_days || []).forEach(sd => {
        (sd.sessions || []).forEach(s => {
          (s.success || []).forEach(t => {
            if (t?.success === false && t?.name) freq[t.name] = (freq[t.name] || 0) + 1;
          });
        });
      });
    });
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return mergeUnique(sorted, BASE_TECHNIQUES);
  }, [classes]);

  const opponentSuggestions = useMemo(() => uniqueOpponents(classes), [classes]);

  const [date, setDate] = useState(
    sparDay?.date?.toString().slice(0, 10) || new Date().toISOString().slice(0, 10)
  );
  const [dayNote, setDayNote] = useState(sparDay?.day_note || '');
  const [sessions, setSessions] = useState(
    (sparDay?.sessions || []).map(s => ({
      level: s.level || '',
      opponent: s.opponent || '',
      tapGot: s.tap_got || 0,
      tapGave: s.tap_gave || 0,
      time: s.time_min || '',
      successTried: (s.success || []).map(a =>
        typeof a === 'string'
          ? { name: a, success: true }
          : { name: a?.name || '', success: a?.success !== false }
      ).filter(a => a.name),
      weak: Array.isArray(s.weak) ? s.weak : [],
      note: s.note || '',
      positionScore: s.position_score || 0,
    }))
  );
  const [aiBusy, setAiBusy] = useState(false);

  function addSession() {
    setSessions([...sessions, { ...EMPTY_SESSION, successTried: [], weak: [] }]);
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
        success: s.successTried || [],
        weak: s.weak || [],
        positions: [],
        note: s.note,
      })),
    };
  }

  async function aiEnhance() {
    if (!sessions.length) { alert('세션이 비어있습니다'); return; }
    const text = sessions.map((s, i) => {
      const parts = [`라운드${i + 1}`];
      if (s.level) parts.push(`${s.level}벨트`);
      if (s.opponent) parts.push(s.opponent);
      let line = `[${parts.join(' · ')}]`;
      const good = s.successTried.filter(t => t.success);
      const tapTech = s.successTried.filter(t => !t.success);
      if (good.length) line += `\n  잘됨: ${good.map(t => t.name).join(', ')}`;
      if (tapTech.length) line += `\n  탭당함: ${tapTech.map(t => t.name).join(', ')}`;
      if ((s.weak || []).length) line += `\n  약점: ${s.weak.join(', ')}`;
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
      onSaved && onSaved();
      setFeedbackData({ sessions, classes });
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

  if (feedbackData) {
    return (
      <SparFeedbackCard
        sessions={feedbackData.sessions}
        classes={feedbackData.classes}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal title={isEdit ? '스파링 수정' : '스파링 추가'} onClose={onClose}>
      <div className="field">
        <label>날짜 *</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>라운드 ({sessions.length})</span>
        </div>
        {sessions.length === 0 && (
          <div style={{
            padding: 20, textAlign: 'center',
            border: '1px dashed var(--border-med)', borderRadius: 12,
            color: 'var(--text2)', fontSize: 13, marginBottom: 8,
          }}>
            아래 버튼으로 라운드를 추가하세요
          </div>
        )}
        {sessions.map((s, i) => (
          <GrowthSessionCard
            key={i}
            idx={i}
            session={s}
            weakSuggestions={weakFreqSuggestions}
            successSuggestions={successFreqSuggestions}
            tapTechSuggestions={tapTechSuggestions}
            opponentSuggestions={opponentSuggestions}
            onRemove={() => removeSession(i)}
            onUpdate={(k, v) => updateSession(i, k, v)}
          />
        ))}
        <button
          onClick={addSession}
          style={{
            width: '100%', padding: '13px 0',
            border: '2px dashed var(--border-med)',
            background: 'transparent', borderRadius: 14,
            color: 'var(--accent)', fontSize: 14, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + 라운드 추가
        </button>
      </div>

      <div className="field">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label style={{ margin: 0 }}>전체 메모 / AI 코칭 분석</label>
          <button
            onClick={aiEnhance}
            disabled={aiBusy || !sessions.length}
            style={{
              background: 'var(--purple-dim)', color: 'var(--purple)',
              border: 'none', padding: '4px 10px', borderRadius: 6,
              fontSize: 11, fontWeight: 600,
              cursor: aiBusy ? 'wait' : 'pointer',
            }}
          >
            {aiBusy ? '분석 중…' : '✨ AI 코칭 분석'}
          </button>
        </div>
        <textarea rows={4} value={dayNote} onChange={e => setDayNote(e.target.value)}
          placeholder="스파링 전체 메모 / AI 분석 결과" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button variant="primary" size="sm" onClick={save}>저장</Button>
        <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
        {isEdit && <Button variant="danger" size="sm" onClick={remove} style={{ marginLeft: 'auto' }}>삭제</Button>}
      </div>
    </Modal>
  );
}

function GrowthSessionCard({
  idx, session, weakSuggestions, successSuggestions, tapTechSuggestions,
  opponentSuggestions, onRemove, onUpdate,
}) {
  const [expanded, setExpanded] = useState(false);
  const [customWeak, setCustomWeak] = useState('');
  const [customSuccess, setCustomSuccess] = useState('');
  const [customTapTech, setCustomTapTech] = useState('');

  const goodTechs = session.successTried.filter(t => t.success).map(t => t.name);
  const tapTechs  = session.successTried.filter(t => !t.success).map(t => t.name);

  function toggleWeak(name) {
    if (session.weak.includes(name))
      onUpdate('weak', session.weak.filter(w => w !== name));
    else
      onUpdate('weak', [...session.weak, name]);
  }
  function addCustomWeak() {
    const val = customWeak.trim();
    if (val && !session.weak.includes(val)) onUpdate('weak', [...session.weak, val]);
    setCustomWeak('');
  }

  function toggleGoodTech(name) {
    if (goodTechs.includes(name)) {
      const i = session.successTried.findIndex(t => t.name === name && t.success);
      if (i >= 0) onUpdate('successTried', session.successTried.filter((_, j) => j !== i));
    } else {
      onUpdate('successTried', [...session.successTried, { name, success: true }]);
    }
  }
  function addCustomSuccess() {
    const val = customSuccess.trim();
    if (val && !goodTechs.includes(val))
      onUpdate('successTried', [...session.successTried, { name: val, success: true }]);
    setCustomSuccess('');
  }

  function toggleTapTech(name) {
    if (tapTechs.includes(name)) {
      const i = session.successTried.findIndex(t => t.name === name && !t.success);
      if (i >= 0) onUpdate('successTried', session.successTried.filter((_, j) => j !== i));
    } else {
      onUpdate('successTried', [...session.successTried, { name, success: false }]);
    }
  }
  function addCustomTapTech() {
    const val = customTapTech.trim();
    if (val && !tapTechs.includes(val))
      onUpdate('successTried', [...session.successTried, { name: val, success: false }]);
    setCustomTapTech('');
  }

  function step(key, delta) {
    onUpdate(key, Math.max(0, (parseInt(session[key]) || 0) + delta));
  }

  // Selected first, then up to 8 unselected suggestions
  const weakChips = [
    ...session.weak,
    ...weakSuggestions.filter(s => !session.weak.includes(s)).slice(0, 8),
  ];
  const successChips = [
    ...goodTechs,
    ...successSuggestions.filter(s => !goodTechs.includes(s)).slice(0, 8),
  ];
  const tapTechChips = [
    ...tapTechs,
    ...tapTechSuggestions.filter(s => !tapTechs.includes(s)).slice(0, 8),
  ];

  return (
    <div style={{
      padding: 14, background: 'var(--surface-up)',
      border: '1px solid var(--border)', borderRadius: 14, marginBottom: 8,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 6,
            background: 'var(--accent-dim)', color: 'var(--accent)',
            fontSize: 11, fontWeight: 800,
          }}>{idx + 1}</span>
          라운드
        </span>
        <button onClick={onRemove} style={{
          background: 'transparent', border: '1px solid var(--border-med)',
          color: 'var(--red)', padding: '4px 8px', borderRadius: 6,
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <Icon name="trash" size={12} color="var(--red)" /> 삭제
        </button>
      </div>

      {/* 아쉬웠던 점 — PRIMARY */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 7 }}>
          아쉬웠던 점
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {weakChips.map(chip => {
            const sel = session.weak.includes(chip);
            return (
              <button key={chip} onClick={() => toggleWeak(chip)} style={{
                padding: '5px 11px', borderRadius: 20,
                background: sel ? 'var(--red)' : 'var(--surface)',
                color: sel ? '#fff' : 'var(--text2)',
                fontSize: 12, fontWeight: sel ? 700 : 500,
                cursor: 'pointer',
                border: sel ? 'none' : '1px solid var(--border-med)',
              }}>{chip}</button>
            );
          })}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input
              value={customWeak}
              onChange={e => setCustomWeak(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustomWeak(); }}
              placeholder="직접 입력"
              style={customInputStyle}
            />
            {customWeak.trim() && (
              <button onClick={addCustomWeak} style={addChipBtnStyle}>+</button>
            )}
          </div>
        </div>
      </div>

      {/* 잘 된 기술 — PRIMARY */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 7 }}>
          잘 된 기술
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {successChips.map(chip => {
            const sel = goodTechs.includes(chip);
            return (
              <button key={chip} onClick={() => toggleGoodTech(chip)} style={{
                padding: '5px 11px', borderRadius: 20,
                background: sel ? 'var(--accent)' : 'var(--surface)',
                color: sel ? '#fff' : 'var(--text2)',
                fontSize: 12, fontWeight: sel ? 700 : 500,
                cursor: 'pointer',
                border: sel ? 'none' : '1px solid var(--border-med)',
              }}>{chip}</button>
            );
          })}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input
              value={customSuccess}
              onChange={e => setCustomSuccess(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustomSuccess(); }}
              placeholder="직접 입력"
              style={customInputStyle}
            />
            {customSuccess.trim() && (
              <button onClick={addCustomSuccess} style={addChipBtnStyle}>+</button>
            )}
          </div>
        </div>
      </div>

      {/* 더 자세히 */}
      <button onClick={() => setExpanded(!expanded)} style={{
        width: '100%', padding: '8px 0',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, color: 'var(--text2)',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}>
        {expanded ? '▲ 접기' : '▼ 더 자세히 (벨트 · 탭 당한 기술 · 메모)'}
      </button>

      {expanded && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 탭 당한 기술 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 7 }}>
              탭 당한 기술 (선택)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tapTechChips.map(chip => {
                const sel = tapTechs.includes(chip);
                return (
                  <button key={chip} onClick={() => toggleTapTech(chip)} style={{
                    padding: '5px 11px', borderRadius: 20,
                    background: sel ? 'var(--red-dim, #fde8e8)' : 'var(--surface)',
                    color: sel ? 'var(--red)' : 'var(--text2)',
                    fontSize: 12, fontWeight: sel ? 700 : 500,
                    cursor: 'pointer',
                    border: sel ? '1px solid var(--red)' : '1px solid var(--border-med)',
                  }}>{chip}</button>
                );
              })}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input
                  value={customTapTech}
                  onChange={e => setCustomTapTech(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomTapTech(); }}
                  placeholder="직접 입력"
                  style={customInputStyle}
                />
                {customTapTech.trim() && (
                  <button onClick={addCustomTapTech} style={addChipBtnStyle}>+</button>
                )}
              </div>
            </div>
          </div>

          {/* 상대 벨트 — pill buttons */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 7 }}>
              상대 벨트
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {BELT_LEVELS.map(belt => {
                const pill = BELT_PILL[belt] || BELT_PILL['화이트'];
                const active = session.level === belt;
                return (
                  <button key={belt} onClick={() => onUpdate('level', active ? '' : belt)} style={{
                    padding: '6px 13px', borderRadius: 20, border: 'none',
                    background: active ? pill.active : pill.bg,
                    color: active ? pill.activeText : pill.text,
                    fontSize: 12, fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                  }}>{belt}</button>
                );
              })}
            </div>
          </div>

          {/* 상대 이름 */}
          <div className="field" style={{ marginBottom: 0 }}>
            <label>상대 이름</label>
            <input
              list={`opp-${idx}`}
              value={session.opponent}
              onChange={e => onUpdate('opponent', e.target.value)}
              placeholder="이름 (선택)"
            />
            <datalist id={`opp-${idx}`}>
              {opponentSuggestions.map(o => <option key={o} value={o} />)}
            </datalist>
          </div>

          {/* 시간 / 탭 스텝퍼 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <StepperField label="시간(분)" value={parseInt(session.time) || 0} onStep={d => step('time', d)} />
            <StepperField label="탭 받음" value={parseInt(session.tapGot) || 0} onStep={d => step('tapGot', d)} />
            <StepperField label="탭 줌" value={parseInt(session.tapGave) || 0} onStep={d => step('tapGave', d)} />
          </div>

          {/* 세션 메모 */}
          <div className="field" style={{ marginBottom: 0 }}>
            <label>세션 메모</label>
            <textarea rows={2} value={session.note} onChange={e => onUpdate('note', e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}

function StepperField({ label, value, onStep }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => onStep(-1)} style={stepperBtnStyle}>−</button>
        <span style={{ fontSize: 15, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{value}</span>
        <button onClick={() => onStep(+1)} style={stepperBtnStyle}>+</button>
      </div>
    </div>
  );
}

const stepperBtnStyle = {
  width: 28, height: 28, borderRadius: 8,
  border: '1px solid var(--border-med)',
  background: 'var(--surface)', color: 'var(--text)',
  fontSize: 18, lineHeight: 1, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

const customInputStyle = {
  padding: '5px 9px', borderRadius: 20,
  border: '1px dashed var(--border-med)',
  background: 'transparent', color: 'var(--text)',
  fontSize: 12, outline: 'none', width: 70,
};

const addChipBtnStyle = {
  width: 24, height: 24, borderRadius: 12,
  border: 'none', background: 'var(--accent)',
  color: '#fff', fontSize: 16, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};
