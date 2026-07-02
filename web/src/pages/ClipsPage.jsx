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
import Modal from '../components/Modal';
import Button from '../components/Button';
import Pagination from '../components/Pagination';
import TagPicker from '../components/TagPicker';
import ClipDetailModal from '../components/ClipDetailModal';

const PAGE_SIZE = 10;
const detectPlatform = u => !u ? 'other' : u.includes('youtu') ? 'youtube' : u.includes('instagram') ? 'instagram' : 'other';

export default function ClipsPage({ embedded = false }) {
  const { clips, techniques, reloadClips } = useCache();
  const { showToast, setLoading } = useUI();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');     // all | recent | star
  const [techFilter, setTechFilter] = useState(''); // 기술명 (빈 문자열이면 미선택)
  const [techOpen, setTechOpen]     = useState(false);
  const [techSearch, setTechSearch] = useState('');
  const techDropRef = useRef(null);
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

  // 사용 빈도순 기술명 (다중 기술 지원)
  const techNames = useMemo(() => {
    const count = new Map();
    for (const c of clips) {
      const names = c.tech_names?.length ? c.tech_names : (c.tech_name ? [c.tech_name] : []);
      for (const n of names) {
        const t = (n || '').trim();
        if (t) count.set(t, (count.get(t) || 0) + 1);
      }
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [clips]);

  const list = useMemo(() => {
    let items = [...clips];
    if (filter === 'star')   items = items.filter(c => c.starred);
    if (filter === 'recent') items.sort((a, b) => (b.id || 0) - (a.id || 0));
    if (techFilter)          items = items.filter(c => {
      const names = c.tech_names?.length ? c.tech_names : (c.tech_name ? [c.tech_name] : []);
      return names.includes(techFilter);
    });
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(c =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.tech_name || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [clips, search, filter, techFilter]);

  useEffect(() => { setPage(1); }, [search, filter, techFilter]);

  const filteredTechNames = useMemo(() =>
    techSearch.trim()
      ? techNames.filter(n => n.toLowerCase().includes(techSearch.toLowerCase()))
      : techNames,
    [techNames, techSearch]
  );

  useEffect(() => {
    if (!techOpen) return;
    function handleClick(e) {
      if (techDropRef.current && !techDropRef.current.contains(e.target))
        setTechOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [techOpen]);

  const paged = useMemo(
    () => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [list, page]
  );

  async function handleStar(id) {
    try { await clipsApi.toggleStar(id); await reloadClips(); }
    catch (e) { showToast('오류: ' + e.message); }
  }
  async function handleSave(form) {
    setLoading(true);
    try {
      if (editing && editing !== 'new') await clipsApi.updateClip(editing.id, form);
      else await clipsApi.createClip(form);
      await reloadClips();
      setEditing(null);
      showToast('저장되었습니다');
      // URL이 있으면 백그라운드 AI 분석이 시작될 수 있으므로 폴링 시작
      if (form.url && /youtube\.com|youtu\.be|instagram\.com/.test(form.url)) {
        setTimeout(() => startPolling(), 2000);
      }
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
        <FilterChip active={filter === 'all'}    onClick={() => setFilter('all')}>전체</FilterChip>
        <FilterChip active={filter === 'recent'} onClick={() => setFilter('recent')} icon="clock">최신순</FilterChip>
        <FilterChip active={filter === 'star'}   onClick={() => setFilter('star')}   icon="star">즐겨찾기</FilterChip>
        {embedded && (
          <div style={{ marginLeft: 'auto' }}>
            <Button size="sm" variant="outline" onClick={() => setEditing('new')}>+ 추가</Button>
          </div>
        )}
      </div>

      {/* 기술명 필터 — 드롭다운 */}
      {techNames.length > 0 && (
        <div style={{ marginBottom: 12, position: 'relative' }} ref={techDropRef}>
          <button
            onClick={() => { setTechOpen(o => !o); setTechSearch(''); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 20,
              border: techFilter ? '1.5px solid var(--accent)' : '1px solid var(--border-med)',
              background: techFilter ? 'var(--accent-dim)' : 'var(--surface-up)',
              color: techFilter ? 'var(--accent)' : 'var(--text2)',
              fontSize: 13, fontWeight: techFilter ? 700 : 500, cursor: 'pointer',
            }}
          >
            {techFilter || '기술 선택'}
            <span style={{ fontSize: 10 }}>{techOpen ? '▲' : '▼'}</span>
          </button>

          {techOpen && (
            <div style={{
              position: 'absolute', top: '110%', left: 0, zIndex: 200,
              width: 240, maxHeight: 260,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                <input
                  autoFocus
                  value={techSearch}
                  onChange={e => setTechSearch(e.target.value)}
                  placeholder="기술 검색…"
                  style={{ width: '100%', border: 'none', outline: 'none',
                           background: 'transparent', fontSize: 13, color: 'var(--text)' }}
                />
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <button onClick={() => { setTechFilter(''); setTechOpen(false); }}
                  style={dropItemStyle(!techFilter)}>모든 기술</button>
                {filteredTechNames.length === 0 && (
                  <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text3)' }}>
                    검색 결과 없음
                  </div>
                )}
                {filteredTechNames.map(n => (
                  <button key={n}
                    onClick={() => { setTechFilter(n); setTechOpen(false); setTechSearch(''); }}
                    style={dropItemStyle(techFilter === n)}>{n}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {list.length === 0 ? (
        <Card style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>
          영상이 없습니다
        </Card>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paged.map(c => <ClipCard key={c.id} c={c} onClick={() => setDetail(c)} onStar={() => handleStar(c.id)} analyzeJob={analyzeStatus[String(c.id)]} />)}
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

function dropItemStyle(active) {
  return {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '9px 14px', border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: active ? 700 : 400,
    background: active ? 'var(--accent-dim)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text)',
  };
}

function FilterChip({ active, onClick, icon, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '6px 12px',
        background: active ? 'var(--accent)' : 'var(--surface-up)',
        color: active ? '#fff' : 'var(--text2)',
        border: 'none',
        borderRadius: 16,
        fontSize: 12, fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {icon && <Icon name={icon} size={12} color={active ? '#fff' : 'var(--text2)'} filled={icon === 'star' && active} />}
      {children}
    </button>
  );
}

function ClipCard({ c, onClick, onStar, analyzeJob }) {
  const thumb = getClipThumb(c);
  const isAnalyzing = analyzeJob && analyzeJob.progress >= 0;
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
        </div>
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

function ClipEditor({ initial, techniques, onSave, onCancel, analyzeJob }) {
  const { igCookieConfigured } = useCache();
  const [title, setTitle] = useState(initial?.title || '');
  const [url, setUrl]     = useState(initial?.url || '');
  const [techNames, setTechNames] = useState(
    initial?.tech_names?.length ? initial.tech_names
    : initial?.tech_name ? [initial.tech_name]
    : []
  );
  const [desc, setDesc]   = useState(initial?.description || '');
  const [starred, setStarred] = useState(!!initial?.starred);
  const [analyzing, setAnalyzing]             = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzeStage, setAnalyzeStage]       = useState('');

  const techSuggestions = useMemo(
    () => techniques.map(t => t.name),
    [techniques]
  );

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
    setAnalyzing(true);
    setAnalyzeProgress(0); setAnalyzeStage('');
    try {
      // initial?.id 가 있으면 (수정 모달) clipId 전달 → 프레임 영구 저장
      const res = await enhanceApi.analyzeVideo(url, initial?.id || null, (pct, stg) => { setAnalyzeProgress(pct); setAnalyzeStage(stg); });
      setDesc(res.description || '');
      // 프레임이 저장됐으면 클립 목록 새로고침
      if ((res.frames || []).length > 0) reloadClips();
      alert(`AI 설명이 생성되었습니다 (${res.method || 'vision'})`);
    } catch (e) {
      alert('AI 분석 실패: ' + e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  function submit() {
    if (!title.trim())       return alert('영상 제목을 입력해주세요');
    if (!url.trim())         return alert('URL을 입력해주세요');
    if (!techNames.length)   return alert('기술명을 1개 이상 입력해주세요');
    onSave({
      title: title.trim(), url: url.trim(),
      description: desc,
      tech_names: techNames,
      tech_name: techNames[0] || '',
      tags: [], starred: starred ? 1 : 0,
    });
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
      </div>
      <div className="field"><label>제목 *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="영상 제목" /></div>
      <div className="field"><label>URL *</label>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="YouTube 또는 Instagram URL" />
        {url && <div style={{ fontSize: 12, color: 'var(--blue)', marginTop: 4 }}>{getPlatformLabel(detectPlatform(url))}</div>}
        {isInstagram && !igCookieConfigured && (
          <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 3 }}>
            ⚠ Instagram은 AI 자동 분석 불가 — 저장 후 상세 화면에서 파일로 분석하거나 프로필에서 쿠키를 설정하세요
          </div>
        )}
        {isInstagram && igCookieConfigured && (
          <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 3 }}>
            ✓ Instagram 쿠키 인증됨 — AI 분석 가능
          </div>
        )}
      </div>
      <div className="field">
        <label>기술명 * (여러 개 가능)</label>
        <TagPicker
          value={techNames}
          onChange={setTechNames}
          suggestions={techSuggestions}
          placeholder="기술명 검색·자유 입력"
        />
      </div>
      <div className="field">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label style={{ margin: 0 }}>설명</label>
          {(() => {
            const bgRunning = analyzeJob && analyzeJob.progress >= 0;
            const igBlocked = isInstagram && !igCookieConfigured;
            const disabled  = analyzing || bgRunning || igBlocked;
            const label     = bgRunning
              ? `🔄 ${analyzeJob.stage || '분석 중'} ${analyzeJob.progress}%`
              : analyzing ? `🔄 ${analyzeStage || 'AI 분석 중'} ${analyzeProgress}%`
              : igBlocked ? '📁 파일로 분석 (상세에서)'
              : isInstagram ? '✨ AI 분석 (쿠키 인증)'
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
