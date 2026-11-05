import React, { useEffect, useId, useRef, useState } from 'react';
import { listFeedback } from '../api/feedback';
import Button from '../components/Button';
import FeedbackStarButton from '../components/FeedbackStarButton';
import FeedbackStatus, { FeedbackLegacySituation } from '../components/FeedbackStatus';
import Icon from '../components/Icon';
import Pagination from '../components/Pagination';
import { useFeedback } from '../contexts/FeedbackContext';
import { savedSituationLabels } from '../utils/feedbackInput';

const PAGE_SIZE = 10;
const FILTERS = { all: '전체', recent: '최신순', star: '즐겨찾기', completed: '완료' };
const normalized = value => value.normalize('NFC').toLowerCase();

function TechniqueFilter({ names, value, onChange }) {
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
  function choose(name) {
    onChange(name);
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  const matches = names.filter(name => normalized(name).includes(normalized(query.trim())));
  return <div className="fb-tech-filter fb-wrap" ref={dropdown} onKeyDown={event => {
    if (open && event.key === 'Escape' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    }
  }}>
    <button ref={trigger} type="button" className="fb-chip" aria-expanded={open} aria-controls={open ? controls : undefined}
      data-selected={Boolean(value)} onClick={() => { setOpen(!open); setQuery(''); }}>{value || '기술 선택'} {open ? '▴' : '▾'}</button>
    {value && <Button variant="ghost" size="sm" onClick={() => choose('')}>기술 조건 해제</Button>}
    {open && <div id={controls} className="fb-dropdown fb-tech-menu">
      <input autoFocus type="search" className="fb-control" aria-label="기술 검색" placeholder="기술 검색…" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="fb-dropdown-options">
        <button type="button" className="fb-tech-option" aria-pressed={!value} onClick={() => choose('')}>모든 기술</button>
        {matches.map(name => <button type="button" className="fb-tech-option" key={name} aria-pressed={value === name} onClick={() => choose(name)}>{name}</button>)}
        {!matches.length && <p className="fb-muted">{names.length ? '검색 결과 없음' : '저장된 피드백 기술이 없습니다.'}</p>}
      </div>
    </div>}
  </div>;
}

function FeedbackListCard({ item, onOpen, onStarSaved }) {
  const title = item.summary?.title || item.technique || '피드백';
  const context = [item.technique, ...savedSituationLabels(item)].filter(Boolean).join(' · ');
  return <article className="fb-library-card">
    <button type="button" className="fb-list-button" aria-label={`${title} 피드백 보기`} onClick={() => onOpen(item.id)}>
      <FeedbackStatus item={item} />
      <h3>{title}</h3>
      {context && <span className="fb-muted">{context}</span>}
      <FeedbackLegacySituation value={item.situation} />
      <p>{(item.summary?.overview || item.original || '').slice(0, 140)}</p>
    </button>
    <FeedbackStarButton item={item} title={title} onSaved={onStarSaved} />
  </article>;
}

export default function FeedbackPage() {
  const { openFeedback, version, getVersion } = useFeedback();
  const [criteria, setCriteria] = useState({ search: '', filter: 'all', technique: '', page: 1 });
  const [data, setData] = useState(null);
  const [resolvedCriteria, setResolvedCriteria] = useState(null);
  const [requestError, setRequestError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const change = patch => setCriteria(current => ({ ...current, page: 1, ...patch }));

  useEffect(() => {
    const abort = new AbortController();
    const isCurrent = () => !abort.signal.aborted && getVersion() === version;
    setLoading(true);
    setRequestError(null);
    listFeedback({ ...criteria, search: criteria.search.trim(), limit: PAGE_SIZE, includeTechniqueOptions: 1 }, { signal: abort.signal }).then(next => {
      if (!isCurrent()) return;
      const lastPage = Math.max(1, Math.ceil(next.total / PAGE_SIZE));
      if (criteria.page > lastPage) {
        setCriteria(current => current === criteria ? { ...current, page: lastPage } : current);
        return;
      }
      setData(next);
      setResolvedCriteria(criteria);
    }).catch(error => {
      if (isCurrent()) setRequestError({ criteria, message: error.message || '피드백을 불러오지 못했습니다.' });
    }).finally(() => { if (isCurrent()) setLoading(false); });
    return () => abort.abort();
  }, [criteria, retry, version, getVersion]);

  function updateStar(saved) {
    setData(current => current && ({
      ...current,
      items: current.items.map(item => String(item.id) === String(saved.id) ? { ...item, starred: saved.starred } : item),
    }));
  }

  const shown = resolvedCriteria === criteria ? data : null;
  const error = requestError?.criteria === criteria ? requestError.message : '';
  const filtered = Boolean(criteria.search.trim() || criteria.technique || ['star', 'completed'].includes(criteria.filter));
  return <div className="fb-stack fb-library">
    <div className="fb-row"><h1>피드백</h1><Button size="sm" variant="outline" onClick={() => openFeedback()}>+ 추가</Button></div>
    <label className="fb-library-search">
      <Icon name="search" size={16} />
      <input type="search" aria-label="피드백 검색" placeholder="제목·기술명·내용 검색" value={criteria.search} onChange={event => change({ search: event.target.value })} />
    </label>
    <div className="fb-wrap" aria-label="피드백 조회 조건">
      {Object.entries(FILTERS).map(([key, label]) => <button type="button" className="fb-chip" key={key} aria-pressed={key === criteria.filter}
        onClick={() => { if (key !== criteria.filter) change({ filter: key }); }}>{label}</button>)}
    </div>
    <TechniqueFilter names={data?.techniqueOptions ?? []} value={criteria.technique} onChange={technique => change({ technique })} />
    <div className="fb-library-content" aria-busy={loading || (!shown && !error)}>
      {error && <div className="fb-notice error" role="alert">{error}<Button variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>다시 불러오기</Button></div>}
      {!shown && !error && <p className="fb-muted" role="status">피드백을 불러오는 중…</p>}
      {shown && <>
        <p className="fb-muted" role="status">{shown.total}개</p>
        {!shown.items.length && !loading && !error && <p className="fb-section fb-muted">{filtered ? '조건에 맞는 피드백이 없습니다.' : '아직 피드백이 없어요.'}</p>}
        {shown.items.map(item => <FeedbackListCard key={item.id} item={item} onOpen={openFeedback} onStarSaved={updateStar} />)}
        <Pagination total={shown.total} page={criteria.page} pageSize={PAGE_SIZE} onPageChange={page => change({ page })} />
      </>}
    </div>
  </div>;
}
