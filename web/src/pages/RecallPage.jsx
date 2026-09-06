import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';
import { getHoles } from '../api/lab';
import { getPositions } from '../api/techniques';
import { searchRecall, getStale, summarizeRecall } from '../api/recall';
import Card from '../components/Card';
import Tag from '../components/Tag';
import Icon from '../components/Icon';
import Button from '../components/Button';
import Modal from '../components/Modal';
import RecallLadder from '../components/RecallLadder';
import ClassDetailModal from '../components/ClassDetailModal';

// ═════════════════════════════════════════════════════════════════════════════
// 복기 화면 — task-025
//
// 이 화면은 "찾는 길"이다. 기록을 새로 만들거나 고치지 않는다.
// 검색 결과를 누르면 캘린더가 쓰는 ClassDetailModal 을 **그대로** 띄운다.
//
// 🔴 이 화면이 에러 없이 조용히 틀릴 수 있는 지점 3가지 (전부 실측된 함정이다):
//
//  1. 미연결(unlinked)을 화면에서 버리는 것.
//     실측 13종은 전부 실패 1건씩이라 구멍 threshold(2)에 걸려 holes 에 안 들어온다.
//     /api/holes 가 unlinked 를 threshold 무관 **전량** 반환하는 유일한 이유가
//     "매칭이 안 돼서 빠진 것"과 "횟수가 낮아서 빠진 것"을 화면이 구분하게 하려는 것이다.
//     → HoleBlock 이 unlinked 를 별도 소제목 + 앰버 "미연결" 배지로 항상 그린다.
//        구멍이 0개여도 unlinked 가 있으면 1번 블록은 뜬다.
//
//  2. 사다리를 연속 막대로 그리는 것. → RecallLadder.jsx 주석 참고.
//
//  3. toISOString() 이 날짜를 하루 민다(KST +9: 2026-06-24 → 2026-06-23).
//     API 가 주는 'YYYY-MM-DD' 는 **문자열 그대로** 다룬다. Date 왕복 금지.
//     기간 필터도 <input type="date"> 의 value(이미 'YYYY-MM-DD' 문자열)를 그대로 보낸다.
//
// 🔴 백엔드가 이미 한 판정을 프론트에서 다시 하지 않는다.
//    "잊기 직전"에서 구멍 기술 제외는 /api/recall/stale 이 한다. 여기서 한 번 더 거르면
//    두 곳이 어긋났을 때 어느 쪽이 틀렸는지 추적할 수 없다. 화면은 excludedHoleNames 를
//    **표시**만 한다.
// ═════════════════════════════════════════════════════════════════════════════

// 정본 포지션 12종 (docs/recall-lab-approvals.md B절 — 주 격자는 이 목록만 세운다).
// 🔴 나머지는 **지우지 않는다.** 주 격자에서 빼는 것은 승인 사항이지만 화면에서
//    사라지게 하는 것은 승인 사항이 아니다 — 1번 블록의 "미연결을 지우지 않는다"와 같은 원칙.
//    끊김 허용 4종(남북 포지션·델라리바·헤드쿼터·스카프홀드)에는 실제 스파링 기록이,
//    B-2 미해결 2종(오픈가드 탑·하프가드 탑)에는 드릴이 붙어 있다.
const CANONICAL_POSITIONS = [
  '가드', '오픈 가드', '클로즈드 가드', '하프 가드', '백', '마운트',
  '사이드 컨트롤', '탑 포지션', '패스', '스탠딩', '터틀', '기타',
];
const CANONICAL_SET = new Set(CANONICAL_POSITIONS.map(n => n.normalize('NFC')));

const FIELD_LABEL = {
  note: '메모', theme: '테마', transcript: '전사본',
  'drill.tech': '드릴 기술', 'drill.pos': '드릴 포지션',
};

/** 'YYYY-MM-DD' 문자열을 표시용으로. 🔴 Date 를 거치지 않는다(하루 밀림 차단). */
function fmtDay(v) {
  if (!v) return '';
  const s = String(v);
  if (s.includes('T')) {                      // 타임스탬프가 섞여 오면 로컬(KST) 게터로
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }
  return s.slice(0, 10).replace(/-/g, '.');
}

/**
 * 스니펫 안의 검색어를 강조. NFC 로 맞춘 뒤 찾고 **NFC 로 렌더**한다
 * (원문을 렌더하면서 정규화된 문자열로 인덱스를 재면 길이가 어긋나 엉뚱한 데가 잘린다).
 */
