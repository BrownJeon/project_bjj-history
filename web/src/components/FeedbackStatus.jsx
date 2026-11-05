import React from 'react';

const TRAINING_LABELS = { assigned: '과제중', training: '훈련중', completed: '훈련완료' };

export function FeedbackLegacySituation({ value }) {
  return value ? <span className="fb-muted fb-legacy-situation">기존 자유 입력 상황 · {value}</span> : null;
}

export default function FeedbackStatus({ item, compact = false }) {
  const summaryLabel = item.summary ? item.summaryStale ? '이전 내용 기준' : '정리됨' : '보완 중';
  const trainingLabel = TRAINING_LABELS[item.trainingStatus];
  return <span className="fb-meta">
    {compact
      ? <span className="fb-muted">{item.date} · {summaryLabel}</span>
      : <><span className="fb-muted">{item.date}</span><span className="fb-badge">{summaryLabel}</span></>}
    {trainingLabel && <span className={`fb-badge fb-training-${item.trainingStatus}`}>{trainingLabel}</span>}
  </span>;
}
