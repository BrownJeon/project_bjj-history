import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';
import * as clipsApi from '../api/clips';
import * as enhanceApi from '../api/enhanceMemo';
import { getStorageMode } from './ProfilePage';
import {
  getYtThumb, getYtEmbed, getClipThumb,
  getPlatformIcon, getPlatformLabel,
} from '../utils/videoThumb';
import Card from '../components/Card';
import Tag from '../components/Tag';
import Icon from '../components/Icon';
import { FilterChip, TechniqueFilter } from '../components/LibraryFilters';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Pagination from '../components/Pagination';
import ClipDetailModal from '../components/ClipDetailModal';
import ClipEditor from '../components/ClipEditor';
import { usageOf, fmtMD } from '../utils/clipUsage';
import { CLIP_FILTERS, filterClips, rankedClipTechniques } from '../utils/clipFilters';

const PAGE_SIZE = 10;
const detectPlatform = u => !u ? 'other' : u.includes('youtu') ? 'youtube' : u.includes('instagram') ? 'instagram' : 'other';

export default function ClipsPage({ embedded = false }) {
  const { clips, techniques, reloadClips } = useCache();
  const { showToast, setLoading } = useUI();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');     // all | recent | star
  const [techFilter, setTechFilter] = useState(''); // 기술명 (빈 문자열이면 미선택)
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [page, setPage] = useState(1);
  const [analyzeStatus, setAnalyzeStatus] = useState({}); // { [clipId]: { progress, stage } }
  const pollRef = useRef(null);

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const st = await clipsApi.getAnalyzeStatus();
        setAnalyzeStatus(st);
        if (Object.keys(st).length === 0) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          await reloadClips();
        }
      } catch { /* ignore */ }
    }, 3000);
  }

  useEffect(() => {
    // 마운트 시 진행 중인 분석 있으면 폴링 시작
    clipsApi.getAnalyzeStatus().then(st => {
      if (Object.keys(st).length > 0) {
        setAnalyzeStatus(st);
        startPolling();
      }
    }).catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 참고영상과 피드백 선택기가 같은 검색·정렬·사용 횟수 기준을 공유한다.
  const techNames = useMemo(() => rankedClipTechniques(clips), [clips]);
  const list = useMemo(() => filterClips(clips, { search, filter, techFilter }), [clips, search, filter, techFilter]);

  useEffect(() => { setPage(1); }, [search, filter, techFilter]);

  const paged = useMemo(
    () => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [list, page]
  );

  async function handleStar(id) {
    try { await clipsApi.toggleStar(id); await reloadClips(); }
    catch (e) { showToast('오류: ' + e.message); }
  }
  async function handlePin(id) {
    try { await clipsApi.togglePin(id); await reloadClips(); }
    catch (e) { showToast('오류: ' + e.message); }
  }
  async function handleSave(form) {
    const _localFile = form._localFile;
    const cleanForm = { ...form };
    delete cleanForm._localFile;
    setLoading(true);
    try {
      if (editing && editing !== 'new') {
        await clipsApi.updateClip(editing.id, cleanForm);
      } else if (_localFile) {
        const clip = await clipsApi.createClip(cleanForm);
        await clipsApi.uploadVideo(clip.id, _localFile, () => {});
        setTimeout(() => startPolling(), 1000);
      } else {
        await clipsApi.createClip(cleanForm);
        if (cleanForm.url && /youtube\.com|youtu\.be|instagram\.com/.test(cleanForm.url)) {
          setTimeout(() => startPolling(), 2000);
        }
      }
      await reloadClips();
      setEditing(null);
      showToast(_localFile ? '업로드 완료, AI 분석 중...' : '저장되었습니다');
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }
  async function handleDelete(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      await clipsApi.deleteClip(id);
      await reloadClips();
      setDetail(null);
      showToast('삭제되었습니다');
    } catch (e) { showToast('삭제 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  return (
    <div>
      {!embedded && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>참고영상</span>
          <Button size="sm" variant="outline" onClick={() => setEditing('new')}>+ 추가</Button>
        </div>
      )}

      {/* 검색바 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        marginBottom: 10,
      }}>
        <Icon name="search" size={16} color="var(--text3)" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="제목·기술명·설명 검색"
          style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 14, outline: 'none' }}
        />
      </div>

      {/* 기본 필터 칩 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {CLIP_FILTERS.map(([key, label, icon]) => <FilterChip key={key} active={filter === key} icon={icon}
          onClick={() => setFilter(key)}>{label}</FilterChip>)}
        {embedded && (
          <div style={{ marginLeft: 'auto' }}>
            <Button size="sm" variant="outline" onClick={() => setEditing('new')}>+ 추가</Button>
          </div>
        )}
      </div>

      {/* 기술명 필터 — 드롭다운 */}
      {techNames.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <TechniqueFilter names={techNames} value={techFilter} onChange={setTechFilter} />
        </div>
      )}

      {list.length === 0 ? (
        <Card style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>
          영상이 없습니다
        </Card>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paged.map(c => <ClipCard key={c.id} c={c} onClick={() => setDetail(c)} onStar={() => handleStar(c.id)} onPin={() => handlePin(c.id)} analyzeJob={analyzeStatus[String(c.id)]} />)}
          </div>
          <Pagination total={list.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}

      {editing && (
        <ClipEditor
          initial={editing === 'new' ? null : editing}
          techniques={techniques}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          analyzeJob={editing !== 'new' ? analyzeStatus[String(editing?.id)] : undefined}
        />
      )}
      {detail && (
        <ClipDetailModal
          c={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(detail); setDetail(null); }}
          onDelete={() => handleDelete(detail.id)}
          analyzeJob={analyzeStatus[String(detail.id)]}
          onRefresh={async () => {
            await reloadClips();
            setDetail(prev => prev ? clips.find(c => c.id === prev.id) || prev : null);
          }}
        />
      )}
    </div>
  );
}

function ClipCard({ c, onClick, onStar, onPin, analyzeJob }) {
  const thumb = getClipThumb(c);
  const isAnalyzing = analyzeJob && analyzeJob.progress >= 0;
  const u = usageOf(c);
  return (
    <Card padding={12} onClick={onClick}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{
          width: 80, height: 50,
          borderRadius: 8,
          background: 'var(--surface-hi)',
          overflow: 'hidden',
          flexShrink: 0,
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {thumb ? (
            <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 18 }}>{getPlatformIcon(c.platform)}</span>
          )}
          {isAnalyzing && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.65)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
            }}>
              <span style={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>{analyzeJob.progress}%</span>
              <div style={{ width: 48, height: 3, background: 'rgba(255,255,255,0.25)', borderRadius: 2 }}>
                <div style={{ width: `${analyzeJob.progress}%`, height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.5s' }} />
              </div>
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, marginBottom: 4,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {c.title}
          </div>
          {(c.tech_names?.length ? c.tech_names : (c.tech_name ? [c.tech_name] : [])).map((t, i) => (
            <Tag key={i} tone="accent">{t}</Tag>
          ))}
          {(c.tags || []).map((t, i) => (
            <Tag key={`tag-${i}`} tone="neutral">{t}</Tag>
          ))}
          {/* task-035 사용 기록 한 줄 — 👁 봤음 · 🥋 써봤음 · 최근 사용일 */}
          <div style={{
            fontSize: 11, color: 'var(--text3)', marginTop: 4,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            👁 {u.view} · 🥋 {u.used}
            {u.used === 0
              ? <span style={{ color: 'var(--amber)', marginLeft: 6 }}>아직 안 써봄</span>
              : (u.last_used_on ? ` · 최근 ${fmtMD(u.last_used_on)}` : '')}
          </div>
        </div>
        <span
          onClick={(e) => { e.stopPropagation(); onPin(); }}
          style={{ display: 'inline-flex', cursor: 'pointer', padding: 4 }}
        >
          <Icon name="pin" size={18} color={c.pinned ? 'var(--accent)' : 'var(--text3)'} filled={!!c.pinned} />
        </span>
        <span
          onClick={(e) => { e.stopPropagation(); onStar(); }}
          style={{ display: 'inline-flex', cursor: 'pointer', padding: 4 }}
        >
          <Icon name="star" size={18} color={c.starred ? 'var(--amber)' : 'var(--text3)'} filled={!!c.starred} />
        </span>
      </div>

      {/* 분석 진행율 + 단계 메시지 */}
      {isAnalyzing && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>{analyzeJob.stage || '분석 중...'}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{analyzeJob.progress}%</span>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{ width: `${analyzeJob.progress}%`, height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.5s' }} />
          </div>
        </div>
      )}
    </Card>
  );
}


// ClipEditor → components/ClipEditor.jsx 로 이동 (항목 2: TechPlanPage에서도 재사용)

// ClipDetail → components/ClipDetailModal.jsx 로 이동
function _ClipDetail_REMOVED({ c, onClose, onEdit, onDelete, onRefresh, analyzeJob }) {
  const [slideIdx, setSlideIdx]             = useState(0);
  const [analyzing, setAnalyzing]           = useState(false);
  const [analyzeElapsed, setAnalyzeElapsed] = useState(0);

  // 로컬 상태로 description·frames·videoFile 관리 — 분석 완료 즉시 반영
  const [localDesc, setLocalDesc]       = useState(c.description || '');
  const [localVideoFile, setLocalVideoFile] = useState(c.video_file || '');
  const [localFrames, setLocalFrames] = useState(() => {
    const f = c.frames;
    if (!f) return [];
    if (Array.isArray(f)) return f;
    try { return JSON.parse(f); } catch { return []; }
  });

  async function handleAiAnalyze() {
    if (!/(youtube\.com|youtu\.be|instagram\.com)/.test(c.url || '')) {
      alert('YouTube 또는 Instagram URL만 AI 분석 가능합니다');
      return;
    }
    setAnalyzing(true);
    setAnalyzeElapsed(0);
    const mode = getStorageMode();
    try {
      // 기기 저장 모드: clipId 전달 안 함 → 서버에 프레임 영구 저장 안 함
      const clipId = mode === 'device' ? null : c.id;
      const res = await enhanceApi.analyzeVideo(c.url, clipId, (sec) => setAnalyzeElapsed(sec));
      if (res.description) setLocalDesc(res.description);
      if (res.videoFile)   setLocalVideoFile(res.videoFile);
      if (res.frames?.length) {
        setLocalFrames(res.frames);
        setSlideIdx(0);
        // 기기 저장 모드: 자동 다운로드 트리거
        if (mode === 'device') downloadFrames(res.frames, c.title);
      }
      await onRefresh?.();
    } catch (e) {
      alert('AI 분석 실패: ' + e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  function downloadFrames(frames, title) {
    frames.forEach((url, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(title || 'frame').replace(/[^가-힣a-zA-Z0-9]/g, '_')}-${i + 1}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, i * 400); // 브라우저 다운로드 차단 방지: 간격 두기
    });
  }

  function downloadSingleFrame(url, idx, title) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'frame').replace(/[^가-힣a-zA-Z0-9]/g, '_')}-${idx + 1}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const frames = localFrames;
  const touchStartX = useRef(null);

  function prev(e) { e?.stopPropagation(); setSlideIdx(i => (i - 1 + frames.length) % frames.length); }
  function next(e) { e?.stopPropagation(); setSlideIdx(i => (i + 1) % frames.length); }

  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStartX.current === null || frames.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) dx < 0 ? next() : prev();
    touchStartX.current = null;
  }

  // 영상 플레이어 전용 — YouTube는 16:9 고정
  const videoSizeStyle = { width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden' };
  // 캡처 프레임 — 비율 고정 없이 이미지 자체 비율 사용
  const mediaSizeStyle = { width: '100%', borderRadius: 10, overflow: 'hidden' };

  return (
    <Modal title={c.title} onClose={onClose}>
      {/* 로컬 저장 영상 플레이어 (오프라인 지원) — 우선 표시 */}
      {localVideoFile && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>📥 저장된 영상 (오프라인 재생 가능)</span>
            <a
              href={localVideoFile}
              download={`${c.title || 'video'}.mp4`}
              style={{ fontSize: 11, color: 'var(--text2)', textDecoration: 'none' }}
            >
              ↓ 다운로드
            </a>
          </div>
          <video
            src={localVideoFile}
            controls
            playsInline
            style={{ width: '100%', borderRadius: 10, display: 'block', background: '#000', maxHeight: 320 }}
          />
        </div>
      )}

      {/* YouTube embed (스트리밍) */}
      {c.platform === 'youtube' && getYtEmbed(c.url) && !localVideoFile && (
        <div style={{ ...videoSizeStyle, marginBottom: 10 }}>
          <iframe
            src={getYtEmbed(c.url)}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {/* 슬라이드쇼 (캡처 프레임) 또는 플레이스홀더 */}
      {frames.length > 0 ? (
        <div style={{ position: 'relative', marginBottom: 12 }}>
          {/* 슬라이드 이미지 — 원본 비율 유지, 터치 스와이프 지원 */}
          <div
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            style={{
              ...mediaSizeStyle,
              background: 'var(--surface-hi)', position: 'relative',
              userSelect: 'none',
            }}
          >
            <img
              src={frames[slideIdx]}
              alt={`frame ${slideIdx + 1}`}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
            {/* 좌우 버튼 */}
            {frames.length > 1 && (
              <>
                <button onClick={prev} style={{
                  position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.5)', color: '#fff',
                  border: 'none', cursor: 'pointer', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>‹</button>
                <button onClick={next} style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.5)', color: '#fff',
                  border: 'none', cursor: 'pointer', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>›</button>
              </>
            )}
            {/* 인덱스 표시 */}
            <div style={{
              position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.55)', color: '#fff',
              borderRadius: 10, padding: '2px 10px',
              fontSize: 11, fontWeight: 600,
            }}>
              {slideIdx + 1} / {frames.length}
            </div>
            {/* 현재 프레임 다운로드 버튼 */}
            <button
              onClick={() => downloadSingleFrame(frames[slideIdx], slideIdx, c.title)}
              style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(0,0,0,0.5)', color: '#fff',
                border: 'none', borderRadius: 8,
                padding: '4px 8px', fontSize: 12, cursor: 'pointer',
              }}
              title="이 프레임 다운로드"
            >
              ↓
            </button>
          </div>
          {/* 썸네일 닷 인디케이터 */}
          {frames.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>
              {frames.map((_, i) => (
                <button key={i} onClick={() => setSlideIdx(i)} style={{
                  width: i === slideIdx ? 18 : 6, height: 6,
                  borderRadius: 3, border: 'none', cursor: 'pointer',
                  background: i === slideIdx ? 'var(--accent)' : 'var(--border-med)',
                  padding: 0, transition: 'width 0.2s',
                }} />
              ))}
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', marginTop: 4 }}>
            ✨ AI 분석 캡처
          </div>
        </div>
      ) : (
        /* 캡처 없으면 플랫폼 아이콘 placeholder */
        <div style={{
          width: '100%', aspectRatio: '16/9', borderRadius: 10,
          background: 'var(--surface)', border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 12, gap: 6,
        }}>
          <span style={{ fontSize: 32 }}>{getPlatformIcon(c.platform)}</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>AI 분석 후 캡처가 표시됩니다</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {(c.tech_names?.length ? c.tech_names : (c.tech_name ? [c.tech_name] : [])).map((t, i) => (
          <Tag key={i} tone="accent">{t}</Tag>
        ))}
        <Tag tone="purple">{getPlatformLabel(c.platform)}</Tag>
        {c.starred ? <Tag tone="amber">즐겨찾기</Tag> : null}
      </div>

      {localDesc && (
        <div style={{
          fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap',
          marginBottom: 12, padding: 10,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          {localDesc}
        </div>
      )}

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
          <button
            onClick={handleAiAnalyze}
            disabled={disabled}
            style={{
              width: '100%', marginTop: 12, marginBottom: 4,
              padding: '10px 0',
              background: disabled ? 'var(--surface-up)' : 'var(--purple-dim)',
              color: disabled ? 'var(--text2)' : 'var(--purple)',
              border: `1px solid ${disabled ? 'var(--border)' : 'var(--purple)'}`,
              borderRadius: 10, fontSize: 13, fontWeight: 700,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {bgRunning
              ? `🔄 ${analyzeJob.stage || 'AI 분석 중'} ${analyzeJob.progress}%`
              : analyzing ? `✨ AI 분석 중... ${analyzeElapsed}s` : '✨ AI 분석 (캡처 저장)'}
          </button>
        );
      })()}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Button variant="outline" size="sm" onClick={onEdit}>수정</Button>
        <Button variant="danger" size="sm" onClick={onDelete} style={{ marginLeft: 'auto' }}>삭제</Button>
      </div>
    </Modal>
  );
}
