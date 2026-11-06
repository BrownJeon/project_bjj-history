import React, { useEffect, useMemo, useState } from 'react';
import { useCache } from '../contexts/CacheContext';
import { CLIP_FILTERS, filterClips, paginateClips, rankedClipTechniques } from '../utils/clipFilters';
import { getClipThumb } from '../utils/videoThumb';
import Button from './Button';
import Icon from './Icon';
import { FilterChip, TechniqueFilter } from './LibraryFilters';

const PICKER_FILTERS = CLIP_FILTERS.filter(([key]) => key !== 'unused' && key !== 'mostUsed');

export default function FeedbackClipPicker({ selectedIds, onChange, onOpen, disabled = false, linkedClips = [] }) {
  const { clips, reloadClips } = useCache();
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('all');
  const [techFilter, setTechFilter] = useState('');
  const [page, setPage] = useState(1), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  // CacheContext intentionally swallows initial failures. Verify this picker request
  // explicitly so an unavailable library is not presented as an empty library.
  useEffect(() => { let active = true; reloadClips().then(() => { if (active) setError(''); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [reloadClips]);
  const names = useMemo(() => rankedClipTechniques(clips), [clips]);
  const result = useMemo(() => paginateClips(filterClips(clips, { search, filter, techFilter }), page, 5), [clips, search, filter, techFilter, page]);
  useEffect(() => { setPage(1); }, [search, filter, techFilter]);
  useEffect(() => { if (page !== result.page) setPage(result.page); }, [page, result.page]);
  const selected = selectedIds.map(id => clips.find(c => Number(c.id) === Number(id)) || linkedClips.find(c => Number(c.id) === Number(id)) || { id, unavailable: true });
  async function retry() {
    setLoading(true);
    try { await reloadClips(); setError(''); } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  function toggle(id) { onChange(selectedIds.includes(id) ? selectedIds.filter(value => value !== id) : [...selectedIds, id]); }
  return <div className="fb-stack" data-testid="feedback-video-picker">
    <h3>등록영상에서 선택</h3>
    <label className="fb-field">영상 검색<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="제목·기술명·설명·태그 검색" data-testid="video-search" /></label>
    <div className="fb-filter-controls">
      <div className="fb-library-filters" aria-label="참고영상 필터">
        {PICKER_FILTERS.map(([key, label, icon]) => <FilterChip key={key} active={filter === key} icon={icon}
          onClick={() => setFilter(key)}>{label}</FilterChip>)}
      </div>
      <TechniqueFilter names={names} value={techFilter} onChange={setTechFilter} />
    </div>
    <div className="fb-row fb-muted"><span data-testid="video-result-count">조회 {result.total}개 · {result.from}–{result.to}</span><strong data-testid="video-selected-count">선택 {selectedIds.length}개</strong></div>
    {error ? <div role="alert" className="fb-notice error">영상을 불러오지 못했습니다. {error}<Button size="sm" variant="outline" onClick={retry} disabled={loading}>다시 불러오기</Button></div>
      : <div className="fb-stack" data-testid="video-results">{result.items.map(clip => {
        const chosen = selectedIds.includes(clip.id), thumb = getClipThumb(clip);
        return <div key={clip.id} className={`fb-video-choice${chosen ? ' selected' : ''}`}>
          <button type="button" className="fb-video-row" aria-pressed={chosen} disabled={disabled} onClick={() => toggle(clip.id)} data-testid={`select-video-${clip.id}`}>
            <span className="fb-video-thumb" aria-hidden="true">
              <span>썸네일 없음</span>
              {thumb && <img key={thumb} src={thumb} alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true; }} />}
              {chosen && <span className="fb-video-thumb-check"><Icon name="check" size={12} /></span>}
            </span>
            <span className="fb-video-caption">
              <strong>{clip.title || '제목 없는 영상'}</strong>
              <small>{clip.tech_names?.join(' · ') || clip.tech_name || '기술 미연결'}</small>
            </span>
          </button>
          <Button size="sm" variant="outline" style={{ flexShrink: 0 }} onClick={() => onOpen(clip.id)}>미리보기</Button>
        </div>;
      })}{!result.total && <p className="fb-muted">조건에 맞는 영상이 없습니다. 검색어나 필터를 바꿔 보세요.</p>}</div>}
    {result.pages > 1 && <div className="fb-row" data-testid="video-pagination"><Button variant="outline" size="sm" onClick={() => setPage(result.page - 1)} disabled={result.page === 1}>이전</Button><span className="fb-muted">{result.page} / {result.pages} 페이지</span><Button variant="outline" size="sm" onClick={() => setPage(result.page + 1)} disabled={result.page === result.pages}>다음</Button></div>}
    {!!selected.length && <div className="fb-stack"><h3>선택한 영상</h3>{selected.map(clip => <div className="fb-row" key={clip.id}><span className="fb-muted">{clip.unavailable ? `연결할 수 없는 영상 #${clip.id}` : clip.title || '제목 없는 영상'}</span><Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(selectedIds.filter(id => Number(id) !== Number(clip.id)))}>선택 해제</Button></div>)}</div>}
  </div>;
}
