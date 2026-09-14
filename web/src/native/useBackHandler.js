import { useEffect, useRef } from 'react';
import { pushBackHandler } from './backStack';

/**
 * 열려 있는 동안 안드로이드 뒤로가기로 닫히게 한다 (task-039 A-6, 설명은 ./backStack.js).
 *
 * 🔴 핸들러는 ref 로 최신값만 부르고, 스택 등록은 `active` 가 바뀔 때만 한다. `onClose` 가 매 렌더
 *    새 함수(인라인 화살표)여도 재등록하지 않으므로 **겹친 모달의 위·아래 순서가 뒤바뀌지 않는다.**
 * 웹 브라우저에서는 스택에 올라가기만 하고 아무도 부르지 않는다(동작 변화 없음).
 *
 * @param {boolean} active   열려 있는가
 * @param {() => void} [onBack] 닫는 함수 — 없으면 등록하지 않는다
 */
export default function useBackHandler(active, onBack) {
  const ref = useRef(onBack);
  ref.current = onBack;
  const enabled = !!active && typeof onBack === 'function';
  useEffect(() => {
    if (!enabled) return undefined;
    return pushBackHandler(() => { if (typeof ref.current === 'function') ref.current(); });
  }, [enabled]);
}
