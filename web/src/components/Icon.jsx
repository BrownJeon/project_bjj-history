import React from 'react';

// SVG icon system ported from reference/bjj-ui.jsx Ic component.
// Usage: <Icon name="home" size={18} color="currentColor" filled />
export default function Icon({ name, size = 18, color = 'currentColor', filled = false, style }) {
  const s = { width: size, height: size, display: 'block', flexShrink: 0, ...style };
  const p = { strokeWidth: 1.7, stroke: color, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  const pf = { ...p, fill: filled ? color : 'none' };

  const icons = {
    home: (<><path d="M3 12l9-8 9 8" {...p} /><path d="M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" {...pf} /></>),
    calendar: (<><rect x="3" y="4" width="18" height="18" rx="2.5" {...pf} /><path d="M8 2v4M16 2v4M3 10h18" {...p} /></>),
    book: (<><path d="M4 19.5A2.5 2.5 0 016.5 17H20" {...p} /><path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z" {...pf} /></>),
    target: (<><circle cx="12" cy="12" r="9" {...p} /><circle cx="12" cy="12" r="5" {...p} /><circle cx="12" cy="12" r="1" fill={color} /></>),
    grid: (<><rect x="3" y="3" width="7" height="7" rx="1.5" {...pf} /><rect x="14" y="3" width="7" height="7" rx="1.5" {...pf} /><rect x="3" y="14" width="7" height="7" rx="1.5" {...pf} /><rect x="14" y="14" width="7" height="7" rx="1.5" {...pf} /></>),
    plus: <path d="M12 5v14M5 12h14" {...p} strokeWidth="2" />,
    search: (<><circle cx="11" cy="11" r="7" {...p} /><path d="M21 21l-4.35-4.35" {...p} /></>),
    chevL: <path d="M15 18l-6-6 6-6" {...p} />,
    chevR: <path d="M9 18l6-6-6-6" {...p} />,
    star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" {...pf} />,
    x: <path d="M18 6L6 18M6 6l12 12" {...p} strokeWidth="2" />,
    check: <path d="M5 12l5 5L20 7" {...p} strokeWidth="2" />,
    clock: (<><circle cx="12" cy="12" r="9" {...p} /><path d="M12 7v5l3 3" {...p} /></>),
    fire: <path d="M12 2c0 4-4 6-4 10a4 4 0 008 0c0-4-4-6-4-10z" {...pf} />,
    trophy: (<><path d="M6 4h12v6a6 6 0 01-12 0V4z" {...pf} /><path d="M6 9H4a1 1 0 01-1-1V6a1 1 0 011-1h2M18 9h2a1 1 0 001-1V6a1 1 0 00-1-1h-2" {...p} /><path d="M9 16h6M12 16v4M8 20h8" {...p} /></>),
    users: (<><circle cx="9" cy="8" r="3.5" {...pf} /><path d="M2 21v-1a5 5 0 0110 0v1" {...pf} /><circle cx="17" cy="8" r="2.5" {...p} /><path d="M22 21v-.5a4 4 0 00-5-3.87" {...p} /></>),
    video: (<><rect x="2" y="5" width="14" height="14" rx="2" {...pf} /><path d="M16 10l6-3v10l-6-3" {...pf} /></>),
    brain: (<><path d="M12 2a5 5 0 015 5c0 2-1 3-2 4l-1 1v4h-4v-4l-1-1c-1-1-2-2-2-4a5 5 0 015-5z" {...pf} /><path d="M9 16h6M10 19h4" {...p} /></>),
    link: (<><path d="M10 13a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1" {...p} /><path d="M14 11a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1" {...p} /></>),
    settings: (<><circle cx="12" cy="12" r="3" {...p} /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" {...p} /></>),
    edit: <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" {...p} />,
    trash: (<><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" {...p} /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" {...p} /></>),
    pin: (<><path d="M12 17v5" {...p} /><path d="M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1z" {...pf} /></>),
    sparring: (<><circle cx="8" cy="6" r="2.5" {...p} /><circle cx="16" cy="6" r="2.5" {...p} /><path d="M4 20c0-3 2-5 4-5s4 2 4 5M12 20c0-3 2-5 4-5s4 2 4 5" {...p} /></>),
    belt: (<><rect x="2" y="10" width="20" height="5" rx="1" {...pf} /><path d="M12 10v5M10 12.5h4" {...p} /></>),
  };
  return <svg style={s} viewBox="0 0 24 24">{icons[name] || null}</svg>;
}
