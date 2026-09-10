import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useCache } from '../contexts/CacheContext';
import * as enhanceApi from '../api/enhanceMemo';
import { getPlatformLabel } from '../utils/videoThumb';
import { uniqueClipTags } from '../utils/suggestions';
import Modal from './Modal';
import Button from './Button';
import TagPicker from './TagPicker';
import ClipDetailModal from './ClipDetailModal';

const detectPlatform = u => !u ? 'other' : u.includes('youtu') ? 'youtube' : u.includes('instagram') ? 'instagram' : 'other';

// ClipsPage.jsx의 로컬 ClipEditor를 추출한 공유 컴포넌트
// (참고영상 등록/수정 — ClipsPage, TechPlanPage(TechDetailModal) 양쪽에서 재사용)
export default function ClipEditor({ initial, techniques, onSave, onCancel, analyzeJob }) {
  const { igCookieConfigured, igSessionValid, igCookieHint, clips: allClips, reloadClips } = useCache();
  const [title, setTitle] = useState(initial?.title || '');
  const [url, setUrl]     = useState(initial?.url || '');
  const [techNames, setTechNames] = useState(
    initial?.tech_names?.length ? initial.tech_names
    : initial?.tech_name ? [initial.tech_name]
    : []
  );
  const [positions, setPositions] = useState(
    Array.isArray(initial?.positions) ? initial.positions : []
  );
  const [tags, setTags] = useState(initial?.tags || []);
  const [desc, setDesc]   = useState(initial?.description || '');
  const [starred, setStarred] = useState(!!initial?.starred);
  const [pinned, setPinned]   = useState(!!initial?.pinned);
  const [analyzing, setAnalyzing]             = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzeStage, setAnalyzeStage]       = useState('');
  const [dupWarnVisible, setDupWarnVisible]   = useState(false);
  const [reviewingClip, setReviewingClip]     = useState(null);
  const [inputMode, setInputMode]             = useState('url'); // 'url' | 'file'
  const [localFile, setLocalFile]             = useState(null);
  const pendingFormRef = useRef(null);
  const abortRef       = useRef(null);

  // 에디터 닫힐 때 폴링 중단 (모달 unmount 시 AbortController 해제)
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const techSuggestions = useMemo(
    () => techniques.map(t => t.name),
    [techniques]
  );

  const posSuggestions = useMemo(() => {
    const fromTechs = techniques.flatMap(t =>
      t.positions?.length ? t.positions : (t.pos ? [t.pos] : [])
    );
    return [...new Set(fromTechs)];
  }, [techniques]);

  const tagSuggestions = useMemo(() => uniqueClipTags(allClips), [allClips]);

  const similarClips = useMemo(() => {
    if (!techNames.length) return [];
    const techSet = new Set(techNames);
    return (allClips || []).filter(clip => {
      if (initial && initial !== 'new' && clip.id === initial.id) return false;
      const clipTechs = clip.tech_names?.length
        ? clip.tech_names
        : (clip.tech_name ? [clip.tech_name] : []);
      return clipTechs.some(t => techSet.has(t));
    });
  }, [allClips, techNames, initial]);

  const isInstagram = /instagram\.com/.test(url);

  async function handleAiAnalyze() {
    if (!url.trim()) { alert('URL을 먼저 입력해주세요'); return; }
    if (isInstagram && !igCookieConfigured) {
      alert('Instagram 영상은 로그인 인증이 필요합니다.\n프로필 > Instagram 쿠키 설정 후 시도하거나\n영상 상세에서 "파일로 분석" 기능을 사용해 주세요.');
      return;
    }
    if (!/(youtube\.com|youtu\.be|instagram\.com)/.test(url)) {
      alert('YouTube URL만 AI 분석 가능합니다');
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAnalyzing(true);
    setAnalyzeProgress(0); setAnalyzeStage('');
    try {
      const res = await enhanceApi.analyzeVideo(url, initial?.id || null, (pct, stg) => { setAnalyzeProgress(pct); setAnalyzeStage(stg); }, 1200000, ctrl.signal);
      setDesc(res.description || '');
      if ((res.frames || []).length > 0) reloadClips();
      alert(`AI 설명이 생성되었습니다 (${res.method || 'vision'})`);
    } catch (e) {
      if (enhanceApi.isAbortError(e)) return; // 모달 닫기 — 백엔드 분석 계속 진행됨
      alert('AI 분석 실패: ' + e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  function submit() {
    if (!title.trim())                          return alert('영상 제목을 입력해주세요');
    if (inputMode === 'url' && !url.trim())     return alert('URL을 입력해주세요');
    if (inputMode === 'file' && !localFile)     return alert('영상 파일을 선택해주세요');
    if (!techNames.length)                      return alert('기술명을 1개 이상 입력해주세요');
    const form = {
      title: title.trim(),
      url: inputMode === 'url' ? url.trim() : '',
      description: desc,
      tech_names: techNames,
      tech_name: techNames[0] || '',
      positions,
      tags, starred: starred ? 1 : 0,
      pinned: pinned ? 1 : 0,
    };
    if (inputMode === 'file') form._localFile = localFile;
    if (similarClips.length > 0) {
      pendingFormRef.current = form;
      setDupWarnVisible(true);
      return;
    }
    onSave(form);
  }

  return (
    <Modal title={initial ? '참고영상 수정' : '참고영상 추가'} onClose={onCancel}>
      {/* 즐겨찾기 — 상단 왼쪽 배치 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <input type="checkbox" id="clip-star" checked={starred} onChange={e => setStarred(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--amber)' }} />
        <label htmlFor="clip-star" style={{ margin: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: starred ? 'var(--amber)' : 'var(--text2)' }}>
          ⭐ 즐겨찾기
        </label>
        <input type="checkbox" id="clip-pin" checked={pinned} onChange={e => setPinned(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)', marginLeft: 14 }} />
        <label htmlFor="clip-pin" style={{ margin: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: pinned ? 'var(--accent)' : 'var(--text2)' }}>
          📌 고정
        </label>
      </div>
      <div className="field"><label>제목 *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="영상 제목" /></div>
      <div className="field">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <label style={{ margin: 0 }}>영상 등록 방식</label>
          <button type="button" onClick={() => { setInputMode('url'); setLocalFile(null); }}
            style={{ padding: '2px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: 'none', fontWeight: 600,
              background: inputMode === 'url' ? 'var(--accent)' : 'var(--surface-up)',
              color: inputMode === 'url' ? 'white' : 'var(--text2)' }}>
            URL
          </button>
          <button type="button" onClick={() => { setInputMode('file'); setUrl(''); }}
            style={{ padding: '2px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: 'none', fontWeight: 600,
              background: inputMode === 'file' ? 'var(--accent)' : 'var(--surface-up)',
              color: inputMode === 'file' ? 'white' : 'var(--text2)' }}>
            파일 업로드
          </button>
        </div>
        {inputMode === 'url' ? (
          <>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="YouTube 또는 Instagram URL" />
            {url && <div style={{ fontSize: 12, color: 'var(--blue)', marginTop: 4 }}>{getPlatformLabel(detectPlatform(url))}</div>}
            {isInstagram && !igCookieConfigured && (
              <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 3 }}>
                ⚠ Instagram은 AI 자동 분석 불가 — 저장 후 상세 화면에서 파일로 분석하거나 프로필에서 쿠키를 설정하세요
              </div>
            )}
            {/* 쿠키 파일이 있어도 로그인 세션이 없으면 "인증됨"이라고 말하면 안 된다.
                릴은 로그인 없이도 분석되므로 시도 자체는 막지 않고, 무엇이 안 되는지만 알린다. */}
            {isInstagram && igCookieConfigured && igSessionValid && (
              <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 3 }}>
                ✓ Instagram 쿠키 인증됨 — AI 분석 가능
              </div>
            )}
            {isInstagram && igCookieConfigured && !igSessionValid && (
              <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 3, lineHeight: 1.5 }}>
                ⚠ 쿠키 파일은 있으나 <b>로그인 세션이 없습니다</b> — 공개 릴은 분석되지만
                스토리·비공개 게시물은 실패합니다.
                {igCookieHint ? <div style={{ marginTop: 2, opacity: .85 }}>{igCookieHint}</div> : null}
              </div>
            )}
          </>
        ) : (
          <>
            <input type="file" accept="video/*" onChange={e => setLocalFile(e.target.files[0] || null)}
              style={{ fontSize: 13, padding: '4px 0' }} />
            {localFile && (
              <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 4 }}>
                {localFile.name} ({(localFile.size / 1024 / 1024).toFixed(1)} MB)
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              업로드 후 AI가 자동으로 영상을 분석합니다
            </div>
          </>
        )}
      </div>
      <div className="field">
        <label>기술명 * (여러 개 가능)</label>
        <TagPicker
          value={techNames}
          onChange={setTechNames}
          suggestions={techSuggestions}
          placeholder="기술명 검색·선택"
          restrictToSuggestions={true}
        />
      </div>
      <div className="field">
        <label>포지션 (여러 개 가능)</label>
        <TagPicker
          value={positions}
          onChange={setPositions}
          suggestions={posSuggestions}
          placeholder="포지션 검색·자유 입력"
        />
      </div>
      <div className="field">
        <label>태그</label>
        <TagPicker value={tags} onChange={setTags} suggestions={tagSuggestions} />
      </div>

      {/* 유사 영상 목록 — 기술명 선택 시 자동 표시, 각 카드 클릭으로 미리보기 */}
      {similarClips.length > 0 && (
        <div style={{
          marginBottom: 8, padding: '8px 10px',
          background: 'var(--amber-dim)', border: '1px solid var(--amber)', borderRadius: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', marginBottom: 2 }}>
            ⚠ 동일 기술로 등록된 영상 ({similarClips.length}개)
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
            클릭하여 영상 내용을 확인하세요
          </div>
          {similarClips.map(clip => (
            <div
              key={clip.id}
              onClick={() => setReviewingClip(clip)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                cursor: 'pointer', borderRadius: 6,
              }}
            >
              {clip.thumb_url && (
                <img src={clip.thumb_url} alt="" style={{ width: 48, height: 30, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {clip.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {(clip.tech_names?.length ? clip.tech_names : (clip.tech_name ? [clip.tech_name] : [])).join(', ')}
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--amber)', flexShrink: 0 }}>확인 →</span>
            </div>
          ))}
        </div>
      )}

      {/* 유사 영상 미리보기 — 읽기 전용 (onEdit/onDelete 미전달) */}
      {reviewingClip && (
        <ClipDetailModal
          c={reviewingClip}
          onClose={() => setReviewingClip(null)}
        />
      )}

      {/* 중복 등록 경고 */}
      {dupWarnVisible && (
        <div style={{
          padding: '10px 12px', marginBottom: 8,
          background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 8,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>
            이미 등록된 영상과 유사합니다. 계속 등록하시겠습니까?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="danger" size="sm"
              onClick={() => { setDupWarnVisible(false); onSave(pendingFormRef.current); }}>
              그래도 등록
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDupWarnVisible(false)}>
              취소
            </Button>
          </div>
        </div>
      )}

      <div className="field">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label style={{ margin: 0 }}>설명</label>
          {inputMode === 'url' && (() => {
            const bgRunning = analyzeJob && analyzeJob.progress >= 0;
            const igBlocked = isInstagram && !igCookieConfigured;
            const disabled  = analyzing || bgRunning || igBlocked;
            const label     = bgRunning
              ? `🔄 ${analyzeJob.stage || '분석 중'} ${analyzeJob.progress}%`
              : analyzing ? `🔄 ${analyzeStage || 'AI 분석 중'} ${analyzeProgress}%`
              : igBlocked ? '📁 파일로 분석 (상세에서)'
              : isInstagram ? (igSessionValid ? '✨ AI 분석 (쿠키 인증)' : '✨ AI 분석 (세션 없음)')
              : '✨ AI 분석';
            return (
              <button onClick={handleAiAnalyze} disabled={disabled}
                title={igBlocked ? '프로필 > Instagram 쿠키 설정 후 이용 가능합니다' : undefined}
                style={{
                  background: disabled ? 'var(--surface-up)' : 'var(--purple-dim)',
                  color: disabled ? 'var(--text3)' : 'var(--purple)',
                  border: 'none', padding: '4px 10px', borderRadius: 6,
                  fontSize: 11, cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600,
                }}>{label}</button>
            );
          })()}
        </div>
        <textarea rows={3} value={desc} onChange={e => setDesc(e.target.value)} placeholder="영상에 대한 설명" />
        {(analyzing || (analyzeJob && analyzeJob.progress >= 0)) && (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>
                {analyzeJob?.progress >= 0
                  ? (analyzeJob.stage || '분석 중...')
                  : (analyzeStage || 'AI 분석 준비 중...')}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
                {analyzeJob?.progress >= 0
                  ? `${analyzeJob.progress}%`
                  : `${analyzeProgress}%`}
              </span>
            </div>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{
                width: analyzeJob?.progress >= 0
                  ? `${analyzeJob.progress}%`
                  : `${analyzeProgress}%`,
                height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.6s ease',
              }} />
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Button variant="primary" size="sm" onClick={submit}>저장</Button>
        <Button variant="outline" size="sm" onClick={onCancel}>취소</Button>
      </div>
    </Modal>
  );
}
