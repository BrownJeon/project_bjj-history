import React from 'react';

/**
 * TechCard — 스와이프 덱에서 카드 1장을 렌더링
 *
 * Props:
 *   clip    : VideoClip 객체 (필수)
 *             { id, title, url, platform, tech_names: string[], thumb_url, description, starred: 0|1 }
 *   picked  : boolean (기본 false) — true이면 "✓ 픽됨" 배지 표시
 *   onClick : function — 카드 탭 핸들러 (선택)
 */
export default function TechCard({ clip, picked = false, onClick }) {
  if (!clip) return null;

  const {
    title       = '',
    thumb_url   = '',
    tech_names  = [],
    description = '',
    starred     = 0,
  } = clip;

  const hasThumbnail = !!thumb_url;
  const firstTech    = tech_names[0] || '';

  return (
    <div
      onClick={onClick}
      style={{
        position:        'relative',
        width:           '100%',
        maxWidth:        320,
        minHeight:       350,
        background:      'var(--surface)',
        border:          '1px solid var(--border-med)',
        borderRadius:    'var(--radius-xl)',
        overflow:        'hidden',
        display:         'flex',
        flexDirection:   'column',
        cursor:          onClick ? 'pointer' : 'default',
        boxShadow:       '0 4px 24px rgba(0,0,0,0.32)',
        userSelect:      'none',
        WebkitUserSelect:'none',
      }}
    >
      {/* ─── 픽됨 배지 (우상단 absolute) ─── */}
      {picked && (
        <div style={{
          position:     'absolute',
          top:          10,
          right:        10,
          zIndex:       10,
          background:   '#22c55e',
          color:        '#fff',
          fontSize:     11,
          fontWeight:   700,
          padding:      '3px 9px',
          borderRadius: 999,
          letterSpacing:'0.02em',
          boxShadow:    '0 2px 8px rgba(34,197,94,0.35)',
        }}>
          ✓ 픽됨
        </div>
      )}

      {/* ─── 썸네일 영역 (약 55%) ─── */}
      <div style={{
        width:      '100%',
        height:     180,            /* 350 * 0.51 ≈ 180 */
        flexShrink: 0,
        overflow:   'hidden',
        background: hasThumbnail ? '#000' : 'var(--surface-up)',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {hasThumbnail ? (
          <img
            src={thumb_url}
            alt={title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span style={{
            fontSize:   22,
            fontWeight: 700,
            color:      'var(--text2)',
            padding:    '0 16px',
            textAlign:  'center',
            lineHeight: 1.3,
          }}>
            {firstTech || '—'}
          </span>
        )}
      </div>

      {/* ─── 콘텐츠 영역 ─── */}
      <div style={{
        flex:    1,
        padding: '12px 14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap:     8,
        position: 'relative',
      }}>
        {/* ⭐ 별 아이콘 (우상단) */}
        {!!starred && (
          <span style={{
            position:  'absolute',
            top:       12,
            right:     14,
            fontSize:  16,
            lineHeight:1,
          }}>
            ⭐
          </span>
        )}

        {/* 기술명 pill 태그들 */}
        {tech_names.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingRight: starred ? 24 : 0 }}>
            {tech_names.map((name, i) => (
              <span
                key={i}
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  padding:      '3px 9px',
                  borderRadius: 6,
                  fontSize:     11,
                  fontWeight:   600,
                  color:        '#1D9E75',
                  background:   'rgba(29,158,117,0.12)',
                  whiteSpace:   'nowrap',
                }}
              >
                {name}
              </span>
            ))}
          </div>
        )}

        {/* 제목 (bold, 최대 2줄) */}
        <div style={{
          fontSize:          14,
          fontWeight:        700,
          color:             'var(--text)',
          lineHeight:        1.4,
          display:           '-webkit-box',
          WebkitLineClamp:   2,
          WebkitBoxOrient:   'vertical',
          overflow:          'hidden',
        }}>
          {title}
        </div>

        {/* 설명 (3줄 clamp) */}
        {description ? (
          <div style={{
            fontSize:          12,
            color:             'var(--text2)',
            lineHeight:        1.55,
            display:           '-webkit-box',
            WebkitLineClamp:   3,
            WebkitBoxOrient:   'vertical',
            overflow:          'hidden',
          }}>
            {description}
          </div>
        ) : null}
      </div>
    </div>
  );
}
