import React, { useState, useRef } from 'react';
import TechCard from './TechCard';

/**
 * SwipeCardDeck — 터치/마우스 스와이프로 카드를 탐색하는 덱 컴포넌트
 *
 * Props:
 *   clips    : VideoClip[] — 카드 배열 (이미 셔플된 상태로 전달됨)
 *   onPick   : (clip) => void — 위 스와이프 시 호출
 *   onCardTap: (clip) => void — 카드 탭(클릭) 시 상세보기 호출
 */
export default function SwipeCardDeck({ clips = [], onPick, onCardTap }) {
  const [index, setIndex]     = useState(0);
  const [drag, setDrag]       = useState({ x: 0, y: 0, active: false });
  const [picking, setPicking] = useState(false);

  // 드래그 시작 좌표 추적용 ref
  const startRef = useRef({ x: 0, y: 0 });
  // stale closure 방지: drag.active를 ref로 동기 추적
  const activeRef = useRef(false);

  if (!clips || clips.length === 0) {
    return (
      <div style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        height:         500,
        color:          'var(--text2)',
        fontSize:       14,
      }}>
        카드가 없습니다
      </div>
    );
  }

  // ─── 드래그 시작 ───────────────────────────────────────────────────────────

  function dragStart(x, y) {
    if (picking) return;
    startRef.current = { x, y };
    activeRef.current = true;
    setDrag({ x: 0, y: 0, active: true });
  }

  function handleMouseDown(e) {
    e.preventDefault();
    dragStart(e.clientX, e.clientY);
  }

  function handleTouchStart(e) {
    const t = e.touches[0];
    dragStart(t.clientX, t.clientY);
  }

  // ─── 드래그 중 ─────────────────────────────────────────────────────────────

  function dragMove(x, y) {
    if (!activeRef.current) return;
    setDrag(prev => ({
      ...prev,
      x: x - startRef.current.x,
      y: y - startRef.current.y,
    }));
  }

  function handleMouseMove(e) {
    dragMove(e.clientX, e.clientY);
  }

  function handleTouchMove(e) {
    const t = e.touches[0];
    dragMove(t.clientX, t.clientY);
  }

  // ─── 드래그 종료 ───────────────────────────────────────────────────────────

  function dragEnd(x, y) {
    if (!activeRef.current) return;
    activeRef.current = false;

    const dx = x - startRef.current.x;
    const dy = y - startRef.current.y;
    const totalMove = Math.abs(dx) + Math.abs(dy);

    if (totalMove < 10) {
      // 탭으로 간주
      if (onCardTap && clips[index]) {
        onCardTap(clips[index]);
      }
    } else if (dy < -80) {
      // 위 스와이프 → 픽!
      setPicking(true);
      setTimeout(() => {
        if (onPick && clips[index]) {
          onPick(clips[index]);
        }
        setIndex(i => i + 1);
        setPicking(false);
      }, 300);
    } else if (Math.abs(dx) > 60) {
      // 좌/우 스와이프 → 다음/이전
      if (dx < 0) {
        setIndex(i => Math.min(i + 1, clips.length - 1));
      } else {
        setIndex(i => Math.max(i - 1, 0));
      }
    }

    setDrag({ x: 0, y: 0, active: false });
  }

  function handleMouseUp(e) {
    dragEnd(e.clientX, e.clientY);
  }

  function handleMouseLeave(e) {
    // 드래그 중 영역 이탈 시 종료
    if (activeRef.current) {
      dragEnd(e.clientX, e.clientY);
    }
  }

  function handleTouchEnd(e) {
    const t = e.changedTouches[0];
    dragEnd(t.clientX, t.clientY);
  }

  // ─── 렌더링 ────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative', userSelect: 'none', WebkitUserSelect: 'none' }}>

      {/* 진행 표시 */}
      <div style={{
        textAlign:    'center',
        fontSize:     13,
        color:        'var(--text2)',
        marginBottom: 12,
        fontWeight:   600,
        letterSpacing:'0.02em',
      }}>
        {Math.min(index + 1, clips.length)} / {clips.length}
      </div>

      {/* 카드 스택 영역 — 중앙 80%만 터치 영역으로 제한해 좌우에 페이지 스크롤 공간 확보 */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            position:    'relative',
            width:       '80%',
            maxWidth:    260,
            height:      380,
            touchAction: 'none',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {[index + 2, index + 1, index].map((cardIdx, stackPos) => {
            const isTop  = stackPos === 2;
            const offset = 2 - stackPos;

            if (!clips[cardIdx]) return null;

            let transform;
            if (isTop) {
              if (picking) {
                transform = 'translateX(0px) translateY(-120%) rotate(0deg)';
              } else {
                transform = `translateX(${drag.x}px) translateY(${drag.y}px) rotate(${drag.x * 0.05}deg)`;
              }
            } else {
              transform = `scale(${1 - offset * 0.04}) translateY(${offset * 8}px)`;
            }

            const transition =
              isTop && drag.active && !picking
                ? 'none'
                : 'transform 0.3s ease, opacity 0.3s ease';

            const opacity = isTop && picking ? 0 : 1;

            return (
              <div
                key={clips[cardIdx].id}
                style={{
                  position:     'absolute',
                  width:        '100%',
                  transform,
                  transition,
                  opacity,
                  zIndex:       stackPos,
                  pointerEvents: isTop ? undefined : 'none',
                }}
              >
                <TechCard clip={clips[cardIdx]} onClick={undefined} />
              </div>
            );
          })}

          {/* 모든 카드 소진 시 메시지 */}
          {index >= clips.length && (
            <div style={{
              position:       'absolute',
              inset:          0,
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            12,
              color:          'var(--text2)',
            }}>
              <div style={{ fontSize: 32 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>모든 카드를 확인했습니다</div>
            </div>
          )}
        </div>
      </div>

      {/* 제스처 힌트 */}
      <div style={{
        display:        'flex',
        justifyContent: 'center',
        gap:            24,
        marginTop:      16,
        fontSize:       12,
        color:          'var(--text3)',
        fontWeight:     500,
        letterSpacing:  '0.01em',
      }}>
        <span>← 이전</span>
        <span style={{ color: 'var(--accent)' }}>↑ 픽</span>
        <span>다음 →</span>
      </div>
    </div>
  );
}
