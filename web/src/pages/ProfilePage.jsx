import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as profileApi from '../api/profile';
import { useAuth } from '../contexts/AuthContext';

const DURATION_MONTHS = { '1개월': 1, '3개월': 3 };

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysRemaining(endDateStr) {
  const end = new Date(endDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end - today) / 86400000);
}

// 결제 이력을 체이닝해서 실제 시작일·만료일 계산
// - paid_date 오름차순으로 정렬 후 처리
// - 이전 회원권이 아직 유효한 상태에서 결제 시 → 이전 만료일부터 시작
function computeMemberships(memberships) {
  const sorted = [...memberships].sort((a, b) => a.paid_date.localeCompare(b.paid_date));
  let chainEnd = null; // 현재 체인의 마지막 만료일 (ISO 날짜 문자열)

  return sorted.map(m => {
    const months = DURATION_MONTHS[m.duration] || 1;
    const effectiveStart = (chainEnd && m.paid_date <= chainEnd) ? chainEnd : m.paid_date;
    const effectiveEnd   = addMonths(effectiveStart, months);
    chainEnd = effectiveEnd;
    return { ...m, effectiveStart, effectiveEnd };
  });
}
import * as settingsApi from '../api/settings';
import { setMasterModel as saveMasterModel } from '../api/master';
import { useUI } from '../contexts/UIContext';
import { useCache } from '../contexts/CacheContext';
import Card from '../components/Card';
import Button from '../components/Button';
import Modal from '../components/Modal';
import Icon from '../components/Icon';
import MasterBar from '../components/MasterBar';
import BeltBar from '../components/BeltBar';
import { BELT_LEVELS, beltKey } from '../utils/baseOptions';

