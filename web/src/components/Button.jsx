import React from 'react';

export default function Button({
  children, variant = 'primary', size = 'md', full = false,
  onClick, type = 'button', disabled = false, style,
}) {
  const sm = size === 'sm';
  const base = {
    padding: sm ? '7px 12px' : '11px 18px',
    borderRadius: sm ? 8 : 12,
    fontSize: sm ? 12 : 14,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none',
    width: full ? '100%' : 'auto',
    opacity: disabled ? 0.5 : 1,
    transition: 'opacity 0.15s, background 0.15s',
  };
  let v = {};
  if (variant === 'primary') v = { background: 'var(--accent)', color: '#fff' };
  else if (variant === 'outline') v = { background: 'transparent', color: 'var(--text)', border: '1px solid var(--border-med)' };
  else if (variant === 'danger') v = { background: 'var(--red)', color: '#fff' };
  else if (variant === 'ghost') v = { background: 'transparent', color: 'var(--text)' };
  else if (variant === 'accent-grad') v = {
    background: 'linear-gradient(135deg, #1D9E75 0%, #25C490 100%)',
    color: '#fff',
    boxShadow: '0 8px 24px var(--accent-glow)',
  };

  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...v, ...style }}>
      {children}
    </button>
  );
}
