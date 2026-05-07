import React, { useState, useMemo } from 'react';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';
import * as clipsApi from '../api/clips';
import * as enhanceApi from '../api/enhanceMemo';
import {
  getYtThumb, getYtEmbed, getClipThumb,
  getPlatformIcon, getPlatformLabel,
} from '../utils/videoThumb';

const platformIcon  = getPlatformIcon;
const platformLabel = getPlatformLabel;
const getThumb      = getClipThumb;
const detectPlatform = u => !u ? 'other' : u.includes('youtu') ? 'youtube' : u.includes('instagram') ? 'instagram' : 'other';

export default function ClipsPage() {
  const { clips, techniques, reloadClips } = useCache();
  const { showToast, setLoading } = useUI();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [techFilter, setTechFilter] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | clip object
  const [detail, setDetail] = useState(null);

  const techNames = useMemo(() =>
    [...new Set(clips.map(c => c.tech_name).filter(Boolean))].sort(),
  [clips]);

  const list = useMemo(() => {
    let items = clips;
    if (filter === 'star') items = items.filter(c => c.starred);
    if (techFilter) items = items.filter(c => c.tech_name === techFilter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(c =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.tech_name || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [clips, filter, techFilter, search]);

  async function handleStar(id) {
    try {
      await clipsApi.toggleStar(id);
      await reloadClips();
    } catch (e) { showToast('오류: ' + e.message); }
  }

  async function handleSave(form) {
    setLoading(true);
    try {
      if (editing && editing !== 'new') await clipsApi.updateClip(editing.id, form);
      else await clipsApi.createClip(form);
      await reloadClips();
      setEditing(null);
      showToast('저장되었습니다');
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
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>참고영상</span>
        <button className="btn-sm" onClick={() => setEditing('new')}>+ 추가</button>
      </div>

      <input
        type="text"
        placeholder="제목·기술명·설명 검색"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '10px 12px', marginBottom: 12,
                 border: '0.5px solid var(--border)', borderRadius: 'var(--radius)',
                 background: 'var(--bg2)', color: 'var(--text)', fontSize: 14 }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        <FilterChip label="전체" active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterChip label="★ 즐겨찾기" active={filter === 'star'} onClick={() => setFilter('star')} />
        {techNames.map(n => (
          <FilterChip key={n} label={n} active={techFilter === n}
            onClick={() => setTechFilter(techFilter === n ? '' : n)} />
        ))}
      </div>

      {list.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text2)', padding: 40 }}>영상이 없습니다</div>
      ) : (
        <div className="clips-grid">
          {list.map(c => <ClipCard key={c.id} c={c} onClick={() => setDetail(c)} onStar={() => handleStar(c.id)} />)}
        </div>
      )}

      {editing && (
        <ClipEditor
          initial={editing === 'new' ? null : editing}
          techniques={techniques}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
      {detail && (
        <ClipDetail c={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(detail); setDetail(null); }}
          onDelete={() => handleDelete(detail.id)}
        />
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '6px 12px',
        border: active ? '1.5px solid var(--text)' : '0.5px solid var(--border2)',
        background: 'var(--bg)', color: 'var(--text)',
        borderRadius: 16, fontSize: 12, cursor: 'pointer',
        fontWeight: active ? 600 : 400,
      }}>
      {label}
    </button>
  );
}

function ClipCard({ c, onClick, onStar }) {
  const thumb = getThumb(c);
  return (
    <div className="clip-card" onClick={onClick}>
      {thumb ? <img className="clip-thumb" src={thumb} alt="" />
             : <div className="clip-thumb-placeholder">{platformIcon(c.platform)}</div>}
      <div className="clip-info">
        <div className="clip-title">{c.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {c.tech_name && <span className="tag">⊙ {c.tech_name}</span>}
          <span style={{ fontSize: 11, color: 'var(--blue)' }}>{platformLabel(c.platform)}</span>
        </div>
      </div>
      <button
        className={`clip-star${c.starred ? ' starred' : ''}`}
        onClick={e => { e.stopPropagation(); onStar(); }}
      >{c.starred ? '★' : '☆'}</button>
    </div>
  );
}

function ClipEditor({ initial, techniques, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [url, setUrl]     = useState(initial?.url || '');
  const [techName, setTechName] = useState(initial?.tech_name || '');
  const [desc, setDesc]   = useState(initial?.description || '');
  const [starred, setStarred] = useState(!!initial?.starred);
  const [analyzing, setAnalyzing] = useState(false);

  const matched = techName.trim()
    ? techniques.filter(t => t.name.toLowerCase().includes(techName.toLowerCase())).slice(0, 8)
    : [];

  async function handleAiAnalyze() {
    if (!url.trim()) { alert('URL을 먼저 입력해주세요'); return; }
    if (!/(youtube\.com|youtu\.be|instagram\.com)/.test(url)) {
      alert('YouTube 또는 Instagram URL만 AI 분석 가능합니다');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await enhanceApi.analyzeVideo(url);
      setDesc(res.description || '');
      alert(`AI 설명이 생성되었습니다 (${res.method || 'vision'})`);
    } catch (e) {
      alert('AI 분석 실패: ' + e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  function submit() {
    if (!title.trim())    return alert('영상 제목을 입력해주세요');
    if (!url.trim())      return alert('URL을 입력해주세요');
    if (!techName.trim()) return alert('기술명을 입력해주세요');
    onSave({
      title: title.trim(), url: url.trim(),
      description: desc, tech_name: techName.trim(),
      tags: [], starred: starred ? 1 : 0,
    });
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{initial ? '참고영상 수정' : '참고영상 추가'}</div>
        <div className="field"><label>제목 *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="영상 제목" /></div>
        <div className="field"><label>URL *</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="YouTube 또는 Instagram URL" />
          {url && <div style={{ fontSize: 12, color: 'var(--blue)', marginTop: 4 }}>{platformLabel(detectPlatform(url))}</div>}
        </div>
        <div className="field" style={{ position: 'relative' }}>
          <label>기술명 *</label>
          <input value={techName} onChange={e => setTechName(e.target.value)}
            placeholder="예: 클로즈드 가드 힙 범프 스윕" autoComplete="off" />
          {matched.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              background: 'var(--bg2)', border: '0.5px solid var(--border2)',
              borderRadius: 'var(--radius)', maxHeight: 180, overflowY: 'auto', zIndex: 10,
            }}>
              {matched.map(t => (
                <div key={t.id} onClick={() => setTechName(t.name)}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '0.5px solid var(--border)' }}>
                  {t.name}{t.pos && <span style={{ color: 'var(--text2)', fontSize: 11, marginLeft: 6 }}>{t.pos}</span>}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
            기술트리에 등록된 동일 기술명의 카드와 자동 연결됩니다
          </div>
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="starred-cb" checked={starred} onChange={e => setStarred(e.target.checked)} />
          <label htmlFor="starred-cb" style={{ margin: 0, cursor: 'pointer' }}>⭐ 즐겨찾기</label>
        </div>
        <div className="field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ margin: 0 }}>설명</label>
            <button onClick={handleAiAnalyze} disabled={analyzing}
              style={{ background: 'var(--blue-bg)', color: 'var(--blue-text)',
                       border: 'none', padding: '4px 10px', borderRadius: 6,
                       fontSize: 12, cursor: analyzing ? 'wait' : 'pointer' }}>
              {analyzing ? '분석 중...' : '✨ AI 분석'}
            </button>
          </div>
          <textarea rows={3} value={desc} onChange={e => setDesc(e.target.value)} placeholder="영상에 대한 설명" />
        </div>
        <div className="modal-actions">
          <button className="btn-outline" onClick={onCancel}>취소</button>
          <button className="btn-primary" onClick={submit}>저장</button>
        </div>
      </div>
    </div>
  );
}

function ClipDetail({ c, onClose, onEdit, onDelete }) {
  const ytEmbed = c.platform === 'youtube' ? getYtEmbed(c.url) : null;
  const thumb = !ytEmbed ? (c.thumb_url || (c.platform === 'youtube' ? getYtThumb(c.url) : null)) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          {c.starred && <span style={{ color: 'var(--amber)', marginRight: 6 }}>★</span>}
          {c.title}
        </div>

        {/* 미리보기: YouTube는 임베드, 외엔 썸네일 이미지(클릭 시 원본 열림) */}
        {ytEmbed ? (
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9',
                        marginBottom: 12, borderRadius: 'var(--radius)', overflow: 'hidden',
                        background: 'var(--bg2)' }}>
            <iframe
              src={ytEmbed}
              title={c.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        ) : thumb ? (
          <a href={c.url} target="_blank" rel="noreferrer"
            style={{ display: 'block', position: 'relative', width: '100%', aspectRatio: '16 / 9',
                     marginBottom: 12, borderRadius: 'var(--radius)', overflow: 'hidden',
                     background: 'var(--bg2)' }}>
            <img src={thumb} alt={c.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(0,0,0,0.25)', color: '#fff',
                          fontSize: 36, textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
              ▶
            </div>
          </a>
        ) : (
          <div className="clip-thumb-placeholder"
            style={{ width: '100%', aspectRatio: '16 / 9', height: 'auto',
                     fontSize: 48, marginBottom: 12 }}>
            {platformIcon(c.platform)}
          </div>
        )}

        {c.tech_name && <div style={{ marginBottom: 8 }}><span className="tag">⊙ {c.tech_name}</span></div>}
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>{platformLabel(c.platform)}</div>
        {c.description && <div style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{c.description}</div>}
        {c.url && <a href={c.url} target="_blank" rel="noreferrer"
          style={{ color: 'var(--blue)', textDecoration: 'none', display: 'inline-block', marginBottom: 12 }}>
          ▶ 원본 영상 열기 ↗
        </a>}
        <div className="modal-actions">
          <button className="btn-outline" onClick={onDelete} style={{ color: 'var(--red)' }}>삭제</button>
          <button className="btn-outline" onClick={onEdit}>수정</button>
          <button className="btn-primary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
