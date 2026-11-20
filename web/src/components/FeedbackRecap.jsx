import React from 'react';
import { useFeedback } from '../contexts/FeedbackContext';
import Button from './Button';
import FeedbackStatus, { FeedbackLegacySituation } from './FeedbackStatus';
import { savedSituationLabels } from '../utils/feedbackInput';

const OUTCOME = { not_tried: '시도 못 함', tried_failed: '해봤는데 안 됨', done: '됐음' };
export default function FeedbackRecap({ data, error, sparFailures, onRetry, from, to }) {
  const { openFeedback } = useFeedback();
  const addFeedback = () => openFeedback();
  return <section className="fb-stack" style={{ marginBottom: 22 }}>
    <div className="fb-section fb-counts" data-testid="recall-summary"><div><strong>{data ? data.summary.feedbackCount : '—'}</strong><span>피드백</span></div><div><strong>{sparFailures ?? '—'}</strong><span>스파링 실패</span></div><div><strong>{data ? data.summary.resultCount : '—'}</strong><span>연습 결과</span></div></div>
    <div className="fb-row"><h3>피드백</h3><Button size="sm" variant="ghost" onClick={addFeedback}>+ 추가</Button></div>
    {error ? <div role="alert" className="fb-notice error">피드백 집계를 불러오지 못했습니다. {error}<Button variant="outline" onClick={onRetry}>다시 불러오기</Button></div> : !data ? <p className="fb-muted">선택 기간의 피드백을 불러오는 중…</p> : <>
      <div data-testid="feedback-list">{data.items.length ? data.items.map(item => <button type="button" className="fb-list-button" key={item.id} onClick={() => openFeedback(item.id)}><FeedbackStatus item={item} compact /><h3>{item.summary?.title || item.technique || '피드백'}</h3><p>{(item.summary?.overview || item.original).slice(0, 140)}</p><span className="fb-muted">{[...savedSituationLabels(item), item.technique].filter(Boolean).join(' · ')}</span><FeedbackLegacySituation value={item.situation} /></button>) : <div className="fb-section"><h3>이 기간의 피드백이 없어요</h3><p className="fb-muted">기록할 내용이 있다면 지금 남겨보세요.</p><Button variant="outline" onClick={addFeedback}>피드백 남기기</Button></div>}</div>
      <section className="fb-section"><h3>선택 기간의 연습 결과</h3><p className="fb-muted">피드백 적용 실패 {data.summary.failureCount}건 · 위 스파링 실패 횟수와 별도로 집계합니다. 결과를 적용한 날짜를 기준으로 봅니다.</p>
        {data.results.length ? data.results.map(result => <button type="button" key={result.id} className="fb-list-button" onClick={() => openFeedback(result.feedbackId)}><span className="fb-muted">{result.date} · {OUTCOME[result.outcome]}</span><p>{result.note || '추가 메모 없음'}</p><span className="fb-muted">원 피드백 {result.feedbackDate}{(from && result.feedbackDate < from || to && result.feedbackDate > to) ? ' · 기간 밖 참고' : ''}</span></button>) : <p className="fb-muted">이 기간에 남긴 연습 결과가 없습니다.</p>}
      </section>
    </>}
  </section>;
}
