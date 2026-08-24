import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../contexts/UIContext';
import * as studyApi from '../api/studyVideos';
import Card from '../components/Card';
import Tag from '../components/Tag';
import Icon from '../components/Icon';
import Button from '../components/Button';

const STATUS_LABEL = { queued: '대기 중', running: '분석 중', done: '완료', error: '오류', canceled: '취소됨' };
const KIND_OPTIONS = [
  { value: 'lecture',  label: '강의' },
  { value: 'seminar',  label: '세미나' },
  { value: 'sparring', label: '스파링' },
];

function fmtDuration(sec) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function isActiveJob(job) {
  return !!job && (job.status === 'queued' || job.status === 'running');
}

// 목록 페이지 — URL 등록 + 목록. 적응형 폴링: running 잡이 있으면 8초 간격, 없으면 정지,
// document.hidden이면 정지(enhanceMemo.js의 20분 while 블라인드 폴링 패턴은 쓰지 않는다).
export default function StudyVideoPage() {
  const navigate = useNavigate();
  const { showToast } = useUI();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState('lecture');
  const [registering, setRegistering] = useState(false);
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

  async function handleRegister(e) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setRegistering(true);
    try {
      const result = await studyApi.registerVideo(trimmed, kind);
      setUrl('');
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
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 14 }}>
        영상분석
      </div>

      <Card style={{ marginBottom: 16 }}>
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
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 30 }}>불러오는 중...</div>
      ) : videos.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 30 }}>
          아직 등록된 영상이 없습니다
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {videos.map(v => {
            const job = v.job;
            const active = isActiveJob(job);
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
      )}
    </div>
  );
}
