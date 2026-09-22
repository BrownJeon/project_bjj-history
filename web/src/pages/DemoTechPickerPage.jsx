// task-046 1단계 — 스파링 기술 선택기 **데모**. 메뉴 밖 주소 `/demo/tech-picker`, 진입은 프로필 맨 위 임시 카드.
//
// 🔴 이 화면은 아무것도 저장하지 않는다. 쓰기 API(POST/PUT/DELETE)를 import 하지도 부르지도 않는다.
//    데이터는 useCache() 가 이미 받아 둔 techniques·classes(GET 결과)만 읽는다.
//    `+` 의 "기술트리에도 등록"은 토스트 + 이 화면 메모리에만 추가한다(새로고침하면 사라진다).
// 🔴 실제 스파링 화면(SparEditPage.jsx 의 GrowthSessionCard)·백엔드·DB 는 건드리지 않는다.
//    사용자가 이 데모를 보고 방식을 고르면 2단계에서 실제 화면을 바꾼다 — 그때 이 파일·라우트·프로필 카드를 지운다.
//
// `+` 는 모달이 아니라 **카드 안에서 펼쳐지는 칸**이다. 실제 스파링 편집기가 이미 Modal 이라 여기서 모달을 띄우면
// 2단계에서 그대로 옮길 수 없다(모달 안 모달 — SparEditPage.jsx FailDetail 주석과 같은 이유).
import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';
import Icon from '../components/Icon';

// ─── 이름 정규화 — backend/src/utils/techMatch.js normalize() 와 같은 규칙 ─────────────────
// NFC + 소문자 + 공백/하이픈/중점(· ㆍ ・) 제거. "시저스스윕" ≡ "시저스 스윕".
// (기록의 "시저스윕"은 '스'가 하나 빠진 **다른 철자**라 정규화로는 안 붙는다 — `+` 의 "혹시 이거예요?"가 잡는다.)
function normalize(name) {
  return String(name || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\-·ㆍ・]+/g, '');
}

// 한글 음절 → 자모. 검색은 이걸로 **부분 일치**를 본다 — 휴대폰에서 "기무라"를 치는 도중의 "김"·"기물"도
// "기무라"에 걸리게(ㄱㅣㅁ ⊂ ㄱㅣㅁㅜㄹㅏ). 겹모음·겹받침은 낱자로 푼다(입력 도중 모양과 맞추려고).
const CHO  = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅗㅏ','ㅗㅐ','ㅗㅣ','ㅛ','ㅜ','ㅜㅓ','ㅜㅔ','ㅜㅣ','ㅠ','ㅡ','ㅡㅣ','ㅣ'];
const JONG = ['','ㄱ','ㄲ','ㄱㅅ','ㄴ','ㄴㅈ','ㄴㅎ','ㄷ','ㄹ','ㄹㄱ','ㄹㅁ','ㄹㅂ','ㄹㅅ','ㄹㅌ','ㄹㅍ','ㄹㅎ',
              'ㅁ','ㅂ','ㅂㅅ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const COMPAT_SPLIT = {
  'ㅘ':'ㅗㅏ','ㅙ':'ㅗㅐ','ㅚ':'ㅗㅣ','ㅝ':'ㅜㅓ','ㅞ':'ㅜㅔ','ㅟ':'ㅜㅣ','ㅢ':'ㅡㅣ',
  'ㄳ':'ㄱㅅ','ㄵ':'ㄴㅈ','ㄶ':'ㄴㅎ','ㄺ':'ㄹㄱ','ㄻ':'ㄹㅁ','ㄼ':'ㄹㅂ','ㄽ':'ㄹㅅ','ㄾ':'ㄹㅌ','ㄿ':'ㄹㅍ','ㅀ':'ㄹㅎ','ㅄ':'ㅂㅅ',
};
function jamo(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) {
      const i = c - 0xAC00;
      out += CHO[Math.floor(i / 588)] + JUNG[Math.floor((i % 588) / 28)] + JONG[i % 28];
    } else {
      out += COMPAT_SPLIT[ch] || ch;
    }
  }
  return out;
}

