import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../contexts/UIContext';
import * as studyApi from '../api/studyVideos';
import Card from '../components/Card';
import Tag from '../components/Tag';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 10;

const STATUS_LABEL = { queued: '대기 중', running: '분석 중', done: '완료', error: '오류', canceled: '취소됨' };
const KIND_OPTIONS = [
  { value: 'lecture',  label: '강의' },
  { value: 'seminar',  label: '세미나' },
  { value: 'sparring', label: '스파링' },
];
// 목록 카드 kind 배지 톤 매핑 — StudyChapterList.jsx의 badgeFor()와 동일한 {tone,label} 형태(task-010 B)
const KIND_BADGE = {
  lecture:  { tone: 'blue',   label: '강의' },
  seminar:  { tone: 'purple', label: '세미나' },
  sparring: { tone: 'amber',  label: '스파링' },
};

function fmtDuration(sec) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function isActiveJob(job) {
  return !!job && (job.status === 'queued' || job.status === 'running');
}

// 목록 페이지 — 등록(Modal) + 검색/필터 + 목록. 적응형 폴링: running 잡이 있으면 8초 간격, 없으면 정지,
// document.hidden이면 정지(enhanceMemo.js의 20분 while 블라인드 폴링 패턴은 쓰지 않는다).
// task-010: 검색/필터는 클라이언트 사이드 파생 state(ClipsPage.jsx와 동일 패턴)이고, 폴링의
// hasRunning 판정은 반드시 필터링 전 원본 videos를 봐야 한다 — 아래 useEffect가 그 원칙을 지킨다.
export default function StudyVideoPage() {
  const navigate = useNavigate();
  const { showToast } = useUI();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  // 등록 Modal (task-010 C)
  const [registerOpen, setRegisterOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('lecture');
  const [registering, setRegistering] = useState(false);

  // 검색 + 분류/기술 필터 (task-010 2번, ClipsPage.jsx 패턴 그대로 복제)
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all'); // all | lecture | seminar | sparring
  const [techFilter, setTechFilter] = useState('');
  const [techOpen, setTechOpen] = useState(false);
  const [techSearch, setTechSearch] = useState('');
  const techDropRef = useRef(null);
  const [page, setPage] = useState(1);

  const pollTimerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const rows = await studyApi.listVideos();
      setVideos(rows);
      return rows;
    } catch (e) {
      console.error(e);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (cancelled || document.hidden) return;
      const rows = await load();
      if (cancelled) return;
      // 적응형 폴링의 hasRunning 체크는 필터링 전 원본 목록(rows)을 그대로 사용한다 — 검색/필터
      // 상태와 무관하게 진행 중인 잡이 있으면 계속 폴링해야 한다(task-010 지시사항 핵심 주의점).
      const hasRunning = rows.some(v => isActiveJob(v.job));
      if (hasRunning && !document.hidden) {
        pollTimerRef.current = setTimeout(tick, 8000);
      }
      // running 잡이 없으면 재예약하지 않고 정지
    }

    function onVisibilityChange() {
      if (!document.hidden) {
        clearTimeout(pollTimerRef.current);
        tick();
      }
    }

    tick();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      clearTimeout(pollTimerRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [load]);

  // 사용 빈도순 기술명 (ClipsPage.jsx의 techNames와 동일한 패턴 — techniqueNames는
  // GET /api/long-videos가 승인·매칭된 기술만 내려줌)
  const techNames = useMemo(() => {
    const count = new Map();
    for (const v of videos) {
      for (const n of v.techniqueNames || []) {
        const t = (n || '').trim();
        if (t) count.set(t, (count.get(t) || 0) + 1);
      }
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [videos]);

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

  // 검색+필터 파생 목록 — 원본 videos와 별개(폴링에 영향 없음)
  const list = useMemo(() => {
    let items = [...videos];
    if (kindFilter !== 'all') items = items.filter(v => v.kind === kindFilter);
    if (techFilter) items = items.filter(v => (v.techniqueNames || []).includes(techFilter));
    if (search) {
      // .normalize('NFC') 필수 — 실기기 검증 중 발견: yt-dlp가 내려주는 일부 영상 제목이 자모
      // 분리형(NFD, macOS 스타일)으로 저장되어 있어(예: video id=29), 사용자가 일반 IME로 입력하는
      // 완성형(NFC) 검색어와 그냥 .includes()로 비교하면 육안상 같은 문자열인데도 매칭에 실패한다
      // (task-010 실행 검증에서 실제로 재현됨). 양쪽 다 NFC로 정규화한 뒤 비교해야 안전하다.
      const q = search.toLowerCase().normalize('NFC');
      items = items.filter(v =>
        (v.title || '').toLowerCase().normalize('NFC').includes(q) ||
        (v.channel || '').toLowerCase().normalize('NFC').includes(q)
      );
    }
    return items;
  }, [videos, search, kindFilter, techFilter]);

  useEffect(() => { setPage(1); }, [search, kindFilter, techFilter]);

  const paged = useMemo(
    () => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [list, page]
  );

  async function handleRegister(e) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setRegistering(true);
    try {
      const result = await studyApi.registerVideo(trimmed, kind, title.trim());
      setUrl('');
      setTitle('');
      setRegisterOpen(false);
      showToast(result.duplicate ? '이미 등록된 영상입니다' : '등록 완료 — 분석을 시작합니다');
      await load();
      navigate(`/study/${result.id}`);
    } catch (err) {
      showToast(err.message || '등록 실패');
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="page-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>영상분석</span>
        <Button size="sm" variant="outline" onClick={() => setRegisterOpen(true)}>+ 등록</Button>
      </div>

      {/* 검색바 (ClipsPage.jsx 패턴) */}
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
          placeholder="제목·채널명 검색"
          style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 14, outline: 'none' }}
        />
      </div>

      {/* 분류(kind) 필터 칩 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <FilterChip active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>전체</FilterChip>
        {KIND_OPTIONS.map(o => (
          <FilterChip key={o.value} active={kindFilter === o.value} onClick={() => setKindFilter(o.value)}>
            {o.label}
          </FilterChip>
        ))}
      </div>

      {/* 기술명 필터 — 드롭다운 (ClipsPage.jsx 패턴) */}
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

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 30 }}>불러오는 중...</div>
      ) : videos.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 30 }}>
          아직 등록된 영상이 없습니다
        </div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 30 }}>
          검색/필터 조건에 맞는 영상이 없습니다
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {paged.map(v => {
              const job = v.job;
              const active = isActiveJob(job);
              const kindBadge = KIND_BADGE[v.kind] || KIND_BADGE.lecture;
              return (
                <Card key={v.id} onClick={() => navigate(`/study/${v.id}`)} className="bjj-card-tap">
                  <div style={{ display: 'flex', gap: 10 }}>
                    {v.thumb_url ? (
                      <img
                        src={v.thumb_url} alt=""
                        style={{ width: 84, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{
                        width: 84, height: 60, borderRadius: 8, flexShrink: 0,
                        background: 'var(--surface-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon name="video" size={20} color="var(--text3)" />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 700, marginBottom: 4,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {v.title || '(제목 조회 중)'}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                        <Tag tone={kindBadge.tone}>{kindBadge.label}</Tag>
                        {v.channel && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{v.channel}</span>}
                        {v.duration_sec > 0 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>· {fmtDuration(v.duration_sec)}</span>}
                      </div>
                      {active ? (
                        <>
                          <div className="voice-progress-bar" style={{ marginBottom: 4 }} />
                          <div style={{ fontSize: 11, color: 'var(--amber)' }}>{job.detail || STATUS_LABEL[job.status]}</div>
                        </>
                      ) : (
                        <Tag tone={v.status === 'error' ? 'red' : v.status === 'done' ? 'accent' : 'neutral'}>
                          {STATUS_LABEL[v.status] || v.status}
                        </Tag>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          <Pagination total={list.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}

      {registerOpen && (
        <Modal title="영상 등록" onClose={() => setRegisterOpen(false)}>
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="YouTube 강의·세미나·스파링 URL"
              style={{
                padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-med)',
                background: 'var(--surface)', color: 'var(--text)', fontSize: 14,
              }}
            />
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="제목 (선택 — 비워두면 유튜브 제목 사용)"
              style={{
                padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-med)',
                background: 'var(--surface)', color: 'var(--text)', fontSize: 14,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={kind}
                onChange={e => setKind(e.target.value)}
                style={{
                  flex: 1, padding: '9px 10px', borderRadius: 10, border: '1px solid var(--border-med)',
                  background: 'var(--surface)', color: 'var(--text)', fontSize: 13,
                }}
              >
                {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Button type="submit" disabled={registering || !url.trim()}>
                {registering ? '등록 중...' : '분석 등록'}
              </Button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              5분~1시간 유튜브 강의·세미나·스파링 영상을 등록하면 목차(챕터)를 자동으로 만들어줍니다.
              등록 후 앱을 꺼도 서버가 계속 분석합니다.
            </div>
          </form>
        </Modal>
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
      {icon && <Icon name={icon} size={12} color={active ? '#fff' : 'var(--text2)'} />}
      {children}
    </button>
  );
}
