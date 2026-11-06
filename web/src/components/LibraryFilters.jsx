import React, { useEffect, useId, useRef, useState } from 'react';
import Button from './Button';
import Icon from './Icon';
import '../styles/library-filters.css';

const normalized = value => value.normalize('NFC').toLowerCase();

export function FilterChip({ active, onClick, icon, children }) {
  return <button type="button" className="library-filter-button" aria-pressed={active} onClick={onClick}>
    <span className="library-filter-chip">
      {icon && <Icon name={icon} size={12} color="currentColor" filled={(icon === 'star' || icon === 'pin') && active} />}
      {children}
    </span>
  </button>;
}

export function TechniqueFilter({ names, value, onChange, showClear = false, emptyText = '검색 결과 없음' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropdown = useRef(null), trigger = useRef(null);
  const controls = useId();

  useEffect(() => {
    if (!open) return;
    function dismiss(event) {
      if (!dropdown.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  function closeAndFocus() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function choose(name) {
    onChange(name);
    closeAndFocus();
  }

  const search = normalized(query.trim());
  const matches = names.filter(name => normalized(name).includes(search));

  return <div className="library-tech-filter" ref={dropdown} onKeyDown={event => {
    if (open && event.key === 'Escape' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      closeAndFocus();
    }
  }}>
    <button ref={trigger} type="button" className="library-filter-button" aria-expanded={open}
      aria-controls={open ? controls : undefined} data-selected={Boolean(value)}
      onClick={() => { setOpen(!open); setQuery(''); }}>
      <span className="library-tech-trigger">
        <span>{value || '기술 선택'}</span>{' '}
        <span className="library-tech-arrow" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </span>
    </button>
    {showClear && value && <Button variant="ghost" size="sm" onClick={() => choose('')}>기술 조건 해제</Button>}
    {open && <div id={controls} className="library-tech-menu">
      <div className="library-tech-search">
        <input autoFocus type="search" aria-label="기술 검색" placeholder="기술 검색…" value={query} onChange={event => setQuery(event.target.value)} />
      </div>
      <div className="library-tech-options">
        <button type="button" aria-pressed={!value} onClick={() => choose('')}>모든 기술</button>
        {!matches.length && <p>{names.length ? '검색 결과 없음' : emptyText}</p>}
        {matches.map(name => <button type="button" key={name} aria-pressed={value === name} onClick={() => choose(name)}>{name}</button>)}
      </div>
    </div>}
  </div>;
}
