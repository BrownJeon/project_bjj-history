import React, { useState, useRef, useEffect } from 'react';
import * as enhanceApi from '../api/enhanceMemo';
import * as clipsApi from '../api/clips';
import { useCache } from '../contexts/CacheContext';
import { getStorageMode } from '../pages/ProfilePage';
import { getPlatformIcon, getPlatformLabel } from '../utils/videoThumb';
import Modal from './Modal';
import Button from './Button';
import Tag from './Tag';
import Icon from './Icon';
import VideoPlayer from './VideoPlayer';

/**
 * 영상 상세 모달
 * onEdit / onDelete 를 넘기지 않으면 해당 버튼이 숨겨집니다 (읽기 전용 모드).
 */
export default function ClipDetailModal({ c, onClose, onEdit, onDelete, onRefresh, analyzeJob }) {
  const { igCookieConfigured } = useCache();
  const [analyzing, setAnalyzing]             = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzeStage, setAnalyzeStage]       = useState('');
  const [uploading, setUploading]           = useState(false);
  const [uploadPct, setUploadPct]           = useState(0);
  const [uploadDone, setUploadDone]         = useState(false); // 업로드 완료, 분석 대기 중

  const [localDesc, setLocalDesc]           = useState(c.description || '');
  const [localVideoFile, setLocalVideoFile] = useState(c.video_file || '');
  const [localFrames, setLocalFrames]       = useState(() => {
    const f = c.frames;
    if (!f) return [];
    if (Array.isArray(f)) return f;
    try { return JSON.parse(f); } catch { return []; }
  });

  const fileInputRef = useRef(null);
  const prevJobRef   = useRef(null);

  // 분석 완료 감지 — analyzeJob이 진행 중이었다가 사라지면 refresh
  useEffect(() => {
    const wasRunning = prevJobRef.current && prevJobRef.current.progress >= 0;
    const isDone     = !analyzeJob;
    if (wasRunning && isDone) {
      setUploadDone(false);
      onRefresh?.();
    }
    prevJobRef.current = analyzeJob || null;
  }, [analyzeJob]);

  // localFrames를 다운로드하는 헬퍼 (device 모드용)
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
    setAnalyzing(true); setAnalyzeProgress(0); setAnalyzeStage('');
    const mode = getStorageMode();
    try {
      const clipId = mode === 'device' ? null : c.id;
      const res = await enhanceApi.analyzeVideo(c.url, clipId, (pct, stg) => { setAnalyzeProgress(pct); setAnalyzeStage(stg); });
      if (res.description) setLocalDesc(res.description);
      if (res.videoFile)   setLocalVideoFile(res.videoFile);
      if (res.frames?.length) {
        setLocalFrames(res.frames);
        if (mode === 'device') downloadFrames(res.frames, c.title);
      }
      await onRefresh?.();
    } catch (e) {
      alert('AI 분석 실패: ' + e.message);
    } finally { setAnalyzing(false); }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;

    setUploading(true); setUploadPct(0);
    try {
      await clipsApi.uploadVideo(c.id, file, (evt) => {
        if (evt.total) setUploadPct(Math.round((evt.loaded / evt.total) * 100));
      });
      setUploading(false); setUploadDone(true);
      // 분석은 백그라운드 진행 — analyzeJob 폴링이 완료 시 onRefresh 호출
    } catch (err) {
      setUploading(false);
      alert('업로드 실패: ' + (err.message || err));
    }
  }

  // AI 분석 결과(localVideoFile, localFrames)를 반영한 clip 객체를 VideoPlayer에 전달
  const clipForPlayer = { ...c, video_file: localVideoFile, frames: localFrames };

  return (
    <Modal title={c.title} onClose={onClose}>
      {/* 영상 플레이어 (VideoPlayer 컴포넌트) */}
      <VideoPlayer clip={clipForPlayer} />

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

      {/* AI 분석 버튼 영역 */}
      {(() => {
        const bgRunning   = (analyzeJob && analyzeJob.progress >= 0) || uploadDone;
        const anyBusy     = analyzing || uploading || bgRunning;
        const isInstagram = /instagram\.com/.test(c.url || '');

        const uploadBtnLabel = uploading
          ? `📤 업로드 중... ${uploadPct}%`
          : bgRunning ? null : '📁 파일로 분석';

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, marginBottom: 4 }}>
            {/* 파일 업로드 버튼 — Instagram은 우선 표시, 나머지는 보조 */}
            <input ref={fileInputRef} type="file" accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
              style={{ display: 'none' }} onChange={handleFileUpload} />

            {isInstagram ? (
              <>
                {/* 쿠키 있으면 URL 분석 우선, 없으면 파일 업로드 우선 */}
                {igCookieConfigured ? (
                  <button onClick={handleAiAnalyze} disabled={anyBusy} style={{
                    width: '100%', padding: '10px 0',
                    background: anyBusy ? 'var(--surface-up)' : 'var(--purple-dim)',
                    color: anyBusy ? 'var(--text2)' : 'var(--purple)',
                    border: `1px solid ${anyBusy ? 'var(--border)' : 'var(--purple)'}`,
                    borderRadius: 10, fontSize: 13, fontWeight: 700,
                    cursor: anyBusy ? 'not-allowed' : 'pointer',
                  }}>
                    {bgRunning
                      ? `🔄 ${analyzeJob?.stage || '분석 중'} ${analyzeJob?.progress ?? ''}%`
                      : analyzing ? `✨ ${analyzeStage || 'AI 분석 중'} ${analyzeProgress}%` : '✨ URL로 AI 분석 (쿠키 인증)'}
                  </button>
                ) : (
                  <button
                    onClick={() => !anyBusy && fileInputRef.current?.click()}
                    disabled={anyBusy}
                    style={{
                      width: '100%', padding: '10px 0',
                      background: anyBusy ? 'var(--surface-up)' : 'var(--accent-dim)',
                      color: anyBusy ? 'var(--text2)' : 'var(--accent)',
                      border: `1px solid ${anyBusy ? 'var(--border)' : 'var(--accent)'}`,
                      borderRadius: 10, fontSize: 13, fontWeight: 700,
                      cursor: anyBusy ? 'not-allowed' : 'pointer',
                    }}>
                    {uploading ? uploadBtnLabel : bgRunning
                      ? `🔄 ${analyzeJob?.stage || '분석 중'} ${analyzeJob?.progress ?? ''}%`
                      : '📁 파일로 AI 분석 (Instagram 권장)'}
                  </button>
                )}
                {!anyBusy && (
                  igCookieConfigured ? (
                    <button onClick={() => fileInputRef.current?.click()} style={{
                      width: '100%', padding: '8px 0',
                      background: 'var(--surface-up)', color: 'var(--text2)',
                      border: '1px solid var(--border)', borderRadius: 10,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>📁 파일로 분석 (로컬 영상)</button>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '4px 0' }}>
                      쿠키 인증 시 URL 분석 가능 — 프로필 &gt; Instagram 쿠키 설정
                    </div>
                  )
                )}
              </>
            ) : (
              <>
                <button onClick={handleAiAnalyze} disabled={anyBusy} style={{
                  width: '100%', padding: '10px 0',
                  background: anyBusy ? 'var(--surface-up)' : 'var(--purple-dim)',
                  color: anyBusy ? 'var(--text2)' : 'var(--purple)',
                  border: `1px solid ${anyBusy ? 'var(--border)' : 'var(--purple)'}`,
                  borderRadius: 10, fontSize: 13, fontWeight: 700,
                  cursor: anyBusy ? 'not-allowed' : 'pointer',
                }}>
                  {bgRunning
                    ? `🔄 ${analyzeJob?.stage || '분석 중'} ${analyzeJob?.progress ?? ''}%`
                    : analyzing ? `✨ ${analyzeStage || 'AI 분석 중'} ${analyzeProgress}%` : '✨ URL로 AI 분석 (캡처 저장)'}
                </button>
                {!anyBusy && (
                  <button onClick={() => fileInputRef.current?.click()} style={{
                    width: '100%', padding: '8px 0',
                    background: 'var(--surface-up)', color: 'var(--text2)',
                    border: '1px solid var(--border)', borderRadius: 10,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>
                    📁 파일로 분석 (로컬 영상)
                  </button>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* AI 분석 진행 상태 바 */}
      {((analyzeJob && analyzeJob.progress >= 0) || uploadDone || analyzing) && (
        <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--surface-up)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>
              {(analyzeJob && analyzeJob.progress >= 0) || uploadDone
                ? (analyzeJob?.stage || '분석 준비 중...')
                : (analyzeStage || 'AI 분석 준비 중...')}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
              {analyzeJob && analyzeJob.progress >= 0
                ? `${analyzeJob.progress}%`
                : analyzing
                ? `${analyzeProgress}%`
                : ''}
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: analyzeJob && analyzeJob.progress >= 0
                ? `${analyzeJob.progress}%`
                : analyzing
                ? `${analyzeProgress}%`
                : '5%',
              background: 'var(--accent)', borderRadius: 2, transition: 'width 0.6s ease',
            }} />
          </div>
        </div>
      )}

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
