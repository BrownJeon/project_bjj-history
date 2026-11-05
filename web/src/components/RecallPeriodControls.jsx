import React, { useState } from 'react';
import { feedbackPeriod, shiftPeriodAnchor, validatePeriod } from '../utils/feedbackPeriod';
import Button from './Button';
import Icon from './Icon';

export default function RecallPeriodControls({ value, onChange }) {
  const [mode, setMode] = useState(value.mode), [from, setFrom] = useState(value.from), [to, setTo] = useState(value.to), [error, setError] = useState('');
  function choose(next) {
    setMode(next); setError('');
    if (next !== 'custom') onChange({ mode: next, anchor: value.anchor, ...feedbackPeriod(next, value.anchor) });
    else { setFrom(value.from || ''); setTo(value.to || ''); }
  }
  function move(direction) {
    const anchor = shiftPeriodAnchor(value.mode, value.anchor, direction);
    onChange({ mode: value.mode, anchor, ...feedbackPeriod(value.mode, anchor) });
  }
  return <section className="fb-stack" style={{ marginBottom: 16 }} aria-label="복기 기간 선택">
    <div className="fb-period">{[['all', '전체'], ['week', '주'], ['month', '월'], ['custom', '직접선택']].map(([key, label]) => <button type="button" key={key} aria-pressed={mode === key} onClick={() => choose(key)} data-testid={`period-${key}`}>{label}</button>)}</div>
    {mode === 'custom' ? <form className="fb-stack" onSubmit={e => {
      e.preventDefault(); const invalid = validatePeriod(from, to); setError(invalid);
      if (!invalid) onChange({ mode: 'custom', anchor: value.anchor, ...feedbackPeriod('custom', value.anchor, { from, to }) });
    }}>
      <div className="fb-date-grid"><label className="fb-field">시작일<input type="date" required value={from} onChange={e => setFrom(e.target.value)} /></label><label className="fb-field">종료일<input type="date" required value={to} onChange={e => setTo(e.target.value)} /></label></div>
      {error && <p className="fb-muted" role="alert">{error}</p>}<Button full variant="outline" type="submit">기간 적용</Button>
    </form> : ['week', 'month'].includes(mode) && <div className="fb-row"><Button variant="ghost" onClick={() => move(-1)}><span aria-label="이전 기간"><Icon name="chevL" /></span></Button><strong>{value.label}</strong><Button variant="ghost" onClick={() => move(1)}><span aria-label="다음 기간"><Icon name="chevR" /></span></Button></div>}
    <p className="fb-muted" role="status" data-testid="period-range">적용 중 · {value.from ? `${value.from} ~ ${value.to}` : '전체 기간'}</p>
  </section>;
}