function lev(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 자모 편집거리 유사도(0~1). 바우앤애로우↔보우 앤 애로우 0.92 · 옴플라타↔오모플라타 0.9 · 니어네이키트 쵸크↔리어네이키드 초크 0.81 */
function jamoSim(aNorm, bNorm) {
  const ja = jamo(aNorm), jb = jamo(bNorm);
  const m = Math.max(ja.length, jb.length);
  if (m < 4) return 0;            // 너무 짧으면 우연히 비슷해진다
  return 1 - lev(ja, jb) / m;
}
const SIMILAR_MIN = 0.75;

/** `+` 시트의 "혹시 이거예요?" 점수 — 한쪽이 다른 쪽을 품거나(롱스탭 패스 ⊃ 롱스탭) 자모가 비슷하면. 묻기만 한다(자동 연결 안 함). */
function similarity(aNorm, bNorm) {
  if (!aNorm || !bNorm || aNorm === bNorm) return 0;
  const [s, l] = aNorm.length <= bNorm.length ? [aNorm, bNorm] : [bNorm, aNorm];
  if (s.length >= 2 && l.includes(s)) return 0.9;
  return jamoSim(aNorm, bNorm);
}

// ─── 관장 제안 ② 카테고리 6개 ─────────────────────────────────────────────
const CATEGORIES = [
  { key: '서브미션',   desc: '탭을 받아내는 기술 — 조르기·꺾기 전부' },
  { key: '패스',       desc: '상대 가드를 넘어 위를 잡는 것' },
  { key: '스윕',       desc: '가드(아래)에서 뒤집고 올라가는 것' },
  { key: '컨트롤',     desc: '백·마운트·사이드를 잡거나 지키는 것, 백테이크 포함' },
  { key: '탈출',       desc: '서브미션·불리한 자리에서 빠져나오기, 가드 되찾기 포함' },
  { key: '테이크다운', desc: '선 자세에서 넘기기' },
];
const CAT_KEYS = CATEGORIES.map(c => c.key);

// ─── 관장 제안 ③ — user 3 기술트리 56행 분류안(이름 → 그룹). 이름 55개 = 56행(앵클락 2행) ──────────
// 합계: 서브미션 14행(13개) · 패스 7 · 스윕 5 · 컨트롤 6 · 탈출 0 · 테이크다운 1 · 포지션 15 · 기타 4 · 미정 4.
// 이름은 트리 철자 그대로다(대조는 normalize 로 — 띄어쓰기 차이는 같은 이름). 여기 없는 트리 기술 = 미분류(검색으로만).
const TAXONOMY = {
  '서브미션':   ['기무라', '암바', '트라이앵글 쵸크', '리어네이키드 초크', '루프 쵸크', '칸토 쵸크', '깃 쵸크',
                 '보우 앤 애로우', '니어네이키트 쵸크', '오모플라타', '바라토플라타', '초이(choi) 바', '앵클락'],
  '패스':       ['니슬라이드', '크레이지독 패스', '엑스패스', '롱스탭', '토레안도', '니컷', '싱글언더 패스'],
  '스윕':       ['시저스 스윕', '버터플라이 스윕', '엑스가드 스윕', '100퍼스윕', '트라이포드'],
  '컨트롤':     ['백테이크', '백포지션', '베림보로', '마운트', '사이드', '스카프홀드'],
  '탈출':       [],
  '테이크다운': ['더블렉'],
  '포지션':     ['하프가드', '딥 하프가드', '델라리바', 'k가드', '윌리엄 가드', '라쏘', '리버스 엑스가드', '싱글엑스',
                 '엑스가드', '싯팅 가드', '오픈가드', '스파이더', '웜가드', '웨이터 가드', '컴뱃가드'],
  '기타':       ['스윕', '테이크다운', '탈출', '가드패스'],
  '미정':       ['매트릭스', '사지오로', '키마스터', '밸리다운'],
};
// 스파링 선택지(카테고리 목록)에 안 나오는 그룹. 검색하면 "○○ · 제외" 표시로 보인다 — 기존 기록 연결은 유지.
const EXCLUDED_GROUPS = ['포지션', '기타'];
const GROUP_NOTE = {
  '탈출':   '트리에 0개 — 기록의 앵클락 탈출·마운트 탈출·가드 리커버리 전부 미연결. 탈출 버튼 = 빈 목록 + 검색 뒤 `+`.',
  '포지션': '가드·자리 이름 — "뭘 했나"가 아니라 "어디서 했나". 스파링 선택지에 안 나옴(검색하면 제외 표시로 보임). 기존 기록 연결은 유지.',
  '기타':   '묶음 이름. 스파링 선택지에 안 나옴.',
  '미정':   '관장이 이름만으로 판단 불가 — 사용자 확인. 그때까지 검색으로만.',
};
const NAME_NOTE = {
  '암바':             '"마운트 암바"는 미연결 유지(확정)',
  '보우 앤 애로우':   '기록 "바우앤애로우"(성공 3) 미연결 — 같은 기술인지 확인',
  '니어네이키트 쵸크': '리어네이키드 초크 오타인지 확인. 합치지 않음',
  '바라토플라타':     '"버라토플라타"(성공 1) 미연결',
  '앵클락':           '트리에 중복 2행 — 목록엔 한 번만',
  '롱스탭':           '"롱스탭 패스"(성공 2) 미연결',
  '토레안도':         '"토레안도 패스" 미연결',
  '트라이포드':       '가드 이름으로 쓰면 포지션 — 확인',
  '백포지션':         '기록 "백포지션 컨트롤"(실패 4) 미연결 — 같은 뜻이면 구멍이 안 보이는 중',
  '베림보로':         '스윕으로 쓰면 스윕',
  '마운트':           '기존 "기타" → 컨트롤로 이동',
  '가드패스':         '실패 1 연결 — 사용자 결정',
};
const TAXONOMY_BY_NORM = new Map(
  Object.entries(TAXONOMY).flatMap(([group, names]) => names.map(n => [normalize(n), group]))
);

// 관장 보류 4종 — 트리 행이 아니다. `+` 에서 트리 등록 금지(등록되면 보류가 저절로 결정된다) → "이 기록에만".
const HOLD_NAMES = ['백 쵸크', '암락', '다스 쵸크', '닌자 쵸크'];
const HOLD_NORMS = HOLD_NAMES.map(normalize);
/** 똑같거나 자모가 거의 같으면(백 초크 ↔ 백 쵸크) 보류로 본다. 품는 관계는 보지 않는다(백 쵸크 탈출 ≠ 백 쵸크). */
function holdOf(norm) {
  const i = HOLD_NORMS.findIndex(h => h === norm || jamoSim(h, norm) >= SIMILAR_MIN);
  return i >= 0 ? HOLD_NAMES[i] : null;
}

// ─── 데이터 가공 ─────────────────────────────────────────────────────────
/** 스파링 기록 전체의 사용 횟수(성공+실패) — 정규화 이름 기준. 문자열 항목은 성공으로 센다(SparEditPage 와 같은 해석). */
function buildUsage(classes) {
  const map = new Map();
  let rounds = 0;
  for (const c of classes || []) {
    for (const sd of c.spar_days || []) {
      for (const s of sd.sessions || []) {
        rounds++;
        for (const t of Array.isArray(s.success) ? s.success : []) {
          const key = normalize(typeof t === 'string' ? t : t?.name);
          if (!key) continue;
          const u = map.get(key) || { succ: 0, fail: 0 };
          if (t && typeof t === 'object' && t.success === false) u.fail++; else u.succ++;
          map.set(key, u);
        }
      }
    }
  }
  return { map, rounds };
}

/** 트리 기술 → 선택기 목록. 동명 중복(앵클락 2행)은 낮은 id 하나만 — 서버 matchTechnique 의 pickLowestId 와 같은 기준. */
function buildPool(techniques, demoTechs, usageMap) {
  const byKey = new Map();
  const make = (name, key, group, demo) => {
    const u = usageMap.get(key) || { succ: 0, fail: 0 };
    return {
      name, key, group, demo, rows: 1, jamo: jamo(key),
      selectable: CAT_KEYS.includes(group), excluded: EXCLUDED_GROUPS.includes(group),
      succ: u.succ, fail: u.fail, count: u.succ + u.fail,
    };
  };
  const sorted = [...(techniques || [])].sort((a, b) => (a.id || 0) - (b.id || 0));
  for (const t of sorted) {
    const key = normalize(t.name);
    if (!key) continue;
    if (byKey.has(key)) { byKey.get(key).rows++; continue; }
    byKey.set(key, make(t.name, key, TAXONOMY_BY_NORM.get(key) || '미분류', false));
  }
  for (const d of demoTechs) {
    if (!byKey.has(d.key)) byKey.set(d.key, make(d.name, d.key, d.cat, true));
  }
  return [...byKey.values()];
}

const byUsage = (a, b) => (b.count - a.count) || a.name.localeCompare(b.name, 'ko');

function groupLabel(t) {
  if (t.demo) return `${t.group} · 새로 등록(데모)`;
  if (t.excluded) return `${t.group} · 제외`;
  return t.group;   // 카테고리 6개 · 미정 · 미분류
}

/** 검색 — 띄어쓰기 무시, **고른 카테고리 밖까지**. 순서: 똑같은 이름 → 고른 카테고리 → 다른 카테고리 → 미정·미분류 → 제외. */
function searchPool(pool, query, cat) {
  const qn = normalize(query);
  if (!qn) return { qn, results: [], exact: null };
  const qj = jamo(qn);
  const rank = t => (t.group === cat ? 0 : t.selectable ? 1 : t.excluded ? 3 : 2);
  const results = pool
    .filter(t => t.jamo.includes(qj))
    .sort((a, b) => ((b.key === qn) - (a.key === qn)) || (rank(a) - rank(b)) || byUsage(a, b));
  return { qn, results, exact: pool.find(t => t.key === qn) || null };
}

const MORE_LIMIT = 6;   // 카테고리 목록은 사용 횟수순 위 6개 + '더 보기'

// ─── 색 — 실제 스파링 화면과 같은 값(성공 = ChipSection gold, 실패 = red, 하나 모드 = accent) ──────────
const TONES = {
  gold:   { solid: '#F5A623',       dim: '#FEF3E2',            text: '#F5A623',       label: '#B8860B' },
  red:    { solid: 'var(--red)',    dim: 'var(--red-dim)',     text: 'var(--red)',    label: 'var(--red)' },
  accent: { solid: 'var(--accent)', dim: 'var(--accent-dim)',  text: 'var(--accent)', label: 'var(--text)' },
};
const chipBase = {
  padding: '5px 11px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%',
};
const hintStyle = { fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 };

// ═════════════════════════════════════════════════════════════════════════
export default function DemoTechPickerPage() {
  const navigate = useNavigate();
  const { techniques, classes, loaded } = useCache();
  const { showToast } = useUI();

  const [listMode, setListMode] = useState('chips');   // 'chips' = 검색 + 탭 목록 · 'select' = 셀렉트박스 + 검색
  const [layout, setLayout]     = useState('split');   // 'split' = 성공·실패 선택기 따로 · 'single' = 선택기 하나 + [성공][실패]
  const [items, setItems]       = useState([]);        // 이 라운드에서 고른 것 [{key, name, success, where: tree|record|register}]
  const [demoTechs, setDemoTechs] = useState([]);      // "기술트리에도 등록" 흉내 — 이 화면 메모리에만
  const [roundNo, setRoundNo]   = useState(1);         // 처음부터 → 선택기(카테고리·검색) 상태도 새로
  const [reviewOpen, setReviewOpen] = useState(false);

  const usage = useMemo(() => buildUsage(classes), [classes]);
  const pool  = useMemo(() => buildPool(techniques, demoTechs, usage.map), [techniques, demoTechs, usage]);
  const catCounts = useMemo(() => {
    const m = Object.fromEntries(CAT_KEYS.map(k => [k, 0]));
    for (const t of pool) if (t.selectable) m[t.group]++;
    return m;
  }, [pool]);

  function toggle(name, where, success) {
    const key = normalize(name);
    setItems(prev => (prev.some(i => i.key === key && i.success === success)
      ? prev.filter(i => !(i.key === key && i.success === success))
      : [...prev, { key, name, success, where }]));
  }
  function add(name, where, success) {
    const key = normalize(name);
    setItems(prev => (prev.some(i => i.key === key && i.success === success)
      ? prev : [...prev, { key, name, success, where }]));
  }
  function remove(it) { setItems(prev => prev.filter(i => !(i.key === it.key && i.success === it.success))); }
  function register(name, cat) {
    const key = normalize(name);
    setDemoTechs(prev => (prev.some(d => d.key === key) ? prev : [...prev, { key, name, cat }]));
    showToast(`데모라 저장하지 않았어요 — 실제로는 기술트리에 「${name}」(${cat})로 등록됩니다`, 3200);
  }
  function restart() { setItems([]); setRoundNo(n => n + 1); }
  function close() {
    // 앱(WebView)엔 주소창이 없다 — 프로필 카드로 들어왔으면 뒤로, 주소로 바로 열었으면 프로필로.
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1); else navigate('/me', { replace: true });
  }

  const pickerProps = { listMode, pool, catCounts, items, onToggle: toggle, onAdd: add, onRemove: remove, onRegister: register };
  const treeRows = (techniques || []).length;
  const unclassified = pool.filter(t => t.group === '미분류');

  return (
    <div className="page-fade" style={{ paddingTop: 12 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px' }}>기술 선택기 데모</span>
        <button onClick={close} aria-label="닫기" style={{
          background: 'var(--surface-up)', border: '1px solid var(--border)', borderRadius: 10,
          padding: 7, cursor: 'pointer', display: 'inline-flex',
        }}>
          <Icon name="x" size={16} color="var(--text)" />
        </button>
      </div>

      {/* 안내 — 한두 줄 */}
      <div style={{
        padding: '9px 12px', marginBottom: 10, borderRadius: 10,
        background: 'var(--amber-dim)', border: '1px solid rgba(240,168,48,0.35)',
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--amber)' }}>
          🧪 저장되지 않는 데모입니다 — 방식 비교 후 결정
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 3, lineHeight: 1.5 }}>
          {loaded
            ? <>내 기술트리 {treeRows}행 · 스파링 {usage.rounds}라운드 기록으로 목록과 순서를 만들었어요. 카테고리는 관장 분류안(임시).</>
            : '기술트리·스파링 기록을 불러오는 중…'}
        </div>
      </div>

      {/* 비교 스위치 2개 — 작게 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
        <Segmented
          label="목록"
          value={listMode}
          onChange={setListMode}
          options={[['chips', '검색 + 탭 목록'], ['select', '셀렉트박스 + 검색']]}
        />
        <Segmented
          label="배치"
          value={layout}
          onChange={setLayout}
          options={[['split', '성공·실패 따로'], ['single', '하나 + 성공/실패']]}
        />
      </div>

      {/* 라운드 카드 — 실제 스파링 화면 GrowthSessionCard 와 같은 틀 */}
      <div style={{
        padding: 14, background: 'var(--surface-up)',
        border: '1px solid var(--border)', borderRadius: 14, marginBottom: 10,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: 6,
              background: 'var(--accent-dim)', color: 'var(--accent)',
              fontSize: 11, fontWeight: 800,
            }}>1</span>
            라운드
          </span>
          <button onClick={restart} style={{
            background: 'transparent', border: '1px solid var(--border-med)',
            color: 'var(--text2)', padding: '4px 8px', borderRadius: 6,
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>↺ 처음부터</button>
        </div>
        <div style={{ ...hintStyle, marginBottom: 12 }}>벨트·시간·성장 포인트 — 지금 화면과 같음(생략)</div>

        {layout === 'split' ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TONES.gold.label, marginBottom: 7 }}>성공한 기술</div>
              <Picker key={`s-${roundNo}`} tone="gold" fixedSuccess={true} {...pickerProps} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--red)', marginBottom: 8 }}>실패한 기술</div>
              <Picker key={`f-${roundNo}`} tone="red" fixedSuccess={false} {...pickerProps} />
            </div>
          </>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800 }}>성공·실패한 기술</span>
              <span style={{ ...hintStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Dot color={TONES.gold.solid} /> 성공 <Dot color="var(--red)" /> 실패
              </span>
            </div>
            <Picker key={`one-${roundNo}`} tone="accent" fixedSuccess={undefined} {...pickerProps} />
          </div>
        )}

        <div style={{ ...hintStyle, marginTop: 10 }}>
          실패 기술마다 붙는 "왜 안 됐나요?" 원인 태그 — 지금 화면과 같음(생략)
        </div>
      </div>

      {/* 분류안 검토 표 — 접힘 */}
      <button onClick={() => setReviewOpen(o => !o)} style={{
        width: '100%', padding: '8px 0', marginBottom: 8,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, color: 'var(--text2)',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}>
        {reviewOpen ? '▲ 분류안 접기' : '▼ 분류안 검토 (카테고리별 · 제외 · 미정 · 관장 확인거리)'}
      </button>
      {reviewOpen && <ReviewTable pool={pool} unclassified={unclassified} />}
    </div>
  );
}

