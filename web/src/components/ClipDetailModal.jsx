import React, { useState, useRef } from 'react';
import * as enhanceApi from '../api/enhanceMemo';
import { getStorageMode } from '../pages/ProfilePage';
import { getYtEmbed, getClipThumb, getPlatformIcon, getPlatformLabel } from '../utils/videoThumb';
import Modal from './Modal';
import Button from './Button';
import Tag from './Tag';
import Icon from './Icon';

/**
 * 영상 상세 모달
 * onEdit / onDelete 를 넘기지 않으면 해당 버튼이 숨겨집니다 (읽기 전용 모드).
 */
export default function ClipDetailModal({ c, onClose, onEdit, onDelete, onRefresh, analyzeJob }) {
  const [slideIdx, setSlideIdx]             = useState(0);
  const [analyzing, setAnalyzing]           = useState(false);
  const [analyzeElapsed, setAnalyzeElapsed] = useState(0);

  const [localDesc, setLocalDesc]           = useState(c.description || '');
  const [localVideoFile, setLocalVideoFile] = useState(c.video_file || '');
  const [localFrames, setLocalFrames]       = useState(() => {
    const f = c.frames;
    if (!f) return [];
    if (Array.isArray(f)) return f;
    try { return JSON.parse(f); } catch { return []; }
  });

  const touchStartX = useRef(null);

  const frames = localFrames;

  function prev(e) { e?.stopPropagation(); setSlideIdx(i => (i - 1 + frames.length) % frames.length); }
  function next(e) { e?.stopPropagation(); setSlideIdx(i => (i + 1) % frames.length); }

  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStartX.current === null || frames.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) dx < 0 ? next() : prev();
    touchStartX.current = null;
  }

  function downloadSingleFrame(url, idx, title) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'frame').replace(/[^가-힣a-zA-Z0-9]/g, '_')}-${idx + 1}.jpg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function downloadFrames(frameList, title) {
    frameList.forEach((url, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(title || 'frame').replace(/[^가-힣a-zA-Z0-9]/g, '_')}-${i + 1}.jpg`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }, i * 400);
    });
  }

  async function handleAiAnalyze() {
    if (!/(youtube\.com|youtu\.be|instagram\.com)/.test(c.url || '')) {
      alert('YouTube 또는 Instagram URL만 AI 분석 가능합니다'); return;
    }
    setAnalyzing(true); setAnalyzeElapsed(0);
    const mode = getStorageMode();
    try {
      const clipId = mode === 'device' ? null : c.id;
      const res = await enhanceApi.analyzeVideo(c.url, clipId, sec => setAnalyzeElapsed(sec));
      if (res.description) setLocalDesc(res.description);
      if (res.videoFile)   setLocalVideoFile(res.videoFile);
      if (res.frames?.length) {
        setLocalFrames(res.frames); setSlideIdx(0);
        if (mode === 'device') downloadFrames(res.frames, c.title);
      }
      await onRefresh?.();
    } catch (e) {
      alert('AI 분석 실패: ' + e.message);
    } finally { setAnalyzing(false); }
  }

  const videoSizeStyle = { width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden' };
  const mediaSizeStyle = { width: '100%', borderRadius: 10, overflow: 'hidden' };

  return (
    <Modal title={c.title} onClose={onClose}>
      {/* 로컬 저장 영상 */}
      {localVideoFile && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>📥 저장된 영상 (오프라인 재생 가능)</span>
            <a href={localVideoFile} download={`${c.title || 'video'}.mp4`}
              style={{ fontSize: 11, color: 'var(--text2)', textDecoration: 'none' }}>↓ 다운로드</a>
          </div>
          <video src={localVideoFile} controls playsInline
            style={{ width: '100%', borderRadius: 10, display: 'block', background: '#000', maxHeight: 320 }} />
        </div>
      )}

      {/* YouTube embed */}
      {c.platform === 'youtube' && getYtEmbed(c.url) && !localVideoFile && (
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
        <div style={{
          width: '100%', aspectRatio: '16/9', borderRadius: 10,
          background: 'var(--surface)', border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          marginBottom: 12, gap: 6,
        }}>
          <span style={{ fontSize: 32 }}>{getPlatformIcon(c.platform)}</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>AI 분석 후 캡처가 표시됩니다</span>
        </div>
      )}

      {/* 태그 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {(c.tech_names?.length ? c.tech_names : (c.tech_name ? [c.tech_name] : [])).map((t, i) => (
          <Tag key={i} tone="accent">{t}</Tag>
        ))}
        <Tag tone="purple">{getPlatformLabel(c.platform)}</Tag>
        {c.starred ? <Tag tone="amber">즐겨찾기</Tag> : null}
      </div>

      {/* 설명 */}
      {localDesc && (
        <div style={{
          fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap',
          marginBottom: 12, padding: 10,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        }}>{localDesc}</div>
      )}

      {/* 원본 링크 */}
      {c.url && (
        <a href={c.url} target="_blank" rel="noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            color: 'var(--accent)', textDecoration: 'none',
            marginBottom: 12, fontSize: 13, fontWeight: 600,
          }}>
          <Icon name="link" size={14} color="var(--accent)" /> 원본 영상 열기
        </a>
      )}

      {/* AI 분석 버튼 */}
      {(() => {
        const bgRunning = analyzeJob && analyzeJob.progress >= 0;
        const disabled  = analyzing || bgRunning;
        return (
          <button onClick={handleAiAnalyze} disabled={disabled} style={{
            width: '100%', marginTop: 4, marginBottom: 4, padding: '10px 0',
            background: disabled ? 'var(--surface-up)' : 'var(--purple-dim)',
            color: disabled ? 'var(--text2)' : 'var(--purple)',
            border: `1px solid ${disabled ? 'var(--border)' : 'var(--purple)'}`,
            borderRadius: 10, fontSize: 13, fontWeight: 700,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}>
            {bgRunning
              ? `🔄 ${analyzeJob.stage || 'AI 분석 중'} ${analyzeJob.progress}%`
              : analyzing ? `✨ AI 분석 중... ${analyzeElapsed}s` : '✨ AI 분석 (캡처 저장)'}
          </button>
        );
      })()}

      {/* 수정/삭제 버튼 (onEdit/onDelete 없으면 숨김) */}
      {(onEdit || onDelete) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {onEdit   && <Button variant="outline" size="sm" onClick={onEdit}>수정</Button>}
          {onDelete && <Button variant="danger" size="sm" onClick={onDelete} style={{ marginLeft: 'auto' }}>삭제</Button>}
        </div>
      )}
    </Modal>
  );
}
