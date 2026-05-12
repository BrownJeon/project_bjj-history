import React from 'react';

const TONES = {
  accent:  { color: '#1D9E75', bg: 'rgba(29,158,117,0.12)' },
  blue:    { color: '#4B8FE2', bg: 'rgba(75,143,226,0.12)' },
  red:     { color: '#E05A47', bg: 'rgba(224,90,71,0.12)' },
  amber:   { color: '#F0A830', bg: 'rgba(240,168,48,0.12)' },
  purple:  { color: '#8B6CE7', bg: 'rgba(139,108,231,0.12)' },
  neutral: { color: 'var(--text)', bg: 'var(--surface-hi)' },
};

export default function Tag({ children, tone = 'neutral', style, onClick }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 9px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        color: t.color,
        background: t.bg,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