// ─── 비교 스위치 ────────────────────────────────────────────────────────
function Segmented({ label, value, onChange, options }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 26, flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--text3)' }}>{label}</span>
      <div role="radiogroup" aria-label={label} style={{
        flex: 1, minWidth: 0, display: 'flex', padding: 2, gap: 2,
        background: 'var(--surface)', border: '1px solid var(--border-med)', borderRadius: 9,
      }}>
        {options.map(([v, text]) => {
          const on = value === v;
          return (
            <button key={v} role="radio" aria-checked={on} onClick={() => onChange(v)} style={{
              flex: 1, minWidth: 0, padding: '5px 4px', borderRadius: 7, border: 'none',
              background: on ? 'var(--surface-hi)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--text3)',
              fontSize: 11.5, fontWeight: on ? 700 : 500, cursor: 'pointer',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{text}</button>
          );
        })}
      </div>
    </div>
  );
}

function Dot({ color }) {
  return <span style={{ width: 7, height: 7, borderRadius: 4, background: color, display: 'inline-block', flexShrink: 0 }} />;
}

function GroupTag({ children }) {
  return (
    <span style={{
      fontSize: 10, padding: '0 5px', borderRadius: 4, lineHeight: '16px',
      background: 'var(--surface-hi)', color: 'var(--text2)', fontWeight: 600, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// ─── 선택기 — 카테고리 줄 → 고른 칩 → 검색 → 목록(탭 목록 | 셀렉트박스) → `+` 칸 ─────────────────
// fixedSuccess: true(성공 선택기) · false(실패 선택기) · undefined(하나 모드 — 고른 뒤 [성공][실패])
function Picker({ tone, fixedSuccess, listMode, pool, catCounts, items, onToggle, onAdd, onRemove, onRegister }) {
  const ask = fixedSuccess === undefined;
  const [cat, setCat]         = useState(null);    // 라운드 안에서 마지막 카테고리 유지 — 고른 뒤에도 안 닫힌다
  const [query, setQuery]     = useState('');
  const [more, setMore]       = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addCat, setAddCat]   = useState(null);
  const [pending, setPending] = useState(null);    // 하나 모드: 성공/실패를 묻는 중인 기술 {name, where}
  const inputRef = useRef(null);

  const mine    = ask ? items : items.filter(i => i.success === fixedSuccess);
  const catList = useMemo(() => (cat ? pool.filter(t => t.selectable && t.group === cat).sort(byUsage) : []), [pool, cat]);
  const { qn, results, exact } = useMemo(() => searchPool(pool, query, cat), [pool, query, cat]);
  const canAdd  = !!qn && !exact;                  // `+` 는 이름이 똑같은 기술이 없을 때만
  const typed   = query.trim().replace(/\s+/g, ' ');
  const hold    = canAdd ? holdOf(qn) : null;
  const similar = useMemo(() => (canAdd
    ? pool.map(t => ({ t, s: similarity(qn, t.key) })).filter(x => x.s >= SIMILAR_MIN)
        .sort((a, b) => b.s - a.s || byUsage(a.t, b.t)).slice(0, 4).map(x => x.t)
    : []), [pool, qn, canAdd]);

  const stateOf = key => ({
    succ: items.some(i => i.key === key && i.success),
    fail: items.some(i => i.key === key && !i.success),
  });

  function pickCat(c) { setCat(prev => (prev === c ? null : c)); setMore(false); setPending(null); }
  function choose(name, where) {
    if (ask) setPending({ name, where });
    else onToggle(name, where, fixedSuccess);
  }
  function chooseFromSearch(name, where) {
    choose(name, where);
    setQuery('');
    setAddOpen(false);
  }
  function openAdd() {
    setAddCat(CAT_KEYS.includes(cat) ? cat : null);
    setAddOpen(true);
  }
  /** `+` 결과 — 성공/실패 선택기면 바로 칩, 하나 모드면 [성공][실패]를 묻는다 */
  function finishAdd(where) {
    if (ask) setPending({ name: typed, where });
    else onAdd(typed, where, fixedSuccess);
    setQuery('');
    setAddOpen(false);
  }
  function onKeyDown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (exact) chooseFromSearch(exact.name, 'tree');
    else if (canAdd) openAdd();
  }

  const listVisible = more ? catList : catList.slice(0, MORE_LIMIT);

  return (
    <div data-picker={tone}>
      {/* ① 카테고리 줄 — 3칸 × 2줄. 다시 누르면 접힌다 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5 }}>
        {CATEGORIES.map(({ key }) => {
          const on = cat === key;
          const n = catCounts[key] || 0;
          return (
            <button key={key} data-cat={key} onClick={() => pickCat(key)} aria-pressed={on} style={{
              padding: '6px 4px', borderRadius: 20, minWidth: 0,
              border: on ? '1px solid var(--accent)' : '1px solid var(--border-med)',
              background: on ? 'var(--accent-dim)' : 'var(--surface)',
              color: on ? 'var(--accent)' : (n ? 'var(--text2)' : 'var(--text3)'),
              fontSize: 12, fontWeight: on ? 700 : 500, cursor: 'pointer',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {key} <span style={{ fontSize: 10.5, opacity: 0.75 }}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* ② 고른 기술 — 카테고리 줄 아래 칩 한 줄. 점선 = 트리에 없는 이름(이 기록에만) */}
      {mine.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {mine.map(it => (
            <button key={`${it.key}-${it.success}`} data-picked={it.name} data-result={it.success ? '성공' : '실패'} data-where={it.where}
              onClick={() => onRemove(it)} style={{
              padding: '4px 10px', borderRadius: 20,
              background: it.success ? TONES.gold.solid : 'var(--red)', color: '#fff',
              border: it.where === 'record' ? '1.5px dashed rgba(255,255,255,0.85)' : '1.5px solid transparent',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%',
            }}>
              {it.name} <span style={{ fontSize: 13, opacity: 0.8 }}>×</span>
            </button>
          ))}
        </div>
      )}
      {mine.some(i => i.where === 'record') && (
        <div style={{ ...hintStyle, marginTop: 4 }}>점선 = 기술트리에 없는 이름(이 기록에만)</div>
      )}

      {/* ③ 검색 — 띄어쓰기 무시 · 전 카테고리. 안내문은 360px 폭에서 안 잘리는 길이로(task-045 교훈) */}
      <div style={{ position: 'relative', marginTop: 8 }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', pointerEvents: 'none' }}>
          <Icon name="search" size={14} color="var(--text3)" />
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setPending(null); }}
          onKeyDown={onKeyDown}
          maxLength={50}
          placeholder="전체 기술 검색 · 띄어쓰기 무시"
          autoComplete="off"
          enterKeyHint="search"
          style={{
            width: '100%', padding: '7px 30px 7px 30px', borderRadius: 20,
            border: '1px solid var(--border-med)', background: 'transparent',
            color: 'var(--text)', fontSize: 13, outline: 'none',
          }}
        />
        {query && (
          <button onClick={() => { setQuery(''); setAddOpen(false); inputRef.current?.focus(); }} aria-label="검색어 지우기" style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            width: 24, height: 24, borderRadius: 12, border: 'none', background: 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <Icon name="x" size={12} color="var(--text2)" />
          </button>
        )}
      </div>

      {/* ④ 목록 — 방식에 따라 탭 목록 / 셀렉트박스 */}
      {listMode === 'chips' ? (
        qn ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {results.map(t => (
              <TechChip key={t.key} t={t} tone={tone} ask={ask} fixedSuccess={fixedSuccess}
                state={stateOf(t.key)} showGroup={t.group !== cat}
                onClick={() => chooseFromSearch(t.name, 'tree')} />
            ))}
            {!results.length && <span style={{ ...hintStyle, alignSelf: 'center' }}>내 기술트리에 없는 이름이에요</span>}
            {canAdd && <AddChip tone={tone} text={typed} onClick={openAdd} />}
          </div>
        ) : cat && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {listVisible.map(t => (
              <TechChip key={t.key} t={t} tone={tone} ask={ask} fixedSuccess={fixedSuccess}
                state={stateOf(t.key)} pending={pending && normalize(pending.name) === t.key}
                onClick={() => choose(t.name, 'tree')} />
            ))}
            {catList.length > MORE_LIMIT && (
              <button onClick={() => setMore(m => !m)} style={{
                ...chipBase, background: 'transparent', color: 'var(--text2)',
                border: '1px dashed var(--border-med)', fontWeight: 600,
              }}>{more ? '접기' : `더 보기 +${catList.length - MORE_LIMIT}`}</button>
            )}
            {!catList.length && <EmptyCat cat={cat} />}
          </div>
        )
      ) : (
        (qn || cat) && (
          <div style={{ marginTop: 8 }}>
            {qn ? (
              <NativeSelect
                placeholder={results.length ? `검색 결과 ${results.length}개 — 눌러서 고르기` : '검색 결과 없음'}
                disabled={!results.length}
                groups={groupForSelect(results, cat)}
                fixedSuccess={fixedSuccess} stateOf={stateOf}
                onPick={t => chooseFromSearch(t.name, 'tree')}
              />
            ) : (
              <NativeSelect
                placeholder={catList.length ? `${cat} 기술 고르기 (${catList.length}개)` : `${cat} — 내 기술트리에 없음`}
                disabled={!catList.length}
                groups={[{ label: null, list: catList }]}
                fixedSuccess={fixedSuccess} stateOf={stateOf}
                onPick={t => choose(t.name, 'tree')}
              />
            )}
            {!qn && !catList.length && <div style={{ marginTop: 6 }}><EmptyCat cat={cat} /></div>}
            {canAdd && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                <AddChip tone={tone} text={typed} onClick={openAdd} />
              </div>
            )}
          </div>
        )
      )}

      {/* ⑤ `+` 칸 — 카드 안에서 펼친다(모달 아님) */}
      {addOpen && canAdd && (
        <div style={{
          marginTop: 8, padding: '10px 10px 12px', borderRadius: 10,
          background: 'var(--surface)', border: '1px solid var(--border-med)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>「{typed}」 추가</span>
            <button onClick={() => setAddOpen(false)} aria-label="닫기" style={{
              width: 24, height: 24, borderRadius: 12, border: 'none', background: 'transparent',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
            }}><Icon name="x" size={12} color="var(--text2)" /></button>
          </div>

          {similar.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ ...hintStyle, color: 'var(--text2)', marginBottom: 5 }}>혹시 이거예요? — 누르면 그 기술로 고릅니다</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {similar.map(t => (
                  <TechChip key={t.key} t={t} tone={tone} ask={ask} fixedSuccess={fixedSuccess}
                    state={stateOf(t.key)} showGroup onClick={() => chooseFromSearch(t.name, 'tree')} />
                ))}
              </div>
            </div>
          )}

          <div style={{ ...hintStyle, color: 'var(--text2)', marginBottom: 5 }}>어디에 남길까요? — 매번 고릅니다</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={() => finishAdd('record')} style={optionStyle(false)}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>이 기록에만</span>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>이번 라운드에만 적혀요 — 기술트리·목록엔 안 생겨요</span>
            </button>

            <div style={{ ...optionStyle(!!hold), cursor: 'default' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: hold ? 'var(--text3)' : 'var(--text)' }}>기술트리에도 등록</span>
              {hold ? (
                <span style={{ fontSize: 11, color: 'var(--amber)', lineHeight: 1.5 }}>
                  「{hold}」은(는) 관장 보류 기술이에요 — 트리에 등록하면 보류가 저절로 결정돼요. "이 기록에만"으로 적어 주세요.
                </span>
              ) : (
                <>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>카테고리를 고르면 다음부터 그 목록에 떠요</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
                    {CAT_KEYS.map(k => {
                      const on = addCat === k;
                      return (
                        <button key={k} onClick={() => setAddCat(k)} aria-pressed={on} style={{
                          padding: '4px 9px', borderRadius: 14, fontSize: 11.5, cursor: 'pointer',
                          border: on ? '1px solid var(--accent)' : '1px solid var(--border-med)',
                          background: on ? 'var(--accent-dim)' : 'transparent',
                          color: on ? 'var(--accent)' : 'var(--text2)', fontWeight: on ? 700 : 500,
                        }}>{k}</button>
                      );
                    })}
                  </div>
                </>
              )}
              <button
                disabled={!!hold || !addCat}
                onClick={() => { onRegister(typed, addCat); finishAdd('register'); }}
                style={{
                  alignSelf: 'flex-end', marginTop: 6, padding: '6px 12px', borderRadius: 14, border: 'none',
                  background: hold || !addCat ? 'var(--border-med)' : 'var(--accent)',
                  color: hold || !addCat ? 'var(--text3)' : '#fff',
                  fontSize: 12, fontWeight: 700, cursor: hold || !addCat ? 'not-allowed' : 'pointer',
                }}
              >{hold ? '등록 불가' : addCat ? `${addCat}에 등록하고 고르기` : '카테고리를 먼저 고르세요'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ⑥ 하나 모드 — 고른 뒤 [성공][실패] */}
      {ask && pending && (
        <div style={{
          marginTop: 8, padding: '8px 10px', borderRadius: 10,
          background: 'var(--accent-dim)', border: '1px solid var(--accent)',
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}>
          <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>
            {pending.name}
          </span>
          {[true, false].map(succ => {
            const on = items.some(i => i.key === normalize(pending.name) && i.success === succ);
            const c = succ ? TONES.gold.solid : 'var(--red)';
            return (
              <button key={String(succ)} onClick={() => { onToggle(pending.name, pending.where, succ); setPending(null); }} style={{
                padding: '6px 14px', borderRadius: 16, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${c}`, background: on ? c : 'transparent', color: on ? '#fff' : c,
              }}>{succ ? '성공' : '실패'}{on ? ' ✓' : ''}</button>
            );
          })}
          <button onClick={() => setPending(null)} aria-label="취소" style={{
            width: 26, height: 26, borderRadius: 13, border: 'none', background: 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}><Icon name="x" size={12} color="var(--text2)" /></button>
        </div>
      )}
    </div>
  );
}

function optionStyle(disabled) {
  return {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, textAlign: 'left',
    width: '100%', padding: '9px 11px', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
    background: 'var(--surface-up)', border: '1px solid var(--border-med)', opacity: disabled ? 0.85 : 1,
  };
}

/** 셀렉트박스 옵션 묶음 — 검색 결과는 카테고리별 optgroup(고른 카테고리 먼저) */
function groupForSelect(results, cat) {
  const order = [];
  const byLabel = new Map();
  for (const t of results) {
    const label = groupLabel(t);
    if (!byLabel.has(label)) { byLabel.set(label, []); order.push(label); }
    byLabel.get(label).push(t);
  }
  return order.map(label => ({ label: label === cat ? `${label} (고른 카테고리)` : label, list: byLabel.get(label) }));
}

/** 휴대폰 기본 셀렉트박스 — 🔴 일부러 네이티브 <select>. 휴대폰의 실제 휠·팝업 동작을 보려는 비교 대상이다. */
function NativeSelect({ placeholder, disabled, groups, fixedSuccess, stateOf, onPick }) {
  const all = groups.flatMap(g => g.list);
  const mark = t => {
    const s = stateOf(t.key);
    if (fixedSuccess === true)  return s.succ ? '✓ ' : '';
    if (fixedSuccess === false) return s.fail ? '✓ ' : '';
    return (s.succ ? '[성공] ' : '') + (s.fail ? '[실패] ' : '');
  };
  const option = t => (
    <option key={t.key} value={t.key}>{mark(t)}{t.name}{t.count ? ` · ${t.count}회` : ''}</option>
  );
  return (
    <select
      value=""
      disabled={disabled}
      onChange={e => { const t = all.find(x => x.key === e.target.value); if (t) onPick(t); }}
      style={{
        width: '100%', padding: '9px 12px', borderRadius: 10,
        background: 'var(--surface)', color: disabled ? 'var(--text3)' : 'var(--text)',
        border: '1px solid var(--border-med)', fontSize: 14, outline: 'none',
      }}
    >
      <option value="" disabled>{placeholder}</option>
      {groups.map((g, gi) => (g.label
        ? <optgroup key={gi} label={g.label}>{g.list.map(option)}</optgroup>
        : g.list.map(option)))}
    </select>
  );
}

/** 목록의 기술 칩 — 성공/실패 선택기는 고른 것을 그 색으로, 하나 모드는 점으로 표시 */
function TechChip({ t, tone, ask, fixedSuccess, state, pending, showGroup, onClick }) {
  const T = TONES[tone];
  const selected = !ask && (fixedSuccess ? state.succ : state.fail);
  const style = pending
    ? { background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent)', fontWeight: 700 }
    : selected
      ? { background: T.dim, color: T.text, border: `1px solid ${T.solid}`, fontWeight: 700 }
      : { background: 'var(--surface)', color: t.excluded ? 'var(--text3)' : 'var(--text2)', border: '1px solid var(--border-med)', fontWeight: 500 };
  return (
    <button onClick={onClick} aria-pressed={!!selected} data-name={t.name} data-group={showGroup ? groupLabel(t) : ''}
      style={{ ...chipBase, ...style }}>
      {ask && state.succ && <Dot color={TONES.gold.solid} />}
      {ask && state.fail && <Dot color="var(--red)" />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
      {t.count > 0 && <span style={{ fontSize: 10.5, color: 'var(--text3)', fontWeight: 500 }}>{t.count}</span>}
      {showGroup && <GroupTag>{groupLabel(t)}</GroupTag>}
    </button>
  );
}

function AddChip({ tone, text, onClick }) {
  const c = TONES[tone].solid;
  return (
    <button data-add={text} onClick={onClick} style={{
      ...chipBase, background: 'transparent', color: c, border: `1px dashed ${c}`, fontWeight: 700,
    }}>
      <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>「{text}」 추가</span>
    </button>
  );
}

function EmptyCat({ cat }) {
  return (
    <span style={{ ...hintStyle, color: 'var(--text2)' }}>
      내 기술트리에 {cat} 기술이 없어요 — 위 검색창에 이름을 적고 <b style={{ color: 'var(--accent)' }}>+</b> 로 추가
    </span>
  );
}

// ─── 분류안 검토 표 ─────────────────────────────────────────────────────
function ReviewTable({ pool, unclassified }) {
  const inTree = new Map(pool.filter(t => !t.demo).map(t => [t.key, t]));
  const groups = [
    ...CATEGORIES.map(c => ({ key: c.key, title: c.key, desc: c.desc })),
    { key: '포지션', title: '포지션 — 제외' },
    { key: '기타',   title: '기타 — 제외' },
    { key: '미정',   title: '미정' },
  ];
  return (
    <div style={{
      padding: 12, marginBottom: 10, borderRadius: 12,
      background: 'var(--surface)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={hintStyle}>
        관장 제안 — 기술트리 56행 분류안. 숫자 = 내 스파링 기록 사용 횟수(성공+실패). 흐린 이름 = 지금 내 트리에 없음.
      </div>
      {groups.map(g => {
        const names = TAXONOMY[g.key];
        const rows = names.reduce((n, name) => n + (inTree.get(normalize(name))?.rows || 1), 0);
        const used = names.reduce((n, name) => n + (inTree.get(normalize(name))?.count || 0), 0);
        const notes = names.filter(n => NAME_NOTE[n]);
        return (
          <div key={g.key}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{g.title}</span>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>{names.length}개{rows !== names.length ? `(${rows}행)` : ''} · 사용 {used}회</span>
            </div>
            {g.desc && <div style={{ ...hintStyle, marginBottom: 5 }}>{g.desc}</div>}
            {GROUP_NOTE[g.key] && <div style={{ ...hintStyle, color: 'var(--text2)', marginBottom: 5 }}>{GROUP_NOTE[g.key]}</div>}
            {names.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {names.map(name => {
                  const t = inTree.get(normalize(name));
                  return (
                    <span key={name} className="tag" style={{
                      fontWeight: 500, background: 'var(--surface-up)',
                      color: t ? 'var(--text)' : 'var(--text3)',
                      border: '1px solid var(--border)',
                    }}>
                      {name}{t?.count ? <span style={{ color: 'var(--text3)', marginLeft: 4 }}>{t.count}</span> : null}
                    </span>
                  );
                })}
              </div>
            )}
            {notes.length > 0 && (
              <ul style={{ margin: '6px 0 0 16px', ...hintStyle, color: 'var(--text2)' }}>
                {notes.map(n => <li key={n}><b style={{ color: 'var(--text)' }}>{n}</b> — {NAME_NOTE[n]}</li>)}
              </ul>
            )}
          </div>
        );
      })}

      {unclassified.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>내 트리의 미분류 {unclassified.length}개</div>
          <div style={{ ...hintStyle, marginBottom: 5 }}>분류안에 없는 이름 — 스파링 선택지엔 안 나오고 검색하면 '미분류'로 보여요</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {unclassified.map(t => (
              <span key={t.key} className="tag" style={{ fontWeight: 500, background: 'var(--surface-up)', border: '1px solid var(--border)' }}>{t.name}</span>
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 5 }}>관장 확인거리</div>
        <ul style={{ margin: '0 0 0 16px', ...hintStyle, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <li>탈출은 트리에 0개 — 기록의 앵클락 탈출·마운트 탈출·가드 리커버리 전부 미연결. 탈출 버튼 = 빈 목록 + `+`.</li>
          <li>보류 4종({HOLD_NAMES.join('·')})은 트리 행이 아니라 분류 대상 아님 — `+` 에서 트리 등록을 막고 "이 기록에만"으로.</li>
          <li>'가드' 카테고리는 두지 않음 — 가드는 "뭘 했나"가 아니라 "어디서 했나".</li>
          <li>가드 이름을 빼면 "어느 자리에서"를 적을 곳이 메모뿐(범위 밖 — 포지션 편집 화면 없음).</li>
          <li>관장 권고 (a): 기술트리 category 값 자체를 이 체계로 바꾸고 기술 관리·스파링·관장이 상수 한 벌을 쓴다(2단계, 승인 후).</li>
          <li>RNC 표기 정본 = 리어네이키드 초크.</li>
        </ul>
      </div>
    </div>
  );
}
