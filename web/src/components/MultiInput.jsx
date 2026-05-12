import React, { useState, useRef } from 'react';

/**
 * 다중 입력 + 자동완성 칩 컴포넌트
 *
 * Props:
 * - value:        string[]   — 선택된 항목들
 * - onChange:     (string[]) => void
 * - suggestions:  string[]   — 자동완성 제안 후보 (선택)
 * - placeholder:  string
 * - allowCustom:  boolean    — true면 제안 외 자유 텍스트도 Enter로 추가 (기본 true)
 */
export default function MultiInput({
  value = [], onChange,
  suggestions = [],
  placeholder = '검색하거나 Enter로 추가',
  allowCustom = true,
}) {
  const [input, setInput] = useState('');
  const [open, setOpen]   = useState(false);
  const ref = useRef(null);

  const matched = input.trim()
    ? suggestions
        .filter(s => !value.includes(s) && s.toLowerCase().includes(input.toLowerCase()))
        .slice(0, 8)
    : [];

  function add(item) {
    const v = (item || '').trim();
    if (!v || value.includes(v)) { setInput(''); return; }
    onChange([...value, v]);
    setInput('');
    setOpen(false);
  }

  function remove(i) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  function onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (matched.length > 0) add(matched[0]);
      else if (allowCustom) add(input);
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      remove(value.length - 1);
    } else if (e.key === ',') {
      e.preventDefault();
      if (allowCustom) add(input);
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
            background: 'var(--green-bg)', color: 'var(--green-text)',
            borderRadius: 12, fontSize: 12,
          }}>
            {v}
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
            flex: 1, minWidth: 100, border: 'none', outline: 'none',
            background: 'transparent', color: 'var(--text)', fontSize: 14,
          }}
        />
        <button
          type="button"
          onMouseDown={e => {
            e.preventDefault();
            if (matched.length > 0) add(matched[0]);
            else if (allowCustom && input.trim()) add(input);
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
