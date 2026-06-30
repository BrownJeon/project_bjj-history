import React, { useState, useEffect } from 'react';
import VideoPlayer from './VideoPlayer';
import Tag from './Tag';
import { getPlatformLabel } from '../utils/videoThumb';
import { recommendTechnique } from '../api/picks';

/**
 * PickDetailPanel — 카드 선택 시 슬라이드업으로 나타나는 상세 패널
 *
 * Props:
 *   clip     VideoClip 객체 (필수)
 *   mode     'browse' | 'picked' | 'history'
 *   onClose  () => void
 *   onPick   (clip) => void   (mode='browse' 일 때)
 *   onUnpick (clipId) => void (mode='picked'|'history' 일 때)
 */
export default function PickDetailPanel({ clip, mode = 'browse', onClose, onPick, onUnpick }) {
  const c = clip;

  /* frames 파싱 (가로 스크롤 섹션용) */
  const frames = (() => {
    const f = c.frames;
    if (!f) return [];
    if (Array.isArray(f)) return f;
    try { return JSON.parse(f); } catch { return []; }
  })();

  /* AI 추천 상태 */
  const [recLoading, setRecLoading] = useState(false);
  const [recommendation, setRecommendation] = useState(() => {
    if (!c.ai_recommendation) return null;
    if (typeof c.ai_recommendation === 'string') {
      try { return JSON.parse(c.ai_recommendation); } catch { return c.ai_recommendation; }
    }
    return c.ai_recommendation;
  });

  /* clip이 바뀌면 추천 초기화 */
  useEffect(() => {
    if (!c.ai_recommendation) {
      setRecommendation(null);
      return;
    }
    if (typeof c.ai_recommendation === 'string') {
      try { setRecommendation(JSON.parse(c.ai_recommendation)); } catch { setRecommendation(c.ai_recommendation); }
    } else {
      setRecommendation(c.ai_recommendation);
    }
  }, [c.id]);

  async function handleRecommend() {
    if (!c.id) { alert('클립 ID가 없어 AI 추천을 실행할 수 없습니다.'); return; }
    setRecLoading(true);
    try {
      const result = await recommendTechnique(c.id);
      setRecommendation(result);
    } catch (e) {
      alert('AI 추천 실패: ' + (e.message || e));
    } finally {
      setRecLoading(false);
    }
  }

  /* 추천 결과 렌더링 헬퍼 */
  function renderRecommendation(rec) {
    if (!rec) return null;
    if (typeof rec === 'string') {
      return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--text)' }}>{rec}</pre>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* 연계 기술 목록 */}
        {Array.isArray(rec.techniques) && rec.techniques.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, marginBottom: 6 }}>📌 연계 기술</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rec.techniques.map((t, i) => (
                <div key={i} style={{
                  background: 'var(--surface-up)', borderRadius: 8, padding: '8px 10px',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
                    {t.name || t}
                  </div>
                  {t.description && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{t.description}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* 콤비네이션 카드 */}
        {Array.isArray(rec.combinations) && rec.combinations.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, marginBottom: 6 }}>🔗 콤비네이션</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rec.combinations.map((combo, i) => (
                <div key={i} style={{
                  background: 'var(--accent-dim)', borderRadius: 8, padding: '8px 10px',
                  border: '1px solid var(--accent-glow)',
                }}>
                  <div style={{ fontSize: 13, color: 'var(--accent)', whiteSpace: 'pre-wrap' }}>
                    {typeof combo === 'string' ? combo : (combo.sequence || JSON.stringify(combo))}
                  </div>
                  {combo.note && (
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{combo.note}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* 그 외 텍스트 필드 */}
        {rec.summary && (
          <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{rec.summary}</div>
        )}
        {/* 구조가 없는 경우 JSON dump */}
        {!rec.techniques && !rec.combinations && !rec.summary && (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--text2)' }}>
            {JSON.stringify(rec, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  /* 하단 액션 버튼 */
  function renderActionButton() {
    if (mode === 'browse') {
      return (
        <button
          onClick={() => onPick?.(c)}
          style={{
            width: '100%', padding: '14px 0',
            background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
            cursor: 'pointer', letterSpacing: 0.3,
          }}>
          픽하기 ↑
        </button>
      );
    }
    return (
      <button
        onClick={() => onUnpick?.(c.id)}
        style={{
          width: '100%', padding: '14px 0',
          background: 'var(--red-dim)', color: 'var(--red)',
          border: '1px solid var(--red)', borderRadius: 12, fontSize: 15, fontWeight: 700,
          cursor: 'pointer', letterSpacing: 0.3,
        }}>
        픽 취소
      </button>
    );
  }

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 300,
        }}
      />

      {/* 슬라이드업 패널 */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: '92vh',
        background: 'var(--surface)',
        borderRadius: '16px 16px 0 0',
        zIndex: 301,
        display: 'flex', flexDirection: 'column',
        transform: 'translateY(0)',
        transition: 'transform 0.3s ease',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {/* 드래그 핸들 */}
        <div
          onClick={onClose}
          style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            padding: '12px 0 8px',
            cursor: 'pointer', flexShrink: 0,
          }}>
          <div style={{
            width: 40, height: 4, borderRadius: 2,
            background: 'var(--border-med)',
          }} />
        </div>

        {/* 스크롤 콘텐츠 영역 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
          {/* 영상 플레이어 */}
          <div style={{ marginBottom: 14 }}>
            <VideoPlayer clip={c} />
          </div>

          {/* tech_names pill 태그 + title */}
          <div style={{ marginBottom: 12 }}>
            {(c.tech_names?.length ? c.tech_names : (c.tech_name ? [c.tech_name] : [])).length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                {(c.tech_names?.length ? c.tech_names : (c.tech_name ? [c.tech_name] : [])).map((t, i) => (
                  <Tag key={i} tone="accent">{t}</Tag>
                ))}
                <Tag tone="purple">{getPlatformLabel(c.platform)}</Tag>
              </div>
            )}
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
              {c.title}
            </div>
          </div>

          {/* AI 영상 분석 (description) */}
          {c.description && (
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: 1,
                textTransform: 'uppercase', marginBottom: 6,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                AI 영상 분석
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              <div style={{
                fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap',
                padding: 10, background: 'var(--surface-up)',
                border: '1px solid var(--border)', borderRadius: 10,
                maxHeight: 200, overflowY: 'auto',
              }}>
                {c.description}
              </div>
            </div>
          )}

          {/* frames 가로 스크롤 (있을 때만) */}
          {frames.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginBottom: 6 }}>
                ✨ AI 분석 캡처 ({frames.length}장)
              </div>
              <div style={{
                display: 'flex', gap: 8, overflowX: 'auto',
                paddingBottom: 4, WebkitOverflowScrolling: 'touch',
              }}>
                {frames.map((url, i) => (
                  <img key={i} src={url} alt={`frame ${i + 1}`}
                    style={{
                      height: 90, width: 'auto', flexShrink: 0,
                      borderRadius: 8, objectFit: 'cover',
                      border: '1px solid var(--border)',
                    }} />
                ))}
              </div>
            </div>
          )}

          {/* 연계 기술 AI 추천 섹션 */}
          <div style={{ marginBottom: 80 }}>
            <div style={{
              fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: 1,
              textTransform: 'uppercase', marginBottom: 10,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              연계 기술 AI 추천
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            {!recommendation && (
              <button
                onClick={handleRecommend}
                disabled={recLoading}
                style={{
                  width: '100%', padding: '10px 0',
                  background: recLoading ? 'var(--surface-up)' : 'var(--purple-dim)',
                  color: recLoading ? 'var(--text2)' : 'var(--purple)',
                  border: `1px solid ${recLoading ? 'var(--border)' : 'var(--purple)'}`,
                  borderRadius: 10, fontSize: 13, fontWeight: 700,
                  cursor: recLoading ? 'not-allowed' : 'pointer',
                  marginBottom: 8,
                }}>
                {recLoading ? '🤖 AI 추천 중...' : '🤖 AI 추천 받기'}
              </button>
            )}

            {recLoading && !recommendation && (
              <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '8px 0' }}>
                로딩 중...
              </div>
            )}

            {recommendation && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {renderRecommendation(recommendation)}
                <button
                  onClick={handleRecommend}
                  disabled={recLoading}
                  style={{
                    padding: '8px 0', marginTop: 4,
                    background: 'var(--surface-up)', color: 'var(--text2)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    fontSize: 12, fontWeight: 600,
                    cursor: recLoading ? 'not-allowed' : 'pointer',
                  }}>
                  {recLoading ? '🤖 재추천 중...' : '🔄 다시 추천'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 하단 고정 액션 버튼 */}
        <div style={{
          position: 'sticky', bottom: 0,
          padding: '12px 16px',
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
          flexShrink: 0,
        }}>
          {renderActionButton()}
        </div>
      </div>
    </>
  );
}
