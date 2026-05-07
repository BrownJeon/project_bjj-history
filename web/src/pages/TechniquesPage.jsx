import React, { useState, useMemo } from 'react';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';
import * as techApi from '../api/techniques';

export default function TechniquesPage() {
  const { techniques, reloadTechniques } = useCache();
  const { showToast, setLoading } = useUI();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  const list = useMemo(() => {
    let items = techniques;
    if (filter === 'star') items = items.filter(t => t.starred);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.pos || '').toLowerCase().includes(q) ||
        (t.tags || []).some(x => x.toLowerCase().includes(q))
      );
    }
    return items;
  }, [techniques, search, filter]);

  async function handleStar(id) {
    try { await techApi.toggleTechStar(id); await reloadTechniques(); }
    catch (e) { showToast('오류: ' + e.message); }
  }

  async function handleSave(form) {
    setLoading(true);
    try {
      if (editing && editing !== 'new') await techApi.updateTechnique(editing.id, form);
      else await techApi.createTechnique(form);
      await reloadTechniques();
      setEditing(null);
      showToast('저장되었습니다');
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  async function handleDelete(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      await techApi.deleteTechnique(id);
      await reloadTechniques();
      setDetail(null);
      showToast('삭제되었습니다');
    } catch (e) { showToast('삭제 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>기술트리</span>
        <button className="btn-sm" onClick={() => setEditing('new')}>+ 추가</button>
      </div>
      <input type="text" placeholder="기술명·포지션·태그 검색" value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '10px 12px', marginBottom: 12,
                 border: '0.5px solid var(--border)', borderRadius: 'var(--radius)',
                 background: 'var(--bg2)', color: 'var(--text)', fontSize: 14 }} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button className="btn-sm" onClick={() => setFilter('all')}
          style={{ fontWeight: filter === 'all' ? 600 : 400 }}>전체</button>
        <button className="btn-sm" onClick={() => setFilter('star')}
          style={{ fontWeight: filter === 'star' ? 600 : 400 }}>★ 즐겨찾기</button>
      </div>
      {list.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text2)', padding: 40 }}>기술이 없습니다</div>
      ) : list.map(t => (
        <div key={t.id} className="card" onClick={() => setDetail(t)} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                {t.starred && <span style={{ color: 'var(--amber)', marginRight: 6 }}>★</span>}
                {t.name}
              </div>
              {t.pos && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>{t.pos}</div>}
              {(t.clips || []).length > 0 && <div style={{ fontSize: 11, color: 'var(--blue)' }}>🎬 {t.clips.length}개 영상 자동 연결</div>}
            </div>
            <button onClick={e => { e.stopPropagation(); handleStar(t.id); }}
              style={{ background: 'none', border: 'none', fontSize: 22, color: t.starred ? 'var(--amber)' : 'var(--border2)', cursor: 'pointer' }}>
              {t.starred ? '★' : '☆'}
            </button>
          </div>
        </div>
      ))}
      {editing && <TechEditor initial={editing === 'new' ? null : editing}
        onSave={handleSave} onCancel={() => setEditing(null)} />}
      {detail && <TechDetail t={detail}
        onClose={() => setDetail(null)}
        onEdit={() => { setEditing(detail); setDetail(null); }}
        onDelete={() => handleDelete(detail.id)} />}
    </div>
  );
}

function TechEditor({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [pos, setPos]   = useState(initial?.pos || '');
  const [category, setCategory] = useState(initial?.category || '');
  const [note, setNote] = useState(initial?.note || '');
  const [starred, setStarred] = useState(!!initial?.starred);

  function submit() {
    if (!name.trim()) return alert('기술명을 입력해주세요');
    onSave({ name: name.trim(), pos, category, tags: initial?.tags || [], note, starred: starred ? 1 : 0 });
  }
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{initial ? '기술 수정' : '기술 추가'}</div>
        <div className="field"><label>기술명 *</label>
          <input value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><label>포지션</label>
          <input value={pos} onChange={e => setPos(e.target.value)} placeholder="예: 클로즈드 가드" /></div>
        <div className="field"><label>카테고리</label>
          <input value={category} onChange={e => setCategory(e.target.value)} /></div>
        <div className="field"><label>참고 영상</label>
          <div style={{ fontSize: 12, color: 'var(--text2)', padding: 8,
                        background: 'var(--bg2)', borderRadius: 'var(--radius)' }}>
            참고영상 메뉴에서 <strong>이 기술명과 동일</strong>한 영상이 자동 연결됩니다
          </div>
        </div>
        <div className="field"><label>핵심 포인트 / 메모</label>
          <textarea rows={4} value={note} onChange={e => setNote(e.target.value)} /></div>
        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="t-star" checked={starred} onChange={e => setStarred(e.target.checked)} />
          <label htmlFor="t-star" style={{ margin: 0, cursor: 'pointer' }}>⭐ 즐겨찾기</label>
        </div>
        <div className="modal-actions">
          <button className="btn-outline" onClick={onCancel}>취소</button>
          <button className="btn-primary" onClick={submit}>저장</button>
        </div>
      </div>
    </div>
  );
}

function TechDetail({ t, onClose, onEdit, onDelete }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          {t.starred && <span style={{ color: 'var(--amber)', marginRight: 6 }}>★</span>}
          {t.name}
        </div>
        {t.pos && <div style={{ marginBottom: 8, color: 'var(--text2)' }}>{t.pos}</div>}
        {t.note && <div style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{t.note}</div>}
        {(t.clips || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>참고 영상 ({t.clips.length})</div>
            {t.clips.map(c => (
              <a key={c.id} href={c.url} target="_blank" rel="noreferrer"
                style={{ display: 'block', padding: 8, marginBottom: 6, background: 'var(--bg2)',
                         borderRadius: 8, textDecoration: 'none', color: 'var(--text)' }}>
                ▶ {c.title}
              </a>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-outline" onClick={onDelete} style={{ color: 'var(--red)' }}>삭제</button>
          <button className="btn-outline" onClick={onEdit}>수정</button>
          <button className="btn-primary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
