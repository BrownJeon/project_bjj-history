import React, { useState, useEffect, useCallback } from 'react';
import { getPositions, deletePosition, renamePosition } from '../api/techniques';
import Modal from './Modal';
import Button from './Button';

// 기술/참고영상/드릴/스파링 중 0이 아닌 항목만 이어붙여 표시
function formatLinks({ techCount, clipCount, drillCount, sparCount }) {
  const parts = [];
  if (techCount)  parts.push(`기술 ${techCount}`);
  if (clipCount)  parts.push(`영상 ${clipCount}`);
  if (drillCount) parts.push(`드릴 ${drillCount}`);
  if (sparCount)  parts.push(`스파링 ${sparCount}`);
  return parts.length ? parts.join(' · ') : '연결된 항목 없음';
}

export default function PositionManagerModal({ onClose, onChanged }) {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [deleting, setDeleting]   = useState(null); // 삭제 중인 포지션명
  const [editing, setEditing]     = useState(null);  // 수정 중인 포지션명
  const [editValue, setEditValue] = useState('');
  const [renaming, setRenaming]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPositions();
      setPositions(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // task-016: 삭제가 기술뿐 아니라 참고영상·드릴·스파링에서도 제거되도록 확장됐다.
  // 예전 문구("N개 기술에서 제거합니다")는 이제 거짓이라 실제 지워지는 범위를 저장소별
  // 실제 건수로 보여준다 — 사용자가 "기술만 지워지겠지"라고 오해한 채 확인을 누르면
  // 되돌릴 수 없는 삭제가 영상·드릴·스파링까지 번진다.
  async function handleDelete(p) {
    const rows = [
      ['기술',     p.techCount],
      ['참고영상', p.clipCount],
      ['드릴',     p.drillCount],
      ['스파링',   p.sparCount],
    ].filter(([, n]) => n > 0);

    const detail = rows.length
      ? rows.map(([label, n]) => `  · ${label} ${n}건`).join('\n')
      : '  · 연결된 기록 없음';
    const sparNote = p.sparCount
      ? '\n\n※ 이 포지션만 기록된 스파링 라운드는 포지션 기록이 비게 됩니다\n   (라운드 자체는 남고, 포지션 평균 집계에서만 빠집니다)'
      : '';

    if (!confirm(
      `'${p.name}' 포지션을 삭제합니다.\n\n다음 기록에서 제거됩니다:\n${detail}${sparNote}\n\n되돌릴 수 없습니다. 계속하시겠습니까?`
    )) return;

    const name = p.name;
    setDeleting(name);
    try {
      await deletePosition(name);
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
    if (!newName) return alert('포지션명을 입력해주세요');
    if (newName === oldName) { cancelEdit(); return; }
    setRenaming(true);
    try {
      const res = await renamePosition(oldName, newName);
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
    <Modal title="포지션 관리" onClose={onClose}>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        ⚠ 수정·삭제 모두 기술·참고영상·드릴·스파링 기록 4곳에 함께 적용됩니다.
        목록에는 4곳 중 어디든 쓰인 포지션이 모두 표시됩니다
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>불러오는 중...</div>
      ) : positions.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>등록된 포지션이 없습니다</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {positions.map((p) => (
            <div key={p.name} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
            }}>
              {editing === p.name ? (
                <>
                  <input
                    autoFocus
                    maxLength={50}   /* 백엔드 400(포지션명 50자 제한)과 짝 — drills.pos varchar(50) */
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(p.name); if (e.key === 'Escape') cancelEdit(); }}
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: 8,
                      border: '1px solid var(--accent)', background: 'var(--surface-up)',
                      color: 'var(--text)', fontSize: 14, outline: 'none',
                    }}
                  />
                  <Button variant="primary" size="sm" onClick={() => saveEdit(p.name)} disabled={renaming}>
                    {renaming ? '저장 중...' : '저장'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={cancelEdit} disabled={renaming}>취소</Button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{formatLinks(p)}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => startEdit(p.name)}>수정</Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(p)}
                    disabled={deleting === p.name}
                  >
                    {deleting === p.name ? '삭제 중...' : '삭제'}
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
