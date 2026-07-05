import React, { useState, useEffect, useCallback } from 'react';
import { getPositions, deletePosition } from '../api/techniques';
import Modal from './Modal';
import Button from './Button';

export default function PositionManagerModal({ onClose, onChanged }) {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [deleting, setDeleting]   = useState(null); // 삭제 중인 포지션명

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

  async function handleDelete(name, count) {
    if (!confirm(`'${name}' 포지션을 ${count}개 기술에서 제거합니다.\n계속하시겠습니까?`)) return;
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

  return (
    <Modal title="포지션 관리" onClose={onClose}>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        ⚠ 삭제 시 해당 포지션이 모든 기술에서 제거됩니다
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>불러오는 중...</div>
      ) : positions.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>등록된 포지션이 없습니다</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {positions.map(({ name, count }) => (
            <div key={name} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
            }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{name}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>{count}개 기술</span>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(name, count)}
                disabled={deleting === name}
              >
                {deleting === name ? '삭제 중...' : '삭제'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
