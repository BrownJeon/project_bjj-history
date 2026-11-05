import React, { useEffect, useState } from 'react';
import { useCache } from '../contexts/CacheContext';
import Button from './Button';
import Modal from './Modal';

const searchable = text => text.normalize('NFC').toLowerCase();

function hasRegisteredId(id) {
  if (typeof id !== 'number' && typeof id !== 'string') return false;
  return Number.isSafeInteger(Number(id)) && Number(id) > 0;
}

export default function FeedbackTechniquePicker({ selected, onSelect, onClose }) {
  const { techniques, reloadTechniques } = useCache();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(!techniques.length);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (techniques.length) { setLoading(false); setError(''); return; }
    let alive = true;
    setLoading(true);
    setError('');
    reloadTechniques().catch(cause => {
      if (alive) setError(cause.message || '등록 기술을 불러오지 못했습니다.');
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [techniques.length, reloadTechniques, retry]);

  const query = searchable(search.trim());
  const matches = techniques.filter(technique => hasRegisteredId(technique.id) && technique.name && searchable(technique.name).includes(query));
  return <Modal title="기술 선택" onClose={onClose}>
    <div className="fb-stack">
      <label className="fb-field">등록 기술 검색<input autoFocus type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="기술명 검색…" /></label>
      {loading && <p className="fb-muted" role="status">등록 기술을 불러오는 중…</p>}
      {error && <div className="fb-notice error" role="alert">{error}<Button variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>다시 불러오기</Button></div>}
      {!loading && !error && !matches.length && <p className="fb-muted">{techniques.length ? '검색 결과 없음' : '기술트리에 등록된 기술이 없습니다.'}</p>}
      <div className="fb-dropdown-options">
        {matches.map(technique => <button type="button" className="fb-tech-option" key={technique.id} aria-pressed={selected === technique.name}
          onClick={() => onSelect(technique)}>{technique.name}</button>)}
      </div>
    </div>
  </Modal>;
}
