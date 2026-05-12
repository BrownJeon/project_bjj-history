// ═══════════════════════════════════════════════════════════════
// BJJ Daily Log — Design System & Shared Components
// ═══════════════════════════════════════════════════════════════

// ── Design Tokens ──
const TK = {
  bg:         '#0C0D12',
  surface:    '#15171E',
  surfaceUp:  '#1C1F28',
  surfaceHi:  '#242836',
  border:     'rgba(255,255,255,0.06)',
  borderMed:  'rgba(255,255,255,0.10)',
  text:       '#EEEEF2',
  text2:      '#7C8098',
  text3:      '#4A4E64',
  accent:     '#1D9E75',
  accentLt:   '#25C490',
  accentDim:  'rgba(29,158,117,0.12)',
  accentGlow: 'rgba(29,158,117,0.25)',
  red:        '#E05A47', redDim:    'rgba(224,90,71,0.12)',
  blue:       '#4B8FE2', blueDim:   'rgba(75,143,226,0.12)',
  amber:      '#F0A830', amberDim:  'rgba(240,168,48,0.12)',
  purple:     '#8B6CE7', purpleDim: 'rgba(139,108,231,0.12)',
};

const BELT = {
  white:'#E0E0E0', blue:'#1565C0', purple:'#7B1FA2',
  brown:'#795548', black:'#212121',
};

// ── Icon System ──
function Ic({ name, size=20, color=TK.text2, filled=false }) {
  const s = { width:size, height:size, display:'block', flexShrink:0 };
  const p = { strokeWidth:1.7, stroke:color, fill:'none', strokeLinecap:'round', strokeLinejoin:'round' };
  const pf = { ...p, fill: filled ? color : 'none' };
  const icons = {
    home: <><path d="M3 12l9-8 9 8" {...p}/><path d="M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" {...pf}/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2.5" {...pf}/><path d="M8 2v4M16 2v4M3 10h18" {...p}/></>,
    book: <><path d="M4 19.5A2.5 2.5 0 016.5 17H20" {...p}/><path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z" {...pf}/></>,
    target: <><circle cx="12" cy="12" r="9" {...p}/><circle cx="12" cy="12" r="5" {...p}/><circle cx="12" cy="12" r="1" fill={color}/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" {...pf}/><rect x="14" y="3" width="7" height="7" rx="1.5" {...pf}/><rect x="3" y="14" width="7" height="7" rx="1.5" {...pf}/><rect x="14" y="14" width="7" height="7" rx="1.5" {...pf}/></>,
    plus: <path d="M12 5v14M5 12h14" {...p} strokeWidth="2"/>,
    search: <><circle cx="11" cy="11" r="7" {...p}/><path d="M21 21l-4.35-4.35" {...p}/></>,
    chevL: <path d="M15 18l-6-6 6-6" {...p}/>,
    chevR: <path d="M9 18l6-6-6-6" {...p}/>,
    star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" {...pf}/>,
    x: <path d="M18 6L6 18M6 6l12 12" {...p} strokeWidth="2"/>,
    check: <path d="M5 12l5 5L20 7" {...p} strokeWidth="2"/>,
    clock: <><circle cx="12" cy="12" r="9" {...p}/><path d="M12 7v5l3 3" {...p}/></>,
    fire: <path d="M12 2c0 4-4 6-4 10a4 4 0 008 0c0-4-4-6-4-10z" {...pf}/>,
    trophy: <><path d="M6 4h12v6a6 6 0 01-12 0V4z" {...pf}/><path d="M6 9H4a1 1 0 01-1-1V6a1 1 0 011-1h2M18 9h2a1 1 0 001-1V6a1 1 0 00-1-1h-2" {...p}/><path d="M9 16h6M12 16v4M8 20h8" {...p}/></>,
    users: <><circle cx="9" cy="8" r="3.5" {...pf}/><path d="M2 21v-1a5 5 0 0110 0v1" {...pf}/><circle cx="17" cy="8" r="2.5" {...p}/><path d="M22 21v-.5a4 4 0 00-5-3.87" {...p}/></>,
    video: <><rect x="2" y="5" width="14" height="14" rx="2" {...pf}/><path d="M16 10l6-3v10l-6-3" {...pf}/></>,
    brain: <><path d="M12 2a5 5 0 015 5c0 2-1 3-2 4l-1 1v4h-4v-4l-1-1c-1-1-2-2-2-4a5 5 0 015-5z" {...pf}/><path d="M9 16h6M10 19h4" {...p}/></>,
    link: <><path d="M10 13a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1" {...p}/><path d="M14 11a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1" {...p}/></>,
    settings: <><circle cx="12" cy="12" r="3" {...p}/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" {...p}/></>,
    edit: <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" {...p}/>,
    trash: <><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" {...p}/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" {...p}/></>,
    sparring: <><circle cx="8" cy="6" r="2.5" {...p}/><circle cx="16" cy="6" r="2.5" {...p}/><path d="M4 20c0-3 2-5 4-5s4 2 4 5M12 20c0-3 2-5 4-5s4 2 4 5" {...p}/></>,
    belt: <><rect x="2" y="10" width="20" height="5" rx="1" {...pf}/><path d="M12 10v5M10 12.5h4" {...p}/></>,
  };
  return <svg style={s} viewBox="0 0 24 24">{icons[name]||null}</svg>;
}

