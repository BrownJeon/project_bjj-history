import React, { useEffect, useState } from 'react';
import * as profileApi from '../api/profile';
import { useUI } from '../contexts/UIContext';

export default function ProfilePage() {
  const { showToast, setLoading } = useUI();
  const [profile, setProfile] = useState({});
  const [belts, setBelts] = useState([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      const [p, b] = await Promise.all([profileApi.getProfile(), profileApi.listBelts()]);
      setProfile(p || {}); setBelts(b);
    } catch (e) { showToast('오류: ' + e.message); }
  }

  async function save(form) {
    setLoading(true);
    try {
      await profileApi.updateProfile(form);
      await loadAll(); setEditing(false);
      showToast('저장됨');
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>마이페이지</span>
        <button className="btn-sm" onClick={() => setEditing(!editing)}>{editing ? '취소' : '수정'}</button>
      </div>

      {!editing ? (
        <div className="card">
          <Row label="닉네임" value={profile.nickname || '-'} />
          <Row label="시작일" value={profile.start_date || '-'} />
          <Row label="체급" value={profile.weight_class || '-'} />
          <Row label="소속" value={profile.network || '-'} />
        </div>
      ) : (
        <ProfileEditor profile={profile} onSave={save} />
      )}

      <div style={{ marginTop: 16, fontWeight: 600, marginBottom: 8 }}>벨트 이력</div>
      {belts.length === 0 ? (
        <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 20 }}>벨트 이력이 없습니다</div>
      ) : belts.map(b => (
        <div key={b.id} className="card">
          <div style={{ fontWeight: 600 }}>{b.belt} {'★'.repeat(b.stripes || 0)}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{b.achieved_date}</div>
          {b.note && <div style={{ marginTop: 4, fontSize: 13 }}>{b.note}</div>}
        </div>
      ))}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
      <span style={{ color: 'var(--text2)' }}>{label}</span><span>{value}</span>
    </div>
  );
}

function ProfileEditor({ profile, onSave }) {
  const [form, setForm] = useState({
    nickname: profile.nickname || '',
    startDate: profile.start_date || '',
    weightClass: profile.weight_class || '',
    network: profile.network || '',
  });
  const update = (k, v) => setForm({ ...form, [k]: v });
  return (
    <div className="card">
      <div className="field"><label>닉네임</label>
        <input value={form.nickname} onChange={e => update('nickname', e.target.value)} /></div>
      <div className="field"><label>시작일</label>
        <input type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} /></div>
      <div className="field"><label>체급</label>
        <input value={form.weightClass} onChange={e => update('weightClass', e.target.value)} /></div>
      <div className="field"><label>소속</label>
        <input value={form.network} onChange={e => update('network', e.target.value)} /></div>
      <button className="btn-primary" onClick={() => onSave(form)} style={{ width: '100%' }}>저장</button>
    </div>
  );
}
