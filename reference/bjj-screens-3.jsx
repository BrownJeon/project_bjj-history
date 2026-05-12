// ═══════════════════════════════════════════════════════
// BJJ Screens Part 3: More (Profile, Coach, Clips)
// ═══════════════════════════════════════════════════════

// ── MORE / PROFILE SCREEN ──
function MoreScreen({ onNav, onClose }) {
  const [editing, setEditing] = React.useState(false);
  const [editBelt, setEditBelt] = React.useState(null); // null | belt object | 'new'

  const [profile, setProfile] = React.useState({
    nickname:'훈련생', startDate:'2023-03-01', weightClass:'76kg', network:'BJJ 아카데미',
  });
  const [editForm, setEditForm] = React.useState({...profile});

  const [belts, setBelts] = React.useState([
    { id:1, belt:'blue', stripes:2, date:'2025-01-15', note:'블루벨트 승급' },
    { id:2, belt:'white', stripes:4, date:'2024-06-01', note:'화이트 4줄' },
    { id:3, belt:'white', stripes:0, date:'2023-03-01', note:'시작' },
  ]);

  const saveProfile = () => {
    setProfile({...editForm});
    setEditing(false);
  };

  const saveBelt = (form) => {
    if (editBelt === 'new') {
      setBelts(prev => [{ ...form, id: Date.now() }, ...prev]);
    } else {
      setBelts(prev => prev.map(b => b.id === editBelt.id ? { ...b, ...form } : b));
    }
    setEditBelt(null);
  };

  const deleteBelt = (id) => {
    setBelts(prev => prev.filter(b => b.id !== id));
    setEditBelt(null);
  };

  const currentBelt = belts[0] || { belt:'white', stripes:0 };
  const BELT_NAMES = { white:'화이트', blue:'블루', purple:'퍼플', brown:'브라운', black:'블랙' };

  return (
    <div style={{ width:'100%', height:'100%', background:TK.bg, color:TK.text,
      fontFamily:"'Noto Sans KR',-apple-system,sans-serif", display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ flex:1, overflowY:'auto', paddingBottom:20 }}>
        {/* Header */}
        <div style={{ padding:'54px 20px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0, letterSpacing:'-0.5px' }}>프로필</h1>
          <div onClick={onClose} style={{ cursor:'pointer', padding:4 }}><Ic name="x" size={20} color={TK.text2}/></div>
        </div>

        {/* Profile Header */}
        <div style={{ textAlign:'center', padding:'4px 20px 16px',
          background:`linear-gradient(180deg, ${TK.accentDim} 0%, transparent 100%)` }}>
          <div style={{ width:64, height:64, borderRadius:18, margin:'0 auto 10px',
            background:TK.surface, border:`2px solid ${TK.accent}`,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>🥋</div>
          <div style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>{profile.nickname}</div>
          <div style={{display:'flex',justifyContent:'center',marginBottom:6}}>
            <BeltBar belt={currentBelt.belt} stripes={currentBelt.stripes} w={120} h={18}/>
          </div>
          <div style={{ fontSize:12, color:TK.text2 }}>
            {profile.startDate} 시작 · 소속: {profile.network}
          </div>
        </div>

        {/* Stats */}
        <div style={{ padding:'0 20px', marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-around', padding:'14px 0' }}>
            {[{l:'수업',v:'87'},{l:'수련',v:'142일'},{l:'기술',v:'8'},{l:'체급',v:profile.weightClass}].map((s,i) => (
              <div key={i} style={{textAlign:'center'}}>
                <div style={{ fontSize:18, fontWeight:800 }}>{s.v}</div>
                <div style={{ fontSize:11, color:TK.text2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Profile Info */}
        <div style={{ padding:'0 20px', marginBottom:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <span style={{ fontSize:15, fontWeight:700 }}>기본 정보</span>
            <Btn sm onClick={()=>{setEditForm({...profile});setEditing(true);}}>수정</Btn>
          </div>
          <Card pad={14}>
            {[
              {l:'닉네임', v:profile.nickname},
              {l:'시작일', v:profile.startDate},
              {l:'체급', v:profile.weightClass},
              {l:'소속', v:profile.network},
            ].map((r,i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0',
                borderBottom:i<3?`1px solid ${TK.border}`:'none', fontSize:14 }}>
                <span style={{color:TK.text2}}>{r.l}</span>
                <span style={{fontWeight:500}}>{r.v}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* Belt History */}
        <div style={{ padding:'0 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <span style={{ fontSize:15, fontWeight:700 }}>벨트 이력</span>
            <Btn sm primary onClick={()=>setEditBelt('new')}>+ 추가</Btn>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {belts.map(b => (
              <Card key={b.id} pad={12} onClick={()=>setEditBelt(b)} style={{cursor:'pointer'}}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <BeltBar belt={b.belt} stripes={b.stripes} w={60} h={10}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{b.note}</div>
                    <div style={{ fontSize:11, color:TK.text2 }}>{b.date}</div>
                  </div>
                  <Ic name="chevR" size={16} color={TK.text3}/>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Profile Edit Modal */}
      {editing && (
        <Modal title="프로필 수정" onClose={()=>setEditing(false)}>
          <Field label="닉네임">
            <Input value={editForm.nickname} onChange={e=>setEditForm(p=>({...p,nickname:e.target.value}))} placeholder="닉네임"/>
          </Field>
          <Field label="시작일">
            <Input type="date" value={editForm.startDate} onChange={e=>setEditForm(p=>({...p,startDate:e.target.value}))}/>
          </Field>
          <Field label="체급">
            <Input value={editForm.weightClass} onChange={e=>setEditForm(p=>({...p,weightClass:e.target.value}))} placeholder="예: 76kg"/>
          </Field>
          <Field label="소속">
            <Input value={editForm.network} onChange={e=>setEditForm(p=>({...p,network:e.target.value}))} placeholder="도장/팀 이름"/>
          </Field>
          <div style={{ display:'flex', gap:8 }}>
            <Btn sm onClick={()=>setEditing(false)} style={{flex:1}}>취소</Btn>
            <Btn primary sm onClick={saveProfile} style={{flex:1}}>저장</Btn>
          </div>
        </Modal>
      )}

      {/* Belt Edit Modal */}
      {editBelt && (
        <BeltEditModal
          initial={editBelt === 'new' ? null : editBelt}
          onClose={()=>setEditBelt(null)}
          onSave={saveBelt}
          onDelete={editBelt !== 'new' ? ()=>deleteBelt(editBelt.id) : null}
          beltNames={BELT_NAMES}
        />
      )}
    </div>
  );
}

// ── Belt Edit Modal ──
function BeltEditModal({ initial, onClose, onSave, onDelete, beltNames }) {
  const [belt, setBelt] = React.useState(initial?.belt || 'white');
  const [stripes, setStripes] = React.useState(initial?.stripes || 0);
  const [date, setDate] = React.useState(initial?.date || '');
  const [note, setNote] = React.useState(initial?.note || '');

  return (
    <Modal title={initial ? '벨트 이력 수정' : '벨트 이력 추가'} onClose={onClose}>
      <Field label="벨트">
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {Object.entries(beltNames).map(([k, v]) => (
            <div key={k} onClick={()=>setBelt(k)} style={{
              padding:'8px 14px', borderRadius:8, cursor:'pointer',
              background: belt===k ? TK.accentDim : TK.surface,
              border: `1.5px solid ${belt===k ? TK.accent : TK.border}`,
              display:'flex', alignItems:'center', gap:6,
            }}>
              <BeltBar belt={k} stripes={0} w={24} h={6}/>
              <span style={{ fontSize:12, fontWeight:600, color: belt===k ? TK.accent : TK.text2 }}>{v}</span>
            </div>
          ))}
        </div>
      </Field>
      <Field label="줄 수">
        <div style={{ display:'flex', gap:6 }}>
          {[0,1,2,3,4].map(n => (
            <div key={n} onClick={()=>setStripes(n)} style={{
              width:36, height:36, borderRadius:8, cursor:'pointer',
              background: stripes===n ? TK.accentDim : TK.surface,
              border: `1.5px solid ${stripes===n ? TK.accent : TK.border}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:13, fontWeight:700, color: stripes===n ? TK.accent : TK.text2,
            }}>{n}</div>
          ))}
        </div>
      </Field>
      <Field label="날짜"><Input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field>
      <Field label="메모"><Input value={note} onChange={e=>setNote(e.target.value)} placeholder="예: 블루벨트 승급"/></Field>

      <div style={{ marginBottom:12, display:'flex', justifyContent:'center' }}>
        <BeltBar belt={belt} stripes={stripes} w={140} h={20}/>
      </div>

      <div style={{ display:'flex', gap:8 }}>
        {onDelete && <Btn danger sm onClick={onDelete}>삭제</Btn>}
        <div style={{flex:1}}/>
        <Btn sm onClick={onClose}>취소</Btn>
        <Btn primary sm onClick={()=>onSave({belt,stripes,date,note})}>저장</Btn>
      </div>
    </Modal>
  );
}
function CoachScreen({ onNav }) {
  const diag = {
    classes:5, trainedDays:5, sessions:20, minutes:100,
    tapGot:8, tapGave:12,
    weakTop: [{ name:'패스 디펜스', count:4 },{ name:'그립 파이팅', count:3 }],
  };

  return (
    <div style={{ width:'100%', height:'100%', background:TK.bg, color:TK.text,
      fontFamily:"'Noto Sans KR',-apple-system,sans-serif", display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ flex:1, overflowY:'auto', paddingBottom:80 }}>
        {/* Header */}
        <div style={{ padding:'54px 20px 12px' }}>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0, letterSpacing:'-0.5px' }}>분석</h1>
        </div>

        {/* Period */}
        <div style={{ padding:'0 20px', marginBottom:12 }}>
          <div style={{ display:'flex', gap:6 }}>
            {['7일','30일','90일'].map((p,i) => (
              <button key={i} style={{
                padding:'6px 14px', borderRadius:16, border:'none',
                background:i===1?TK.purple:TK.surfaceUp,
                color:i===1?'#fff':TK.text2,
                fontSize:12, fontWeight:600, cursor:'pointer',
              }}>{p}</button>
            ))}
          </div>
        </div>

        {/* Diagnosis */}
        <div style={{ padding:'0 20px', marginBottom:16 }}>
          <Card pad={16}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>진단 요약</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[
                { l:'수업', v:`${diag.classes}회`, c:TK.accent },
                { l:'수련일', v:`${diag.trainedDays}일`, c:TK.blue },
                { l:'스파링', v:`${diag.sessions}세션`, c:TK.red },
                { l:'탭 비율', v:`↓${diag.tapGot} ↑${diag.tapGave}`, c:TK.amber },
              ].map((s,i) => (
                <div key={i} style={{ padding:10, background:TK.surfaceUp, borderRadius:8, textAlign:'center' }}>
                  <div style={{ fontSize:16, fontWeight:800, color:s.c }}>{s.v}</div>
                  <div style={{ fontSize:11, color:TK.text2, marginTop:2 }}>{s.l}</div>
                </div>
              ))}
            </div>
            {diag.weakTop.length>0 && (
              <div style={{ marginTop:12, padding:10, background:TK.redDim, borderRadius:8 }}>
                <div style={{ fontSize:12, fontWeight:600, color:TK.red, marginBottom:4 }}>반복 약점</div>
                <div style={{ fontSize:13, color:TK.text }}>
                  {diag.weakTop.map(w=>`${w.name} (×${w.count})`).join(', ')}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Actions */}
        <div style={{ padding:'0 20px', display:'flex', gap:8, marginBottom:16 }}>
          <Btn primary sm style={{flex:1}}>+ 리포트 생성</Btn>
          <Btn primary sm style={{flex:1, background:TK.purple}}>+ 플랜 생성</Btn>
        </div>

        {/* Reports */}
        <SH title="최근 리포트"/>
        <div style={{ padding:'0 20px' }}>
          <Card pad={14} style={{marginBottom:8}}>
            <div style={{ fontSize:12, color:TK.text2, marginBottom:6 }}>2026-05-07 · 04.07 ~ 05.07</div>
            <div style={{ fontSize:13, lineHeight:1.6 }}>
              가드 패스 성공률이 향상되었습니다. 니슬라이스 패스의 성공률이 특히 좋습니다.
              백테이크 이후 RNC 마무리를 더 연습하면 좋겠습니다.
            </div>
          </Card>
        </div>
      </div>
      <NavBar active="coach" onNav={onNav}/>
    </div>
  );
}

// ── CLIPS SCREEN (standalone with nav) ──
function ClipsScreen({ onNav }) {
  const clips = [
    { id:1, title:'삼각조르기 디테일', tech:'삼각조르기', platform:'youtube', starred:true },
    { id:2, title:'니슬라이스 패스 3가지 변형', tech:'니슬라이스 패스', platform:'youtube', starred:false },
    { id:3, title:'싱글렉 엔트리', tech:'싱글렉 테이크다운', platform:'instagram', starred:true },
    { id:4, title:'RNC 피니시 디테일', tech:'리어네이키드 초크', platform:'youtube', starred:false },
  ];

  return (
    <div style={{ width:'100%', height:'100%', background:TK.bg, color:TK.text,
      fontFamily:"'Noto Sans KR',-apple-system,sans-serif", display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ flex:1, overflowY:'auto', paddingBottom:80 }}>
        <div style={{ padding:'54px 20px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0, letterSpacing:'-0.5px' }}>참고영상</h1>
          <Btn sm primary>+ 추가</Btn>
        </div>

        {/* Search */}
        <div style={{ padding:'4px 20px 12px' }}>
          <div style={{ position:'relative' }}>
            <div style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }}>
              <Ic name="search" size={16} color={TK.text3}/>
            </div>
            <input placeholder="제목·기술명 검색"
              style={{ width:'100%', padding:'10px 12px 10px 36px', borderRadius:10,
                border:`1px solid ${TK.border}`, background:TK.surface,
                color:TK.text, fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }}/>
          </div>
        </div>

        {/* Clip Cards */}
        <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap:8 }}>
          {clips.map(c => (
            <Card key={c.id} pad={12} onClick={()=>{}}>
              <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                <div style={{ width:80, height:50, borderRadius:8, background:TK.surfaceHi, flexShrink:0,
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ fontSize:20, opacity:0.5 }}>{c.platform==='youtube'?'▶':'📷'}</span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:4,
                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.title}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <Tag color={TK.accent} bg={TK.accentDim} style={{fontSize:10}}>{c.tech}</Tag>
                  </div>
                </div>
                <Ic name="star" size={18} color={c.starred?TK.amber:TK.text3} filled={c.starred}/>
              </div>
            </Card>
          ))}
        </div>
      </div>
      <NavBar active="clips" onNav={onNav}/>
    </div>
  );
}

// ── Predefined suggestion lists ──
const POS_LIST = ['클로즈드 가드','오픈 가드','하프 가드','데라히바','스파이더 가드','X가드',
  '버터플라이 가드','래소 가드','사이드 컨트롤','마운트','백 마운트','니온벨리',
  '터틀','스탠딩','하프가드 탑','50/50'];
const TECH_LIST = ['삼각조르기','암바','기무라','길로틴','RNC','옴플라타','크로스초크',
  '에제키엘','니슬라이스 패스','스매시 패스','롱스텝 패스','레그드래그','불파이터 패스',
  '힙범프 스윕','시저스윕','펜듈럼 스윕','싱글렉','더블렉','스냅다운','풋스윕',
  '백테이크','시트벨트 그립','바우앤애로우','베림볼로','언더훅 패스',
  '니쉴드 리텐션','프레임 셋업','가드 리커버리','토홀드','힐훅','스트레이트 풋락'];
const WEAK_LIST = ['패스 디펜스','그립 파이팅','포스쳐 관리','힙 무브먼트','프레임 유지',
  '테이크다운 디펜스','가드 리텐션','스크램블','체력 관리','멘탈','타이밍',
  '압박 유지','서브미션 디펜스','백 탈출','마운트 탈출'];

// ── TagPicker Component ──
function TagPicker({ label, selected, onChange, suggestions, placeholder, singleSelect }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');

  const filtered = React.useMemo(() => {
    const all = suggestions || [];
    if (!q) return all.filter(s => !selected.includes(s));
    const lq = q.toLowerCase();
    return all.filter(s => s.toLowerCase().includes(lq) && !selected.includes(s));
  }, [q, suggestions, selected]);

  const add = (val) => {
    if (singleSelect) {
      onChange([val]);
    } else {
      onChange([...selected, val]);
    }
    setQ('');
    if (singleSelect) setOpen(false);
  };
  const remove = (val) => { onChange(selected.filter(v => v !== val)); };
  const addCustom = () => {
    if (q.trim() && !selected.includes(q.trim())) {
      add(q.trim());
    }
  };

  return (
    <div style={{ marginBottom:14 }}>
      {label && <div style={{ fontSize:12, color:TK.text2, marginBottom:6, fontWeight:500 }}>{label}</div>}

      {/* Selected tags */}
      {selected.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:8 }}>
          {selected.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 8px',
              background:TK.accentDim, borderRadius:6, border:`1px solid ${TK.accent}30` }}>
              <span style={{ fontSize:12, color:TK.accent, fontWeight:600 }}>{s}</span>
              <div onClick={()=>remove(s)} style={{ cursor:'pointer', display:'flex' }}>
                <Ic name="x" size={12} color={TK.accent}/>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toggle open */}
      {!open ? (
        <div onClick={()=>setOpen(true)} style={{
          padding:'9px 12px', borderRadius:10, cursor:'pointer',
          border:`1px dashed ${TK.borderMed}`, color:TK.text3, fontSize:13,
          display:'flex', alignItems:'center', gap:6,
        }}>
          <Ic name="plus" size={14} color={TK.text3}/>
          <span>{placeholder || '추가하기'}</span>
        </div>
      ) : (
        <div style={{ background:TK.surfaceUp, borderRadius:10, border:`1px solid ${TK.borderMed}`,
          overflow:'hidden' }}>
          {/* Search input */}
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 10px',
            borderBottom:`1px solid ${TK.border}` }}>
            <Ic name="search" size={14} color={TK.text3}/>
            <input value={q} onChange={e=>setQ(e.target.value)}
              placeholder="검색 또는 직접 입력"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') addCustom(); }}
              style={{ flex:1, border:'none', background:'transparent', color:TK.text,
                fontSize:13, outline:'none', fontFamily:'inherit' }}/>
            {q.trim() && (
              <div onClick={addCustom} style={{ cursor:'pointer', padding:'3px 8px',
                background:TK.accentDim, borderRadius:5, fontSize:11, fontWeight:600, color:TK.accent }}>
                추가
              </div>
            )}
            <div onClick={()=>{setOpen(false);setQ('');}} style={{ cursor:'pointer', padding:2 }}>
              <Ic name="x" size={16} color={TK.text3}/>
            </div>
          </div>
          {/* Suggestions */}
          <div style={{ maxHeight:160, overflowY:'auto', padding:'4px 6px' }}>
            {filtered.length === 0 && !q.trim() && (
              <div style={{ padding:'10px 6px', fontSize:12, color:TK.text3, textAlign:'center' }}>
                모든 항목이 선택됨
              </div>
            )}
            {filtered.length === 0 && q.trim() && (
              <div style={{ padding:'10px 6px', fontSize:12, color:TK.text3, textAlign:'center' }}>
                "{q}" 를 직접 추가하려면 Enter 또는 추가 버튼
              </div>
            )}
            <div style={{ display:'flex', flexWrap:'wrap', gap:4, padding:'4px 2px' }}>
              {filtered.slice(0, 20).map((s, i) => (
                <div key={i} onClick={()=>add(s)} style={{
                  padding:'5px 10px', borderRadius:6, cursor:'pointer',
                  background:TK.surface, border:`1px solid ${TK.border}`,
                  fontSize:12, fontWeight:500, color:TK.text,
                  transition:'all 0.1s',
                }}>{s}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CLASS DETAIL MODAL (with TagPicker) ──
function ClassModal({ cls, onClose }) {
  if (!cls) return null;
  const isNew = cls === 'new';

  const [date, setDate] = React.useState(isNew ? '' : cls.date?.slice(0,10) || '');
  const [theme, setTheme] = React.useState(isNew ? '' : cls.theme || '');
  const [note, setNote] = React.useState(isNew ? '' : cls.note || '');
  const [pos, setPos] = React.useState(isNew ? [] : (cls.drill?.pos ? [cls.drill.pos] : []));
  const [techs, setTechs] = React.useState(isNew ? [] : (cls.drill?.tech || []));
  const [stars, setStars] = React.useState(isNew ? 0 : (cls.drill?.stars || 0));

  return (
    <Modal title={isNew ? '수업 추가' : '수업 수정'} onClose={onClose}>
      <Field label="시작일 *"><Input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field>
      <Field label="테마"><Input placeholder="예: 하프가드 위크" value={theme} onChange={e=>setTheme(e.target.value)}/></Field>
      <Field label="전체 메모">
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:6 }}>
          <Btn sm style={{ background:TK.blueDim, color:TK.blue, border:'none', fontSize:11 }}>✨ AI 보완</Btn>
        </div>
        <Input rows={3} placeholder="수업 메모, 인사이트, 깨달음" value={note} onChange={e=>setNote(e.target.value)}/>
      </Field>

      <div style={{ padding:12, background:TK.surfaceUp, borderRadius:10, marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>드릴 정보</div>
        <TagPicker label="포지션" selected={pos} onChange={setPos}
          suggestions={POS_LIST} placeholder="포지션 선택" singleSelect/>
        <TagPicker label="기술" selected={techs} onChange={setTechs}
          suggestions={TECH_LIST} placeholder="기술 추가"/>
        <Field label="난이도">
          <div style={{ display:'flex', gap:4 }}>
            {[1,2,3,4,5].map(n => (
              <div key={n} onClick={()=>setStars(n)} style={{ width:32, height:32, borderRadius:8,
                background:n<=stars?TK.accentDim:TK.surface, border:`1px solid ${n<=stars?TK.accent+'40':TK.border}`,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:14, cursor:'pointer', color:n<=stars?TK.amber:TK.text3 }}>
                {n<=stars?'★':'☆'}
              </div>
            ))}
          </div>
        </Field>
      </div>

      <div style={{ display:'flex', gap:8 }}>
        {!isNew && <Btn danger sm style={{flex:0}}>삭제</Btn>}
        <div style={{flex:1}}/>
        <Btn sm onClick={onClose}>취소</Btn>
        <Btn primary sm>저장</Btn>
      </div>
    </Modal>
  );
}

// ── SPARRING MODAL (with TagPicker) ──
function SparModal({ onClose }) {
  const [date, setDate] = React.useState('');
  const [sessions, setSessions] = React.useState([{
    level:'', opponent:'', tapGot:0, tapGave:0, time:'',
    success:[], weak:[], note:'', posScore:0,
  }]);
  const [dayNote, setDayNote] = React.useState('');

  const updateSession = (idx, key, val) => {
    setSessions(prev => prev.map((s, i) => i === idx ? { ...s, [key]: val } : s));
  };
  const addSession = () => {
    setSessions(prev => [...prev, {
      level:'', opponent:'', tapGot:0, tapGave:0, time:'',
      success:[], weak:[], note:'', posScore:0,
    }]);
  };
  const removeSession = (idx) => { setSessions(prev => prev.filter((_, i) => i !== idx)); };

  return (
    <Modal title="스파링 기록" onClose={onClose}>
      <Field label="날짜 *"><Input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field>

      <div style={{ marginBottom:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <span style={{ fontSize:14, fontWeight:700 }}>세션 ({sessions.length})</span>
          <Btn sm primary onClick={addSession}>+ 세션</Btn>
        </div>

        {sessions.map((s, idx) => (
          <div key={idx} style={{ padding:12, background:TK.surfaceUp, borderRadius:10, marginBottom:8,
            border:`1px solid ${TK.border}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <span style={{ fontSize:13, fontWeight:700 }}>세션 {idx+1}</span>
              {sessions.length > 1 && (
                <div onClick={()=>removeSession(idx)} style={{ cursor:'pointer', padding:2 }}>
                  <Ic name="x" size={16} color={TK.red}/>
                </div>
              )}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
              <Field label="상대 벨트"><Input value={s.level} onChange={e=>updateSession(idx,'level',e.target.value)} placeholder="예: 블루"/></Field>
              <Field label="상대"><Input value={s.opponent} onChange={e=>updateSession(idx,'opponent',e.target.value)} placeholder="이름/별명"/></Field>
              <Field label="탭 받음"><Input type="number" value={s.tapGot} onChange={e=>updateSession(idx,'tapGot',e.target.value)}/></Field>
              <Field label="탭 줌"><Input type="number" value={s.tapGave} onChange={e=>updateSession(idx,'tapGave',e.target.value)}/></Field>
              <Field label="시간(분)"><Input type="number" value={s.time} onChange={e=>updateSession(idx,'time',e.target.value)}/></Field>
              <Field label="포지션 점수"><Input type="number" value={s.posScore} onChange={e=>updateSession(idx,'posScore',e.target.value)}/></Field>
            </div>

            <TagPicker label="시도한 기술" selected={s.success} onChange={v=>updateSession(idx,'success',v)}
              suggestions={TECH_LIST} placeholder="시도한 기술 추가"/>

            <TagPicker label="부족했던 부분" selected={s.weak} onChange={v=>updateSession(idx,'weak',v)}
              suggestions={WEAK_LIST} placeholder="약점/개선점 추가"/>

            <Field label="세션 메모">
              <Input rows={2} value={s.note} onChange={e=>updateSession(idx,'note',e.target.value)} placeholder="이 세션에서 느낀 점"/>
            </Field>
          </div>
        ))}
      </div>

      <Field label="전체 메모 / AI 코칭">
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:6 }}>
          <Btn sm style={{ background:TK.blueDim, color:TK.blue, border:'none', fontSize:11 }}>✨ AI 코칭 분석</Btn>
        </div>
        <Input rows={3} value={dayNote} onChange={e=>setDayNote(e.target.value)} placeholder="스파링 전체 메모"/>
      </Field>

      <div style={{ display:'flex', gap:8 }}>
        <div style={{flex:1}}/>
        <Btn sm onClick={onClose}>취소</Btn>
        <Btn primary sm>저장</Btn>
      </div>
    </Modal>
  );
}

Object.assign(window, { MoreScreen, CoachScreen, ClipsScreen, BeltEditModal, ClassModal, SparModal, TagPicker,
  POS_LIST, TECH_LIST, WEAK_LIST });