const STORAGE_KEY = 'bjj_storage_mode'; // 'server' | 'device'
export const getStorageMode = () => localStorage.getItem(STORAGE_KEY) || 'server';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { showToast, setLoading } = useUI();
  const { classes, techniques } = useCache();

  const [profile, setProfile] = useState({});
  const [belts, setBelts] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingBelt, setEditingBelt] = useState(null); // 'new' | belt object | null
  const [addingMembership, setAddingMembership] = useState(false);
  const [storageMode, setStorageMode] = useState(getStorageMode());
  const [uploadPath, setUploadPath] = useState('');
  const [effectivePath, setEffectivePath] = useState('');
  const [pathEditing, setPathEditing] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const [igCookie, setIgCookie] = useState({ configured: false, mode: 'none', updatedAt: null });
  const [igGuideOpen, setIgGuideOpen] = useState(false);
  const cookieInputRef = React.useRef(null);
  // 아바타 캐시버스터 버전 (task-019)
  const [avatarVer, setAvatarVer] = useState(0);

  // 관장 모델(task-030). 🔴 기존 PUT /profile 을 쓰지 않는다 — 그건 부분 갱신이 아니라
  //    화이트리스트 전체를 덮어쓰므로 여기서 부르면 닉네임·수련 시작일이 지워진다.
  const MASTER_MODELS = [
    { key: 'opus',   label: 'opus',   desc: '가장 깊게 생각해요 · 기본값 · 한 턴 40~60초', icon: '🧠' },
    { key: 'sonnet', label: 'sonnet', desc: '빠르고 균형 잡힘 · 한 턴 20~40초',            icon: '⚡' },
    { key: 'haiku',  label: 'haiku',  desc: '가장 빠름 · 간단한 질문·영상 찾기',             icon: '🪶' },
  ];
  const masterModel = profile.masterModel || 'opus';

  async function changeMasterModel(next) {
    const prev = profile.masterModel || 'opus';
    if (next === prev) return;
    setProfile(p => ({ ...p, masterModel: next }));   // 낙관적 — 실패하면 되돌린다
    try {
      await saveMasterModel(next);
      showToast(`관장 모델을 ${next}로 바꿨어요 — 다음 턴부터 적용`);
    } catch (e) {
      setProfile(p => ({ ...p, masterModel: prev }));
      showToast('모델을 바꾸지 못했어요: ' + e.message);
    }
  }

  function toggleStorageMode(mode) {
    localStorage.setItem(STORAGE_KEY, mode);
    setStorageMode(mode);
    showToast(mode === 'device' ? '기기에 저장 모드로 변경됩니다' : '서버에 저장 모드로 변경됩니다');
  }

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      const [p, b, s, ig, m] = await Promise.all([
        profileApi.getProfile(),
        profileApi.listBelts(),
        settingsApi.getSettings().catch(() => ({ uploadPath: '', effectivePath: '' })),
        settingsApi.getInstagramCookieStatus().catch(() => ({ configured: false, updatedAt: null })),
        profileApi.listMemberships().catch(() => []),
      ]);
      setProfile(p || {});
      setBelts(b || []);
      setMemberships(m || []);
      setUploadPath(s.uploadPath || '');
      setEffectivePath(s.effectivePath || '');
      setIgCookie(ig || { configured: false, updatedAt: null });
      setPathInput(s.uploadPath || '');
    } catch (e) { showToast('오류: ' + e.message); }
  }

  async function saveUploadPath() {
    setLoading(true);
    try {
      const res = await settingsApi.saveSettings({ uploadPath: pathInput.trim() });
      setUploadPath(pathInput.trim());
      setEffectivePath(res.effectivePath || '');
      setPathEditing(false);
      showToast('저장 경로 저장됨');
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  async function handleCookieUpload(e) {
    const file = e.target.files?.[0];
    if (cookieInputRef.current) cookieInputRef.current.value = '';
    if (!file) return;
    setLoading(true);
    try {
      await settingsApi.uploadInstagramCookie(file);
      const ig = await settingsApi.getInstagramCookieStatus();
      setIgCookie(ig);
      showToast('Instagram 쿠키 저장됨');
    } catch (err) { showToast('업로드 실패: ' + err.message); }
    finally { setLoading(false); }
  }

  async function handleCookieDelete() {
    if (!confirm('Instagram 쿠키를 삭제하면 Instagram 영상 분석이 불가해집니다. 삭제할까요?')) return;
    setLoading(true);
    try {
      await settingsApi.deleteInstagramCookie();
      setIgCookie({ configured: false, updatedAt: null });
      showToast('쿠키가 삭제되었습니다');
    } catch (err) { showToast('삭제 실패: ' + err.message); }
    finally { setLoading(false); }
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

  async function saveMembership(form) {
    setLoading(true);
    try {
      await profileApi.createMembership(form);
      const m = await profileApi.listMemberships();
      setMemberships(m || []);
      setAddingMembership(false);
      showToast('회원권이 등록됐습니다');
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  async function deleteMembership(id) {
    if (!confirm('이 결제 이력을 삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      await profileApi.deleteMembership(id);
      setMemberships(prev => prev.filter(m => m.id !== id));
      showToast('삭제됨');
    } catch (e) { showToast('삭제 실패: ' + e.message); }
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

  // 소속 목록 — networks 배열 우선, 없으면 레거시 network 단일값 흡수
  const networks = useMemo(() => {
    if (Array.isArray(profile.networks)) return profile.networks.filter(Boolean);
    return profile.network ? [profile.network] : [];
  }, [profile]);

  // 수련일수 — 시작일 당일을 1일째로 카운트
  const trainingDays = useMemo(() => {
    if (!profile.start_date) return null;
    const start = new Date(profile.start_date);
    if (isNaN(start.getTime())) return null;
    start.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.floor((today - start) / 86400000) + 1;
    return days > 0 ? days : null;
  }, [profile.start_date]);

  // 아바타 이미지 URL (task-019)
  // 🔴 캐시버스터 필수 — 재업로드해도 파일명이 avatar_<uid><ext> 로 같아서, 붙이지 않으면
  //    브라우저가 옛 이미지를 그대로 보여준다("업로드했는데 안 바뀐다" = 원래 증상과 구분 불가).
  //    초기값 0 은 페이지 로드마다 URL 이 바뀌지 않게 해 정상 캐시(max-age=0 + ETag 재검증)를 유지한다.
  const avatarSrc = useMemo(() => {
    if (!profile.avatar) return '';
    return `${profile.avatar}${profile.avatar.includes('?') ? '&' : '?'}v=${avatarVer}`;
  }, [profile.avatar, avatarVer]);

  // 업로드·삭제 성공 시 부모 state 를 직접 갱신한다(loadAll 재호출보다 깜빡임이 없다).
  // 모달을 닫으면 헤더 아바타에도 즉시 반영된다.
  function handleAvatarChange(newPath) {
    setProfile(p => ({ ...p, avatar: newPath || null }));
    setAvatarVer(Date.now());
  }

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
        // top 은 안드로이드 앱에서만 상태바 높이(--native-top, 웹은 0px) — 이 화면은 셸 밖 fixed 오버레이라
        // 셸의 상태바 여백을 받지 못한다(task-039 A-6).
        position: 'fixed', top: 'var(--native-top, 0px)', right: 0, bottom: 0, left: 0,
        background: 'var(--bg)',
        zIndex: 150,
        overflowY: 'auto',
        maxWidth: 460, margin: '0 auto',
      }}
    >
      {/* 🔴 이 화면은 `.app-content` 가 아니라 자체 fixed 오버레이(z-index 150)라
          Layout 의 상단 바를 덮어 버린다. 여기에도 바를 하나 올려 "어떤 화면에 있든
          관장님께 물어볼 수 있다"를 지킨다(Leader 결정 2026-09-09 #2).
          padding-top 은 54 → 0 — 바가 그 자리를 그대로 대신한다(Layout 과 같은 구조라
          바의 `margin: 0 -20px` 이 이 div 의 좌우 20px 을 상쇄한다).
          대화 패널은 z-index 160 이라 이 오버레이 **위**에서 열린다. */}
      <div style={{ padding: '0 20px 80px' }}>
        <MasterBar />
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
            {avatarSrc
              ? <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (profile.nickname || '?').slice(0, 1)}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{profile.nickname || '익명'}</div>
          <BeltBar color={currentBelt.color} stripes={currentBelt.stripes} width={120} height={18} />
          <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center' }}>
            {profile.start_date && (
              <span>시작 {profile.start_date}{trainingDays ? ` · ${trainingDays}일째` : ''}</span>
            )}
            {profile.start_date && networks.length > 0 && <span> · </span>}
            {networks.length > 0 && <span>{networks.join(' · ')}</span>}
            {!profile.start_date && networks.length === 0 && <span>시작일/소속을 등록해보세요</span>}
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
          <Row label="소속"   value={networks.length ? networks.join(' · ') : '-'} last />
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

        {/* 회원권 결제이력 */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>회원권 결제이력</span>
            <Button size="sm" variant="outline" onClick={() => setAddingMembership(true)}>+ 추가</Button>
          </div>
          {memberships.length === 0 ? (
            <Card style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>
              결제 이력이 없습니다
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* computeMemberships: paid_date ASC 체이닝 후 effectiveEnd DESC로 최신 먼저 표시 */}
              {computeMemberships(memberships)
                .slice()
                .reverse()
                .map(m => {
                  const remaining = daysRemaining(m.effectiveEnd);
                  const active    = remaining >= 0;
                  const chained   = m.effectiveStart !== m.paid_date;
                  return (
                    <Card key={m.id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{m.duration}</span>
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                              background: 'var(--surface-up)', color: 'var(--text2)',
                              border: '1px solid var(--border)',
                            }}>{m.session_type}</span>
                            {chained && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8,
                                background: 'rgba(139,92,246,0.1)', color: 'var(--purple)',
                                border: '1px solid var(--purple)',
                              }}>연장</span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.8 }}>
                            <span>결제일 {m.paid_date}</span>
                            {chained && (
                              <span style={{ color: 'var(--purple)' }}> · 시작 {m.effectiveStart}</span>
                            )}
                            <br />
                            <span>만료일 <strong style={{ color: active ? 'var(--text)' : 'var(--text3)' }}>{m.effectiveEnd}</strong></span>
                            {m.memo && <span style={{ marginLeft: 8, color: 'var(--text3)' }}>· {m.memo}</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                          <span style={{
                            fontSize: 13, fontWeight: 800, padding: '4px 11px', borderRadius: 12,
                            background: active ? 'rgba(29,158,117,0.12)' : 'var(--surface-up)',
                            color: active ? 'var(--accent)' : 'var(--text3)',
                            border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          }}>
                            {active ? (remaining === 0 ? 'D-Day' : `D-${remaining}`) : '만료'}
                          </span>
                          <button
                            onClick={() => deleteMembership(m.id)}
                            style={{
                              background: 'transparent', border: 'none',
                              color: 'var(--text3)', fontSize: 11, cursor: 'pointer', padding: 0,
                            }}
                          >삭제</button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
            </div>
          )}
        </div>

        {/* 파일 저장 위치 설정 */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>파일 저장 위치</div>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, overflow: 'hidden',
          }}>
            {[
              { key: 'server', label: '서버에 저장', desc: '캡처·썸네일을 서버에 보관하여 앱에서 바로 확인', icon: '🖥' },
              { key: 'device', label: '기기에 저장', desc: '분석 완료 후 파일을 기기에 다운로드 (서버 미보관)', icon: '📱' },
            ].map((opt, i) => (
              <button
                key={opt.key}
                onClick={() => toggleStorageMode(opt.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: '14px 16px',
                  background: storageMode === opt.key ? 'var(--accent-dim)' : 'transparent',
                  border: 'none',
                  borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 22 }}>{opt.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: storageMode === opt.key ? 'var(--accent)' : 'var(--text)' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{opt.desc}</div>
                </div>
                {storageMode === opt.key && (
                  <span style={{ fontSize: 16, color: 'var(--accent)' }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 관장 모델 (task-030) — "파일 저장 위치"와 같은 옵션 목록 UI */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>관장 모델</div>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, overflow: 'hidden',
          }}>
            {MASTER_MODELS.map((opt, i) => (
              <button
                key={opt.key}
                onClick={() => changeMasterModel(opt.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: '14px 16px',
                  background: masterModel === opt.key ? 'var(--accent-dim)' : 'transparent',
                  border: 'none',
                  borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 22 }}>{opt.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: masterModel === opt.key ? 'var(--accent)' : 'var(--text)' }}>
                    {opt.label}
                    {opt.key === 'opus' && <span style={{ color: 'var(--text3)', fontWeight: 500, marginLeft: 6 }}>기본</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{opt.desc}</div>
                </div>
                {masterModel === opt.key && (
                  <span style={{ fontSize: 16, color: 'var(--accent)' }}>✓</span>
                )}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, lineHeight: 1.6 }}>
            바꾸면 다음 대화 턴부터 적용돼요. 대화 패널 상단과 “관장이 본 것”에 어떤 모델이 답했는지 표시됩니다.
          </div>
        </div>

        {/* 서버 저장 경로 */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>서버 저장 경로</span>
            <button
              onClick={() => { setPathEditing(o => !o); setPathInput(uploadPath); }}
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
            >
              {pathEditing ? '취소' : '변경'}
            </button>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', fontSize: 12 }}>
            <div style={{ color: 'var(--text3)', marginBottom: 4 }}>현재 경로</div>
            <div style={{ color: 'var(--text)', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 11 }}>
              {effectivePath || '(기본: 프로젝트 내 public/uploads)'}
            </div>
            {pathEditing && (
              <div style={{ marginTop: 10 }}>
                <input
                  value={pathInput}
                  onChange={e => setPathInput(e.target.value)}
                  placeholder="예: /mnt/storage/bjj-uploads (비워두면 기본값)"
                  style={{
                    width: '100%', padding: '8px 10px', boxSizing: 'border-box',
                    background: 'var(--surface-up)', border: '1px solid var(--border)',
                    borderRadius: 8, color: 'var(--text)', fontSize: 12, fontFamily: 'monospace',
                  }}
                />
                <button
                  onClick={saveUploadPath}
                  style={{
                    marginTop: 8, width: '100%', padding: '9px',
                    background: 'var(--accent)', color: '#fff', border: 'none',
                    borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  저장
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Instagram 쿠키 인증 */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Instagram 쿠키 인증</span>
            {igCookie.mode === 'browser' && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: 'rgba(59,130,246,0.12)', color: 'var(--blue)',
                border: '1px solid var(--blue)' }}>✓ Firefox 자동</span>
            )}
            {/* 파일이 있다고 인증된 게 아니다 — sessionid 가 없거나 만료면 실제로는 로그아웃 상태 */}
            {igCookie.mode === 'file' && igCookie.sessionValid && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: 'var(--accent-dim)', color: 'var(--accent)',
                border: '1px solid var(--accent)' }}>✓ 파일 인증</span>
            )}
            {igCookie.mode === 'file' && !igCookie.sessionValid && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: 'rgba(245,158,11,0.12)', color: 'var(--amber)',
                border: '1px solid var(--amber)' }}>⚠ 세션 없음</span>
            )}
            {igCookie.mode === 'none' && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: 'var(--surface-up)', color: 'var(--text3)',
                border: '1px solid var(--border)' }}>미설정</span>
            )}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>

            {/* Firefox 자동 모드 안내 */}
            {igCookie.mode === 'browser' && (
              <div style={{
                padding: '10px 12px', borderRadius: 10, marginBottom: 12,
                background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', marginBottom: 4 }}>
                  Firefox 자동 인증 활성화됨
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                  서버의 Firefox가 Instagram에 로그인된 상태입니다.
                  yt-dlp가 Firefox 쿠키 DB를 직접 읽어 분석할 때마다 최신 세션을 사용합니다.
                  <strong style={{ color: 'var(--text)' }}>Firefox에서 Instagram 로그아웃만 하지 않으면 만료 없이 작동합니다.</strong>
                </div>
              </div>
            )}

            {/* 파일 모드 */}
            {igCookie.mode === 'file' && igCookie.updatedAt && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
                파일 업로드: {new Date(igCookie.updatedAt).toLocaleString('ko-KR')}
                <span style={{ color: 'var(--amber)', marginLeft: 8 }}>
                  — 로그아웃 시 만료될 수 있음
                </span>
              </div>
            )}
            {igCookie.mode === 'file' && !igCookie.sessionValid && igCookie.hint && (
              <div style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 10, lineHeight: 1.6,
                background: 'rgba(245,158,11,0.08)', border: '1px solid var(--amber)',
                borderRadius: 8, padding: '8px 10px' }}>
                {igCookie.hint}
                <div style={{ color: 'var(--text3)', marginTop: 4 }}>
                  공개 릴(reel)은 로그인 없이도 분석되지만, 스토리·비공개 게시물은 실패합니다.
                </div>
              </div>
            )}

            {/* 미설정 안내 */}
            {igCookie.mode === 'none' && (
              <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 12px', lineHeight: 1.6 }}>
                Instagram URL 분석을 위해 인증이 필요합니다.
                아래 두 가지 방법 중 하나를 선택하세요.
              </p>
            )}

            <input ref={cookieInputRef} type="file" accept=".txt,text/plain"
              style={{ display: 'none' }} onChange={handleCookieUpload} />

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => cookieInputRef.current?.click()}
                style={{
                  flex: 1, padding: '9px 0',
                  background: igCookie.mode === 'file' ? 'var(--accent-dim)' : 'var(--surface-up)',
                  color: igCookie.mode === 'file' ? 'var(--accent)' : 'var(--text2)',
                  border: `1px solid ${igCookie.mode === 'file' ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>
                {igCookie.mode === 'file' ? '🔄 쿠키 파일 갱신' : '📂 쿠키 파일 업로드'}
              </button>
              {igCookie.mode === 'file' && (
                <button onClick={handleCookieDelete} style={{
                  padding: '9px 14px', background: 'transparent', color: 'var(--red)',
                  border: '1px solid var(--red)', borderRadius: 8,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>삭제</button>
              )}
            </div>

            {/* 가이드 토글 */}
            <button
              onClick={() => setIgGuideOpen(o => !o)}
              style={{
                marginTop: 10, width: '100%', padding: '8px 0',
                background: 'transparent', color: 'var(--text3)',
                border: '1px solid var(--border)', borderRadius: 8,
                fontSize: 12, cursor: 'pointer',
              }}>
              {igGuideOpen ? '▲ 가이드 숨기기' : '▼ 인증 방법 가이드'}
            </button>

            {igGuideOpen && (
              <div style={{
                marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10,
                fontSize: 12, lineHeight: 1.7,
              }}>
                {/* 방법 1: Android Firefox */}
                <div style={{ padding: '12px 14px', background: 'rgba(59,130,246,0.06)', borderRadius: 10, border: '1px solid rgba(59,130,246,0.2)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--blue)', marginBottom: 6 }}>
                    방법 1 — Android Firefox (모바일 추출, 추천)
                  </div>
                  <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <li>Play Store에서 <strong>Firefox</strong> 설치</li>
                    <li>Firefox 주소창에서 <code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: 4 }}>addons.mozilla.org</code> 접속</li>
                    <li><strong style={{ color: 'var(--accent)' }}>"cookies.txt"</strong> 확장 검색 후 설치 <span style={{ color: 'var(--text3)' }}>(Lennon Hill 작)</span></li>
                    <li><strong>instagram.com</strong> 로그인 후 확장 아이콘 → <strong>Export</strong></li>
                    <li>다운로드된 <code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: 4 }}>.txt</code> 파일을 위 업로드 버튼으로 업로드</li>
                  </ol>
                  <div style={{ marginTop: 8, color: 'var(--accent)', fontSize: 11 }}>
                    ✓ Android에서만 가능 — iOS는 쿠키 내보내기 확장 미지원
                  </div>
                </div>

                {/* 방법 2: PC Chrome/Edge */}
                <div style={{ padding: '12px 14px', background: 'var(--surface-up)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                    방법 2 — PC Chrome / Edge (90일~1년 유효)
                  </div>
                  <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <li>Chrome 웹스토어에서 <strong style={{ color: 'var(--accent)' }}>"Get cookies.txt LOCALLY"</strong> 설치</li>
                    <li><strong>instagram.com</strong> 로그인 후 확장 아이콘 → <strong>Export</strong></li>
                    <li>저장된 <code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: 4 }}>.txt</code> 파일을 위 업로드 버튼으로 업로드</li>
                  </ol>
                  <div style={{ marginTop: 8, color: 'var(--amber)', fontSize: 11 }}>
                    ⚠ 로그아웃하거나 세션 만료 시 재업로드 필요
                  </div>
                </div>

                <div style={{ padding: '8px 10px', background: 'rgba(255,180,0,0.06)', borderRadius: 8, border: '1px solid rgba(255,180,0,0.2)', fontSize: 11, color: 'var(--text2)' }}>
                  쿠키는 서버에만 저장되며 yt-dlp 로컬 실행에만 사용됩니다.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 계정 정보 */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>계정</div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text2)', fontSize: 14 }}>{user?.email}</span>
            <button
              onClick={logout}
              style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 8, padding: '6px 14px', color: 'var(--red)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              로그아웃
            </button>
          </div>
        </div>

        {addingMembership && (
          <MembershipEditor
            onCancel={() => setAddingMembership(false)}
            onSave={saveMembership}
          />
        )}
        {editingProfile && (
          <ProfileEditor
            profile={profile}
            avatarSrc={avatarSrc}
            onAvatarChange={handleAvatarChange}
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

function ProfileEditor({ profile, avatarSrc, onAvatarChange, onCancel, onSave }) {
  const { showToast, setLoading } = useUI();
  const avatarInputRef = React.useRef(null);
  const [form, setForm] = useState({
    nickname: profile.nickname || '',
    startDate: profile.start_date || '',
    weightClass: profile.weight_class || '',
    networks: Array.isArray(profile.networks) && profile.networks.length
      ? profile.networks.filter(Boolean)
      : (profile.network ? [profile.network] : []),
  });
  const [networkInput, setNetworkInput] = useState('');
  const update = (k, v) => setForm({ ...form, [k]: v });

  // 빈 값·중복은 추가하지 않음
  function addNetwork() {
    const v = networkInput.trim();
    setNetworkInput('');
    if (!v || form.networks.includes(v)) return;
    setForm({ ...form, networks: [...form.networks, v] });
  }

  function removeNetwork(name) {
    setForm({ ...form, networks: form.networks.filter(n => n !== name) });
  }

  // 입력창에 남아있는 값도 저장 시 함께 반영
  function submit() {
    const pending = networkInput.trim();
    const networks = pending && !form.networks.includes(pending)
      ? [...form.networks, pending]
      : form.networks;
    onSave({ ...form, networks });
  }

  // 사진은 별도 multipart 엔드포인트라 "저장" 버튼과 무관하게 선택 즉시 반영된다.
  // handleCookieUpload(위 ProfilePage)와 동일한 형태 — 실패해도 finally 로 로딩이 반드시 풀린다.
  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (avatarInputRef.current) avatarInputRef.current.value = '';
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);          // multer upload.single('avatar') 와 필드명 일치
      const res = await profileApi.uploadAvatar(fd);
      onAvatarChange(res?.avatar || null);
      showToast('프로필 사진이 변경됐습니다');
    } catch (err) { showToast('업로드 실패: ' + err.message); }
    finally { setLoading(false); }
  }

  async function handleAvatarDelete() {
    if (!confirm('프로필 사진을 삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      await profileApi.deleteAvatar();
      onAvatarChange(null);
      showToast('사진이 삭제되었습니다');
    } catch (err) { showToast('삭제 실패: ' + err.message); }
    finally { setLoading(false); }
  }

  return (
    <Modal title="기본 정보 수정" onClose={onCancel}>
      <div className="field">
        <label>프로필 사진</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'var(--surface-hi)',
            border: '2px solid var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent)', fontSize: 24, fontWeight: 800,
            overflow: 'hidden', flexShrink: 0,
          }}>
            {avatarSrc
              ? <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (form.nickname || profile.nickname || '?').slice(0, 1)}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarUpload}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => avatarInputRef.current?.click()}>사진 변경</Button>
            {profile.avatar && (
              <Button variant="danger" size="sm" onClick={handleAvatarDelete}>삭제</Button>
            )}
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
          이미지 파일 · 5MB 이하 · 선택하면 바로 저장됩니다
        </div>
      </div>
      <div className="field"><label>닉네임</label>
        <input value={form.nickname} onChange={e => update('nickname', e.target.value)} /></div>
      <div className="field"><label>시작일</label>
        <input type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} /></div>
      <div className="field"><label>체급</label>
        <input value={form.weightClass} onChange={e => update('weightClass', e.target.value)} placeholder="예: -76kg" /></div>
      <div className="field">
        <label>소속 (여러 개 등록 가능)</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={networkInput}
            onChange={e => setNetworkInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNetwork(); } }}
            placeholder="소속 입력 후 추가"
            style={{ flex: 1, minWidth: 0 }}
          />
          <Button variant="outline" size="sm" onClick={addNetwork}>추가</Button>
        </div>
        {form.networks.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {form.networks.map(n => (
              <span
                key={n}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px',
                  background: 'var(--accent-dim)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                  borderRadius: 8,
                  fontSize: 12, fontWeight: 600,
                }}
              >
                {n}
                <button
                  onClick={() => removeNetwork(n)}
                  aria-label={`${n} 삭제`}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--accent)',
                    fontSize: 14, lineHeight: 1, padding: 0, cursor: 'pointer',
                  }}
                >×</button>
              </span>
            ))}
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

function MembershipEditor({ onCancel, onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const [paidDate, setPaidDate]       = useState(today);
  const [duration, setDuration]       = useState('1개월');
  const [sessionType, setSessionType] = useState('매일권');
  const [memo, setMemo]               = useState('신규등록');

  const previewEnd = paidDate ? addMonths(paidDate, DURATION_MONTHS[duration] || 1) : null;
  const previewRemaining = previewEnd ? daysRemaining(previewEnd) : null;

  function submit() {
    if (!paidDate) return alert('결제일을 입력해주세요');
    onSave({ paidDate, duration, sessionType, memo });
  }

  return (
    <Modal title="회원권 등록" onClose={onCancel}>
      <div className="field">
        <label>결제일</label>
        <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
      </div>

      <div className="field">
        <label>기간</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['1개월', '3개월'].map(d => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              style={{
                flex: 1, padding: '9px 0',
                background: duration === d ? 'var(--accent-dim)' : 'var(--surface)',
                color: duration === d ? 'var(--accent)' : 'var(--text)',
                border: `1px solid ${duration === d ? 'var(--accent)' : 'var(--border-med)'}`,
                borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >{d}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>수강권</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['매일권', '주 3회'].map(s => (
            <button
              key={s}
              onClick={() => setSessionType(s)}
              style={{
                flex: 1, padding: '9px 0',
                background: sessionType === s ? 'var(--accent-dim)' : 'var(--surface)',
                color: sessionType === s ? 'var(--accent)' : 'var(--text)',
                border: `1px solid ${sessionType === s ? 'var(--accent)' : 'var(--border-med)'}`,
                borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >{s}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>구분</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['신규등록', '연장'].map(t => (
            <button
              key={t}
              onClick={() => setMemo(t)}
              style={{
                flex: 1, padding: '9px 0',
                background: memo === t ? 'var(--accent-dim)' : 'var(--surface)',
                color: memo === t ? 'var(--accent)' : 'var(--text)',
                border: `1px solid ${memo === t ? 'var(--accent)' : 'var(--border-med)'}`,
                borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >{t}</button>
          ))}
        </div>
      </div>

      {previewEnd && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 8,
          background: previewRemaining >= 0 ? 'rgba(29,158,117,0.08)' : 'var(--surface-up)',
          border: `1px solid ${previewRemaining >= 0 ? 'var(--accent)' : 'var(--border)'}`,
          fontSize: 12, color: 'var(--text2)', lineHeight: 1.8,
        }}>
          <div>만료일 <strong style={{ color: previewRemaining >= 0 ? 'var(--accent)' : 'var(--text3)' }}>{previewEnd}</strong></div>
          <div style={{ color: previewRemaining >= 0 ? 'var(--accent)' : 'var(--text3)', fontWeight: 700 }}>
            {previewRemaining > 0 && `D-${previewRemaining} (잔여 ${previewRemaining}일)`}
            {previewRemaining === 0 && 'D-Day (오늘 만료)'}
            {previewRemaining < 0 && `만료됨 (${Math.abs(previewRemaining)}일 경과)`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            ※ 기존 회원권이 남아있으면 연장 적용됩니다
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Button variant="primary" size="sm" onClick={submit}>저장</Button>
        <Button variant="outline" size="sm" onClick={onCancel}>취소</Button>
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

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Button variant="primary" size="sm" onClick={submit}>저장</Button>
        <Button variant="outline" size="sm" onClick={onCancel}>취소</Button>
        {onDelete && <Button variant="danger" size="sm" onClick={onDelete} style={{ marginLeft: 'auto' }}>삭제</Button>}
      </div>
    </Modal>
  );
}
