import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import useFeedbackRecord from '../hooks/useFeedbackRecord';
import { setFeedbackStar } from '../api/feedback';
import '../styles/feedback.css';

const FeedbackContext = createContext(null);
export function FeedbackProvider({ children }) {
  const recordState = useFeedbackRecord();
  const { controller, record } = recordState;
  const [stage, setStage] = useState('input');
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [version, setVersion] = useState(0);
  const currentVersion = useRef(0);
  const starLocks = useRef(new Set());
  const [pendingStars, setPendingStars] = useState(new Set());
  const invalidate = useCallback(() => setVersion(++currentVersion.current), []);
  const getVersion = useCallback(() => currentVersion.current, []);
  useEffect(() => { if (record) invalidate(); }, [record?.id, record?.revision, invalidate]);
  const setStar = useCallback(async (id, starred) => {
    const key = String(id);
    if (starLocks.current.has(key)) return null;
    starLocks.current.add(key);
    setPendingStars(new Set(starLocks.current));
    try {
      const saved = await setFeedbackStar(id, starred);
      if (String(saved?.id) !== key || typeof saved.starred !== 'boolean') throw new Error('즐겨찾기 저장 응답을 확인하지 못했습니다.');
      controller.acceptStar(saved);
      invalidate();
      return saved;
    } finally {
      starLocks.current.delete(key);
      setPendingStars(new Set(starLocks.current));
    }
  }, [controller, invalidate]);
  const openFeedback = useCallback(async (id = null) => {
    const saved = await controller.open(id);
    const current = controller.getSnapshot();
    if (current.open && (id == null ? !current.record : String(current.record?.id) === String(id))) {
      setCloseConfirm(false);
      setStage(saved?.summary || saved?.ai?.kind === 'summarize' ? 'summary' : saved?.turns?.length || saved?.ready || saved?.ai?.kind === 'ask' ? 'conversation' : 'input');
    }
    return saved;
  }, [controller]);
  const requestClose = useCallback(() => {
    if (!controller.close()) setCloseConfirm(true);
  }, [controller]);
  return <FeedbackContext.Provider value={{ ...recordState, stage, setStage, openFeedback, requestClose, closeConfirm, setCloseConfirm, version, getVersion, setStar, pendingStars }}>
    {children}
  </FeedbackContext.Provider>;
}
export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('useFeedback must be inside FeedbackProvider');
  return value;
}
