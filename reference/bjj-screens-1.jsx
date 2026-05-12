// ═══════════════════════════════════════════════════════
// BJJ Screens Part 1: Home + Calendar
// ═══════════════════════════════════════════════════════

// ── SAMPLE DATA ──
const SAMPLE_CLASSES = [
  { id:1, date:'2026-05-08', theme:'하프가드 패스', type:'gi', trained:true,
    drill:{ pos:'하프가드', tech:['언더훅 패스','니슬라이스'] },
    sparCount:3, note:'언더훅 타이밍이 핵심' },
  { id:2, date:'2026-05-06', theme:'클로즈드 가드 공격', type:'gi', trained:true,
    drill:{ pos:'클로즈드 가드', tech:['힙범프 스윕','삼각조르기'] },
    sparCount:4, note:'힙 올리는 각도 중요' },
  { id:3, date:'2026-05-05', theme:'노기 레슬링', type:'nogi', trained:true,
    drill:{ pos:'스탠딩', tech:['싱글렉','스냅다운'] },
    sparCount:5, note:'레벨 체인지 빠르게' },
  { id:4, date:'2026-05-03', theme:'백테이크 시스템', type:'gi', trained:true,
    drill:{ pos:'사이드 컨트롤', tech:['킹크랩','백테이크'] },
    sparCount:2, note:'' },
  { id:5, date:'2026-05-01', theme:'오픈매트 스파링', type:'open', trained:true,
    drill:null, sparCount:6, note:'다양한 상대와 롤링' },
];

const SAMPLE_TECHS = [
  { id:1, name:'삼각조르기', pos:'클로즈드 가드', starred:true, clips:2, note:'각도 조절이 핵심' },
  { id:2, name:'니슬라이스 패스', pos:'하프가드', starred:true, clips:1, note:'무릎으로 핀' },
  { id:3, name:'힙범프 스윕', pos:'클로즈드 가드', starred:false, clips:1, note:'' },
  { id:4, name:'기무라', pos:'클로즈드 가드', starred:false, clips:0, note:'그립 먼저' },
  { id:5, name:'싱글렉 테이크다운', pos:'스탠딩', starred:true, clips:3, note:'' },
  { id:6, name:'리어네이키드 초크', pos:'백마운트', starred:true, clips:2, note:'시트벨트 그립 유지' },
  { id:7, name:'베림볼로', pos:'데라히바', starred:false, clips:1, note:'' },
  { id:8, name:'암바', pos:'마운트', starred:false, clips:1, note:'S마운트에서 전환' },
];

