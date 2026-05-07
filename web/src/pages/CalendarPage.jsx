import React, { useState, useMemo } from 'react';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';
import * as classesApi from '../api/classes';
import ClassEditor from './ClassEditPage';
import SparEditor from './SparEditPage';

function pad(n) { return String(n).padStart(2, '0'); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function CalendarPage() {
  const { classes, reloadClasses } = useCache();
  const { showToast, setLoading } = useUI();
  const [year, setYear]   = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selected, setSelected] = useState(null);
  const [editingClass, setEditingClass] = useState(null);   // 'new' | class object
  const [editingSpar, setEditingSpar]   = useState(null);   // { classId, sparDay }

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

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>캘린더</span>
        <button className="btn-sm" onClick={() => setEditingClass('new')}>+ 수업 추가</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button className="btn-sm" onClick={() => changeMonth(-1)}>‹</button>
        <span style={{ fontWeight: 600 }}>{year}년 {month + 1}월</span>
        <button className="btn-sm" onClick={() => changeMonth(+1)}>›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 16 }}>
        {['일','월','화','수','목','금','토'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text2)', padding: 4 }}>{d}</div>
        ))}
        {cells.map((cell, i) => cell ? (
          <button key={i} onClick={() => setSelected(cell.ds)}
            style={{
              aspectRatio: '1', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: cell.ds === td ? 'var(--green-bg)' : 'var(--bg)',
              border: cell.hasClass ? '0.5px solid var(--green)' : '0.5px solid var(--border)',
              borderRadius: 8, padding: 4, cursor: 'pointer',
              color: 'var(--text)', fontSize: 13,
            }}>
            <div style={{ fontWeight: cell.hasClass ? 600 : 400 }}>{cell.day}</div>
            {cell.trained && <span style={{ fontSize: 10, color: 'var(--green)' }}>✓</span>}
          </button>
        ) : <div key={i} />)}
      </div>

      {selected && (
        <DateSheet
          date={selected}
          items={dataByDate.get(selected) || []}
          onClose={() => setSelected(null)}
          onToggleTrain={toggleTrain}
          onEditClass={c => { setEditingClass(c); setSelected(null); }}
          onAddSpar={c => { setEditingSpar({ classId: c.id, sparDay: { date: selected } }); setSelected(null); }}
          onEditSpar={(c, sd) => { setEditingSpar({ classId: c.id, sparDay: sd }); setSelected(null); }}
        />
      )}
      {editingClass && (
        <ClassEditor
          initial={editingClass === 'new' ? null : editingClass}
          onClose={() => setEditingClass(null)}
          onSaved={reloadClasses}
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

function DateSheet({ date, items, onClose, onToggleTrain, onEditClass, onAddSpar, onEditSpar }) {
  const d = new Date(date + 'T00:00:00');
  const days = ['일','월','화','수','목','금','토'];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          {d.getMonth() + 1}월 {d.getDate()}일 ({days[d.getDay()]})
        </div>
        {items.length === 0 ? (
          <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 20 }}>이 날짜의 기록이 없습니다</div>
        ) : items.map(c => {
          const trained = (c.trained_dates || []).includes(date);
          const sparOnDay = (c.spar_days || []).find(sd => (sd.date || '').toString().slice(0, 10) === date);
          return (
            <div key={c.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontWeight: 600 }}>{c.theme || '수업'}</div>
                <button className="btn-sm" onClick={() => onEditClass(c)}>수정</button>
              </div>
              {c.drill && <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
                {c.drill.pos && <span>📍 {c.drill.pos} · </span>}
                {(c.drill.tech || []).join(', ')}
              </div>}
              <button className={trained ? 'btn-primary' : 'btn-outline'}
                onClick={() => onToggleTrain(c, date)}
                style={{ width: '100%', marginBottom: 8 }}>
                {trained ? '✓ 오늘 수련했어요' : '+ 오늘 수련 체크'}
              </button>
              {sparOnDay ? (
                <button className="btn-outline" onClick={() => onEditSpar(c, sparOnDay)} style={{ width: '100%' }}>
                  🥋 스파링 ({(sparOnDay.sessions || []).length}세션) 보기/수정
                </button>
              ) : (
                <button className="btn-outline" onClick={() => onAddSpar(c)} style={{ width: '100%' }}>
                  + 스파링 추가
                </button>
              )}
            </div>
          );
        })}
        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
