// ═══════════════════════════════════════════════════════
// BJJ Screens Part 2: Techniques + Plans
// ═══════════════════════════════════════════════════════

// ── TECHNIQUES SCREEN ──
function TechScreen({ onNav }) {
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const [detail, setDetail] = React.useState(null);

  const list = React.useMemo(() => {
    let items = [...SAMPLE_TECHS];
    if (filter === 'star') items = items.filter(t => t.starred);
    if (filter === 'recent') items = items.sort((a, b) => b.id - a.id);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(t => t.name.toLowerCase().includes(q) || (t.pos||'').toLowerCase().includes(q));
    }
    return items;
  }, [search, filter]);

  return (
    <div style={{ width:'100%', height:'100%', background:TK.bg, color:TK.text,
      fontFamily:"'Noto Sans KR',-apple-system,sans-serif", display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ flex:1, overflowY:'auto', paddingBottom:80 }}>
        <div style={{ padding:'54px 20px 8px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0, letterSpacing:'-0.5px' }}>기술트리</h1>
          <Btn sm primary>+ 추가</Btn>
        </div>

        {/* Search */}
        <div style={{ padding:'4px 20px 8px' }}>
          <div style={{ position:'relative' }}>
            <div style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }}>
              <Ic name="search" size={16} color={TK.text3}/>
            </div>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="기술명, 포지션 검색"
              style={{ width:'100%', padding:'10px 12px 10px 36px', borderRadius:10,
                border:`1px solid ${TK.border}`, background:TK.surface,
                color:TK.text, fontSize:13, outline:'none', boxSizing:'border-box',
                fontFamily:'inherit' }}/>
          </div>
        </div>

        {/* Filters */}
        <div style={{ padding:'0 20px', marginBottom:12 }}>
          <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }}>
            {[{ id:'all', l:'전체' },{ id:'recent', l:'🕐 최신순' },{ id:'star', l:'⭐ 즐겨찾기' },
            ].map(f => (
              <button key={f.id} onClick={()=>setFilter(f.id)}
                style={{
                  padding:'6px 12px', borderRadius:16, border:'none', whiteSpace:'nowrap',
                  background: filter===f.id ? TK.accent : TK.surfaceUp,
                  color: filter===f.id ? '#fff' : TK.text2,
                  fontSize:12, fontWeight:600, cursor:'pointer', flexShrink:0,
                }}>{f.l}</button>
            ))}
          </div>
        </div>

        {/* Tech List */}
        <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap:8 }}>
          {list.length===0 ? (
            <div style={{ textAlign:'center', color:TK.text2, padding:40, fontSize:13 }}>기술이 없습니다</div>
          ) : list.map(t => (
            <Card key={t.id} onClick={()=>setDetail(t)} pad={14}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                    {t.starred && <Ic name="star" size={14} color={TK.amber} filled/>}
                    <span style={{ fontSize:14, fontWeight:700 }}>{t.name}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                    {t.pos && <Tag color={TK.blue} bg={TK.blueDim}>{t.pos}</Tag>}
                    {t.clips>0 && <Tag color={TK.purple} bg={TK.purpleDim}>🎬 {t.clips}</Tag>}
                  </div>
                </div>
                <Ic name="chevR" size={18} color={TK.text3}/>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      {detail && (
        <Modal title={detail.name} onClose={()=>setDetail(null)}>
          <div style={{ display:'flex', gap:6, marginBottom:12 }}>
            {detail.pos && <Tag color={TK.blue} bg={TK.blueDim}>{detail.pos}</Tag>}
            {detail.starred && <Tag color={TK.amber} bg={TK.amberDim}>⭐ 즐겨찾기</Tag>}
          </div>
          {detail.note && (
            <div style={{ padding:12, background:TK.surface, borderRadius:10,
              fontSize:13, color:TK.text2, lineHeight:1.6, marginBottom:12 }}>
              {detail.note}
            </div>
          )}
          {detail.clips>0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:13, color:TK.text2, marginBottom:6 }}>참고 영상 ({detail.clips})</div>
              {Array.from({length:detail.clips}).map((_,i) => (
                <div key={i} style={{ padding:10, background:TK.surface, borderRadius:8, marginBottom:6,
                  display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                  <div style={{ width:48, height:32, borderRadius:4, background:TK.surfaceHi,
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{fontSize:14}}>▶</span>
                  </div>
                  <span style={{ fontSize:13, fontWeight:500 }}>{detail.name} 영상 {i+1}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display:'flex', gap:8 }}>
            <Btn sm style={{flex:1, color:TK.red}}>삭제</Btn>
            <Btn sm style={{flex:1}}>수정</Btn>
            <Btn primary sm style={{flex:1}}>닫기</Btn>
          </div>
        </Modal>
      )}

      <NavBar active="techplan" onNav={onNav}/>
    </div>
  );
}

// ── CHAIN FLOW DATA ──
const CHAIN_FLOWS = [
  {
    id:1, name:'클가 삼각 → 암바 체인', note:'삼각 실패시 암바로 전환',
    startPos:'클로즈드 가드',
    nodes: [
      { id:'n1', label:'클로즈드 가드', type:'start', x:0, y:0 },
      { id:'n2', label:'삼각 셋업', type:'action', x:0, y:1, detail:'한쪽 팔 크로스 그립 → 힙 올리기 → 다리 걸기' },
      { id:'n3', label:'삼각 완성', type:'finish', x:-1, y:2, detail:'각도 30도 조절 → 다리 당김 → 탭' },
      { id:'n4', label:'포스쳐 올림', type:'reaction', x:1, y:2, detail:'상대가 머리를 들고 자세를 세움' },
      { id:'n5', label:'암바 전환', type:'action', x:1, y:3, detail:'다리 피벗 → 상대 팔 핀치 → 힙 올리기' },
      { id:'n6', label:'암바 피니시', type:'finish', x:0, y:4, detail:'힙 밀착 → 천천히 신전 → 탭' },
      { id:'n7', label:'팔 빼냄', type:'reaction', x:2, y:4, detail:'상대가 팔을 빼서 탈출 시도' },
      { id:'n8', label:'옴플라타', type:'action', x:2, y:5, detail:'다리 넘기기 → 상대 팔 언더훅' },
      { id:'n9', label:'옴플 피니시', type:'finish', x:2, y:6, detail:'상대 팔 고정 → 앞으로 숙이기 → 탭' },
      { id:'n10', label:'가드 리텐션', type:'escape', x:-1, y:5, detail:'실패시 가드로 복귀' },
    ],
    edges: [
      { from:'n1', to:'n2', label:'그립 확보', type:'default' },
      { from:'n2', to:'n3', label:'성공', type:'success' },
      { from:'n2', to:'n4', label:'실패', type:'fail' },
      { from:'n4', to:'n5', label:'전환', type:'default' },
      { from:'n5', to:'n6', label:'성공', type:'success' },
      { from:'n5', to:'n7', label:'실패', type:'fail' },
      { from:'n7', to:'n8', label:'전환', type:'default' },
      { from:'n8', to:'n9', label:'성공', type:'success' },
      { from:'n3', to:'n10', label:'실패시', type:'fail' },
      { from:'n6', to:'n10', label:'실패시', type:'fail' },
    ],
  },
  {
    id:2, name:'하프가드 패스 시퀀스', note:'상대 반응에 따라 패스 기술 선택',
    startPos:'하프가드 탑',
    nodes: [
      { id:'n1', label:'하프가드 탑', type:'start', x:0, y:0 },
      { id:'n2', label:'크로스페이스', type:'action', x:0, y:1, detail:'언더훅 킬 + 크로스페이스로 상대 고정' },
      { id:'n3', label:'프레임 만듦', type:'reaction', x:-1, y:2, detail:'상대가 팔로 프레임을 세움' },
      { id:'n4', label:'니쉴드 전환', type:'reaction', x:1, y:2, detail:'상대가 무릎을 세워 방어' },
      { id:'n5', label:'니슬라이스', type:'action', x:-1, y:3, detail:'무릎으로 상대 힙 차단 후 슬라이딩' },
      { id:'n6', label:'스매시 패스', type:'action', x:1, y:3, detail:'체중 실어 상대 무릎 넘기기' },
      { id:'n7', label:'사이드 컨트롤', type:'finish', x:0, y:4, detail:'패스 성공 → 사이드 컨트롤 확보' },
      { id:'n8', label:'하프 리커버리', type:'reaction', x:2, y:4, detail:'상대가 다시 하프가드 회복' },
      { id:'n9', label:'레그드래그', type:'action', x:2, y:5, detail:'상대 다리 끌어당겨 옆으로 눕히기' },
    ],
    edges: [
      { from:'n1', to:'n2', label:'압박', type:'default' },
      { from:'n2', to:'n3', label:'반응 A', type:'default' },
      { from:'n2', to:'n4', label:'반응 B', type:'default' },
      { from:'n3', to:'n5', label:'전환', type:'default' },
      { from:'n4', to:'n6', label:'전환', type:'default' },
      { from:'n5', to:'n7', label:'성공', type:'success' },
      { from:'n6', to:'n7', label:'성공', type:'success' },
      { from:'n5', to:'n8', label:'실패', type:'fail' },
      { from:'n6', to:'n8', label:'실패', type:'fail' },
      { from:'n8', to:'n9', label:'전환', type:'default' },
      { from:'n9', to:'n7', label:'성공', type:'success' },
    ],
  },
];

// ── Chain Flow Visualization ──
function ChainFlowView({ chain, onBack }) {
  const [activeNode, setActiveNode] = React.useState(null);

  const nodeColors = {
    start:    { bg:TK.blueDim, border:TK.blue, text:TK.blue },
    action:   { bg:TK.accentDim, border:TK.accent, text:TK.accent },
    finish:   { bg:TK.amberDim, border:TK.amber, text:TK.amber },
    reaction: { bg:TK.purpleDim, border:TK.purple, text:TK.purple },
    escape:   { bg:TK.redDim, border:TK.red, text:TK.red },
  };
  const edgeCol = { success:TK.accent, fail:TK.red, default:TK.text3 };
  const typeLabel = { start:'시작', action:'기술', finish:'피니시', reaction:'상대반응', escape:'탈출' };
  const typeIcon = { start:'▶', action:'⚡', finish:'🏁', reaction:'👤', escape:'↩' };

  const CW=116, CH=76, OX=165, OY=36, NW=104, NH=48;
  const nPos = n => ({ cx:OX+n.x*CW, cy:OY+n.y*CH });
  const nodeById = {}; chain.nodes.forEach(n=>{ nodeById[n.id]=n; });

  const allP = chain.nodes.map(nPos);
  const minX = Math.min(...allP.map(p=>p.cx)) - NW/2 - 16;
  const maxX = Math.max(...allP.map(p=>p.cx)) + NW/2 + 16;
  const maxY = Math.max(...allP.map(p=>p.cy)) + NH + 24;
  const svgW = maxX - minX;

  return (
    <div style={{ width:'100%', height:'100%', background:TK.bg, color:TK.text,
      fontFamily:"'Noto Sans KR',-apple-system,sans-serif", display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'58px 20px 12px', display:'flex', alignItems:'center', gap:10,
        borderBottom:`1px solid ${TK.border}`, flexShrink:0 }}>
        <div onClick={onBack} style={{ cursor:'pointer', padding:4 }}><Ic name="chevL" size={20} color={TK.text2}/></div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15, fontWeight:700 }}>{chain.name}</div>
          <div style={{ fontSize:11, color:TK.text2 }}>📍 {chain.startPos}</div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ padding:'8px 16px 4px', display:'flex', gap:8, flexWrap:'wrap', flexShrink:0 }}>
        {['start','action','finish','reaction','escape'].map(t => {
          const c = nodeColors[t];
          return (
            <div key={t} style={{ display:'flex', alignItems:'center', gap:3 }}>
              <div style={{ width:8, height:8, borderRadius:2, background:c.bg, border:`1px solid ${c.border}` }}/>
              <span style={{ fontSize:9, color:TK.text2 }}>{typeLabel[t]}</span>
            </div>
          );
        })}
        <div style={{ display:'flex', alignItems:'center', gap:3 }}>
          <div style={{ width:12, borderTop:`1.5px solid ${TK.accent}` }}/><span style={{fontSize:9,color:TK.text2}}>성공</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:3 }}>
          <div style={{ width:12, borderTop:`1.5px dashed ${TK.red}` }}/><span style={{fontSize:9,color:TK.text2}}>실패</span>
        </div>
      </div>

      {/* Flow */}
      <div style={{ flex:1, overflowY:'auto', overflowX:'auto', padding:'16px 4px 20px' }}>
        <svg width={svgW} height={maxY} style={{ display:'block', margin:'0 auto' }}>
          {/* Edges */}
          {chain.edges.map((e,idx) => {
            const fn=nodeById[e.from], tn=nodeById[e.to];
            if(!fn||!tn) return null;
            const fp=nPos(fn), tp=nPos(tn);
            const x1=fp.cx-minX, y1=fp.cy+NH/2;
            const x2=tp.cx-minX, y2=tp.cy-NH/2+4;
            const my=(y1+y2)/2;
            const col=edgeCol[e.type]||edgeCol.default;
            const dash=e.type==='fail'?'4,3':'none';
            const lx=(x1+x2)/2, ly=my-5;
            return (
              <g key={idx}>
                <path d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`}
                  stroke={col} strokeWidth="1.5" fill="none" strokeDasharray={dash} opacity={0.65}/>
                <circle cx={x2} cy={y2} r="2.5" fill={col} opacity={0.7}/>
                {e.label && (
                  <g>
                    <rect x={lx-16} y={ly-7} width={32} height={13} rx={4} fill={TK.bg} stroke={col} strokeWidth="0.5" opacity={0.9}/>
                    <text x={lx} y={ly+3} textAnchor="middle" fill={col} fontSize="8" fontWeight="600" fontFamily="'Noto Sans KR',sans-serif">{e.label}</text>
                  </g>
                )}
              </g>
            );
          })}
          {/* Nodes */}
          {chain.nodes.map(n => {
            const pos=nPos(n);
            const x=pos.cx-minX-NW/2, y=pos.cy-NH/2+4;
            const c=nodeColors[n.type]||nodeColors.action;
            const on=activeNode?.id===n.id;
            return (
              <g key={n.id} onClick={()=>setActiveNode(on?null:n)} style={{cursor:'pointer'}}>
                {on && <rect x={x-2} y={y-2} width={NW+4} height={NH+4} rx={13} fill="none" stroke={c.border} strokeWidth="2" opacity={0.4}/>}
                <rect x={x} y={y} width={NW} height={NH} rx={11} fill={c.bg} stroke={c.border} strokeWidth={on?1.5:0.8} opacity={on?1:0.85}/>
                <text x={x+NW/2} y={y+14} textAnchor="middle" fill={c.text} fontSize="8" fontWeight="600">{typeIcon[n.type]} {typeLabel[n.type]}</text>
                <text x={x+NW/2} y={y+30} textAnchor="middle" fill={TK.text} fontSize="10" fontWeight="700" fontFamily="'Noto Sans KR',sans-serif">
                  {n.label.length>8?n.label.slice(0,8)+'…':n.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Detail card */}
        {activeNode && (
          <div style={{ margin:'8px 12px 0', padding:14, background:TK.surfaceUp, borderRadius:12,
            border:`1px solid ${(nodeColors[activeNode.type]||nodeColors.action).border}30` }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
              <Tag color={(nodeColors[activeNode.type]).text} bg={(nodeColors[activeNode.type]).bg}>
                {typeLabel[activeNode.type]}
              </Tag>
              <span style={{ fontSize:14, fontWeight:700 }}>{activeNode.label}</span>
            </div>
            {activeNode.detail && (
              <div style={{ fontSize:12, color:TK.text2, lineHeight:1.6, marginBottom:8 }}>{activeNode.detail}</div>
            )}
            {chain.edges.filter(e=>e.from===activeNode.id).length>0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {chain.edges.filter(e=>e.from===activeNode.id).map((e,i) => {
                  const to=nodeById[e.to]; const col=edgeCol[e.type]||edgeCol.default;
                  return (
                    <div key={i} onClick={ev=>{ev.stopPropagation();setActiveNode(to);}}
                      style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px',
                      background:TK.surface, borderRadius:8, cursor:'pointer' }}>
                      <div style={{ width:6, height:6, borderRadius:3, background:col }}/>
                      <span style={{ fontSize:11, color:col, fontWeight:600 }}>{e.label||'→'}</span>
                      <span style={{ fontSize:11, color:TK.text }}>{to?.label}</span>
                      <div style={{marginLeft:'auto'}}><Ic name="chevR" size={14} color={TK.text3}/></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {chain.note && (
          <div style={{ margin:'8px 12px', padding:10, background:TK.surface, borderRadius:8 }}>
            <div style={{ fontSize:11, color:TK.text2, lineHeight:1.5 }}>💡 {chain.note}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chain Editor Screen ──
function ChainEditor({ onBack, onSave }) {
  const [name, setName] = React.useState('');
  const [startPos, setStartPos] = React.useState('');
  const [note, setNote] = React.useState('');
  const [nodes, setNodes] = React.useState([
    { id:'n1', label:'', type:'start', detail:'' },
  ]);
  const [edges, setEdges] = React.useState([]);
  const [addEdgeMode, setAddEdgeMode] = React.useState(null); // {from:'n1'}

  const nodeId = () => 'n' + Date.now() + Math.random().toString(36).slice(2,5);

  const addNode = (type) => {
    setNodes(prev => [...prev, { id:nodeId(), label:'', type, detail:'' }]);
  };
  const removeNode = (id) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.from !== id && e.to !== id));
  };
  const updateNode = (id, key, val) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, [key]: val } : n));
  };
  const addEdge = (from, to, type='default', label='') => {
    if (from === to) return;
    if (edges.find(e => e.from === from && e.to === to)) return;
    setEdges(prev => [...prev, { from, to, type, label }]);
    setAddEdgeMode(null);
  };
  const removeEdge = (idx) => {
    setEdges(prev => prev.filter((_, i) => i !== idx));
  };
  const updateEdge = (idx, key, val) => {
    setEdges(prev => prev.map((e, i) => i === idx ? { ...e, [key]: val } : e));
  };

  const typeConf = {
    start:    { label:'시작', color:TK.blue, bg:TK.blueDim, icon:'▶' },
    action:   { label:'기술', color:TK.accent, bg:TK.accentDim, icon:'⚡' },
    finish:   { label:'피니시', color:TK.amber, bg:TK.amberDim, icon:'🏁' },
    reaction: { label:'상대반응', color:TK.purple, bg:TK.purpleDim, icon:'👤' },
    escape:   { label:'탈출', color:TK.red, bg:TK.redDim, icon:'↩' },
  };

  const handleSave = () => {
    if (!name.trim()) return alert('체인 이름을 입력해주세요');
    if (nodes.length < 2) return alert('최소 2개 노드를 추가해주세요');
    const emptyNode = nodes.find(n => !n.label.trim());
    if (emptyNode) return alert('모든 노드의 이름을 입력해주세요');
    // Auto-layout: assign x/y based on edges
    const laid = autoLayout(nodes, edges);
    onSave({ name:name.trim(), startPos, note, nodes:laid, edges });
  };

  // Simple auto-layout: BFS from start node
  function autoLayout(ns, es) {
    const byId = {}; ns.forEach(n => { byId[n.id] = {...n, x:0, y:0}; });
    const children = {};
    es.forEach(e => { if (!children[e.from]) children[e.from] = []; children[e.from].push(e.to); });
    const startN = ns.find(n => n.type === 'start') || ns[0];
    const visited = new Set();
    const queue = [{ id: startN.id, y:0, x:0 }];
    const ySlots = {};
    while (queue.length) {
      const { id, y, x } = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      byId[id].y = y;
      byId[id].x = x;
      const kids = children[id] || [];
      const startX = -Math.floor((kids.length-1)/2);
      kids.forEach((kid, i) => {
        if (!visited.has(kid)) queue.push({ id:kid, y:y+1, x:startX+i });
      });
    }
    // Nodes with no edges
    let orphanY = Math.max(...ns.map(n => byId[n.id].y || 0)) + 1;
    ns.forEach(n => { if (!visited.has(n.id)) { byId[n.id].y = orphanY; orphanY++; } });
    return ns.map(n => byId[n.id]);
  }

  return (
    <div style={{ width:'100%', height:'100%', background:TK.bg, color:TK.text,
      fontFamily:"'Noto Sans KR',-apple-system,sans-serif", display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'58px 20px 12px', display:'flex', alignItems:'center', gap:10,
        borderBottom:`1px solid ${TK.border}`, flexShrink:0 }}>
        <div onClick={onBack} style={{ cursor:'pointer', padding:4 }}><Ic name="chevL" size={20} color={TK.text2}/></div>
        <span style={{ flex:1, fontSize:16, fontWeight:700 }}>체인 등록</span>
        <Btn sm primary onClick={handleSave}>저장</Btn>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'14px 20px 30px' }}>
        {/* Basic Info */}
        <Field label="체인 이름 *">
          <Input value={name} onChange={e=>setName(e.target.value)} placeholder="예: 클가 삼각 → 암바 체인"/>
        </Field>
        <Field label="시작 포지션">
          <Input value={startPos} onChange={e=>setStartPos(e.target.value)} placeholder="예: 클로즈드 가드"/>
        </Field>
        <Field label="설명 (선택)">
          <Input rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="체인에 대한 간단한 설명"/>
        </Field>

        {/* Nodes */}
        <div style={{ marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <span style={{ fontSize:14, fontWeight:700 }}>노드 ({nodes.length})</span>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {nodes.map((n, idx) => {
              const tc = typeConf[n.type];
              return (
                <div key={n.id} style={{ padding:12, background:TK.surfaceUp, borderRadius:12,
                  border:`1px solid ${tc.color}25` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <Tag color={tc.color} bg={tc.bg}>{tc.icon} {tc.label}</Tag>
                    <span style={{ fontSize:11, color:TK.text3 }}>#{idx+1}</span>
                    {nodes.length > 1 && n.type !== 'start' && (
                      <div onClick={()=>removeNode(n.id)} style={{ marginLeft:'auto', cursor:'pointer', padding:2 }}>
                        <Ic name="trash" size={15} color={TK.red}/>
                      </div>
                    )}
                  </div>
                  <Input value={n.label} onChange={e=>updateNode(n.id,'label',e.target.value)}
                    placeholder={`${tc.label} 이름 (예: ${n.type==='start'?'클로즈드 가드':n.type==='action'?'삼각조르기':n.type==='finish'?'탭 아웃':n.type==='reaction'?'포스쳐 올림':'가드 리텐션'})`}/>
                  <div style={{ marginTop:6 }}>
                    <Input value={n.detail} onChange={e=>updateNode(n.id,'detail',e.target.value)}
                      placeholder="디테일 설명 (선택)"/>
                  </div>
                  {/* Edge add button */}
                  <div style={{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap' }}>
                    {addEdgeMode?.from === n.id ? (
                      <div style={{ fontSize:12, color:TK.accent, fontWeight:600, padding:'4px 0' }}>
                        ↓ 연결할 노드를 선택하세요
                      </div>
                    ) : (
                      <div onClick={()=>setAddEdgeMode({from:n.id})}
                        style={{ fontSize:11, color:TK.accent, cursor:'pointer', padding:'4px 8px',
                          background:TK.accentDim, borderRadius:6, fontWeight:600 }}>
                        + 전환 연결
                      </div>
                    )}
                  </div>
                  {/* Target selection when in edge mode */}
                  {addEdgeMode?.from === n.id && (
                    <div style={{ marginTop:6, display:'flex', flexDirection:'column', gap:4 }}>
                      {nodes.filter(t => t.id !== n.id).map(t => {
                        const ttc = typeConf[t.type];
                        return (
                          <div key={t.id} style={{ display:'flex', gap:6, alignItems:'center' }}>
                            <div onClick={()=>addEdge(n.id, t.id, 'success', '성공')}
                              style={{ flex:1, padding:'6px 8px', background:TK.accentDim, borderRadius:6,
                                cursor:'pointer', fontSize:11, fontWeight:600, color:TK.accent, textAlign:'center' }}>
                              ✓ {t.label || ttc.label}
                            </div>
                            <div onClick={()=>addEdge(n.id, t.id, 'fail', '실패')}
                              style={{ flex:1, padding:'6px 8px', background:TK.redDim, borderRadius:6,
                                cursor:'pointer', fontSize:11, fontWeight:600, color:TK.red, textAlign:'center' }}>
                              ✗ {t.label || ttc.label}
                            </div>
                            <div onClick={()=>addEdge(n.id, t.id, 'default', '')}
                              style={{ padding:'6px 8px', background:TK.surfaceHi, borderRadius:6,
                                cursor:'pointer', fontSize:11, fontWeight:500, color:TK.text2 }}>
                              →
                            </div>
                          </div>
                        );
                      })}
                      <div onClick={()=>setAddEdgeMode(null)}
                        style={{ fontSize:11, color:TK.text3, cursor:'pointer', textAlign:'center', padding:4 }}>
                        취소
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add node buttons */}
          <div style={{ marginTop:10, display:'flex', gap:6, flexWrap:'wrap' }}>
            {[
              { type:'action', label:'+ 기술', color:TK.accent, bg:TK.accentDim },
              { type:'reaction', label:'+ 상대반응', color:TK.purple, bg:TK.purpleDim },
              { type:'finish', label:'+ 피니시', color:TK.amber, bg:TK.amberDim },
              { type:'escape', label:'+ 탈출', color:TK.red, bg:TK.redDim },
            ].map(b => (
              <div key={b.type} onClick={()=>addNode(b.type)}
                style={{ padding:'7px 12px', borderRadius:8, cursor:'pointer',
                  background:b.bg, color:b.color, fontSize:12, fontWeight:600 }}>
                {b.label}
              </div>
            ))}
          </div>
        </div>

        {/* Edges Summary */}
        {edges.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <span style={{ fontSize:14, fontWeight:700, display:'block', marginBottom:8 }}>전환 ({edges.length})</span>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {edges.map((e, idx) => {
                const fn = nodes.find(n => n.id === e.from);
                const tn = nodes.find(n => n.id === e.to);
                const col = e.type==='success'?TK.accent:e.type==='fail'?TK.red:TK.text2;
                return (
                  <div key={idx} style={{ padding:10, background:TK.surfaceUp, borderRadius:8,
                    display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:6, height:6, borderRadius:3, background:col, flexShrink:0 }}/>
                    <span style={{ fontSize:12, flex:1 }}>
                      <span style={{fontWeight:600}}>{fn?.label||'?'}</span>
                      <span style={{color:TK.text3}}> → </span>
                      <span style={{fontWeight:600}}>{tn?.label||'?'}</span>
                    </span>
                    {/* Edge type selector */}
                    <select value={e.type} onChange={ev=>updateEdge(idx,'type',ev.target.value)}
                      style={{ padding:'3px 6px', borderRadius:6, border:`1px solid ${TK.border}`,
                        background:TK.surface, color:TK.text, fontSize:11 }}>
                      <option value="success">성공</option>
                      <option value="fail">실패</option>
                      <option value="default">기본</option>
                    </select>
                    <div onClick={()=>removeEdge(idx)} style={{cursor:'pointer',padding:2}}>
                      <Ic name="x" size={14} color={TK.text3}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Preview hint */}
        <div style={{ padding:12, background:TK.surfaceUp, borderRadius:10, textAlign:'center' }}>
          <div style={{ fontSize:12, color:TK.text2, lineHeight:1.5 }}>
            💡 저장하면 자동으로 플로우차트가 생성됩니다
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TECHNIQUE CHAIN DATA (simple combo sequences from registered techs) ──
const SAMPLE_CHAINS = [
  { id:1, name:'클가 삼각→암바 콤보', note:'삼각 실패시 암바로 이어가는 기본 콤보',
    techs:['클로즈드 가드 컨트롤','삼각조르기 셋업','암바 전환','암바 피니시'] },
  { id:2, name:'하프가드 스윕→패스', note:'보텀에서 탑 포지션까지',
    techs:['하프가드 언더훅','독드립 스윕','니슬라이스 패스','사이드 컨트롤'] },
  { id:3, name:'백테이크 피니시 루틴', note:'백 잡은 후 마무리 시퀀스',
    techs:['시트벨트 그립','바디 트라이앵글','RNC 셋업','리어네이키드 초크'] },
];

// ── Chain Detail View (simple sequence) ──
function ChainDetailView({ chain, onBack }) {
  return (
    <div style={{ width:'100%', height:'100%', background:TK.bg, color:TK.text,
      fontFamily:"'Noto Sans KR',-apple-system,sans-serif", display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ padding:'58px 20px 12px', display:'flex', alignItems:'center', gap:10,
        borderBottom:`1px solid ${TK.border}`, flexShrink:0 }}>
        <div onClick={onBack} style={{ cursor:'pointer', padding:4 }}><Ic name="chevL" size={20} color={TK.text2}/></div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:700 }}>{chain.name}</div>
          {chain.note && <div style={{ fontSize:11, color:TK.text2 }}>{chain.note}</div>}
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px 30px' }}>
        <div style={{ fontSize:13, fontWeight:600, color:TK.text2, marginBottom:14 }}>
          {chain.techs.length}개 기술 콤비네이션
        </div>
        {/* Vertical timeline */}
        <div style={{ position:'relative', paddingLeft:28 }}>
          {/* Vertical line */}
          <div style={{ position:'absolute', left:11, top:8, bottom:8, width:2,
            background:`linear-gradient(to bottom, ${TK.accent}, ${TK.accent}20)`, borderRadius:1 }}/>
          {chain.techs.map((t, i) => {
            const isLast = i === chain.techs.length - 1;
            const isFirst = i === 0;
            // Try to find matching registered tech
            const matched = SAMPLE_TECHS.find(st => st.name === t || t.includes(st.name));
            return (
              <div key={i} style={{ marginBottom: isLast ? 0 : 20, position:'relative' }}>
                {/* Node dot */}
                <div style={{
                  position:'absolute', left:-28+5, top:6, width:14, height:14, borderRadius:7,
                  background: isLast ? TK.amber : isFirst ? TK.blue : TK.accent,
                  border: `3px solid ${TK.bg}`,
                  boxShadow: `0 0 0 2px ${isLast ? TK.amber : isFirst ? TK.blue : TK.accent}40`,
                }}/>
                {/* Step number */}
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{
                    fontSize:10, fontWeight:700, color: isLast ? TK.amber : isFirst ? TK.blue : TK.accent,
                    background: isLast ? TK.amberDim : isFirst ? TK.blueDim : TK.accentDim,
                    padding:'2px 6px', borderRadius:4,
                  }}>STEP {i+1}</span>
                  {isFirst && <Tag color={TK.blue} bg={TK.blueDim} style={{fontSize:9}}>시작</Tag>}
                  {isLast && <Tag color={TK.amber} bg={TK.amberDim} style={{fontSize:9}}>피니시</Tag>}
                </div>
                {/* Tech card */}
                <Card pad={12} style={{ marginLeft:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>{t}</div>
                  {matched && (
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      {matched.pos && <Tag color={TK.blue} bg={TK.blueDim} style={{fontSize:10}}>{matched.pos}</Tag>}
                      {matched.clips > 0 && <Tag color={TK.purple} bg={TK.purpleDim} style={{fontSize:10}}>🎬 {matched.clips}</Tag>}
                    </div>
                  )}
                  {matched?.note && (
                    <div style={{ fontSize:12, color:TK.text2, marginTop:6, lineHeight:1.5 }}>{matched.note}</div>
                  )}
                </Card>
                {/* Transition arrow */}
                {!isLast && (
                  <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:6, paddingLeft:4 }}>
                    <span style={{ fontSize:10, color:TK.text3 }}>↓ 다음 기술로 전환</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Chain Editor (simple: pick techs from registered list) ──
function SimpleChainEditor({ onBack, onSave }) {
  const [name, setName] = React.useState('');
  const [note, setNote] = React.useState('');
  const [techs, setTechs] = React.useState([]);
  const [showPicker, setShowPicker] = React.useState(false);
  const [searchQ, setSearchQ] = React.useState('');

  const filteredTechs = React.useMemo(() => {
    if (!searchQ) return SAMPLE_TECHS;
    const q = searchQ.toLowerCase();
    return SAMPLE_TECHS.filter(t => t.name.toLowerCase().includes(q) || (t.pos||'').toLowerCase().includes(q));
  }, [searchQ]);

  const addTech = (techName) => {
    setTechs(prev => [...prev, techName]);
    setShowPicker(false);
    setSearchQ('');
  };
  const removeTech = (idx) => { setTechs(prev => prev.filter((_, i) => i !== idx)); };
  const moveTech = (idx, dir) => {
    setTechs(prev => {
      const arr = [...prev];
      const ni = idx + dir;
      if (ni < 0 || ni >= arr.length) return arr;
      [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
      return arr;
    });
  };

  const handleSave = () => {
    if (!name.trim()) return alert('체인 이름을 입력해주세요');
    if (techs.length < 2) return alert('최소 2개 기술을 추가해주세요');
    onSave({ name: name.trim(), note, techs });
  };

  return (
    <div style={{ width:'100%', height:'100%', background:TK.bg, color:TK.text,
      fontFamily:"'Noto Sans KR',-apple-system,sans-serif", display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ padding:'58px 20px 12px', display:'flex', alignItems:'center', gap:10,
        borderBottom:`1px solid ${TK.border}`, flexShrink:0 }}>
        <div onClick={onBack} style={{ cursor:'pointer', padding:4 }}><Ic name="chevL" size={20} color={TK.text2}/></div>
        <span style={{ flex:1, fontSize:16, fontWeight:700 }}>체인 등록</span>
        <Btn sm primary onClick={handleSave}>저장</Btn>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'14px 20px 30px' }}>
        <Field label="체인 이름 *">
          <Input value={name} onChange={e=>setName(e.target.value)} placeholder="예: 클가 삼각→암바 콤보"/>
        </Field>
        <Field label="설명 (선택)">
          <Input rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="이 콤비네이션에 대한 간단한 설명"/>
        </Field>

        {/* Tech sequence */}
        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <span style={{ fontSize:14, fontWeight:700 }}>기술 순서 ({techs.length})</span>
          </div>

          {techs.length === 0 ? (
            <div style={{ padding:20, textAlign:'center', color:TK.text3, fontSize:13,
              border:`1.5px dashed ${TK.border}`, borderRadius:12 }}>
              아래 버튼으로 기술을 추가하세요
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {techs.map((t, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:10,
                  background:TK.surfaceUp, borderRadius:10, border:`1px solid ${TK.border}` }}>
                  <div style={{
                    width:24, height:24, borderRadius:7, flexShrink:0, display:'flex',
                    alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700,
                    background: i===0 ? TK.blueDim : i===techs.length-1 ? TK.amberDim : TK.accentDim,
                    color: i===0 ? TK.blue : i===techs.length-1 ? TK.amber : TK.accent,
                  }}>{i+1}</div>
                  <span style={{ flex:1, fontSize:13, fontWeight:600 }}>{t}</span>
                  <div style={{ display:'flex', gap:2 }}>
                    <div onClick={()=>moveTech(i,-1)} style={{ cursor:'pointer', padding:3, opacity:i===0?0.3:1 }}>
                      <span style={{ fontSize:12, color:TK.text3 }}>▲</span>
                    </div>
                    <div onClick={()=>moveTech(i,1)} style={{ cursor:'pointer', padding:3, opacity:i===techs.length-1?0.3:1 }}>
                      <span style={{ fontSize:12, color:TK.text3 }}>▼</span>
                    </div>
                    <div onClick={()=>removeTech(i)} style={{ cursor:'pointer', padding:3, marginLeft:4 }}>
                      <Ic name="x" size={14} color={TK.red}/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add tech button */}
          <div onClick={()=>setShowPicker(true)} style={{
            marginTop:8, padding:'10px 14px', borderRadius:10, cursor:'pointer',
            background:TK.accentDim, color:TK.accent, fontSize:13, fontWeight:600,
            textAlign:'center', border:`1px solid ${TK.accent}30`,
          }}>+ 기술 추가</div>
        </div>

        {/* Preview */}
        {techs.length >= 2 && (
          <div style={{ padding:12, background:TK.surfaceUp, borderRadius:10 }}>
            <div style={{ fontSize:12, color:TK.text2, marginBottom:8 }}>미리보기</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4, alignItems:'center' }}>
              {techs.map((t, i) => (
                <React.Fragment key={i}>
                  <Tag color={i===techs.length-1?TK.amber:TK.accent}
                    bg={i===techs.length-1?TK.amberDim:TK.accentDim} style={{fontSize:10}}>{t}</Tag>
                  {i<techs.length-1 && <span style={{color:TK.text3,fontSize:10}}>→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tech Picker Modal */}
      {showPicker && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)',
          display:'flex', alignItems:'flex-end', zIndex:200 }}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:TK.surfaceUp, borderRadius:'20px 20px 0 0', width:'100%',
            maxHeight:'70%', display:'flex', flexDirection:'column', overflow:'hidden',
          }}>
            <div style={{ padding:'16px 20px 10px', borderBottom:`1px solid ${TK.border}`, flexShrink:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <span style={{ fontSize:16, fontWeight:700 }}>기술 선택</span>
                <div onClick={()=>{setShowPicker(false);setSearchQ('');}} style={{cursor:'pointer',padding:4}}>
                  <Ic name="x" size={20} color={TK.text2}/>
                </div>
              </div>
              <div style={{ position:'relative' }}>
                <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }}>
                  <Ic name="search" size={15} color={TK.text3}/>
                </div>
                <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="기술명 검색"
                  style={{ width:'100%', padding:'9px 10px 9px 32px', borderRadius:8,
                    border:`1px solid ${TK.border}`, background:TK.surface,
                    color:TK.text, fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }}/>
              </div>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'8px 20px 20px' }}>
              {filteredTechs.map(t => (
                <div key={t.id} onClick={()=>addTech(t.name)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0',
                    borderBottom:`1px solid ${TK.border}`, cursor:'pointer' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{t.name}</div>
                    {t.pos && <div style={{ fontSize:11, color:TK.text2 }}>{t.pos}</div>}
                  </div>
                  <Ic name="plus" size={18} color={TK.accent}/>
                </div>
              ))}
              {/* Custom input */}
              <div style={{ marginTop:12, padding:10, background:TK.surface, borderRadius:8 }}>
                <div style={{ fontSize:11, color:TK.text2, marginBottom:6 }}>목록에 없는 기술 직접 입력</div>
                <div style={{ display:'flex', gap:6 }}>
                  <input id="custom-tech-input" placeholder="기술명 입력" style={{
                    flex:1, padding:'8px 10px', borderRadius:6, border:`1px solid ${TK.border}`,
                    background:TK.surfaceUp, color:TK.text, fontSize:12, outline:'none', fontFamily:'inherit' }}/>
                  <Btn sm primary onClick={() => {
                    const inp = document.getElementById('custom-tech-input');
                    if (inp?.value.trim()) { addTech(inp.value.trim()); }
                  }}>추가</Btn>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PLANS SCREEN (Chains + Gameplans) ──
function PlanScreen({ onNav }) {
  const [tab, setTab] = React.useState('chain');
  // Chain (simple combo)
  const [chainDetail, setChainDetail] = React.useState(null);
  const [showChainEditor, setShowChainEditor] = React.useState(false);
  const [localChains, setLocalChains] = React.useState(SAMPLE_CHAINS);
  // Gameplan (flow chart)
  const [gpDetail, setGpDetail] = React.useState(null);
  const [showGpEditor, setShowGpEditor] = React.useState(false);
  const [localGps, setLocalGps] = React.useState(CHAIN_FLOWS);

  // Sub-screens
  if (showChainEditor) {
    return <SimpleChainEditor onBack={()=>setShowChainEditor(false)} onSave={(chain) => {
      setLocalChains(prev => [...prev, { ...chain, id: Date.now() }]);
      setShowChainEditor(false);
    }}/>;
  }
  if (chainDetail) return <ChainDetailView chain={chainDetail} onBack={()=>setChainDetail(null)}/>;
  if (showGpEditor) {
    return <ChainEditor onBack={()=>setShowGpEditor(false)} onSave={(gp) => {
      setLocalGps(prev => [...prev, { ...gp, id: Date.now() }]);
      setShowGpEditor(false);
    }}/>;
  }
  if (gpDetail) return <ChainFlowView chain={gpDetail} onBack={()=>setGpDetail(null)}/>;

  const handleAdd = () => {
    if (tab === 'chain') setShowChainEditor(true);
    else setShowGpEditor(true);
  };

  return (
    <div style={{ width:'100%', height:'100%', background:TK.bg, color:TK.text,
      fontFamily:"'Noto Sans KR',-apple-system,sans-serif", display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ flex:1, overflowY:'auto', paddingBottom:80 }}>
        <div style={{ padding:'54px 20px 8px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0, letterSpacing:'-0.5px' }}>플랜</h1>
          <Btn sm primary onClick={handleAdd}>+ 추가</Btn>
        </div>

        {/* Tabs */}
        <div style={{ padding:'4px 20px 14px' }}>
          <div style={{ display:'flex', background:TK.surfaceUp, borderRadius:10, padding:3 }}>
            {[{id:'chain',l:'기술 체인'},{id:'gp',l:'게임플랜'}].map(t => (
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{ flex:1, padding:'8px 0', borderRadius:8, border:'none',
                  background:tab===t.id?TK.surface:'transparent',
                  color:tab===t.id?TK.text:TK.text2,
                  fontSize:13, fontWeight:600, cursor:'pointer',
                  boxShadow:tab===t.id?'0 1px 4px rgba(0,0,0,0.2)':'none',
                }}>{t.l}</button>
            ))}
          </div>
        </div>

        {/* Chains Tab (simple combos) */}
        {tab==='chain' && (
          <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap:10 }}>
            {localChains.length===0 ? (
              <div style={{ textAlign:'center', color:TK.text2, padding:40, fontSize:13 }}>등록된 체인이 없습니다</div>
            ) : localChains.map(c => (
              <Card key={c.id} pad={16} onClick={()=>setChainDetail(c)}>
                <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>{c.name}</div>
                {c.note && <div style={{ fontSize:12, color:TK.text2, marginBottom:8 }}>{c.note}</div>}
                <div style={{ display:'flex', flexWrap:'wrap', gap:4, alignItems:'center' }}>
                  {c.techs.slice(0,5).map((t,i,arr) => (
                    <React.Fragment key={i}>
                      <Tag color={i===arr.length-1&&i===c.techs.length-1?TK.amber:TK.accent}
                        bg={i===arr.length-1&&i===c.techs.length-1?TK.amberDim:TK.accentDim}
                        style={{fontSize:10}}>{t}</Tag>
                      {i<arr.length-1 && <span style={{color:TK.text3,fontSize:10}}>→</span>}
                    </React.Fragment>
                  ))}
                  {c.techs.length>5 && <span style={{fontSize:10,color:TK.text3}}>+{c.techs.length-5}</span>}
                </div>
                <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:11, color:TK.text3 }}>{c.techs.length}개 기술</span>
                  <div style={{marginLeft:'auto'}}><Ic name="chevR" size={16} color={TK.text3}/></div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Gameplans Tab (flow charts) */}
        {tab==='gp' && (
          <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap:10 }}>
            {localGps.length===0 ? (
              <div style={{ textAlign:'center', color:TK.text2, padding:40, fontSize:13 }}>등록된 게임플랜이 없습니다</div>
            ) : localGps.map(gp => (
              <Card key={gp.id} pad={16} onClick={()=>setGpDetail(gp)}>
                <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>{gp.name}</div>
                {gp.note && <div style={{ fontSize:12, color:TK.text2, marginBottom:8 }}>{gp.note}</div>}
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                  <Tag color={TK.blue} bg={TK.blueDim}>📍 {gp.startPos}</Tag>
                  <span style={{ fontSize:11, color:TK.text3 }}>노드 {gp.nodes.length} · 전환 {gp.edges.length}</span>
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:4, alignItems:'center' }}>
                  {gp.nodes.filter(n=>n.type==='action'||n.type==='finish').slice(0,4).map((n,i,arr) => (
                    <React.Fragment key={n.id}>
                      <Tag color={n.type==='finish'?TK.amber:TK.accent}
                        bg={n.type==='finish'?TK.amberDim:TK.accentDim} style={{fontSize:10}}>{n.label}</Tag>
                      {i<arr.length-1 && <span style={{color:TK.text3,fontSize:10}}>→</span>}
                    </React.Fragment>
                  ))}
                </div>
                <div style={{ marginTop:8, display:'flex', alignItems:'center' }}>
                  <div style={{marginLeft:'auto'}}><Ic name="chevR" size={16} color={TK.text3}/></div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <NavBar active="techplan" onNav={onNav}/>
    </div>
  );
}

// ── Combined Tech + Plan Screen ──
function TechPlanScreen({ onNav }) {
  const [mode, setMode] = React.useState('tech'); // 'tech' | 'plan'
  return (
    <div style={{ width:'100%', height:'100%', background:TK.bg, color:TK.text,
      fontFamily:"'Noto Sans KR',-apple-system,sans-serif", display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Top toggle */}
      <div style={{ padding:'54px 20px 0px', flexShrink:0 }}>
        <div style={{ display:'flex', background:TK.surfaceUp, borderRadius:10, padding:3 }}>
          {[{id:'tech',l:'기술트리'},{id:'plan',l:'플랜'}].map(t => (
            <button key={t.id} onClick={()=>setMode(t.id)}
              style={{ flex:1, padding:'9px 0', borderRadius:8, border:'none',
                background:mode===t.id?TK.surface:'transparent',
                color:mode===t.id?TK.text:TK.text2,
                fontSize:14, fontWeight:700, cursor:'pointer',
                boxShadow:mode===t.id?'0 1px 4px rgba(0,0,0,0.2)':'none',
                transition:'all 0.15s',
              }}>{t.l}</button>
          ))}
        </div>
      </div>
      {/* Content area — render the sub-screen without its own header/nav */}
      <div style={{ flex:1, overflow:'hidden' }}>
        {mode === 'tech' ? <TechScreenInner onNav={onNav}/> : <PlanScreenInner onNav={onNav}/>}
      </div>
      <NavBar active="techplan" onNav={onNav}/>
    </div>
  );
}

// Inner versions without header and navbar
function TechScreenInner({ onNav }) {
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const [detail, setDetail] = React.useState(null);

  const list = React.useMemo(() => {
    let items = [...SAMPLE_TECHS];
    if (filter === 'star') items = items.filter(t => t.starred);
    if (filter === 'recent') items = items.sort((a, b) => b.id - a.id);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(t => t.name.toLowerCase().includes(q) || (t.pos||'').toLowerCase().includes(q));
    }
    return items;
  }, [search, filter]);

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ flex:1, overflowY:'auto', paddingBottom:20 }}>
        {/* Add button */}
        <div style={{ padding:'10px 20px 4px', display:'flex', justifyContent:'flex-end' }}>
          <Btn sm primary>+ 추가</Btn>
        </div>
        {/* Search */}
        <div style={{ padding:'4px 20px 8px' }}>
          <div style={{ position:'relative' }}>
            <div style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }}>
              <Ic name="search" size={16} color={TK.text3}/>
            </div>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="기술명, 포지션 검색"
              style={{ width:'100%', padding:'10px 12px 10px 36px', borderRadius:10,
                border:`1px solid ${TK.border}`, background:TK.surface,
                color:TK.text, fontSize:13, outline:'none', boxSizing:'border-box',
                fontFamily:'inherit' }}/>
          </div>
        </div>
        {/* Filters */}
        <div style={{ padding:'0 20px', marginBottom:12 }}>
          <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }}>
            {[{ id:'all', l:'전체' },{ id:'recent', l:'🕐 최신순' },{ id:'star', l:'⭐ 즐겨찾기' }].map(f => (
              <button key={f.id} onClick={()=>setFilter(f.id)}
                style={{
                  padding:'6px 12px', borderRadius:16, border:'none', whiteSpace:'nowrap',
                  background: filter===f.id ? TK.accent : TK.surfaceUp,
                  color: filter===f.id ? '#fff' : TK.text2,
                  fontSize:12, fontWeight:600, cursor:'pointer', flexShrink:0,
                }}>{f.l}</button>
            ))}
          </div>
        </div>
        {/* List */}
        <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap:8 }}>
          {list.length===0 ? (
            <div style={{ textAlign:'center', color:TK.text2, padding:40, fontSize:13 }}>기술이 없습니다</div>
          ) : list.map(t => (
            <Card key={t.id} onClick={()=>setDetail(t)} pad={14}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                    {t.starred && <Ic name="star" size={14} color={TK.amber} filled/>}
                    <span style={{ fontSize:14, fontWeight:700 }}>{t.name}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                    {t.pos && <Tag color={TK.blue} bg={TK.blueDim}>{t.pos}</Tag>}
                    {t.clips>0 && <Tag color={TK.purple} bg={TK.purpleDim}>🎬 {t.clips}</Tag>}
                  </div>
                </div>
                <Ic name="chevR" size={18} color={TK.text3}/>
              </div>
            </Card>
          ))}
        </div>
      </div>
      {/* Detail Modal */}
      {detail && (
        <Modal title={detail.name} onClose={()=>setDetail(null)}>
          <div style={{ display:'flex', gap:6, marginBottom:12 }}>
            {detail.pos && <Tag color={TK.blue} bg={TK.blueDim}>{detail.pos}</Tag>}
            {detail.starred && <Tag color={TK.amber} bg={TK.amberDim}>⭐ 즐겨찾기</Tag>}
          </div>
          {detail.note && (
            <div style={{ padding:12, background:TK.surface, borderRadius:10,
              fontSize:13, color:TK.text2, lineHeight:1.6, marginBottom:12 }}>
              {detail.note}
            </div>
          )}
          {detail.clips>0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:13, color:TK.text2, marginBottom:6 }}>참고 영상 ({detail.clips})</div>
              {Array.from({length:detail.clips}).map((_,i) => (
                <div key={i} style={{ padding:10, background:TK.surface, borderRadius:8, marginBottom:6,
                  display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                  <div style={{ width:48, height:32, borderRadius:4, background:TK.surfaceHi,
                    display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{fontSize:14}}>▶</span>
                  </div>
                  <span style={{ fontSize:13, fontWeight:500 }}>{detail.name} 영상 {i+1}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display:'flex', gap:8 }}>
            <Btn sm style={{flex:1, color:TK.red}}>삭제</Btn>
            <Btn sm style={{flex:1}}>수정</Btn>
            <Btn primary sm style={{flex:1}} onClick={()=>setDetail(null)}>닫기</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PlanScreenInner({ onNav }) {
  const [tab, setTab] = React.useState('chain');
  const [chainDetail, setChainDetail] = React.useState(null);
  const [showChainEditor, setShowChainEditor] = React.useState(false);
  const [localChains, setLocalChains] = React.useState(SAMPLE_CHAINS);
  const [gpDetail, setGpDetail] = React.useState(null);
  const [showGpEditor, setShowGpEditor] = React.useState(false);
  const [localGps, setLocalGps] = React.useState(CHAIN_FLOWS);

  if (showChainEditor) {
    return <SimpleChainEditor onBack={()=>setShowChainEditor(false)} onSave={(chain) => {
      setLocalChains(prev => [...prev, { ...chain, id: Date.now() }]);
      setShowChainEditor(false);
    }}/>;
  }
  if (chainDetail) return <ChainDetailView chain={chainDetail} onBack={()=>setChainDetail(null)}/>;
  if (showGpEditor) {
    return <ChainEditor onBack={()=>setShowGpEditor(false)} onSave={(gp) => {
      setLocalGps(prev => [...prev, { ...gp, id: Date.now() }]);
      setShowGpEditor(false);
    }}/>;
  }
  if (gpDetail) return <ChainFlowView chain={gpDetail} onBack={()=>setGpDetail(null)}/>;

  const handleAdd = () => {
    if (tab === 'chain') setShowChainEditor(true);
    else setShowGpEditor(true);
  };

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ flex:1, overflowY:'auto', paddingBottom:20 }}>
        {/* Sub-tabs + add */}
        <div style={{ padding:'10px 20px 8px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', gap:6 }}>
            {[{id:'chain',l:'체인'},{id:'gp',l:'게임플랜'}].map(t => (
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{ padding:'5px 12px', borderRadius:14, border:'none',
                  background:tab===t.id?TK.accent:TK.surfaceUp,
                  color:tab===t.id?'#fff':TK.text2,
                  fontSize:12, fontWeight:600, cursor:'pointer',
                }}>{t.l}</button>
            ))}
          </div>
          <Btn sm primary onClick={handleAdd}>+ 추가</Btn>
        </div>

        {/* Chains */}
        {tab==='chain' && (
          <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap:10 }}>
            {localChains.length===0 ? (
              <div style={{ textAlign:'center', color:TK.text2, padding:40, fontSize:13 }}>등록된 체인이 없습니다</div>
            ) : localChains.map(c => (
              <Card key={c.id} pad={16} onClick={()=>setChainDetail(c)}>
                <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>{c.name}</div>
                {c.note && <div style={{ fontSize:12, color:TK.text2, marginBottom:8 }}>{c.note}</div>}
                <div style={{ display:'flex', flexWrap:'wrap', gap:4, alignItems:'center' }}>
                  {c.techs.slice(0,5).map((t,i,arr) => (
                    <React.Fragment key={i}>
                      <Tag color={i===arr.length-1&&i===c.techs.length-1?TK.amber:TK.accent}
                        bg={i===arr.length-1&&i===c.techs.length-1?TK.amberDim:TK.accentDim}
                        style={{fontSize:10}}>{t}</Tag>
                      {i<arr.length-1 && <span style={{color:TK.text3,fontSize:10}}>→</span>}
                    </React.Fragment>
                  ))}
                </div>
                <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:11, color:TK.text3 }}>{c.techs.length}개 기술</span>
                  <div style={{marginLeft:'auto'}}><Ic name="chevR" size={16} color={TK.text3}/></div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Gameplans */}
        {tab==='gp' && (
          <div style={{ padding:'0 20px', display:'flex', flexDirection:'column', gap:10 }}>
            {localGps.length===0 ? (
              <div style={{ textAlign:'center', color:TK.text2, padding:40, fontSize:13 }}>등록된 게임플랜이 없습니다</div>
            ) : localGps.map(gp => (
              <Card key={gp.id} pad={16} onClick={()=>setGpDetail(gp)}>
                <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>{gp.name}</div>
                {gp.note && <div style={{ fontSize:12, color:TK.text2, marginBottom:8 }}>{gp.note}</div>}
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                  <Tag color={TK.blue} bg={TK.blueDim}>📍 {gp.startPos}</Tag>
                  <span style={{ fontSize:11, color:TK.text3 }}>노드 {gp.nodes.length} · 전환 {gp.edges.length}</span>
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:4, alignItems:'center' }}>
                  {gp.nodes.filter(n=>n.type==='action'||n.type==='finish').slice(0,4).map((n,i,arr) => (
                    <React.Fragment key={n.id}>
                      <Tag color={n.type==='finish'?TK.amber:TK.accent}
                        bg={n.type==='finish'?TK.amberDim:TK.accentDim} style={{fontSize:10}}>{n.label}</Tag>
                      {i<arr.length-1 && <span style={{color:TK.text3,fontSize:10}}>→</span>}
                    </React.Fragment>
                  ))}
                </div>
                <div style={{ marginTop:8, display:'flex', alignItems:'center' }}>
                  <div style={{marginLeft:'auto'}}><Ic name="chevR" size={16} color={TK.text3}/></div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { TechScreen, PlanScreen, TechPlanScreen, TechScreenInner, PlanScreenInner,
  ChainFlowView, ChainEditor, ChainDetailView, SimpleChainEditor, CHAIN_FLOWS, SAMPLE_CHAINS });
