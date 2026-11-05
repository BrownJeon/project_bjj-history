import { useEffect, useRef, useSyncExternalStore } from 'react';
import * as feedbackApi from '../api/feedback';
import { createFeedbackRecordController } from '../utils/feedbackRecordController.js';

// API/state only; no screen is mounted or connected here.
export default function useFeedbackRecord(options = {}) {
  const ref = useRef(null);
  if (!ref.current) ref.current = createFeedbackRecordController({ api: feedbackApi, ...options });
  const controller = ref.current;
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    controller.mount();
    return () => controller.unmount();
  }, [controller]);
  return { ...state, controller };
}
