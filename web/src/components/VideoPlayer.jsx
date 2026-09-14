import React, { useState, useRef, useEffect } from 'react';
import { getYtEmbed, getPlatformIcon } from '../utils/videoThumb';
import { useUI } from '../contexts/UIContext';
import { isNativeApp } from '../native/bridge';
import { downloadFile, frameFileName, videoFileName } from '../utils/download';

/**
 * VideoPlayer — 영상 플레이어 영역 컴포넌트
 *
 * Props:
 *   clip  VideoClip 객체 (url, platform, video_file, frames, thumb_url, title)
 *
 * 지원 케이스:
 *   1. video_file 있음    → <video> 태그 (오프라인 재생)
 *   2. YouTube            → iframe embed
 *   3. frames[] 있음      → 슬라이드쇼 (swipe 포함)
 *   4. 그 외 (Instagram 등) → 플랫폼 아이콘 플레이스홀더
 */
export default function VideoPlayer({ clip }) {
  const c = clip;
  const { showToast } = useUI();

  /* frames 파싱 */
  const frames = (() => {
    const f = c.frames;
    if (!f) return [];
    if (Array.isArray(f)) return f;
    try { return JSON.parse(f); } catch { return []; }
  })();

  const [slideIdx, setSlideIdx] = useState(0);
  const touchStartX = useRef(null);

  useEffect(() => {
    setSlideIdx(0);
  }, [frames?.length]);

  function prev(e) { e?.stopPropagation(); setSlideIdx(i => (i - 1 + frames.length) % frames.length); }
  function next(e) { e?.stopPropagation(); setSlideIdx(i => (i + 1) % frames.length); }

  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStartX.current === null || frames.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) dx < 0 ? next() : prev();
    touchStartX.current = null;
  }

  // 웹: 기존 `<a download>` 그대로 · 앱: 폰 Download/BJJ 에 저장하고 완료/실패를 알린다(task-039 A-5)
  function downloadSingleFrame(url, idx, title) {
    downloadFile(url, frameFileName(title, idx), { notify: showToast });
  }

  function downloadVideo(e) {
    if (!isNativeApp()) return; // 웹은 아래 <a download> 기본 동작 그대로
    e.preventDefault();
    showToast('영상을 기기에 저장하는 중…', 2000);
    downloadFile(c.video_file, videoFileName(c.title), { notify: showToast });
  }

  const videoSizeStyle = { width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden' };
  const mediaSizeStyle = { width: '100%', borderRadius: 10, overflow: 'hidden' };

  return (
    <>
      {/* 로컬 저장 영상 */}
      {c.video_file && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>📥 저장된 영상 (오프라인 재생 가능)</span>
            <a href={c.video_file} download={videoFileName(c.title)} onClick={downloadVideo}
              style={{ fontSize: 11, color: 'var(--text2)', textDecoration: 'none' }}>↓ 다운로드</a>
          </div>
          <video src={c.video_file} controls playsInline
            style={{ width: '100%', borderRadius: 10, display: 'block', background: '#000', maxHeight: 320 }} />
        </div>
      )}

      {/* YouTube embed */}
      {c.platform === 'youtube' && getYtEmbed(c.url) && !c.video_file && (
        <div style={{ ...videoSizeStyle, marginBottom: 10 }}>
          <iframe src={getYtEmbed(c.url)}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen />
        </div>
      )}

      {/* 캡처 프레임 슬라이드쇼 */}
      {frames.length > 0 ? (
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
            style={{ ...mediaSizeStyle, background: 'var(--surface-hi)', position: 'relative', userSelect: 'none' }}>
            <img src={frames[slideIdx]} alt={`frame ${slideIdx + 1}`}
              style={{ width: '100%', height: 'auto', display: 'block' }} />
            {frames.length > 1 && (
              <>
                <button onClick={prev} style={{
                  position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>‹</button>
                <button onClick={next} style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>›</button>
              </>
            )}
            <div style={{
              position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 10, padding: '2px 10px',
              fontSize: 11, fontWeight: 600,
            }}>{slideIdx + 1} / {frames.length}</div>
            <button onClick={() => downloadSingleFrame(frames[slideIdx], slideIdx, c.title)}
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(0,0,0,0.5)', color: '#fff',
                border: 'none', borderRadius: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer',
              }}>↓</button>
          </div>
          {frames.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>
              {frames.map((_, i) => (
                <button key={i} onClick={() => setSlideIdx(i)} style={{
                  width: i === slideIdx ? 18 : 6, height: 6, borderRadius: 3,
                  border: 'none', cursor: 'pointer', padding: 0, transition: 'width 0.2s',
                  background: i === slideIdx ? 'var(--accent)' : 'var(--border-med)',
                }} />
              ))}
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', marginTop: 4 }}>✨ AI 분석 캡처</div>
        </div>
      ) : (
        /* frames 없고 video_file도 없고 YouTube도 아닌 경우 → 플랫폼 플레이스홀더 */
        !c.video_file && !(c.platform === 'youtube' && getYtEmbed(c.url)) && (
          <div style={{
            width: '100%', aspectRatio: '16/9', borderRadius: 10,
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12, gap: 6,
          }}>
            <span style={{ fontSize: 32 }}>{getPlatformIcon(c.platform)}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>AI 분석 후 캡처가 표시됩니다</span>
          </div>
        )
      )}
    </>
  );
}
