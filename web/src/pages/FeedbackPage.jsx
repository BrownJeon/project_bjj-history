import React, { useEffect, useState } from 'react';
import { listFeedback } from '../api/feedback';
import Button from '../components/Button';
import FeedbackStarButton from '../components/FeedbackStarButton';
import FeedbackStatus, { FeedbackLegacySituation } from '../components/FeedbackStatus';
import Icon from '../components/Icon';
import { FilterChip, TechniqueFilter } from '../components/LibraryFilters';
import Pagination from '../components/Pagination';
import { useFeedback } from '../contexts/FeedbackContext';
import { savedSituationLabels } from '../utils/feedbackInput';

const PAGE_SIZE = 10;
const FILTERS = [
  ['all', '전체'], ['recent', '최신순', 'clock'], ['star', '즐겨찾기', 'star'], ['completed', '완료', 'check'],
];

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
    <div className="fb-library-filters" aria-label="피드백 조회 조건">
      {FILTERS.map(([key, label, icon]) => <FilterChip key={key} active={key === criteria.filter} icon={icon}
        onClick={() => { if (key !== criteria.filter) change({ filter: key }); }}>{label}</FilterChip>)}
    </div>
    <TechniqueFilter names={data?.techniqueOptions ?? []} value={criteria.technique} showClear
      emptyText="저장된 피드백 기술이 없습니다." onChange={technique => change({ technique })} />
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
