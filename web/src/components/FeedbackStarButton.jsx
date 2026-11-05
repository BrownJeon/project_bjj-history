import React, { useState } from 'react';
import { useFeedback } from '../contexts/FeedbackContext';
import Icon from './Icon';

export default function FeedbackStarButton({ item, title, onSaved }) {
  const { setStar, pendingStars } = useFeedback();
  const [error, setError] = useState('');
  const starred = Boolean(item.starred);
  async function toggle() {
    setError('');
    try {
      const saved = await setStar(item.id, !starred);
      if (saved) onSaved?.(saved);
    } catch (cause) { setError(cause.message || '즐겨찾기를 저장하지 못했습니다.'); }
  }
  return <>
    <button type="button" className="fb-star" aria-label={title ? `${title} 즐겨찾기` : '즐겨찾기'} aria-pressed={starred}
      disabled={pendingStars.has(String(item.id))} onClick={toggle}>
      <Icon name="star" size={19} filled={starred} />
    </button>
    {error && <p className="fb-star-error fb-muted" role="alert">{error}</p>}
  </>;
}