// ── Belt Display ──
function BeltBar({ belt='blue', stripes=0, w=110, h=16 }) {
  const bc = BELT[belt] || BELT.white;
  return (
    <div style={{ width:w, height:h, borderRadius:h/3, background:bc, position:'relative', overflow:'hidden', boxShadow:`0 2px 8px ${bc}30` }}>
      <div style={{ position:'absolute', right:w*0.15, top:0, bottom:0, width:h*0.35, background:'#111' }}/>
      {Array.from({length:stripes}).map((_,i) => (
        <div key={i} style={{ position:'absolute', right:w*0.15+h*0.45+i*(h*0.18+2), top:'15%', bottom:'15%', width:h*0.12, background:'#fff', borderRadius:1 }}/>
      ))}
    </div>
  );
}

// ── Tag ──
function Tag({ children, color=TK.accent, bg, style:sx }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:6,
      fontSize:11, fontWeight:600, color, background:bg||`${color}18`, whiteSpace:'nowrap', flexShrink:0, ...sx }}>
      {children}
    </span>
  );
}

// ── Card ──
function Card({ children, onClick, style:sx, pad=14 }) {
  return (
    <div onClick={onClick} style={{
      background:TK.surface, borderRadius:14, padding:pad,
      border:`1px solid ${TK.border}`, cursor:onClick?'pointer':'default',
      transition:'background 0.15s', ...sx,
    }}>{children}</div>
  );
}

// ── Section Header ──
function SH({ title, action, onAction }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, padding:'0 20px' }}>
      <span style={{ fontSize:16, fontWeight:700, whiteSpace:'nowrap' }}>{title}</span>
      {action && <span onClick={onAction} style={{ fontSize:13, color:TK.accent, cursor:'pointer', fontWeight:500, whiteSpace:'nowrap', flexShrink:0 }}>{action}</span>}
    </div>
  );
}

// ── Bottom Nav ──
function NavBar({ active, onNav }) {
  const items = [
    { id:'home',   icon:'home',     label:'홈' },
    { id:'cal',    icon:'calendar', label:'캘린더' },
    { id:'techplan', icon:'book',   label:'기술/플랜' },
    { id:'clips',  icon:'video',    label:'영상' },
    { id:'coach',  icon:'brain',    label:'분석' },
  ];
  return (
    <div style={{
      position:'absolute', bottom:0, left:0, right:0, height:62,
      background:'rgba(12,13,18,0.92)', backdropFilter:'blur(20px)',
      borderTop:`1px solid ${TK.border}`, display:'flex',
      alignItems:'center', justifyContent:'space-around', zIndex:100, padding:'0 4px',
    }}>
      {items.map(it => {
        const on = active===it.id;
        return (
          <div key={it.id} onClick={()=>onNav(it.id)} style={{
            display:'flex', flexDirection:'column', alignItems:'center', gap:3,
            padding:'6px 14px', cursor:'pointer', transition:'all 0.2s',
          }}>
            <Ic name={it.icon} size={21} color={on?TK.accent:TK.text3} filled={on}/>
            <span style={{ fontSize:10, fontWeight:on?600:400, color:on?TK.accent:TK.text3 }}>{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Modal Wrapper ──
function Modal({ children, onClose, title, wide }) {
  return (
    <div onClick={onClose} style={{
      position:'absolute', inset:0, background:'rgba(0,0,0,0.6)',
      display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:200,
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:TK.surfaceUp, borderRadius:'20px 20px 0 0', width:'100%',
        maxHeight:'88%', overflowY:'auto', padding:'20px 20px 30px',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <span style={{ fontSize:18, fontWeight:700 }}>{title}</span>
          <div onClick={onClose} style={{ cursor:'pointer', padding:4 }}>
            <Ic name="x" size={20} color={TK.text2}/>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Form Field ──
function Field({ label, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <div style={{ fontSize:12, color:TK.text2, marginBottom:6, fontWeight:500 }}>{label}</div>}
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type='text', rows }) {
  const base = {
    width:'100%', padding:'10px 12px', borderRadius:10,
    border:`1px solid ${TK.borderMed}`, background:TK.surface,
    color:TK.text, fontSize:14, fontFamily:'inherit', outline:'none',
    boxSizing:'border-box',
  };
  if (rows) return <textarea style={{...base, minHeight:rows*24, resize:'vertical'}} value={value} onChange={onChange} placeholder={placeholder}/>;
  return <input style={base} type={type} value={value} onChange={onChange} placeholder={placeholder}/>;
}

function Btn({ children, primary, danger, sm, full, onClick, style:sx }) {
  const bg = primary ? TK.accent : danger ? TK.red : 'transparent';
  const c = primary || danger ? '#fff' : TK.text;
  const bd = primary || danger ? 'none' : `1px solid ${TK.borderMed}`;
  return (
    <button onClick={onClick} style={{
      padding: sm?'7px 12px':'11px 18px', borderRadius:sm?8:12,
      background:bg, color:c, border:bd, fontSize:sm?12:14,
      fontWeight:600, cursor:'pointer', fontFamily:'inherit',
      width:full?'100%':'auto', ...sx,
    }}>{children}</button>
  );
}

// ── Training Type Badge ──
function TypeBadge({ type }) {
  const m = {
    gi:    { l:'Gi', c:TK.accent, b:TK.accentDim },
    nogi:  { l:'No-Gi', c:TK.blue, b:TK.blueDim },
    comp:  { l:'대회', c:TK.amber, b:TK.amberDim },
    open:  { l:'오픈매트', c:TK.purple, b:TK.purpleDim },
  };
  const x = m[type]||m.gi;
  return <Tag color={x.c} bg={x.b}>{x.l}</Tag>;
}

// Export everything
Object.assign(window, {
  TK, BELT, Ic, BeltBar, Tag, Card, SH, NavBar, Modal, Field, Input, Btn, TypeBadge,
});