// ── HOME SCREEN ──
function HomeScreen({ onNav, onOpenClass, onOpenSpar, onOpenMore }) {
  const today = new Date();
  const days = ['일','월','화','수','목','금','토'];
  const trainedDays = [1,3,5,8]; // days of month that were trained

  const weekDates = Array.from({length:7}).map((_,i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - today.getDay() + i);
    return {
      day: days[d.getDay()],
      date: d.getDate(),
      isToday: d.toDateString() === today.toDateString(),
      trained: trainedDays.includes(d.getDate()),
    };
  });

  return (
    <div style={{ width:'100%', height:'100%', background:TK.bg, color:TK.text,
      fontFamily:"'Noto Sans KR',-apple-system,sans-serif", display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ flex:1, overflowY:'auto', paddingBottom:80 }}>
        {/* Header */}
        <div style={{ padding:'54px 20px 8px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <p style={{ fontSize:13, color:TK.text2, margin:0 }}>오늘도 매트 위에서</p>
              <h1 style={{ fontSize:22, fontWeight:800, margin:'2px 0 0', letterSpacing:'-0.5px' }}>훈련 기록</h1>
            </div>
            <div onClick={()=>onOpenMore&&onOpenMore()} style={{ width:38, height:38, borderRadius:12,
              background:TK.accentDim, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
              <Ic name="users" size={18} color={TK.accent}/>
            </div>
          </div>
        </div>

        {/* Week Strip */}
        <div style={{ padding:'6px 20px 16px' }}>
          <Card pad={14}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, padding:'0 2px' }}>
              <span style={{ fontSize:13, fontWeight:600 }}>이번 주</span>
              <Tag color={TK.amber} bg={TK.amberDim}>
                <Ic name="fire" size={12} color={TK.amber} filled/> <span style={{marginLeft:3}}>12일 연속</span>
              </Tag>
            </div>
            <div style={{ display:'flex', justifyContent:'space-around' }}>
              {weekDates.map((d,i) => (
                <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
                  <span style={{ fontSize:10, color:TK.text3, fontWeight:500 }}>{d.day}</span>
                  <div style={{
                    width:30, height:30, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center',
                    background: d.isToday ? TK.accent : d.trained ? TK.accentDim : 'transparent',
                    border: !d.isToday && !d.trained ? `1px solid ${TK.border}` : 'none',
                  }}>
                    <span style={{ fontSize:12, fontWeight:d.isToday?700:500,
                      color: d.isToday?'#fff': d.trained?TK.accent:TK.text3 }}>{d.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Quick Stats */}
        <div style={{ padding:'0 20px', marginBottom:20 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
            {[
              { label:'이번 달', value:'12회', icon:'calendar', c:TK.accent },
              { label:'총 수업', value:'87회', icon:'trophy', c:TK.amber },
              { label:'기술 수', value:`${SAMPLE_TECHS.length}개`, icon:'book', c:TK.blue },
            ].map((s,i) => (
              <Card key={i} pad={12} style={{textAlign:'center'}}>
                <div style={{ width:28, height:28, borderRadius:8, background:`${s.c}15`,
                  margin:'0 auto 6px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Ic name={s.icon} size={14} color={s.c}/>
                </div>
                <div style={{ fontSize:17, fontWeight:800 }}>{s.value}</div>
                <div style={{ fontSize:10, color:TK.text2, marginTop:1 }}>{s.label}</div>
              </Card>
            ))}
          </div>
        </div>

        {/* Recent Classes */}
        <SH title="최근 수업" action="전체보기" onAction={()=>onNav('cal')}/>
        <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap:8 }}>
          {SAMPLE_CLASSES.slice(0,3).map(c => (
            <Card key={c.id} onClick={()=>onOpenClass&&onOpenClass(c)} pad={14}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                <div style={{display:'flex', alignItems:'center', gap:6}}>
                  <TypeBadge type={c.type}/>
                  <span style={{ fontSize:11, color:TK.text3 }}>{c.date.slice(5)}</span>
                </div>
                {c.sparCount>0 && <Tag color={TK.red} bg={TK.redDim}>스파링 {c.sparCount}</Tag>}
              </div>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>{c.theme}</div>
              {c.drill && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {c.drill.tech.map((t,i) => (
                    <span key={i} style={{ fontSize:11, color:TK.text2, background:TK.surfaceHi,
                      padding:'2px 7px', borderRadius:5, whiteSpace:'nowrap', flexShrink:0 }}>{t}</span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <div style={{ padding:'16px 20px 0' }}>
          <div onClick={()=>onOpenClass&&onOpenClass('new')} style={{
            padding:'14px 18px', borderRadius:14, cursor:'pointer',
            background:`linear-gradient(135deg, ${TK.accent}, ${TK.accentLt})`,
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            boxShadow:`0 4px 16px ${TK.accentGlow}`,
          }}>
            <Ic name="plus" size={20} color="#fff"/>
            <span style={{ fontSize:15, fontWeight:700, color:'#fff' }}>새 수업 기록하기</span>
          </div>
        </div>
      </div>
      <NavBar active="home" onNav={onNav}/>
    </div>
  );
}

// ── CALENDAR SCREEN ──
function CalendarScreen({ onNav, onOpenClass, onOpenSpar }) {
  const [year] = React.useState(2026);
  const [month] = React.useState(4); // May (0-indexed)
  const [selected, setSelected] = React.useState(null);

  const trainedMap = { 1:true, 3:true, 5:true, 6:true, 8:true };
  const classMap = { 1:'open', 3:'gi', 5:'nogi', 6:'gi', 8:'gi' };

  const pad = n => String(n).padStart(2,'0');
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const todayD = new Date().getDate();

  const cells = [];
  for (let i=0; i<firstDay; i++) cells.push(null);
  for (let d=1; d<=daysInMonth; d++) {
    cells.push({ day:d, trained:!!trainedMap[d], hasClass:!!classMap[d], type:classMap[d] });
  }

  const selClass = selected ? SAMPLE_CLASSES.find(c => parseInt(c.date.slice(8))===selected) : null;

  return (
    <div style={{ width:'100%', height:'100%', background:TK.bg, color:TK.text,
      fontFamily:"'Noto Sans KR',-apple-system,sans-serif", display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ flex:1, overflowY:'auto', paddingBottom:80 }}>
        <div style={{ padding:'54px 20px 8px' }}>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0, letterSpacing:'-0.5px' }}>캘린더</h1>
        </div>

        {/* Month Nav */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:24, padding:'8px 20px 12px' }}>
          <div style={{cursor:'pointer',padding:4}}><Ic name="chevL" size={20} color={TK.text2}/></div>
          <span style={{ fontSize:16, fontWeight:700 }}>{year}년 {month+1}월</span>
          <div style={{cursor:'pointer',padding:4}}><Ic name="chevR" size={20} color={TK.text2}/></div>
        </div>

        {/* Calendar Grid */}
        <div style={{ padding:'0 16px', marginBottom:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
            {['일','월','화','수','목','금','토'].map(d => (
              <div key={d} style={{ textAlign:'center', fontSize:11, color:TK.text3, padding:4, fontWeight:500 }}>{d}</div>
            ))}
            {cells.map((cell,i) => cell ? (
              <div key={i} onClick={()=>setSelected(cell.day===selected?null:cell.day)} style={{
                aspectRatio:'1', display:'flex', flexDirection:'column',
                alignItems:'center', justifyContent:'center', borderRadius:10, cursor:'pointer',
                background: cell.day===selected ? TK.accent
                  : cell.day===todayD ? TK.accentDim
                  : cell.trained ? TK.surfaceUp : 'transparent',
                border: cell.hasClass && cell.day!==selected ? `1px solid ${TK.accent}50` : `1px solid ${TK.border}`,
                position:'relative', transition:'all 0.15s',
              }}>
                <span style={{ fontSize:13, fontWeight:cell.hasClass?600:400,
                  color: cell.day===selected?'#fff': cell.day===todayD?TK.accent: cell.trained?TK.text:TK.text3 }}>
                  {cell.day}
                </span>
                {cell.trained && cell.day!==selected && (
                  <div style={{ width:4, height:4, borderRadius:2, background:TK.accent, marginTop:2 }}/>
                )}
              </div>
            ) : <div key={i}/>)}
          </div>
        </div>

        {/* Monthly Summary */}
        <div style={{ padding:'0 20px', marginBottom:16 }}>
          <Card pad={14} style={{ display:'flex', justifyContent:'space-around' }}>
            {[
              { l:'수업', v:'5회', c:TK.accent },
              { l:'수련일', v:'5일', c:TK.blue },
              { l:'스파링', v:'20회', c:TK.red },
            ].map((s,i) => (
              <div key={i} style={{textAlign:'center'}}>
                <div style={{ fontSize:18, fontWeight:800, color:s.c }}>{s.v}</div>
                <div style={{ fontSize:11, color:TK.text2, marginTop:2 }}>{s.l}</div>
              </div>
            ))}
          </Card>
        </div>

        {/* Selected Date Detail */}
        {selected && (
          <div style={{ padding:'0 20px' }}>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:10 }}>
              {month+1}월 {selected}일
            </div>
            {selClass ? (
              <Card pad={16}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ fontWeight:700 }}>{selClass.theme}</div>
                  <TypeBadge type={selClass.type}/>
                </div>
                {selClass.drill && (
                  <div style={{ fontSize:13, color:TK.text2, marginBottom:8 }}>
                    📍 {selClass.drill.pos} · {selClass.drill.tech.join(', ')}
                  </div>
                )}
                {selClass.note && <div style={{ fontSize:13, color:TK.text2, marginBottom:10 }}>{selClass.note}</div>}
                <div style={{ display:'flex', gap:8 }}>
                  <Btn primary full onClick={()=>onOpenClass&&onOpenClass(selClass)}>
                    {selClass.trained ? '✓ 수련 완료' : '수련 체크'}
                  </Btn>
                  <Btn sm onClick={(e)=>{e.stopPropagation();onOpenSpar&&onOpenSpar();}}>스파링 {selClass.sparCount}</Btn>
                </div>
              </Card>
            ) : (
              <Card pad={20} style={{textAlign:'center'}}>
                <div style={{ color:TK.text2, marginBottom:12, fontSize:13 }}>이 날짜의 기록이 없습니다</div>
                <Btn primary onClick={()=>onOpenClass&&onOpenClass('new')}>+ 수업 추가</Btn>
              </Card>
            )}
          </div>
        )}

        {/* Add Button */}
        <div style={{ padding:'16px 20px 0' }}>
          <div onClick={()=>onOpenClass&&onOpenClass('new')} style={{
            padding:'12px', borderRadius:12, cursor:'pointer', textAlign:'center',
            border:`1.5px dashed ${TK.borderMed}`, color:TK.text2, fontSize:13, fontWeight:500,
          }}>+ 수업 추가</div>
        </div>
      </div>
      <NavBar active="cal" onNav={onNav}/>
    </div>
  );
}

Object.assign(window, { HomeScreen, CalendarScreen, SAMPLE_CLASSES, SAMPLE_TECHS });
