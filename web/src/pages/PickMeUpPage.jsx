import React, { useState, useEffect, useMemo } from 'react';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';
import SwipeCardDeck from '../components/SwipeCardDeck';
import ClipDetailModal from '../components/ClipDetailModal';
import { listPicks, createPick, deletePick } from '../api/picks';

// ─── Fisher-Yates 셔플 ──────────────────────────────────────────────────────
function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── 세그먼트 탭 버튼 (TechPlanPage 스타일) ────────────────────────────────
function SegBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 12px',
        background: active ? 'var(--surface)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text2)',
        border: 'none',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: active ? '0 2px 6px rgba(0,0,0,0.3)' : 'none',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

// ─── 포지션 실시간 필터 칩 (ClipsPage FilterChip 스타일) ──────────────────
function PositionChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 13px',
        background: active ? 'var(--accent)' : 'var(--surface-up)',
        color: active ? '#fff' : 'var(--text2)',
        border: 'none',
        borderRadius: 16,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────
export default function PickMeUpPage() {
  const [tab, setTab] = useState('today'); // 'today' | 'history'

  // ─── 오늘픽 탭 상태 ──────────────────────────────────────────────────────
  const [deckState, setDeckState]       = useState('idle'); // 'idle' | 'swiping' | 'done'
  const [cardPool, setCardPool]         = useState('all');  // 'all' | 'starred'
  const [todayPicks, setTodayPicks]     = useState([]);     // 오늘 선택한 clip 객체 배열
  const [detailClip, setDetailClip]     = useState(null);   // 상세보기 중인 clip
  const [detailMode, setDetailMode]     = useState('browse');
  const [shuffledClips, setShuffledClips] = useState([]);
  const [confirming, setConfirming]       = useState(false);
  const [excludedPickIds, setExcludedPickIds] = useState(() => new Set()); // 현재 세션에서 제외할 clip_id (기본: 오늘 픽)
  const [positionFilter, setPositionFilter] = useState('all'); // 'all' | 포지션명 — 카드 보기 중 실시간 전환
  const [continuingDate, setContinuingDate] = useState(null); // 이력에서 "이어서 뽑기"로 이어가는 중인 과거 날짜 (null이면 평소처럼 오늘 세션)

  // 현재 셔플된 풀에 실제로 존재하는 포지션만 필터 칩으로 노출
  const availablePositions = useMemo(() => {
    const set = new Set();
    shuffledClips.forEach(c => (c.positions || []).forEach(p => { if (p) set.add(p); }));
    return [...set];
  }, [shuffledClips]);

  // 포지션 필터는 재조회/재셔플 없이 이미 뽑힌 풀을 즉시 다시 거르기만 한다
  const displayedClips = useMemo(() => {
    if (positionFilter === 'all') return shuffledClips;
    return shuffledClips.filter(c => (c.positions || []).includes(positionFilter));
  }, [shuffledClips, positionFilter]);

  // ─── 이력 탭 상태 ────────────────────────────────────────────────────────
  const [history, setHistory]       = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  const { clips } = useCache();
  const { showToast } = useUI();
  const todayDateStr = new Date().toISOString().slice(0, 10); // 이력 탭에서 "오늘" 날짜 그룹 구분용

  // ─── 이력 탭 진입 시 데이터 로드 ─────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'history') return;
    let cancelled = false;
    setHistLoading(true);
    listPicks()
      .then(data => { if (!cancelled) { setHistory(data); } })
      .catch(() => { if (!cancelled) { setHistory([]); } })
      .finally(() => { if (!cancelled) { setHistLoading(false); } });
    return () => { cancelled = true; };
  }, [tab]);

  // ─── 오늘 이미 확정된 픽 조회 (마운트 시) ───────────────────────────────
  // 재진입 시 오늘 이미 뽑은 카드는 카드 풀에서 기본으로 제외해 "이어서 뽑기"가 되게 한다.
  // 이력 탭에서 과거 날짜를 골라 "이어서 뽑기"를 누르면 이 제외 목록이 그 날짜의 픽으로 대체된다 (handleContinueFromDate).
  useEffect(() => {
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);
    listPicks()
      .then(data => {
        if (cancelled) return;
        const todayGroup = data.find(g => g.date === today);
        const ids = new Set((todayGroup?.picks || []).map(p => p.clip_id));
        setExcludedPickIds(ids);
      })
      .catch(() => { if (!cancelled) setExcludedPickIds(new Set()); });
    return () => { cancelled = true; };
  }, []);

  // ─── 오늘픽 시작 (카드 풀 선택) ──────────────────────────────────────────
  function handleStartDeck(pool) {
    const base = pool === 'starred'
      ? clips.filter(c => c.starred === 1)
      : [...clips];
    const source = base.filter(c => !excludedPickIds.has(c.id));

    if (source.length === 0) {
      alert(
        base.length === 0
          ? '등록된 영상이 없습니다'
          : '오늘 뽑을 수 있는 카드가 없습니다 — 모두 뽑으셨어요! 🎉'
      );
      return;
    }

    const shuffled = fisherYates([...source]);
    setCardPool(pool);
    setShuffledClips(shuffled);
    setPositionFilter('all');
    setDeckState('swiping');
  }

  // ─── 카드 픽 (로컬만 — 확정 버튼 누를 때 DB 저장) ───────────────────────
  function handlePick(clip) {
    if (todayPicks.find(p => p.id === clip.id)) return;
    setTodayPicks(prev => [...prev, clip]);
  }

  // ─── 오늘픽 확정 → DB 일괄 저장 ─────────────────────────────────────────
  // 이력에서 "이어서 뽑기"로 진입한 상태(continuingDate)면 오늘 날짜가 아니라
  // 이어서 뽑던 그 날짜로 저장한다 (= 그 날짜 이력에 추가하는 것으로 처리).
  async function handleConfirmPicks() {
    if (todayPicks.length === 0 || confirming) return;
    setConfirming(true);
    const pickDate = continuingDate || todayDateStr;
    const count = todayPicks.length;
    try {
      await Promise.all(todayPicks.map(clip => createPick({ clip_id: clip.id, pick_date: pickDate })));
      // 확정 직후 같은 세션에서 재섞기해도 방금 뽑은 카드가 다시 나오지 않도록 로컬 즉시 반영
      setExcludedPickIds(prev => {
        const next = new Set(prev);
        todayPicks.forEach(clip => next.add(clip.id));
        return next;
      });
      setTodayPicks([]);
      showToast(continuingDate ? `${pickDate}에 ${count}개 추가됐습니다` : '오늘의 픽이 저장되었습니다');
    } catch (e) {
      console.error('픽 확정 실패:', e);
      alert('저장 실패: ' + (e.message || e));
    } finally {
      setConfirming(false);
    }
  }

  // ─── 다시 생성 (재셔플) ──────────────────────────────────────────────────
  // 포지션 필터가 걸려 있으면 해당 포지션 카드끼리만 순서를 섞는다 (전체 풀은 그대로 유지)
  function handleReshuffle() {
    if (positionFilter === 'all') {
      const base = cardPool === 'starred'
        ? clips.filter(c => c.starred === 1)
        : clips;
      const pool = base.filter(c => !excludedPickIds.has(c.id));
      setShuffledClips(fisherYates([...pool]));
      return;
    }
    setShuffledClips(prev => {
      const matches = c => (c.positions || []).includes(positionFilter);
      const shuffledMatching = fisherYates(prev.filter(matches));
      let mi = 0;
      return prev.map(c => (matches(c) ? shuffledMatching[mi++] : c));
    });
  }

  // ─── 카드 탭 → 상세보기 ──────────────────────────────────────────────────
  function handleCardTap(clip) {
    setDetailClip(clip);
    setDetailMode('browse');
  }

  // ─── 이력 픽 삭제 ────────────────────────────────────────────────────────
  async function handleDeletePick(id) {
    try {
      await deletePick(id);
      // 오늘 확정 픽(또는 "이어서 뽑기"로 합산된 과거 픽)을 이력에서 삭제한 경우,
      // 같은 clip_id가 다른 날짜 이력에 더 남아있지 않을 때만 제외 목록에서 해제한다
      // (여러 날짜에 걸쳐 중복 픽된 카드일 수 있으므로 무조건 해제하면 안 됨)
      const deletedClipId = history
        .flatMap(g => g.picks)
        .find(p => p.id === id)?.clip_id;
      if (deletedClipId != null) {
        const stillExists = history.some(g => g.picks.some(p => p.id !== id && p.clip_id === deletedClipId));
        if (!stillExists) {
          setExcludedPickIds(prev => {
            if (!prev.has(deletedClipId)) return prev;
            const next = new Set(prev);
            next.delete(deletedClipId);
            return next;
          });
        }
      }
      setHistory(prev =>
        prev
          .map(group => ({
            ...group,
            picks: group.picks.filter(p => p.id !== id),
          }))
          .filter(group => group.picks.length > 0)
      );
    } catch (e) {
      console.error('픽 삭제 실패:', e);
      alert('픽 삭제에 실패했습니다: ' + (e.message || e));
    }
  }

  // ─── 상세(ClipDetailModal) 픽 취소 ────────────────────────────────────────
  async function handleUnpick(clipId) {
    // 확정 전 로컬 픽 → DB 호출 없이 목록에서만 제거
    if (detailMode === 'picked') {
      setTodayPicks(prev => prev.filter(c => c.id !== clipId));
      setDetailClip(null);
      return;
    }
    // 이력 탭 픽 → DB 삭제
    try {
      const allPicks = await listPicks();
      const target = allPicks.flatMap(g => g.picks).find(p => p.clip_id === clipId);
      if (target) await deletePick(target.id);
      // 오늘 확정 픽을 취소한 경우, 같은 clip_id가 다른 날짜 이력에 더 없을 때만 제외 목록에서 해제
      const stillExists = allPicks.some(g => g.picks.some(p => p.id !== target?.id && p.clip_id === clipId));
      if (!stillExists) {
        setExcludedPickIds(prev => {
          if (!prev.has(clipId)) return prev;
          const next = new Set(prev);
          next.delete(clipId);
          return next;
        });
      }
      setDetailClip(null);
    } catch (e) {
      console.error('픽 취소 실패:', e);
      setDetailClip(null);
    }
  }

  // ─── 이력에서 과거 날짜 골라 이어서 뽑기 ────────────────────────────────
  // 선택한 날짜의 세션을 이어간다: 그 날짜에 이미 뽑은 카드만 제외 대상으로 삼고(다른 날짜와 섞지 않음),
  // 이 상태에서 확정하면 오늘이 아니라 그 날짜로 저장된다 (handleConfirmPicks 참고).
  function handleContinueFromDate(date) {
    if (todayPicks.length > 0) {
      const ok = confirm('확정하지 않은 픽이 있습니다. 세션을 전환하면 사라집니다. 계속할까요?');
      if (!ok) return;
      setTodayPicks([]);
    }
    const group = history.find(g => g.date === date);
    if (!group) return;
    const ids = new Set(group.picks.map(p => p.clip_id));
    setContinuingDate(date);
    setExcludedPickIds(ids);
    setPositionFilter('all');
    setDeckState('idle');
    setTab('today');
    showToast(`${date} 세션을 이어서 뽑습니다`);
  }

  // ─── 이어서 뽑기 모드 종료 → 오늘 세션으로 복귀 ─────────────────────────
  function handleExitContinuing() {
    if (todayPicks.length > 0) {
      const ok = confirm('확정하지 않은 픽이 있습니다. 오늘로 돌아가면 사라집니다. 계속할까요?');
      if (!ok) return;
      setTodayPicks([]);
    }
    setContinuingDate(null);
    setPositionFilter('all');
    setDeckState('idle');
    listPicks()
      .then(data => {
        const todayGroup = data.find(g => g.date === todayDateStr);
        setExcludedPickIds(new Set((todayGroup?.picks || []).map(p => p.clip_id)));
      })
      .catch(() => setExcludedPickIds(new Set()));
  }

  // ─── 렌더링 ──────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '16px', paddingBottom: 80 }}>
      {/* 페이지 제목 */}
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 14 }}>
        픽미업
      </div>

      {/* 세그먼트 탭 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        background: 'var(--surface-up)',
        borderRadius: 10,
        padding: 3,
        marginBottom: 16,
        gap: 3,
      }}>
        <SegBtn active={tab === 'today'}   onClick={() => setTab('today')}>오늘픽</SegBtn>
        <SegBtn active={tab === 'history'} onClick={() => setTab('history')}>이력</SegBtn>
      </div>

      {/* ─── 오늘픽 탭 ─────────────────────────────────────────────────────── */}
      {tab === 'today' && (
        <div>
          {continuingDate && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, padding: '10px 14px', marginBottom: 14,
              background: 'var(--accent-dim, rgba(0,0,0,0.05))',
              border: '1px solid var(--accent)', borderRadius: 12,
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' }}>
                📅 {continuingDate} 세션 이어서 뽑는 중 — 여기서 뽑으면 이 날짜에 추가됩니다
              </span>
              <button
                onClick={handleExitContinuing}
                style={{
                  padding: '4px 10px', background: 'var(--surface)', color: 'var(--text2)',
                  border: '1px solid var(--border-med)', borderRadius: 16,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                오늘로 복귀
              </button>
            </div>
          )}

          {deckState === 'idle' && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 48,
              gap: 24,
            }}>
              <div style={{
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--text)',
                textAlign: 'center',
                lineHeight: 1.6,
              }}>
                오늘 스파링에서 쓸 기술 카드를 뽑아보세요 🥋
              </div>

              {excludedPickIds.size > 0 && (
                <div style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--accent)',
                  background: 'var(--accent-dim, rgba(0,0,0,0.05))',
                  padding: '6px 14px', borderRadius: 20,
                }}>
                  이미 뽑은 카드 {excludedPickIds.size}개 제외 중
                </div>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => handleStartDeck('all')}
                  style={{
                    padding: '12px 24px',
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  전체영상
                </button>
                <button
                  onClick={() => handleStartDeck('starred')}
                  style={{
                    padding: '12px 24px',
                    background: 'var(--surface-up)',
                    color: 'var(--amber)',
                    border: '1px solid var(--amber)',
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  즐겨찾기
                </button>
              </div>
            </div>
          )}

          {deckState === 'swiping' && (
            <div>
              {/* 다시 생성 버튼 */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button
                  onClick={handleReshuffle}
                  style={{
                    padding: '6px 14px',
                    background: 'var(--surface-up)',
                    color: 'var(--text2)',
                    border: '1px solid var(--border)',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  🔀 다시 생성
                </button>
              </div>

              {/* 포지션 실시간 전환 — 뽑기 시작 방식은 그대로 두고, 보는 중에만 좁혀 본다 */}
              {availablePositions.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  <PositionChip active={positionFilter === 'all'} onClick={() => setPositionFilter('all')}>
                    전체
                  </PositionChip>
                  {availablePositions.map(p => (
                    <PositionChip key={p} active={positionFilter === p} onClick={() => setPositionFilter(p)}>
                      {p}
                    </PositionChip>
                  ))}
                </div>
              )}

              {/* 스와이프 덱 — key로 포지션 전환 시 카드 인덱스를 처음으로 리셋 */}
              <SwipeCardDeck
                key={positionFilter}
                clips={displayedClips}
                onPick={handlePick}
                onCardTap={handleCardTap}
              />

              {/* 오늘 픽한 카드 썸네일 row + 확정 버튼 */}
              {todayPicks.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', marginBottom: 8,
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em' }}>
                      {continuingDate ? `${continuingDate}에 추가할 픽` : '오늘의 픽'} ({todayPicks.length})
                    </div>
                    <button
                      onClick={handleConfirmPicks}
                      disabled={confirming}
                      style={{
                        padding: '6px 14px',
                        background: confirming ? 'var(--surface-up)' : 'var(--accent)',
                        color: confirming ? 'var(--text2)' : '#fff',
                        border: 'none', borderRadius: 20,
                        fontSize: 12, fontWeight: 700,
                        cursor: confirming ? 'not-allowed' : 'pointer',
                      }}>
                      {confirming ? '저장 중...' : '✓ 확정하기'}
                    </button>
                  </div>
                  <div style={{ overflowX: 'auto', display: 'flex', gap: 8 }}>
                    {todayPicks.map(clip => (
                      <img
                        key={clip.id}
                        src={clip.thumb_url || ''}
                        onClick={() => { setDetailClip(clip); setDetailMode('picked'); }}
                        style={{
                          width: 60, height: 60, objectFit: 'cover',
                          borderRadius: 8, cursor: 'pointer',
                          border: '2px solid var(--accent)', flexShrink: 0,
                        }}
                        alt={clip.title}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── 이력 탭 ─────────────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div>
          {histLoading && (
            <div style={{
              textAlign: 'center',
              color: 'var(--text2)',
              padding: 32,
              fontSize: 14,
            }}>
              로딩 중...
            </div>
          )}

          {!histLoading && history.length === 0 && (
            <div style={{
              textAlign: 'center',
              color: 'var(--text2)',
              padding: 32,
              fontSize: 14,
              background: 'var(--surface)',
              borderRadius: 12,
              border: '1px solid var(--border)',
            }}>
              픽 이력이 없습니다
            </div>
          )}

          {!histLoading && history.map(({ date, picks }) => (
            <div key={date} style={{ marginBottom: 20 }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', marginBottom: 8,
              }}>
                <h3 style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text2)',
                  margin: 0,
                  letterSpacing: '0.02em',
                }}>
                  {date}
                </h3>
                {date !== todayDateStr && (
                  date === continuingDate ? (
                    <span style={{
                      padding: '4px 12px',
                      background: 'var(--accent)',
                      color: '#fff',
                      borderRadius: 20,
                      fontSize: 11, fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}>
                      ● 이어서 뽑는 중
                    </span>
                  ) : (
                    <button
                      onClick={() => handleContinueFromDate(date)}
                      style={{
                        padding: '4px 12px',
                        background: 'var(--accent-dim, rgba(0,0,0,0.05))',
                        color: 'var(--accent)',
                        border: 'none', borderRadius: 20,
                        fontSize: 11, fontWeight: 700,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      ▶ 이어서 뽑기
                    </button>
                  )
                )}
              </div>
              <div style={{
                background: 'var(--surface)',
                borderRadius: 12,
                border: '1px solid var(--border)',
                overflow: 'hidden',
              }}>
                {picks.map((pick, i) => (
                  <div
                    key={pick.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <img
                      src={pick.clip?.thumb_url || ''}
                      alt={pick.clip?.title || ''}
                      style={{
                        width: 50,
                        height: 50,
                        objectFit: 'cover',
                        borderRadius: 8,
                        flexShrink: 0,
                        background: 'var(--surface-up)',
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text)',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      onClick={() => {
                        setDetailClip(pick.clip);
                        setDetailMode('history');
                        setTab('today');
                      }}
                    >
                      {pick.clip?.title || '(제목 없음)'}
                    </span>
                    <button
                      onClick={() => handleDeletePick(pick.id)}
                      style={{
                        width: 28, height: 28,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--surface-up)',
                        border: '1px solid var(--border-med)',
                        borderRadius: 8,
                        fontSize: 13, fontWeight: 600,
                        color: 'var(--text2)',
                        cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── 상세 (전역 — 탭 무관) ─────────────────────────────────────────────
          task-036: 참고영상과 **같은 ClipDetailModal** 을 연다 — 상세 화면이 바뀌면 픽미업도 같이 바뀐다.
          픽미업만의 차이는 props 로만: 조회 기록 안 함(countView=false), 수정·삭제 없음(읽기 전용),
          하단 고정 픽하기 / 픽 취소(actions). */}
      {detailClip && (() => {
        // 이력 탭의 clip 은 GET /api/picks 가 만든 축약 객체(positions·tags·usage·ai_recommendation 없음)라
        // clips 캐시의 온전한 객체로 연다. 캐시에 없으면(삭제된 영상 등) 넘겨받은 객체 그대로.
        const clip = (clips || []).find(x => x.id === detailClip.id) || detailClip;
        const actionBtn = {
          flex: 1, padding: '14px 0', borderRadius: 12,
          fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.3,
        };
        // 옛 PickDetailPanel 의 ✕ 버튼 — 픽 버튼 옆에서 바로 닫는다(모달 제목줄 X 까지 손을 올리지 않게)
        const closeBtn = (
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setDetailClip(null)}
            style={{
              flexShrink: 0, width: 48, padding: '14px 0', borderRadius: 12,
              background: 'var(--surface-hi)', color: 'var(--text2)',
              border: '1px solid var(--border-med)', fontSize: 20, lineHeight: 1, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        );
        return (
          <ClipDetailModal
            key={detailClip.id}
            c={clip}
            countView={false}
            onClose={() => setDetailClip(null)}
            actions={
              <div style={{ display: 'flex', gap: 8 }}>
                {detailMode === 'browse' ? (
                  <button
                    type="button"
                    onClick={async () => { await handlePick(clip); setDetailClip(null); }}
                    style={{ ...actionBtn, background: 'var(--accent)', color: '#fff', border: 'none' }}
                  >
                    픽하기 ↑
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleUnpick(clip.id)}
                    style={{ ...actionBtn, background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red)' }}
                  >
                    픽 취소
                  </button>
                )}
                {closeBtn}
              </div>
            }
          />
        );
      })()}
    </div>
  );
}
