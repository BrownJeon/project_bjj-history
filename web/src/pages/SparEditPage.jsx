import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as classesApi from '../api/classes';
import * as enhanceApi from '../api/enhanceMemo';
import { useUI } from '../contexts/UIContext';
import { useCache } from '../contexts/CacheContext';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Icon from '../components/Icon';
import BeltBar from '../components/BeltBar';
import {
  BELT_LEVELS, BASE_TECHNIQUES, BASE_WEAKNESSES, mergeUnique, beltKey,
} from '../utils/baseOptions';
import { uniqueOpponents, uniqueWeaks } from '../utils/suggestions';

const EMPTY_SESSION = {
  level: '', opponent: '', tapGot: 0, tapGave: 0, time: '',
  successTried: [], weak: [], note: '', positionScore: 0,
};

export default function SparEditor({ classId, sparDay, onClose, onSaved }) {
  const { showToast, setLoading } = useUI();
  const { techniques, classes } = useCache();
  const isEdit = !!sparDay?.id;

  const techSuggestions = useMemo(
    () => mergeUnique(BASE_TECHNIQUES, techniques.map(t => t.name)),
    [techniques]
  );
  const weakSuggestions = useMemo(
    () => mergeUnique(BASE_WEAKNESSES, uniqueWeaks(classes)),
    [classes]
  );
  const opponentSuggestions = useMemo(() => uniqueOpponents(classes), [classes]);

  const [date, setDate] = useState(sparDay?.date?.toString().slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [dayNote, setDayNote] = useState(sparDay?.day_note || '');
  const [sessions, setSessions] = useState(
    (sparDay?.sessions || []).map(s => ({
      level: s.level || '',
      opponent: s.opponent || '',
      tapGot: s.tap_got || 0,
      tapGave: s.tap_gave || 0,
      time: s.time_min || '',
      // success 배열 → {name, success}[] 로 정규화
      successTried: (s.success || []).map(a =>
        typeof a === 'string'
          ? { name: a, success: true }
          : { name: a?.name || '', success: a?.success !== false }
      ).filter(a => a.name),
      weak: Array.isArray(s.weak) ? s.weak : [],
      note: s.note || '',
      positionScore: s.position_score || 0,
    })) || []
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
      const parts = [`세션${i + 1}`];
      if (s.level)    parts.push(`${s.level}벨트`);
      if (s.opponent) parts.push(s.opponent);
      parts.push(`탭 ${s.tapGot}:${s.tapGave}`);
      if (s.time) parts.push(`${s.time}분`);
      let line = `[${parts.join(' · ')}]`;
      if ((s.successTried || []).length)
        line += `\n  시도: ${s.successTried.map(t => `${t.name}(${t.success ? '✓' : '✗'})`).join(', ')}`;
      if ((s.weak || []).length)
        line += `\n  약점: ${s.weak.join(', ')}`;
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
    <Modal title={isEdit ? '스파링 수정' : '스파링 추가'} onClose={onClose}>
      <div className="field">
        <label>날짜 *</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>세션 ({sessions.length})</span>
          <Button size="sm" variant="outline" onClick={addSession}>+ 세션 추가</Button>
        </div>
        {sessions.length === 0 && (
          <div style={{
            padding: 16, textAlign: 'center',
            border: '1px dashed var(--border-med)', borderRadius: 12,
            color: 'var(--text2)', fontSize: 12,
          }}>
            세션을 추가하세요
          </div>
        )}
        {sessions.map((s, i) => (
          <SessionCard
            key={i}
            idx={i}
            session={s}
            opponentSuggestions={opponentSuggestions}
            techSuggestions={techSuggestions}
            weakSuggestions={weakSuggestions}
            onRemove={() => removeSession(i)}
            onUpdate={(k, v) => updateSession(i, k, v)}
          />
        ))}
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

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        {isEdit && <Button variant="danger" size="sm" onClick={remove} style={{ marginRight: 'auto' }}>삭제</Button>}
        <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
        <Button variant="primary" size="sm" onClick={save}>저장</Button>
      </div>
    </Modal>
  );
}

function SessionCard({ idx, session, opponentSuggestions, techSuggestions, weakSuggestions, onRemove, onUpdate }) {
  const [editingIdx, setEditingIdx]       = useState(null);
  const [editingVal, setEditingVal]       = useState('');
  const [adding, setAdding]               = useState(false);
  const [newVal, setNewVal]               = useState('');
  const [editingWeakIdx, setEditingWeakIdx] = useState(null);
  const [editingWeakVal, setEditingWeakVal] = useState('');
  const [addingWeak, setAddingWeak]         = useState(false);
  const [newWeakVal, setNewWeakVal]         = useState('');
  const editRef     = useRef(null);
  const newRef      = useRef(null);
  const weakEditRef = useRef(null);
  const newWeakRef  = useRef(null);

  useEffect(() => { if (editingIdx !== null) editRef.current?.focus(); }, [editingIdx]);
  useEffect(() => { if (adding) newRef.current?.focus(); }, [adding]);
  useEffect(() => { if (editingWeakIdx !== null) weakEditRef.current?.focus(); }, [editingWeakIdx]);
  useEffect(() => { if (addingWeak) newWeakRef.current?.focus(); }, [addingWeak]);

  function toggle(i) {
    const updated = session.successTried.map((x, idx2) =>
      idx2 === i ? { ...x, success: !x.success } : x
    );
    onUpdate('successTried', updated);
  }
  function startEdit(i) {
    setEditingIdx(i);
    setEditingVal(session.successTried[i].name);
  }
  function commitEdit(i) {
    const val = editingVal.trim();
    const updated = val
      ? session.successTried.map((x, idx2) => idx2 === i ? { ...x, name: val } : x)
      : session.successTried.filter((_, idx2) => idx2 !== i);
    onUpdate('successTried', updated);
    setEditingIdx(null);
  }
  function deleteItem(i) {
    onUpdate('successTried', session.successTried.filter((_, idx2) => idx2 !== i));
    if (editingIdx === i) setEditingIdx(null);
  }
  function addItem() {
    const val = newVal.trim();
    if (val) onUpdate('successTried', [...session.successTried, { name: val, success: true }]);
    setNewVal('');
    setAdding(false);
  }

  function startEditWeak(i) { setEditingWeakIdx(i); setEditingWeakVal(session.weak[i]); }
  function commitEditWeak(i) {
    const val = editingWeakVal.trim();
    const updated = val
      ? session.weak.map((x, idx2) => idx2 === i ? val : x)
      : session.weak.filter((_, idx2) => idx2 !== i);
    onUpdate('weak', updated);
    setEditingWeakIdx(null);
  }
  function deleteWeak(i) {
    onUpdate('weak', session.weak.filter((_, idx2) => idx2 !== i));
    if (editingWeakIdx === i) setEditingWeakIdx(null);
  }
  function addWeak() {
    const val = newWeakVal.trim();
    if (val) onUpdate('weak', [...session.weak, val]);
    setNewWeakVal('');
    setAddingWeak(false);
  }

  return (
    <div style={{
      padding: 14,
      background: 'var(--surface-up)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 6,
            background: 'var(--accent-dim)', color: 'var(--accent)',
            fontSize: 11, fontWeight: 800,
          }}>{idx + 1}</span>
          세션
        </span>
        <button
          onClick={onRemove}
          style={{
            background: 'transparent', border: '1px solid var(--border-med)',
            color: 'var(--red)', padding: '4px 8px', borderRadius: 6,
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <Icon name="trash" size={12} color="var(--red)" />
          삭제
        </button>
      </div>

      {/* 상대 벨트 + 미니 BeltBar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>상대 벨트</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={session.level}
              onChange={e => onUpdate('level', e.target.value)}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 10,
                border: '1px solid var(--border-med)', background: 'var(--surface)',
                color: 'var(--text)', fontSize: 13,
              }}
            >
              <option value="">-</option>
              {BELT_LEVELS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <BeltBar color={beltKey(session.level)} stripes={0} width={50} height={10} />
          </div>
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>상대</label>
          <input
            list={`opp-${idx}`}
            value={session.opponent}
            onChange={e => onUpdate('opponent', e.target.value)}
            placeholder="이름"
          />
          <datalist id={`opp-${idx}`}>
            {opponentSuggestions.map(o => <option key={o} value={o} />)}
          </datalist>
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>탭 받음</label>
          <input type="number" min={0} value={session.tapGot}
            onChange={e => onUpdate('tapGot', e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>탭 줌</label>
          <input type="number" min={0} value={session.tapGave}
            onChange={e => onUpdate('tapGave', e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>시간(분)</label>
          <input type="number" min={0} value={session.time}
            onChange={e => onUpdate('time', e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>포지션 점수</label>
          <input type="number" value={session.positionScore}
            onChange={e => onUpdate('positionScore', e.target.value)} />
        </div>
      </div>

      {/* 시도한 기술 — 성공/실패 토글 + 인라인 편집 */}
      <div className="field" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ margin: 0 }}>시도한 기술</label>
          <button onClick={() => setAdding(true)} style={addBtnStyle}>+ 추가</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {session.successTried.map((item, i) => (
            <div key={i} style={rowStyle}>
              {editingIdx === i ? (
                <input
                  ref={editRef}
                  value={editingVal}
                  onChange={e => setEditingVal(e.target.value)}
                  onBlur={() => commitEdit(i)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit(i);
                    if (e.key === 'Escape') setEditingIdx(null);
                  }}
                  style={inlineInputStyle}
                />
              ) : (
                <span onClick={() => startEdit(i)} style={{ flex: 1, cursor: 'pointer', fontSize: 13 }}>
                  {item.name}
                </span>
              )}
              <button
                onClick={() => toggle(i)}
                style={{
                  border: 'none', borderRadius: 6,
                  padding: '3px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                  background: item.success ? 'var(--green-dim, #d4edda)' : 'var(--red-dim, #fde8e8)',
                  color: item.success ? 'var(--green, #28a745)' : 'var(--red, #dc3545)',
                }}
              >
                {item.success ? '✓ 성공' : '✗ 실패'}
              </button>
              <button onClick={() => deleteItem(i)} style={delBtnStyle}>×</button>
            </div>
          ))}

          {adding && (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                ref={newRef}
                value={newVal}
                onChange={e => setNewVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addItem();
                  if (e.key === 'Escape') { setAdding(false); setNewVal(''); }
                }}
                placeholder="기술명 입력"
                list={`tech-suggestions-${idx}`}
                style={{ ...inlineInputStyle, flex: 1, border: '1px solid var(--border-med)', borderRadius: 8, padding: '6px 10px' }}
              />
              <datalist id={`tech-suggestions-${idx}`}>
                {techSuggestions.map(t => <option key={t} value={t} />)}
              </datalist>
              <button onClick={addItem} style={confirmBtnStyle}>추가</button>
              <button onClick={() => { setAdding(false); setNewVal(''); }} style={delBtnStyle}>취소</button>
            </div>
          )}

          {session.successTried.length === 0 && !adding && (
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>+ 추가를 눌러 시도한 기술을 입력하세요</p>
          )}
        </div>
      </div>

      <div className="field" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ margin: 0 }}>부족했던 부분</label>
          <button onClick={() => setAddingWeak(true)} style={addBtnStyle}>+ 추가</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {session.weak.map((item, i) => (
            <div key={i} style={rowStyle}>
              {editingWeakIdx === i ? (
                <input
                  ref={weakEditRef}
                  value={editingWeakVal}
                  onChange={e => setEditingWeakVal(e.target.value)}
                  onBlur={() => commitEditWeak(i)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEditWeak(i);
                    if (e.key === 'Escape') setEditingWeakIdx(null);
                  }}
                  style={inlineInputStyle}
                />
              ) : (
                <span onClick={() => startEditWeak(i)} style={{ flex: 1, cursor: 'pointer', fontSize: 13 }}>
                  {item}
                </span>
              )}
              <button onClick={() => deleteWeak(i)} style={delBtnStyle}>×</button>
            </div>
          ))}

          {addingWeak && (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                ref={newWeakRef}
                value={newWeakVal}
                onChange={e => setNewWeakVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addWeak();
                  if (e.key === 'Escape') { setAddingWeak(false); setNewWeakVal(''); }
                }}
                placeholder="부족했던 부분 입력"
                list={`weak-suggestions-${idx}`}
                style={{ ...inlineInputStyle, flex: 1, border: '1px solid var(--border-med)', borderRadius: 8, padding: '6px 10px' }}
              />
              <datalist id={`weak-suggestions-${idx}`}>
                {weakSuggestions.map(w => <option key={w} value={w} />)}
              </datalist>
              <button onClick={addWeak} style={confirmBtnStyle}>추가</button>
              <button onClick={() => { setAddingWeak(false); setNewWeakVal(''); }} style={delBtnStyle}>취소</button>
            </div>
          )}

          {session.weak.length === 0 && !addingWeak && (
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>+ 추가를 눌러 부족했던 부분을 입력하세요</p>
          )}
        </div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>세션 메모</label>
        <textarea rows={2} value={session.note}
          onChange={e => onUpdate('note', e.target.value)} />
      </div>
    </div>
  );
}

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 10px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
};

const inlineInputStyle = {
  flex: 1, border: 'none', background: 'transparent',
  outline: 'none', fontSize: 13, color: 'var(--text)', padding: 0,
};

const addBtnStyle = {
  border: 'none', background: 'var(--surface)',
  color: 'var(--accent)', borderRadius: 6,
  padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

const confirmBtnStyle = {
  border: 'none', background: 'var(--accent)', color: '#fff',
  borderRadius: 6, padding: '4px 12px',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
};

const delBtnStyle = {
  border: 'none', background: 'transparent',
  color: 'var(--text3)', cursor: 'pointer',
  fontSize: 16, padding: '0 2px', lineHeight: 1, flexShrink: 0,
};
