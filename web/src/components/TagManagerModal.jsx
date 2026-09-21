import React, { useState, useEffect, useCallback } from 'react';
import { getTags, deleteTag, renameTag } from '../api/techniques';
import Modal from './Modal';
import Button from './Button';

// 기술/참고영상 중 0이 아닌 항목만 이어붙여 표시 — PositionManagerModal의 formatLinks와 동일 패턴
function formatLinks({ techCount, clipCount }) {
  const parts = [];
  if (techCount) parts.push(`기술 ${techCount}`);
  if (clipCount) parts.push(`영상 ${clipCount}`);
  return parts.length ? parts.join(' · ') : '연결된 항목 없음';
}

export default function TagManagerModal({ onClose, onChanged }) {
  const [tags, setTags]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [deleting, setDeleting]   = useState(null); // 삭제 중인 태그명
  const [editing, setEditing]     = useState(null);  // 수정 중인 태그명
  const [editValue, setEditValue] = useState('');
  const [renaming, setRenaming]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTags();
      setTags(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(tag) {
    const rows = [
      ['기술',     tag.techCount],
      ['참고영상', tag.clipCount],
    ].filter(([, n]) => n > 0);

    const detail = rows.length
      ? rows.map(([label, n]) => `  · ${label} ${n}건`).join('\n')
      : '  · 연결된 기록 없음';

    if (!confirm(
      `'${tag.name}' 태그를 삭제합니다.\n\n다음 기록에서 제거됩니다:\n${detail}\n\n되돌릴 수 없습니다. 계속하시겠습니까?`
    )) return;

    const name = tag.name;
    setDeleting(name);
    try {
      await deleteTag(name);
      await load();
      onChanged?.();
    } catch (e) {
      alert('삭제 실패: ' + e.message);
    } finally {
      setDeleting(null);
    }
  }

  function startEdit(name) {
    setEditing(name);
    setEditValue(name);
  }
  function cancelEdit() {
    setEditing(null);
    setEditValue('');
  }
  async function saveEdit(oldName) {
    const newName = editValue.trim();
    if (!newName) return alert('태그명을 입력해주세요');
    if (newName === oldName) { cancelEdit(); return; }
    setRenaming(true);
    try {
      const res = await renameTag(oldName, newName);
      await load();
      onChanged?.();
      cancelEdit();
      alert(`'${oldName}' → '${newName}'로 변경했습니다 (연결된 항목 ${res.updatedCount}개 함께 갱신됨)`);
    } catch (e) {
      alert('수정 실패: ' + e.message);
    } finally {
      setRenaming(false);
    }
  }

  return (
    <Modal title="태그 관리" onClose={onClose}>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        ⚠ 수정·삭제 모두 기술·참고영상 기록에 함께 적용됩니다.
        목록에는 둘 중 어디든 쓰인 태그가 모두 표시됩니다
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>불러오는 중...</div>
      ) : tags.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>등록된 태그가 없습니다</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tags.map((tag) => (
            <div key={tag.name} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
            }}>
              {editing === tag.name ? (
                <>
                  <input
                    autoFocus
                    maxLength={60}   /* 백엔드 TAG_NAME_MAX(60자)와 짝 */
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(tag.name); if (e.key === 'Escape') cancelEdit(); }}
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: 8,
                      border: '1px solid var(--accent)', background: 'var(--surface-up)',
                      color: 'var(--text)', fontSize: 14, outline: 'none',
                    }}
                  />
                  <Button variant="primary" size="sm" onClick={() => saveEdit(tag.name)} disabled={renaming}>
                    {renaming ? '저장 중...' : '저장'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={cancelEdit} disabled={renaming}>취소</Button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{tag.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{formatLinks(tag)}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => startEdit(tag.name)}>수정</Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(tag)}
                    disabled={deleting === tag.name}
                  >
                    {deleting === tag.name ? '삭제 중...' : '삭제'}
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
