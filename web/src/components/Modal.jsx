import React, { createContext, useContext, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import useBackHandler from '../native/useBackHandler';
import { registerModal, topModal } from '../utils/modalStack';

const ParentModal = createContext(null);

export default function Modal({ open = true, onClose, title, children, footer, fullScreen = false }) {
  const overlayRef = useRef(null), sheetRef = useRef(null), closeRef = useRef(onClose);
  closeRef.current = onClose;
  const token = useRef({});
  const parent = useContext(ParentModal);
  const previousOpen = useRef(false), trigger = useRef(null);
  // Capture before React's autoFocus descendants commit, not after they take focus.
  if (open && !previousOpen.current && typeof document !== 'undefined') trigger.current = document.activeElement;
  previousOpen.current = open;
  const titleId = useId();
  const closeTop = () => topModal(overlayRef.current?.ownerDocument)?.close?.();
  const closeThis = () => { if (topModal(overlayRef.current?.ownerDocument)?.token === token.current) closeRef.current?.(); };
  // 안드로이드 앱 뒤로가기 → 열린 모달 중 맨 위 하나만 닫는다(task-039 A-6). 웹에서는 동작 변화 없음.
  // A parent's native hook can mount after its child's; always delegate to the actual top dialog.
  useBackHandler(open, typeof onClose === 'function' ? closeTop : undefined);

  useLayoutEffect(() => {
    if (!open) return;
    return registerModal({
      token: token.current, parent, overlay: overlayRef.current, sheet: sheetRef.current,
      trigger: trigger.current, close: () => closeRef.current?.(),
    });
  }, [open, parent]);

  if (!open) return null;

  return createPortal((<ParentModal.Provider value={token.current}>
    <div
      ref={overlayRef}
      className="bjj-modal-overlay"
      onClick={event => { if (event.target === event.currentTarget) { event.stopPropagation(); closeThis(); } }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={sheetRef}
        role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : '상세 보기'} tabIndex={-1}
        className="bjj-modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-up)',
          borderRadius: fullScreen ? 0 : '20px 20px 0 0',
          width: '100%', maxWidth: 460,
          maxHeight: fullScreen ? '100%' : '88%', height: fullScreen ? '100dvh' : undefined,
          overflowY: 'auto',
          padding: fullScreen ? 'max(20px, var(--native-top, 0px)) 20px calc(30px + var(--safe-bottom, 0px))' : '20px 20px 30px',
          overscrollBehavior: 'contain',
          border: '1px solid var(--border-med)',
          borderBottom: 'none',
        }}
      >
        {(title || onClose) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span id={titleId} style={{ fontSize: 18, fontWeight: 700 }}>{title}</span>
            {onClose && (
              <button type="button" aria-label="닫기" onClick={closeThis} style={{ cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'grid', placeItems: 'center', background: 'transparent', border: 0 }}>
                <Icon name="x" size={20} color="var(--text2)" />
              </button>
            )}
          </div>
        )}
        {children}
        {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
      </div>
    </div></ParentModal.Provider>
  ), document.body);
}
