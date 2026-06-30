import React, { useState, useEffect } from 'react';
import { useCache } from '../contexts/CacheContext';
import SwipeCardDeck from '../components/SwipeCardDeck';
import PickDetailPanel from '../components/PickDetailPanel';
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

  // ─── 이력 탭 상태 ────────────────────────────────────────────────────────
  const [history, setHistory]       = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  const { clips } = useCache();

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

  // ─── 오늘픽 시작 (카드 풀 선택) ──────────────────────────────────────────
  function handleStartDeck(pool) {
    const source = pool === 'starred'
      ? clips.filter(c => c.starred === 1)
      : [...clips];

    if (source.length === 0) {
      alert('등록된 영상이 없습니다');
      return;
    }

    const shuffled = fisherYates([...source]);
    setCardPool(pool);
    setShuffledClips(shuffled);
    setDeckState('swiping');
  }

  // ─── 카드 픽 ─────────────────────────────────────────────────────────────
  async function handlePick(clip) {
    // 이미 오늘 픽한 클립이면 중복 방지
    if (todayPicks.find(p => p.id === clip.id)) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      await createPick({ clip_id: clip.id, pick_date: today });
    } catch (e) {
      console.error('픽 저장 실패:', e);
    }
    setTodayPicks(prev => [...prev, clip]);
  }

  // ─── 다시 생성 (재셔플) ──────────────────────────────────────────────────
  function handleReshuffle() {
    const pool = cardPool === 'starred'
      ? clips.filter(c => c.starred === 1)
      : clips;
    const shuffled = fisherYates([...pool]);
    setShuffledClips(shuffled);
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

  // ─── PickDetailPanel onUnpick ─────────────────────────────────────────────
  async function handleUnpick(clipId) {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const allPicks = await listPicks();
      const todayGroup = allPicks.find(g => g.date === today);
      const target = todayGroup?.picks.find(p => p.clip_id === clipId);
      if (target) await deletePick(target.id);
    } catch (e) {
      console.error('픽 취소 실패:', e);
    }
    setTodayPicks(prev => prev.filter(c => c.id !== clipId));
    setDetailClip(null);
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

              {/* 스와이프 덱 */}
              <SwipeCardDeck
                clips={shuffledClips}
                onPick={handlePick}
                onCardTap={handleCardTap}
              />

              {/* 오늘 픽한 카드 썸네일 row */}
              {todayPicks.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--text3)',
                    fontWeight: 600,
                    marginBottom: 6,
                    letterSpacing: '0.05em',
                  }}>
                    오늘의 픽 ({todayPicks.length})
                  </div>
                  <div style={{ overflowX: 'auto', display: 'flex', gap: 8 }}>
                    {todayPicks.map(clip => (
                      <img
                        key={clip.id}
                        src={clip.thumb_url || ''}
                        onClick={() => { setDetailClip(clip); setDetailMode('picked'); }}
                        style={{
                          width: 60,
                          height: 60,
                          objectFit: 'cover',
                          borderRadius: 8,
                          cursor: 'pointer',
                          border: '2px solid var(--accent)',
                          flexShrink: 0,
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
              <h3 style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text2)',
                marginBottom: 8,
                letterSpacing: '0.02em',
              }}>
                {date}
              </h3>
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
                        background: 'transparent',
                        border: 'none',
                        fontSize: 16,
                        cursor: 'pointer',
                        padding: 4,
                        color: 'var(--text3)',
                        flexShrink: 0,
                      }}
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── PickDetailPanel (전역 — 탭 무관) ──────────────────────────────── */}
      {detailClip && (
        <PickDetailPanel
          clip={detailClip}
          mode={detailMode}
          onClose={() => setDetailClip(null)}
          onPick={async (clip) => {
            await handlePick(clip);
            setDetailClip(null);
          }}
          onUnpick={handleUnpick}
        />
      )}
    </div>
  );
}