function Highlight({ text, q }) {
  const t = String(text ?? '').normalize('NFC');
  const needle = String(q ?? '').normalize('NFC').trim();
  if (!needle) return <>{t}</>;

  const hay = t.toLowerCase();
  const nee = needle.toLowerCase();
  // 일부 문자는 소문자화하며 길이가 바뀐다 — 그러면 인덱스가 어긋나므로 강조를 포기한다.
  if (hay.length !== t.length || !nee) return <>{t}</>;

  const out = [];
  let i = 0, k = 0;
  while (k < 50) {
    const at = hay.indexOf(nee, i);
    if (at < 0) break;
    if (at > i) out.push(t.slice(i, at));
    out.push(
      <mark key={`h${k}`} style={{ background: 'var(--accent-dim)', color: 'var(--accent-lt)', padding: '0 1px', borderRadius: 3 }}>
        {t.slice(at, at + needle.length)}
      </mark>
    );
    i = at + needle.length;
    k++;
  }
  out.push(t.slice(i));
  return <>{out}</>;
}

function SectionTitle({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 2px 8px' }}>
      <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.2px' }}>{children}</span>
      {right}
    </div>
  );
}

function Hint({ children }) {
  return <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.55 }}>{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 반복해서 실패한 기술 + 미연결
// ─────────────────────────────────────────────────────────────────────────────

function HoleRow({ h, onLadder, unlinked }) {
  return (
    <div style={{
      padding: '10px 11px', marginBottom: 6, borderRadius: 10,
      background: unlinked ? 'transparent' : 'var(--surface-up)',
      border: unlinked ? '1px dashed var(--amber)' : '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{h.name}</span>
        <Tag tone="red">실패 {h.failCount}</Tag>
        {h.successCount > 0 && <Tag tone="accent">성공 {h.successCount}</Tag>}
        {/* 🔴 linked:false 를 눈에 보이게. 이게 이 블록의 급소다. */}
        {unlinked && <Tag tone="amber">미연결</Tag>}
        {!unlinked && h.matchedName && h.matchedName !== h.name && (
          <Tag tone="blue">→ {h.matchedName}</Tag>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
        {h.lastFailedAt ? `최근 실패 ${fmtDay(h.lastFailedAt)}` : '최근 실패일 없음'}
        {' · '}
        {/* causes 는 실측상 전부 빈 배열이다(스파링 기록이 2026-06-24 이후 끊김).
            정상 상태이므로 칸을 숨기지 않고 "원인 태그 없음"으로 조용히 적는다. */}
        {(h.causes || []).length > 0
          ? h.causes.map(c => `${c.name ?? `#${c.id}`}(${c.count})`).join(', ')
          : '원인 태그 없음'}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
        {/* 자리만 만든 버튼. 누르면 반응할 것처럼 보이는데 아무 일도 안 하는 게 제일 나쁘므로
            disabled 로 둬서 **비활성으로 보이게** 한다. */}
        <Button variant="outline" size="sm" disabled>연구 과제로</Button>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>준비 중</span>
        {h.techniqueId
          ? (
            <span
              onClick={() => onLadder(h.techniqueId, h.matchedName || h.name)}
              style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--accent-lt)', cursor: 'pointer' }}
            >사다리 보기 ›</span>
          )
          : (
            // 미연결은 techniqueId 가 null 이라 /api/mastery/null 이 404 다. 열지 않는다.
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>사다리 없음</span>
          )}
      </div>
    </div>
  );
}

function HoleBlock({ data, onLadder, goCalendar }) {
  const holes = data.holes || [];
  const unlinked = data.unlinked || [];
  const s = data.summary || {};

  // 빈 상태 ②: 스파링 기록 자체가 0건. 구멍/미연결을 따질 재료가 없다.
  if (data.empty || s.sparSessions === 0) {
    return (
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>아직 스파링 기록이 없습니다</div>
        <Hint>
          복기는 스파링에서 실패한 항목을 재료로 씁니다. 수업에 스파링 라운드를 한 번 기록하면
          여기에 반복 실패 기술이 모입니다.
        </Hint>
        <div style={{ marginTop: 10 }}>
          <Button variant="primary" size="sm" onClick={goCalendar}>기록하러 가기</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {holes.length > 0 ? (
        <>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
            실패 {data.threshold}회 이상 — {holes.length}종
          </div>
          {holes.map(h => <HoleRow key={h.normName} h={h} onLadder={onLadder} />)}
        </>
      ) : (
        <Hint>실패 {data.threshold}회 이상 반복된 기술은 없습니다.</Hint>
      )}

      {/* 🔴 미연결은 실패 1건씩이라 구멍 목록에 안 들어온다. 여기서 사라지면
          "매칭이 안 돼서 빠진 것"과 "횟수가 낮아서 빠진 것"을 구분할 수 없다. */}
      {unlinked.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Icon name="link" size={13} color="var(--amber)" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)' }}>
              기술트리에 연결되지 않은 이름 {unlinked.length}
            </span>
          </div>
          <Hint>
            이 이름들은 기술 목록의 어떤 기술과도 매칭되지 않아 위 집계에 합쳐지지 않았습니다.
            실패 횟수가 적어서 빠진 것이 아니라 <b style={{ color: 'var(--amber)' }}>이름이 연결되지 않아서</b> 빠진 것입니다.
            기술을 추가하거나 이름을 맞추면 위 목록으로 합쳐집니다.
          </Hint>
          <div style={{ marginTop: 8 }}>
            {unlinked.map(h => <HoleRow key={`u-${h.normName}`} h={h} onLadder={onLadder} unlinked />)}
          </div>
        </div>
      )}

      {(s.sameTechnique || []).length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
          같은 기술로 연결된 서로 다른 표기(합치지 않았습니다):{' '}
          {s.sameTechnique.map(g => g.names.join(' = ')).join(' / ')}
        </div>
      )}
      {(s.parseFailures || []).length > 0 && (
        <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: 'var(--red-dim)', fontSize: 11, color: 'var(--red)' }}>
          읽지 못한 기록 {s.parseFailures.length}건이 집계에서 빠졌습니다.
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 잊기 직전
// ─────────────────────────────────────────────────────────────────────────────

function StaleCard({ data, onLadder }) {
  const top = (data.items || [])[0];
  const excluded = data.excludedHoleNames || [];

  return (
    <Card>
      {top ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{top.name}</span>
            {/* 🔴 표본 0건은 "경과 0일"이 아니라 "기록 없음"이다. */}
            {top.status === 'no_record'
              ? <Tag tone="neutral">기록 없음</Tag>
              : <Tag tone="amber">{top.daysSince}일 경과</Tag>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>
            {top.status === 'no_record'
              ? '드릴에서도 스파링에서도 나온 적이 없습니다.'
              : `마지막 배움 ${top.lastLearnedAt ? fmtDay(top.lastLearnedAt) : '-'} · 마지막 스파링 ${top.lastSeenAt ? fmtDay(top.lastSeenAt) : '-'}`}
            {data.today && ` · 오늘 ${fmtDay(data.today)}`}
          </div>
          {top.techniqueId && (
            <div style={{ marginTop: 8 }}>
              <span
                onClick={() => onLadder(top.techniqueId, top.name)}
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-lt)', cursor: 'pointer' }}
              >사다리 보기 ›</span>
            </div>
          )}
        </>
      ) : (
        <Hint>잊기 직전인 기술이 없습니다.</Hint>
      )}

      {/* 🔴 프론트에서 다시 거르지 않는다 — 백엔드가 제외한 사실을 그대로 표시만 한다. */}
      {excluded.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          반복 실패 {excluded.length}종({excluded.join(', ')})은 위 블록에 있어 여기서 제외했습니다.
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 포지션 격자
// ─────────────────────────────────────────────────────────────────────────────

function PosCell({ p, active, onClick }) {
  return (
    <div
      onClick={onClick}
      className="bjj-card-tap"
      style={{
        padding: '9px 8px', borderRadius: 10, cursor: 'pointer',
        background: active ? 'var(--accent-dim)' : 'var(--surface-up)',
        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
      }}
    >
      <div style={{
        fontSize: 12, fontWeight: 700, marginBottom: 3,
        color: active ? 'var(--accent-lt)' : 'var(--text)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{p.name}</div>
      {/* 어휘가 갈라져 있던 문제가 병합으로 해소됐는지 눈으로 확인할 수 있도록
          기록 쪽(드릴·스파링)과 자료 쪽(기술·영상)을 **양쪽 다** 보여준다. */}
      <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.45 }}>
        기록 {p.drillCount + p.sparCount}
        <span style={{ color: 'var(--text3)', opacity: 0.6 }}> (드릴 {p.drillCount}·스파 {p.sparCount})</span>
        <br />
        자료 {p.techCount + p.clipCount}
        <span style={{ color: 'var(--text3)', opacity: 0.6 }}> (기술 {p.techCount}·영상 {p.clipCount})</span>
      </div>
    </div>
  );
}

function PositionGrid({ positions, activePos, onPick }) {
  const [openOther, setOpenOther] = useState(false);

  const { main, other } = useMemo(() => {
    const m = [], o = [];
    for (const p of positions) {
      (CANONICAL_SET.has(String(p.name).normalize('NFC')) ? m : o).push(p);
    }
    // 주 격자는 정본 순서 그대로 — 목록이 화면마다 달라 보이지 않게 한다.
    m.sort((a, b) =>
      CANONICAL_POSITIONS.indexOf(a.name.normalize('NFC')) - CANONICAL_POSITIONS.indexOf(b.name.normalize('NFC')));
    return { main: m, other: o };
  }, [positions]);

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 };

  return (
    <Card>
      <Hint>이름이 기억나지 않을 때. 누르면 아래 검색의 포지션 필터로 들어갑니다.</Hint>
      <div style={{ ...grid, marginTop: 8 }}>
        {main.map(p => (
          <PosCell key={p.name} p={p}
            active={activePos === p.name}
            onClick={() => onPick(activePos === p.name ? '' : p.name)} />
        ))}
      </div>

      {/* 🔴 정본 밖 표기를 지우지 않는다. 스파링·드릴 기록이 실제로 붙어 있다. */}
      {other.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div
            onClick={() => setOpenOther(v => !v)}
            style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', cursor: 'pointer' }}
          >
            {openOther ? '▾' : '▸'} 기타 표기 {other.length}
          </div>
          {openOther && (
            <>
              <div style={{ marginTop: 6, marginBottom: 6 }}>
                <Hint>정본 목록에는 없지만 기록에 실제로 쓰인 이름입니다. 여기서도 검색할 수 있습니다.</Hint>
              </div>
              <div style={grid}>
                {other.map(p => (
                  <PosCell key={p.name} p={p}
                    active={activePos === p.name}
                    onClick={() => onPick(activePos === p.name ? '' : p.name)} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. 검색 결과
// ─────────────────────────────────────────────────────────────────────────────

function ResultCard({ r, q, onOpen }) {
  return (
    <div
      onClick={onOpen}
      className="bjj-card-tap"
      style={{
        padding: '10px 11px', marginBottom: 6, borderRadius: 10, cursor: 'pointer',
        background: 'var(--surface-up)', border: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-lt)' }}>
          {fmtDay(r.date)}{r.dateEnd && r.dateEnd !== r.date ? ` ~ ${fmtDay(r.dateEnd)}` : ''}
        </span>
        <span style={{
          fontSize: 12, color: 'var(--text)', flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{r.theme || '(테마 없음)'}</span>
      </div>

      {(r.hits || []).map((h, i) => (
        <div key={i} style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Tag tone={h.field === 'transcript' ? 'purple' : h.field === 'note' ? 'blue' : 'neutral'}>
              {FIELD_LABEL[h.field] || h.field}
            </Tag>
            {h.count > 1 && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{h.count}회</span>}
            {/* 🔴 잘렸다는 사실을 숨기지 않는다. */}
            {h.truncated && <Tag tone="amber">전사본 일부</Tag>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.55, marginTop: 3, wordBreak: 'break-word' }}>
            <Highlight text={h.snippet} q={q} />
          </div>
        </div>
      ))}

      {r.transcriptChars > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
          전사본 {r.transcriptChars.toLocaleString()}자 (본문은 열어서 확인)
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════

export default function RecallPage() {
  const navigate = useNavigate();
  const { classes, techniques } = useCache();
  const { showToast } = useUI();

  const [holes, setHoles] = useState(null);
  const [stale, setStale] = useState(null);
  const [positions, setPositions] = useState([]);
  const [errs, setErrs] = useState({});          // { holes, stale, positions } — 하나가 죽어도 나머지는 뜬다

  // 검색 입력(사용자가 타이핑 중인 값)과 적용된 조건(마지막으로 서버에 보낸 값)을 분리한다.
  // 섞으면 "요약 보기"가 아직 검색하지 않은 조건으로 AI 를 호출한다.
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState(null);
  const [res, setRes] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');

  const [ladder, setLadder] = useState(null);    // { techId, name }
  const [detailClass, setDetailClass] = useState(null);

  const [summary, setSummary] = useState(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryErr, setSummaryErr] = useState('');

  useEffect(() => {
    let alive = true;
    // 🔴 세 요청을 각자 catch 한다. Promise.all 로 묶으면 하나가 죽을 때 화면이 통째로 빈다 —
    //    특히 /api/recall/stale 은 백엔드 배포 순서에 따라 잠깐 없을 수 있다.
    const fail = (key) => (e) => {
      if (alive) setErrs(prev => ({ ...prev, [key]: e.message || '불러오지 못했습니다' }));
    };
    getHoles().then(d => { if (alive) setHoles(d); }).catch(fail('holes'));
    getStale().then(d => { if (alive) setStale(d); }).catch(fail('stale'));
    getPositions().then(d => { if (alive) setPositions(Array.isArray(d) ? d : []); }).catch(fail('positions'));
    return () => { alive = false; };
  }, []);

  const runSearch = useCallback(async (override) => {
    const cond = {
      q: (override?.q ?? q).trim(),
      pos: override?.pos ?? pos,
      from: override?.from ?? from,
      to: override?.to ?? to,
    };
    setSearching(true); setSearchErr(''); setSummary(null); setSummaryErr('');
    try {
      const d = await searchRecall(cond);
      setRes(d);
      setApplied(cond);
    } catch (e) {
      setRes(null); setApplied(cond);
      setSearchErr(e.message || '검색에 실패했습니다');
    } finally {
      setSearching(false);
    }
  }, [q, pos, from, to]);

  // 포지션 칸을 누르면 그 자리에서 검색까지 간다 (격자는 검색의 진입로다).
  const pickPos = useCallback((name) => {
    setPos(name);
    runSearch({ pos: name });
  }, [runSearch]);

  const openClass = useCallback((classId) => {
    // ClassDetailModal 은 수업 **전체 객체**를 받는다. 검색 응답은 요약만 주므로
    // CacheContext 가 이미 들고 있는 목록(api/classes.js 의 listClasses)에서 찾아 넘긴다.
    const c = (classes || []).find(x => x.id === classId);
    if (!c) { showToast('수업을 찾지 못했습니다'); return; }
    setDetailClass(c);
  }, [classes, showToast]);

  const runSummarize = useCallback(async () => {
    if (!applied) return;
    setSummarizing(true); setSummaryErr('');
    try {
      setSummary(await summarizeRecall(applied));
    } catch (e) {
      setSummaryErr(e.message || 'AI 요약에 실패했습니다');
    } finally {
      setSummarizing(false);
    }
  }, [applied]);

  // 검색어와 이름이 겹치는 기술 — 사다리 진입로. 새 API 없이 캐시된 기술 목록으로 판정한다.
  const matchedTechs = useMemo(() => {
    const needle = (applied?.q || '').normalize('NFC').toLowerCase().trim();
    if (!needle) return [];
    return (techniques || [])
      .filter(t => String(t.name || '').normalize('NFC').toLowerCase().includes(needle))
      .slice(0, 6);
  }, [applied, techniques]);

  // 빈 상태 ①: 구멍도 미연결도 0 → 1번 블록을 빈 카드로 남기지 않고 격자를 위로 올린다.
  const sparEmpty = !!holes && (holes.empty || holes.summary?.sparSessions === 0);
  const holeBlockHidden = !!holes && !sparEmpty
    && (holes.holes || []).length === 0 && (holes.unlinked || []).length === 0;

  const gridBlock = (
    <>
      <SectionTitle>포지션으로 찾기</SectionTitle>
      {errs.positions
        ? <Card><Hint>포지션 목록을 불러오지 못했습니다 — {errs.positions}</Hint></Card>
        : <PositionGrid positions={positions} activePos={pos} onPick={pickPos} />}
    </>
  );

  return (
    <div>
      <h1 className="page-header">복기</h1>

      {/* 구멍이 하나도 없으면 격자가 맨 위로 올라온다 */}
      {holeBlockHidden && gridBlock}

      {/* ── 1. 반복해서 실패한 기술 ─────────────────────────────────────────── */}
      {!holeBlockHidden && (
        <>
          <SectionTitle>반복해서 실패한 기술</SectionTitle>
          {errs.holes
            ? <Card><Hint>실패 집계를 불러오지 못했습니다 — {errs.holes}</Hint></Card>
            : holes
              ? <HoleBlock data={holes} onLadder={(id, name) => setLadder({ techId: id, name })}
                  goCalendar={() => navigate('/calendar')} />
              : <Card><Hint>불러오는 중…</Hint></Card>}
        </>
      )}

      {/* ── 2. 잊기 직전 ────────────────────────────────────────────────────── */}
      <SectionTitle>잊기 직전</SectionTitle>
      {errs.stale
        ? <Card><Hint>잊기 직전 목록을 불러오지 못했습니다 — {errs.stale}</Hint></Card>
        : stale
          ? <StaleCard data={stale} onLadder={(id, name) => setLadder({ techId: id, name })} />
          : <Card><Hint>불러오는 중…</Hint></Card>}

      {/* ── 3. 포지션 격자 ──────────────────────────────────────────────────── */}
      {!holeBlockHidden && gridBlock}

      {/* ── 4. 검색 ─────────────────────────────────────────────────────────── */}
      <SectionTitle>수업기록 검색</SectionTitle>
      <Card>
        <form onSubmit={(e) => { e.preventDefault(); runSearch(); }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="기술·상황·말버릇 무엇이든"
              style={{
                flex: 1, minWidth: 0, padding: '10px 12px', fontSize: 14,
                background: 'var(--surface-up)', border: '1px solid var(--border-med)',
                borderRadius: 10, color: 'var(--text)', outline: 'none',
              }}
            />
            <Button type="submit" variant="primary" disabled={searching}>
              {searching ? '검색 중' : '검색'}
            </Button>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            {/* value 가 이미 'YYYY-MM-DD' 문자열이다 — 그대로 API 에 넘긴다(Date 왕복 금지). */}
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              style={dateInput} />
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>~</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              style={dateInput} />
            {pos && (
              <Tag tone="accent" onClick={() => pickPos('')} style={{ cursor: 'pointer' }}>
                {pos} ✕
              </Tag>
            )}
            {(q || pos || from || to) && (
              <span
                onClick={() => { setQ(''); setPos(''); setFrom(''); setTo(''); setRes(null); setApplied(null); setSummary(null); }}
                style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', cursor: 'pointer' }}
              >조건 지우기</span>
            )}
          </div>
        </form>
      </Card>

      {searchErr && <Card><Hint>검색에 실패했습니다 — {searchErr}</Hint></Card>}

      {matchedTechs.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 2px 10px' }}>
          <span style={{ fontSize: 11, color: 'var(--text3)', alignSelf: 'center' }}>사다리:</span>
          {matchedTechs.map(t => (
            <Tag key={t.id} tone="accent" onClick={() => setLadder({ techId: t.id, name: t.name })}>
              {t.name} ›
            </Tag>
          ))}
        </div>
      )}

      {res && !searchErr && (
        res.total > 0 ? (
          <Card>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
              수업 {res.total}건
              {applied?.pos && ` · 포지션 ${applied.pos}`}
              {applied?.from && ` · ${fmtDay(applied.from)}부터`}
              {applied?.to && ` · ${fmtDay(applied.to)}까지`}
            </div>
            {(res.results || []).map(r => (
              <ResultCard key={r.classId} r={r} q={applied?.q} onOpen={() => openClass(r.classId)} />
            ))}
          </Card>
        ) : (
          // 빈 상태 ③: 검색 결과 0건 — 무엇을 바꿔볼지 적는다.
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>걸린 수업이 없습니다</div>
            <Hint>
              · 다른 표기로 — 같은 기술을 <b>암바 / 암바 (Armbar) / arm bar</b> 처럼 다르게 적어 뒀을 수 있습니다.<br />
              · 위 <b>포지션 격자</b>에서 골라 보세요. 이름이 아니라 상황으로 찾습니다.<br />
              {(applied?.from || applied?.to) && <>· 기간 필터를 넓혀 보세요.<br /></>}
              {applied?.pos && <>· 포지션 필터(<b>{applied.pos}</b>)를 빼 보세요.<br /></>}
            </Hint>
          </Card>
        )
      )}

      {/* ── 6. AI 복기 카드 ─────────────────────────────────────────────────── */}
      {res && res.total > 0 && (
        <>
          <SectionTitle>AI 복기</SectionTitle>
          <Card>
            {!summary && !summarizing && (
              <>
                <Hint>검색된 수업 {res.total}건만 읽고 요약합니다. 수십 초 걸립니다.</Hint>
                <div style={{ marginTop: 10 }}>
                  <Button variant="accent-grad" size="sm" onClick={runSummarize}>요약 보기</Button>
                </div>
              </>
            )}
            {summarizing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="loader-spinner" style={{ width: 16, height: 16 }} />
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>AI 가 읽는 중… (수십 초)</span>
              </div>
            )}
            {summaryErr && <Hint>요약에 실패했습니다 — {summaryErr}</Hint>}
            {summary && (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {summary.cached && <Tag tone="blue">캐시</Tag>}
                  {summary.generatedAt && (
                    <span style={{ fontSize: 10, color: 'var(--text3)', alignSelf: 'center' }}>
                      생성 {summary.generatedAt}
                    </span>
                  )}
                  {summary.promptChars != null && (
                    <span style={{ fontSize: 10, color: 'var(--text3)', alignSelf: 'center' }}>
                      · 프롬프트 {summary.promptChars.toLocaleString()}자
                    </span>
                  )}
                </div>

                {/* 🔴 잘렸는데 "전부 요약했습니다" 얼굴을 하면 안 된다. 몇 건이 어떻게 빠졌는지 쓴다.
                    truncated 는 **두 가지**를 함께 뜻한다(backend recallSearch.js:490):
                      droppedClassIds  — 아예 안 읽은 수업
                      abridgedClassIds — 읽었지만 내용을 줄인 수업
                    한 문장으로 뭉쳐 "N건 빼고"라고 쓰면 dropped 가 0인데 0건을 뺐다고 말하게 된다. */}
                {summary.truncated && (
                  <div style={{
                    padding: 9, borderRadius: 8, marginBottom: 8,
                    background: 'var(--amber-dim)', fontSize: 11, color: 'var(--amber)', lineHeight: 1.5,
                  }}>
                    {(summary.droppedClassIds || []).length > 0 && (
                      <div>
                        분량이 커서 <b>{summary.droppedClassIds.length}건은 아예 읽지 못했습니다</b>
                        {' '}— {(summary.includedClassIds || []).length}건만 읽은 요약입니다.
                      </div>
                    )}
                    {(summary.abridgedClassIds || []).length > 0 && (
                      <div>
                        <b>{summary.abridgedClassIds.length}건</b>은 내용을 줄여서 읽었습니다.
                      </div>
                    )}
                    <div style={{ opacity: 0.85 }}>검색 조건을 좁히면 더 자세히 읽힙니다.</div>
                  </div>
                )}

                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {summary.content}
                </div>

                <div style={{ marginTop: 10 }}>
                  <Button variant="outline" size="sm" onClick={runSummarize} disabled={summarizing}>다시 요약</Button>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      <div style={{ height: 20 }} />

      {/* ── 5. 사다리 카드 ──────────────────────────────────────────────────── */}
      {ladder && (
        <Modal title="사다리" onClose={() => setLadder(null)}>
          <RecallLadder techId={ladder.techId} name={ladder.name} onClose={() => setLadder(null)} />
        </Modal>
      )}

      {/* 검색 결과 → 캘린더가 쓰는 그 모달을 **그대로**. 고치지 않는다.
          "수정"은 이 모달이 항상 그리는 버튼이라 onEdit 을 안 주면 눌러도 아무 일이 없다
          (반응할 것처럼 보이는데 안 하는 게 제일 나쁘다). 편집기는 캘린더 화면 소유이고
          복기는 "찾는 길"만 만들므로, 여기서는 캘린더로 보내고 어디서 고치는지 알려준다. */}
      {detailClass && (
        <ClassDetailModal
          initial={detailClass}
          onClose={() => setDetailClass(null)}
          onEdit={() => {
            setDetailClass(null);
            showToast('수업기록에서 이 수업을 눌러 수정하세요');
            navigate('/calendar');
          }}
        />
      )}
    </div>
  );
}

const dateInput = {
  padding: '7px 9px', fontSize: 12,
  background: 'var(--surface-up)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text)', outline: 'none',
  colorScheme: 'dark',
};
