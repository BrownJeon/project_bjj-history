import React, { useState, useRef, useEffect, useMemo } from 'react';
import Icon from './Icon';

/**
 * TagPicker
 * props:
 *   value: string[] (선택된 태그 목록)
 *   onChange: (next: string[]) => void
 *   suggestions: string[] (추천 후보)
 *   singleSelect: boolean — true면 1개만 선택
 *   placeholder: string
 */
export default function TagPicker({
  value = [],
  onChange,
  suggestions = [],
  singleSelect = false,
  placeholder = '검색 또는 직접 입력 후 Enter',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sel = new Set(value);
    return suggestions.filter(s => !sel.has(s) && (!q || s.toLowerCase().includes(q)));
  }, [suggestions, query, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  function add(tag) {
    const t = (tag || '').trim();
    if (!t) return;
    if (value.includes(t)) return;
    const next = singleSelect ? [t] : [...value, t];
    onChange(next);
    setQuery('');
    if (singleSelect) setOpen(false);
  }
  function remove(tag) {
    onChange(value.filter(v => v !== tag));
  }
  function onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      add(query);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6,
        padding: '8px 10px',
        background: 'var(--surface)',
        border: '1px solid var(--border-med)',
        borderRadius: 10,
        minHeight: 40,
        alignItems: 'center',
      }}>
        {value.map(v => (
          <span key={v} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 4px 3px 9px',
            borderRadius: 6,
            fontSize: 12, fontWeight: 600,
            color: 'var(--accent)',
            background: 'var(--accent-dim)',
          }}>
            {v}
            <span onClick={() => remove(v)} style={{ cursor: 'pointer', display: 'inline-flex', padding: 2 }}>
              <Icon name="x" size={12} color="var(--accent)" />
            </span>
          </span>
        ))}
        {(!singleSelect || value.length === 0) && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            style={{
              background: 'transparent',
              border: '1px dashed var(--border-med)',
              color: 'var(--text2)',
              borderRadius: 6,
              padding: '3px 9px',
              fontSize: 11, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + 추가
          </button>
        )}
      </div>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--surface-up)',
          border: '1px solid var(--border-med)',
          borderRadius: 10,
          padding: 8,
          zIndex: 50,
          maxHeight: 260,
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 8px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            marginBottom: 8,
          }}>
            <Icon name="search" size={14} color="var(--text3)" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder={placeholder}
              style={{
                flex: 1, background: 'transparent', border: 'none',
                color: 'var(--text)', fontSize: 13, outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {filtered.length === 0 && !query && (
              <div style={{ color: 'var(--text3)', fontSize: 12, padding: 6 }}>추천 없음</div>
            )}
            {filtered.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                style={{
                  background: 'var(--surface-hi)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12, fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {s}
              </button>
            ))}
            {query && !filtered.some(s => s.toLowerCase() === query.toLowerCase()) && (
              <button
                type="button"
                onClick={() => add(query)}
                style={{
                  background: 'var(--accent-dim)',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + "{query}" 추가
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
