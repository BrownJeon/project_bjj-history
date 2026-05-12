import React, { useState, useRef } from 'react';

/**
 * 단일 텍스트 입력 + 자동완성 dropdown
 * suggestions에 없는 값도 자유 입력 허용 (그대로 onChange).
 *
 * Props:
 *  - value:        string
 *  - onChange:     (string) => void
 *  - suggestions:  string[]
 *  - placeholder:  string
 */
export default function AutocompleteInput({
  value = '', onChange,
  suggestions = [],
  placeholder = '',
  ...rest
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const matched = (value || '').trim()
    ? suggestions
        .filter(s => s !== value && s.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 8)
    : suggestions.slice(0, 8);

  function pick(s) {
    onChange(s);
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={ref}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        style={{ width: '100%' }}
        {...rest}
      />
      {open && matched.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--bg2)', border: '0.5px solid var(--border2)',
          borderRadius: 'var(--radius)',
          maxHeight: 220, overflowY: 'auto', zIndex: 50, marginTop: 2,
        }}>
          {matched.map((m, i) => (
            <div key={i}
              onMouseDown={e => { e.preventDefault(); pick(m); }}
              style={{ padding: '8px 12px', cursor: 'pointer',
                       borderBottom: i < matched.length - 1 ? '0.5px solid var(--border)' : 'none',
                       fontSize: 14 }}>
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
