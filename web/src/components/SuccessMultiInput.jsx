import React, { useState, useRef } from 'react';

/**
 * 시도 기술 다중 입력 — 항목별 ✓(성공) / ✗(실패) 토글
 *
 * Props:
 * - value:       Array<{ name: string, success: boolean }>
 * - onChange:    (next) => void
 * - suggestions: string[]
 */
export default function SuccessMultiInput({
  value = [], onChange,
  suggestions = [],
  placeholder = '시도 기술 (Enter로 추가, 클릭으로 ✓/✗ 토글)',
}) {
  const [input, setInput] = useState('');
  const [open, setOpen]   = useState(false);
  const ref = useRef(null);

  const matched = input.trim()
    ? suggestions
        .filter(s => !value.some(v => v.name === s) && s.toLowerCase().includes(input.toLowerCase()))
        .slice(0, 8)
    : [];

  function add(name) {
    const v = (name || '').trim();
    if (!v || value.some(x => x.name === v)) { setInput(''); return; }
    onChange([...value, { name: v, success: true }]);
    setInput('');
    setOpen(false);
  }
  function remove(i)   { onChange(value.filter((_, idx) => idx !== i)); }
  function toggle(i)   { onChange(value.map((v, idx) => idx === i ? { ...v, success: !v.success } : v)); }

  function onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (matched.length > 0) add(matched[0]);
      else add(input);
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      remove(value.length - 1);
    } else if (e.key === ',') {
      e.preventDefault();
      add(input);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 4,
        padding: 6, minHeight: 38,
        background: 'var(--bg2)',
        border: '0.5px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}
        onClick={() => ref.current?.focus()}>
        {value.map((v, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 8px',
            background: v.success ? 'var(--green-bg)' : 'var(--red-bg)',
            color: v.success ? 'var(--green-text)' : 'var(--red-text)',
            borderRadius: 12, fontSize: 12,
          }}>
            <button onClick={(e) => { e.stopPropagation(); toggle(i); }}
              title="성공/실패 토글"
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                       color: 'inherit', fontSize: 13, padding: 0, lineHeight: 1 }}>
              {v.success ? '✓' : '✗'}
            </button>
            {v.name}
            <button onClick={(e) => { e.stopPropagation(); remove(i); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                       color: 'inherit', fontSize: 13, padding: 0, lineHeight: 1 }}>
              ×
            </button>
          </span>
        ))}
        <input
          ref={ref}
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); }}
          onKeyDown={onKey}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={value.length === 0 ? placeholder : ''}
          style={{
            flex: 1, minWidth: 120, border: 'none', outline: 'none',
            background: 'transparent', color: 'var(--text)', fontSize: 14,
          }}
        />
        <button
          type="button"
          onMouseDown={e => {
            e.preventDefault();
            if (matched.length > 0) add(matched[0]);
            else if (input.trim()) add(input);
          }}
          disabled={!input.trim()}
          style={{
            background: input.trim() ? 'var(--green)' : 'var(--bg3)',
            color: input.trim() ? '#fff' : 'var(--text2)',
            border: 'none', borderRadius: 6,
            padding: '4px 10px', fontSize: 13, fontWeight: 500,
            cursor: input.trim() ? 'pointer' : 'not-allowed',
            flexShrink: 0,
          }}>
          + 추가
        </button>
      </div>
      {open && matched.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--bg2)', border: '0.5px solid var(--border2)',
          borderRadius: 'var(--radius)',
          maxHeight: 220, overflowY: 'auto', zIndex: 50, marginTop: 2,
        }}>
          {matched.map((m, i) => (
            <div key={i}
              onMouseDown={e => { e.preventDefault(); add(m); }}
              style={{ padding: '8px 12px', cursor: 'pointer',
                       borderBottom: i < matched.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
