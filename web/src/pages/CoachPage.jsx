import React, { useState, useEffect } from 'react';
import { useUI } from '../contexts/UIContext';
import * as coachApi from '../api/coach';

export default function CoachPage() {
  const { showToast, setLoading } = useUI();
  const [days, setDays] = useState(30);
  const [diag, setDiag] = useState(null);
  const [reports, setReports] = useState([]);
  const [plans, setPlans] = useState([]);

  useEffect(() => { loadAll(); }, [days]);

  async function loadAll() {
    try {
      const [d, r, p] = await Promise.all([
        coachApi.getDiagnosis(days),
        coachApi.listReports('report', 5),
        coachApi.listReports('plan', 5),
      ]);
      setDiag(d); setReports(r); setPlans(p);
    } catch (e) { showToast('오류: ' + e.message); }
  }

  async function generateReport() {
    setLoading(true);
    try {
      await coachApi.generateReport({ days });
      await loadAll();
      showToast('리포트 생성 완료');
    } catch (e) { showToast('생성 실패: ' + e.message); }
    finally { setLoading(false); }
  }
  async function generatePlan() {
    setLoading(true);
    try {
      await coachApi.generatePlan({ days });
      await loadAll();
      showToast('플랜 생성 완료');
    } catch (e) { showToast('생성 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <div className="page-header">코치</div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: 'var(--text2)' }}>기간:</label>
        <select value={days} onChange={e => setDays(parseInt(e.target.value))}
          style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 8, border: '0.5px solid var(--border)' }}>
          <option value={7}>7일</option>
          <option value={30}>30일</option>
          <option value={90}>90일</option>
        </select>
      </div>

      {diag && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>진단 요약</div>
          <Row label="수업" value={`${diag.summary.classes}회`} />
          <Row label="수련 일수" value={`${diag.summary.trainedDays}일`} />
          <Row label="스파링" value={`${diag.summary.sessions}세션 / ${diag.summary.minutes}분`} />
          <Row label="탭" value={`↓${diag.summary.tapGot} ↑${diag.summary.tapGave}`} />
          {(diag.weakTop || []).length > 0 && (
            <div style={{ marginTop: 8, fontSize: 13 }}>
              반복 약점: {diag.weakTop.map(w => `${w.name}(×${w.count})`).join(', ')}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn-primary" onClick={generateReport} style={{ flex: 1 }}>+ 리포트 생성</button>
        <button className="btn-primary" onClick={generatePlan} style={{ flex: 1 }}>+ 플랜 생성</button>
      </div>

      {reports.length > 0 && <Section title="최근 리포트" items={reports} field="content"
        render={c => c.highlights || ''} />}
      {plans.length > 0 && <Section title="최근 플랜" items={plans} field="content"
        render={c => (c.focuses || []).map(f => f.title).join(' · ')} />}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
      <span style={{ color: 'var(--text2)' }}>{label}</span><span>{value}</span>
    </div>
  );
}

function Section({ title, items, render }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {items.map(r => (
        <div key={r.id} className="card">
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
            {String(r.created_at).slice(0, 10)} · {r.period_start} ~ {r.period_end}
          </div>
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap',
                        maxHeight: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {render(r.content)}
          </div>
        </div>
      ))}
    </div>
  );
}
