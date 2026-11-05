import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFeedback } from '../contexts/FeedbackContext';
import { listFeedback } from '../api/feedback';
import Button from './Button';
import Icon from './Icon';
import FeedbackStatus from './FeedbackStatus';

export default function FeedbackHomeCard() {
  const { openFeedback, version, getVersion } = useFeedback();
  const navigate = useNavigate();
  const [items, setItems] = useState([]), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    const isCurrent = () => !abort.signal.aborted && getVersion() === version;
    listFeedback({ limit: 3 }, { signal: abort.signal }).then(data => {
      if (isCurrent()) { setItems((data.items || []).slice(0, 3)); setError(''); }
    }).catch(e => { if (isCurrent()) setError(e.message); });
    return () => abort.abort();
  }, [version, getVersion, retry]);
  return <section className="fb-stack" style={{ margin: '16px 0' }} data-testid="independent-feedback-card">
    <div className="fb-section"><div className="fb-row"><h3>피드백</h3><Icon name="chat" /></div><p className="fb-muted">영상 복기, 개인 연습, 기술토론에서 얻은 내용을 남겨보세요.</p><Button full onClick={() => openFeedback()}>피드백 추가</Button></div>
    {error && <div className="fb-notice error" role="alert">피드백을 불러오지 못했습니다. {error}<Button size="sm" variant="outline" onClick={() => setRetry(value => value + 1)}>다시 불러오기</Button></div>}
    <div>
      <div className="fb-row fb-recent-heading"><h3>최근 피드백</h3><Button size="sm" variant="ghost" style={{ color: 'var(--accent-lt)', whiteSpace: 'nowrap' }} onClick={() => navigate('/feedback')}>전체 보기 ›</Button></div>
      {items.map(item => <button type="button" className="fb-list-button" key={item.id} onClick={() => openFeedback(item.id)}>
        <FeedbackStatus item={item} compact /><h3>{item.summary?.title || item.technique || '피드백'}</h3><p>{(item.summary?.overview || item.original || '').slice(0, 100)}</p>
      </button>)}
    </div>
  </section>;
}
