import React from 'react';

export default function Card({ children, className = '', style, onClick, padding }) {
  const sx = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: padding != null ? padding : 14,
    cursor: onClick ? 'pointer' : 'default',
    ...style,
  };
  return (
    <div className={className} style={sx} onClick={onClick}>
      {children}
    </div>
  );
}
