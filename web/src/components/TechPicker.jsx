// 스파링 기술 선택기 — 카테고리 줄 → 고른 칩 → 검색 → 사용 횟수순 탭 목록 → `+` 칸 (task-047, task-046 데모의 "검색 + 탭 목록" 모드).
// 스파링 편집기(SparEditPage 의 GrowthSessionCard)가 성공·실패 섹션에 **따로** 하나씩 둔다(사용자 결정: 성공·실패 따로).
//
// 🔴 이 컴포넌트는 기록 항목을 직접 만들지 않는다. 고르기·빼기·추가는 전부 부모 콜백으로 올린다 — 항목의 정본은
//    SparEditPage 의 newSuccessItem() 하나뿐이고(원인 태그·리액션 필드 포함), 저장 payload 구조는 거기서 정한다.
// 🔴 `+` 는 모달이 아니라 **카드 안에서 펼치는 칸**이다. 스파링 편집기가 이미 Modal 이라 여기서 모달을 띄우면
//    모달 안 모달이 된다(SparEditPage.jsx FailDetail 주석과 같은 이유).
// 🔴 "이 기록에만 / 기술트리에도 등록"은 **매번 고른다**(기본 선택 없음 — 사용자 결정). 보류 4종은 등록 버튼이 꺼진다.
//
// props
//   tone        'gold'(성공) | 'red'(실패)
//   pool        techSearch.buildPool() 결과 — 카테고리는 DB techniques.category 에서 온다
//   catCounts   techSearch.countByCategory(pool)
//   selected    [{ name, i }] — 이 선택기(성공 또는 실패)에 고른 항목과 successTried 안의 위치
//   onToggle(name)  목록에서 누름 — 같은 이름(정규화)이 있으면 빼고 없으면 넣는다
//   onAdd(name)     `+` → 이 기록에만(또는 등록 성공 후) — 있으면 그대로
//   onRemove(i)     고른 칩의 × — successTried[i] 를 뺀다(실패 항목이면 원인·리액션도 같이 사라진다)
//   onRegister(name, category) → Promise<{name}|null>  기술트리에 등록. 실패하면 null(토스트는 부모가) — 항목을 넣지 않는다
import React, { useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { TECH_CATEGORIES } from '../utils/baseOptions';
import { normalize, searchPool, similarTo, holdOf, byUsage, groupLabel } from '../utils/techSearch';

const MORE_LIMIT = 6;   // 카테고리 목록은 사용 횟수순 위 6개 + '더 보기'

// 색 — 기존 스파링 화면과 같은 값(성공 = ChipSection gold, 실패 = red)
const TONES = {
  gold: { solid: '#F5A623',    dim: '#FEF3E2',        text: '#F5A623' },
  red:  { solid: 'var(--red)', dim: 'var(--red-dim)', text: 'var(--red)' },
};
const chipBase = {
  padding: '5px 11px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%',
};
const hintStyle = { fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 };

export default function TechPicker({ tone, pool, catCounts, selected, onToggle, onAdd, onRemove, onRegister }) {
  const T = TONES[tone] || TONES.gold;
  const [cat, setCat]         = useState(null);    // 라운드(카드) 안에서 마지막 카테고리 유지 — 고른 뒤에도 안 닫힌다
  const [query, setQuery]     = useState('');
  const [more, setMore]       = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addCat, setAddCat]   = useState(null);
  const [busy, setBusy]       = useState(false);   // 기술트리 등록 요청 중 — 두 번 눌러 두 번 보내지 않게
  const inputRef = useRef(null);

  const poolKeys = useMemo(() => new Set(pool.map(t => t.key)), [pool]);
  const pickedKeys = useMemo(() => new Set(selected.map(s => normalize(s.name))), [selected]);
  const catList = useMemo(() => (cat ? pool.filter(t => t.selectable && t.group === cat).sort(byUsage) : []), [pool, cat]);
  const { qn, results, exact } = useMemo(() => searchPool(pool, query, cat), [pool, query, cat]);
  const canAdd  = !!qn && !exact;                  // `+` 는 이름이 똑같은(정규화) 기술이 트리에 없을 때만
  const typed   = query.trim().replace(/\s+/g, ' ');
  const hold    = canAdd ? holdOf(qn) : null;
  const similar = useMemo(() => (canAdd ? similarTo(pool, qn) : []), [pool, qn, canAdd]);

  function pickCat(c) { setCat(prev => (prev === c ? null : c)); setMore(false); }
  function chooseFromSearch(name) {
    onToggle(name);
    setQuery('');
    setAddOpen(false);
  }
  function openAdd() {
    setAddCat(TECH_CATEGORIES.includes(cat) ? cat : null);
    setAddOpen(true);
  }
  function addRecordOnly() {
    if (!typed || busy) return;
    onAdd(typed);
    setQuery('');
    setAddOpen(false);
  }
  async function register() {
    if (!typed || !addCat || hold || busy) return;
    setBusy(true);
    let r = null;
    try { r = await onRegister(typed, addCat); } finally { setBusy(false); }
    if (!r || !r.name) return;                     // 실패 — 항목을 넣지 않고 칸을 열어 둔다("이 기록에만"으로 바꿀 수 있게)
    onAdd(r.name);
    setQuery('');
    setAddOpen(false);
  }
  function onKeyDown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (exact) chooseFromSearch(exact.name);
    else if (canAdd) openAdd();                     // Enter 로는 칸만 연다 — 어디에 남길지는 매번 고른다
  }

  const listVisible = more ? catList : catList.slice(0, MORE_LIMIT);

  return (
    <div data-picker={tone}>
      {/* ① 카테고리 줄 — 3칸 × 2줄(360px 에서 한 줄 6개는 넘친다). 다시 누르면 접힌다 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5 }}>
        {TECH_CATEGORIES.map(key => {
          const on = cat === key;
          const n = catCounts?.[key] || 0;
          return (
            <button key={key} type="button" data-cat={key} onClick={() => pickCat(key)} aria-pressed={on} style={{
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

      {/* ② 고른 기술 — 저장된 이름 그대로(트리에 없는 옛 철자 포함). 점선 = 기술트리에 없는 이름 */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {selected.map(({ name, i }) => {
            const inTree = poolKeys.has(normalize(name));
            return (
              <button key={`${i}-${name}`} type="button" data-picked={name} data-where={inTree ? 'tree' : 'record'}
                onClick={() => onRemove(i)} aria-label={`${name} 빼기`} style={{
                  padding: '4px 10px', borderRadius: 20,
                  background: T.solid, color: '#fff',
                  border: inTree ? '1.5px solid transparent' : '1.5px dashed rgba(255,255,255,0.85)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%',
                }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                <span style={{ fontSize: 13, opacity: 0.8 }}>×</span>
              </button>
            );
          })}
        </div>
      )}
      {selected.some(s => !poolKeys.has(normalize(s.name))) && (
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
          onChange={e => setQuery(e.target.value)}
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
          <button type="button" onClick={() => { setQuery(''); setAddOpen(false); inputRef.current?.focus(); }} aria-label="검색어 지우기" style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            width: 24, height: 24, borderRadius: 12, border: 'none', background: 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <Icon name="x" size={12} color="var(--text2)" />
          </button>
        )}
      </div>

      {/* ④ 목록 — 검색어가 있으면 검색 결과(다른 카테고리엔 이름표), 없으면 고른 카테고리의 사용 횟수순 */}
      {qn ? (
        <div data-list style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {results.map(t => (
            <TechChip key={t.key} t={t} T={T} selected={pickedKeys.has(t.key)} showGroup={t.group !== cat}
              onClick={() => chooseFromSearch(t.name)} />
          ))}
          {!results.length && <span style={{ ...hintStyle, alignSelf: 'center' }}>내 기술트리에 없는 이름이에요</span>}
          {canAdd && <AddChip color={T.solid} text={typed} onClick={openAdd} />}
        </div>
      ) : cat && (
        <div data-list style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {listVisible.map(t => (
            <TechChip key={t.key} t={t} T={T} selected={pickedKeys.has(t.key)} onClick={() => onToggle(t.name)} />
          ))}
          {catList.length > MORE_LIMIT && (
            <button type="button" onClick={() => setMore(m => !m)} style={{
              ...chipBase, background: 'transparent', color: 'var(--text2)',
              border: '1px dashed var(--border-med)', fontWeight: 600,
            }}>{more ? '접기' : `더 보기 +${catList.length - MORE_LIMIT}`}</button>
          )}
          {!catList.length && (
            <span style={{ ...hintStyle, color: 'var(--text2)' }}>
              내 기술트리에 {cat} 기술이 없어요 — 위 검색창에 이름을 적고 <b style={{ color: 'var(--accent)' }}>+</b> 로 추가
            </span>
          )}
        </div>
      )}

      {/* ⑤ `+` 칸 — 카드 안에서 펼친다(모달 아님) */}
      {addOpen && canAdd && (
        <div data-add-panel style={{
          marginTop: 8, padding: '10px 10px 12px', borderRadius: 10,
          background: 'var(--surface)', border: '1px solid var(--border-med)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>「{typed}」 추가</span>
            <button type="button" onClick={() => setAddOpen(false)} aria-label="닫기" style={{
              width: 24, height: 24, borderRadius: 12, border: 'none', background: 'transparent',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
            }}><Icon name="x" size={12} color="var(--text2)" /></button>
          </div>

          {similar.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ ...hintStyle, color: 'var(--text2)', marginBottom: 5 }}>혹시 이거예요? — 누르면 그 기술로 고릅니다</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {similar.map(t => (
                  <TechChip key={t.key} t={t} T={T} selected={pickedKeys.has(t.key)} showGroup
                    onClick={() => chooseFromSearch(t.name)} />
                ))}
              </div>
            </div>
          )}

          <div style={{ ...hintStyle, color: 'var(--text2)', marginBottom: 5 }}>어디에 남길까요? — 매번 고릅니다</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button type="button" onClick={addRecordOnly} disabled={busy} style={optionStyle(busy)}>
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
                    {TECH_CATEGORIES.map(k => {
                      const on = addCat === k;
                      return (
                        <button key={k} type="button" onClick={() => setAddCat(k)} aria-pressed={on} disabled={busy} style={{
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
                type="button"
                data-register
                disabled={!!hold || !addCat || busy}
                onClick={register}
                style={{
                  alignSelf: 'flex-end', marginTop: 6, padding: '6px 12px', borderRadius: 14, border: 'none',
                  background: hold || !addCat ? 'var(--border-med)' : 'var(--accent)',
                  color: hold || !addCat ? 'var(--text3)' : '#fff',
                  fontSize: 12, fontWeight: 700,
                  cursor: hold || !addCat ? 'not-allowed' : busy ? 'wait' : 'pointer',
                }}
              >{hold ? '등록 불가' : busy ? '등록 중…' : addCat ? `${addCat}에 등록하고 고르기` : '카테고리를 먼저 고르세요'}</button>
            </div>
          </div>
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

function GroupTag({ children }) {
  return (
    <span style={{
      fontSize: 10, padding: '0 5px', borderRadius: 4, lineHeight: '16px',
      background: 'var(--surface-hi)', color: 'var(--text2)', fontWeight: 600, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

/** 목록의 기술 칩 — 고른 것은 그 선택기 색으로. 숫자 = 내 스파링 사용 횟수(성공+실패) */
function TechChip({ t, T, selected, showGroup, onClick }) {
  const style = selected
    ? { background: T.dim, color: T.text, border: `1px solid ${T.solid}`, fontWeight: 700 }
    : { background: 'var(--surface)', color: t.excluded ? 'var(--text3)' : 'var(--text2)', border: '1px solid var(--border-med)', fontWeight: 500 };
  return (
    <button type="button" onClick={onClick} aria-pressed={!!selected} data-name={t.name} data-group={showGroup ? groupLabel(t) : ''}
      style={{ ...chipBase, ...style }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
      {t.count > 0 && <span style={{ fontSize: 10.5, color: 'var(--text3)', fontWeight: 500 }}>{t.count}</span>}
      {showGroup && <GroupTag>{groupLabel(t)}</GroupTag>}
    </button>
  );
}

function AddChip({ color, text, onClick }) {
  return (
    <button type="button" data-add={text} onClick={onClick} style={{
      ...chipBase, background: 'transparent', color, border: `1px dashed ${color}`, fontWeight: 700,
    }}>
      <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>「{text}」 추가</span>
    </button>
  );
}
