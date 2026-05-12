import React, { useEffect } from 'react';
import Icon from './Icon';

export default function Modal({ open = true, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="bjj-modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        className="bjj-modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-up)',
          borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 460,
          maxHeight: '88%',
          overflowY: 'auto',
          padding: '20px 20px 30px',
          border: '1px solid var(--border-med)',
          borderBottom: 'none',
        }}
      >
        {(title || onClose) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{title}</span>
            {onClose && (
              <div onClick={onClose} style={{ cursor: 'pointer', padding: 4 }}>
                <Icon name="x" size={20} color="var(--text2)" />
              </div>
            )}
          </div>
        )}
        {children}
        {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
      </div>
    </div>
  );
}
