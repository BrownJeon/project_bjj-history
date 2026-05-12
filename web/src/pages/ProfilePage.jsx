import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as profileApi from '../api/profile';
import { useUI } from '../contexts/UIContext';
import { useCache } from '../contexts/CacheContext';
import Card from '../components/Card';
import Button from '../components/Button';
import Modal from '../components/Modal';
import Icon from '../components/Icon';
import BeltBar from '../components/BeltBar';
import { BELT_LEVELS, beltKey } from '../utils/baseOptions';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { showToast, setLoading } = useUI();
  const { classes, techniques } = useCache();

  const [profile, setProfile] = useState({});
  const [belts, setBelts] = useState([]);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingBelt, setEditingBelt] = useState(null); // 'new' | belt object | null

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      const [p, b] = await Promise.all([profileApi.getProfile(), profileApi.listBelts()]);
      setProfile(p || {});
      setBelts(b || []);
    } catch (e) { showToast('오류: ' + e.message); }
  }

  async function saveProfile(form) {
    setLoading(true);
    try {
      await profileApi.updateProfile(form);
      await loadAll();
      setEditingProfile(false);
      showToast('저장됨');
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  async function saveBelt(form) {
    setLoading(true);
    try {
      if (editingBelt && editingBelt !== 'new') {
        await profileApi.updateBelt(editingBelt.id, form);
      } else {
        await profileApi.createBelt(form);
      }
      await loadAll();
      setEditingBelt(null);
      showToast('저장됨');
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  async function deleteBelt(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      await profileApi.deleteBelt(id);
      await loadAll();
      setEditingBelt(null);
      showToast('삭제됨');
    } catch (e) { showToast('삭제 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  // 통계
  const stats = useMemo(() => {
    const trainedDays = new Set();
    classes.forEach(c => (c.trained_dates || []).forEach(d => trainedDays.add(d)));
    return {
      classes: classes.length,
      trained: trainedDays.size,
      tech: techniques.length,
    };
  }, [classes, techniques]);

  // 현재 벨트(가장 최근)
  const currentBelt = useMemo(() => {
    if (!belts.length) return { color: 'white', stripes: 0 };
    const sorted = [...belts].sort((a, b) =>
      (b.achieved_date || '').localeCompare(a.achieved_date || '')
    );
    const top = sorted[0];
    return { color: beltKey(top.belt), stripes: parseInt(top.stripes) || 0 };
  }, [belts]);

  return (
    <div
      className="page-fade"
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--bg)',
        zIndex: 150,
        overflowY: 'auto',
        maxWidth: 460, margin: '0 auto',
      }}
    >
      <div style={{ padding: '54px 20px 80px' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>프로필</span>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'var(--surface-up)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 8, cursor: 'pointer',
              display: 'inline-flex',
            }}
          >
            <Icon name="x" size={18} color="var(--text)" />
          </button>
        </div>

        {/* 프로필 헤더 */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(29,158,117,0.20) 0%, rgba(37,196,144,0.08) 100%)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '20px 16px',
          marginBottom: 14,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'var(--surface-hi)',
            border: '2px solid var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent)', fontSize: 24, fontWeight: 800,
            overflow: 'hidden',
          }}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (profile.nickname || '?').slice(0, 1)}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{profile.nickname || '익명'}</div>
          <BeltBar color={currentBelt.color} stripes={currentBelt.stripes} width={120} height={18} />
          <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center' }}>
            {profile.start_date && <span>시작 {profile.start_date}</span>}
            {profile.start_date && profile.network && <span> · </span>}
            {profile.network && <span>{profile.network}</span>}
            {!profile.start_date && !profile.network && <span>시작일/소속을 등록해보세요</span>}
          </div>
        </div>

        {/* 통계 4칸 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
          <StatCell value={stats.classes} label="수업" color="var(--accent)" />
          <StatCell value={stats.trained} label="수련" color="var(--blue)" />
          <StatCell value={stats.tech}    label="기술" color="var(--purple)" />
          <StatCell value={profile.weight_class || '-'} label="체급" color="var(--amber)" />
        </div>

        {/* 기본 정보 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>기본 정보</span>
          <Button size="sm" variant="outline" onClick={() => setEditingProfile(true)}>수정</Button>
        </div>
        <Card style={{ marginBottom: 16 }}>
          <Row label="닉네임" value={profile.nickname || '-'} />
          <Row label="시작일" value={profile.start_date || '-'} />
          <Row label="체급"   value={profile.weight_class || '-'} />
          <Row label="소속"   value={profile.network || '-'} last />
        </Card>

        {/* 벨트 이력 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>벨트 이력</span>
          <Button size="sm" variant="outline" onClick={() => setEditingBelt('new')}>+ 추가</Button>
        </div>
        {belts.length === 0 ? (
          <Card style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>
            벨트 이력이 없습니다
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {belts.map(b => (
              <Card key={b.id} className="bjj-card-tap" onClick={() => setEditingBelt(b)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <BeltBar color={beltKey(b.belt)} stripes={parseInt(b.stripes) || 0} width={60} height={10} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {b.belt} {b.stripes ? `· ${b.stripes}줄` : ''}
                    </div>
                    {b.note && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{b.note}</div>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{b.achieved_date}</div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {editingProfile && (
          <ProfileEditor
            profile={profile}
            onCancel={() => setEditingProfile(false)}
            onSave={saveProfile}
          />
        )}
        {editingBelt && (
          <BeltEditor
            initial={editingBelt === 'new' ? null : editingBelt}
            onCancel={() => setEditingBelt(null)}
            onSave={saveBelt}
            onDelete={editingBelt !== 'new' ? () => deleteBelt(editingBelt.id) : null}
          />
        )}
      </div>
    </div>
  );
}

function Row({ label, value, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '8px 0',
      fontSize: 13,
      borderBottom: last ? 'none' : '1px solid var(--border)',
    }}>
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function StatCell({ value, label, color }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '10px 6px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 16, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ProfileEditor({ profile, onCancel, onSave }) {
  const [form, setForm] = useState({
    nickname: profile.nickname || '',
    startDate: profile.start_date || '',
    weightClass: profile.weight_class || '',
    network: profile.network || '',
  });
  const update = (k, v) => setForm({ ...form, [k]: v });
  return (
    <Modal title="기본 정보 수정" onClose={onCancel}>
      <div className="field"><label>닉네임</label>
        <input value={form.nickname} onChange={e => update('nickname', e.target.value)} /></div>
      <div className="field"><label>시작일</label>
        <input type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} /></div>
      <div className="field"><label>체급</label>
        <input value={form.weightClass} onChange={e => update('weightClass', e.target.value)} placeholder="예: -76kg" /></div>
      <div className="field"><label>소속</label>
        <input value={form.network} onChange={e => update('network', e.target.value)} /></div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <Button variant="outline" size="sm" onClick={onCancel}>취소</Button>
        <Button variant="primary" size="sm" onClick={() => onSave(form)}>저장</Button>
      </div>
    </Modal>
  );
}

function BeltEditor({ initial, onCancel, onSave, onDelete }) {
  const [belt, setBelt]       = useState(initial?.belt || '화이트');
  const [stripes, setStripes] = useState(parseInt(initial?.stripes) || 0);
  const [date, setDate]       = useState(
    initial?.achieved_date || new Date().toISOString().slice(0, 10)
  );
  const [note, setNote] = useState(initial?.note || '');

  function submit() {
    if (!belt) return alert('벨트를 선택해주세요');
    onSave({
      belt,
      stripes: parseInt(stripes) || 0,
      achievedDate: date,
      note,
    });
  }

  return (
    <Modal title={initial ? '벨트 수정' : '벨트 추가'} onClose={onCancel}>
      <div className="field">
        <label>벨트 색상</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {BELT_LEVELS.map(b => (
            <button
              key={b}
              onClick={() => setBelt(b)}
              style={{
                padding: '6px 10px',
                background: belt === b ? 'var(--accent-dim)' : 'var(--surface)',
                color: belt === b ? 'var(--accent)' : 'var(--text)',
                border: `1px solid ${belt === b ? 'var(--accent)' : 'var(--border-med)'}`,
                borderRadius: 8,
                fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <BeltBar color={beltKey(b)} stripes={0} width={28} height={6} />
              {b}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>줄 수 (0~4)</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2, 3, 4].map(n => (
            <button
              key={n}
              onClick={() => setStripes(n)}
              style={{
                flex: 1, padding: 8,
                background: stripes === n ? 'var(--accent)' : 'var(--surface)',
                color: stripes === n ? '#fff' : 'var(--text)',
                border: '1px solid var(--border-med)',
                borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10, padding: 12, background: 'var(--surface-up)', borderRadius: 10, display: 'flex', justifyContent: 'center' }}>
          <BeltBar color={beltKey(belt)} stripes={stripes} width={140} height={20} />
        </div>
      </div>
      <div className="field"><label>달성일</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      <div className="field"><label>메모</label>
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="달성 기념 메모" /></div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        {onDelete && <Button variant="danger" size="sm" onClick={onDelete} style={{ marginRight: 'auto' }}>삭제</Button>}
        <Button variant="outline" size="sm" onClick={onCancel}>취소</Button>
        <Button variant="primary" size="sm" onClick={submit}>저장</Button>
      </div>
    </Modal>
  );
}
