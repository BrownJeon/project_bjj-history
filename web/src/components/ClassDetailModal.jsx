import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useCache } from '../contexts/CacheContext';
import Modal from './Modal';
import Button from './Button';
import Icon from './Icon';
import Tag from './Tag';
import { getClipThumb, getPlatformIcon } from '../utils/videoThumb';
import { generateVideo, getVideoStatus, deleteVideo } from '../api/classVideo';

const TYPE_TONE = { gi: 'accent', nogi: 'blue', open: 'purple', comp: 'amber' };
const TYPE_LABEL = { gi: 'Gi', nogi: 'No-Gi', open: '오픈매트', comp: '대회' };

function fmtFull(ds) {
  if (!ds) return '';
  const d = new Date(ds.toString().slice(0, 10) + 'T00:00:00');
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${labels[d.getDay()]})`;
}

function normArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

// 라벨 + 내용 섹션 (편집 화면의 .field 와 동일한 시각 구조)
function Section({ label, children, empty }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children != null && children !== '' ? children : (
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>{empty || '-'}</p>
      )}
    </div>
  );
}

function VideoSection({ classId }) {
  const [vs, setVs] = useState(null); // null = 로딩 중
  const [generating, setGenerating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getVideoStatus(classId);
      setVs(data);
      return data.status;
    } catch {
      return null;
    }
  }, [classId]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const st = await fetchStatus();
      if (st !== 'pending') {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 30000);
  }, [fetchStatus]);

  useEffect(() => {
    fetchStatus().then(st => { if (st === 'pending') startPolling(); });
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [fetchStatus, startPolling]);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const data = await generateVideo(classId);
      setVs({ status: data.status, progress: data.progress || '영상 생성 준비 중...' });
      startPolling();
    } catch (e) {
      setVs({ status: 'error', error: e.message || '오류 발생' });
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    await deleteVideo(classId).catch(() => {});
    setConfirmDelete(false);
    setVs({ status: 'none' });
  };

  if (vs === null) {
    return (
      <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text3)', fontSize: 13 }}>
        영상 상태 확인 중...
      </div>
    );
  }

  if (vs.status === 'done' && vs.videoUrl) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <video
          controls
          src={vs.videoUrl}
          style={{ width: '100%', borderRadius: 12, background: '#000', maxHeight: 260 }}
          playsInline
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href={vs.videoUrl}
            download
            style={{ flex: 1 }}
          >
            <Button variant="outline" size="sm" style={{ width: '100%' }}>다운로드</Button>
          </a>
          {confirmDelete ? (
            <>
              <Button variant="danger" size="sm" onClick={handleDelete}>삭제 확인</Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>취소</Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>삭제 후 재생성</Button>
          )}
        </div>
      </div>
    );
  }

  if (vs.status === 'pending') {
    const progressText = vs.progress || '영상 생성 중...';
    return (
      <div style={{
        padding: '14px 16px', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 12,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>⏳</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>AI 영상 생성 중...</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>{progressText}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>약 20~40분 소요됩니다. 페이지를 닫아도 생성이 계속됩니다.</div>
      </div>
    );
  }

  if (vs.status === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          padding: '10px 14px', background: 'var(--surface)',
          border: '1px solid var(--red)', borderRadius: 10,
          fontSize: 12, color: 'var(--red)',
        }}>
          오류: {vs.error || '알 수 없는 오류'}
        </div>
        <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
          {generating ? '생성 시작 중...' : '다시 시도'}
        </Button>
      </div>
    );
  }

  // status === 'none'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
        수업 내용을 바탕으로 AI가 BJJ 장면 영상을 자동 생성합니다.<br />
        (예상 시간: 20~40분)
      </div>
      <Button variant="primary" size="sm" onClick={handleGenerate} disabled={generating}>
        {generating ? '생성 시작 중...' : 'AI 영상 생성'}
      </Button>
    </div>
  );
}

export default function ClassDetailModal({ initial, onClose, onEdit }) {
  const { clips } = useCache();
  const c = initial || {};

  const drill = c.drill || {};
  const drillTech = (drill.tech || []).map(t => (typeof t === 'string' ? t : t?.name || '')).filter(Boolean);
  const stars = parseInt(drill.stars) || 0;

  const trainedDates = useMemo(() => normArray(c.trained_dates).map(d => d.toString().slice(0, 10)).sort(), [c.trained_dates]);

  const linkedClips = useMemo(
    () => (c.clip_ids || []).map(id => clips.find(cl => cl.id === id)).filter(Boolean),
    [c.clip_ids, clips]
  );

  const sparDays = (c.spar_days || []).filter(sd => (sd.sessions || []).length > 0);
  const sparCount = sparDays.reduce((s, sd) => s + (sd.sessions || []).length, 0);

  const tone = TYPE_TONE[c.type] || 'accent';
  const typeLabel = TYPE_LABEL[c.type] || 'Gi';
  const dateRange = c.date_end && c.date_end.toString().slice(0, 10) !== c.date?.toString().slice(0, 10)
    ? `${fmtFull(c.date)} ~ ${fmtFull(c.date_end)}`
    : fmtFull(c.date);

  return (
    <Modal title="수업 상세" onClose={onClose}>
      {/* 헤더: 유형 + 테마 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Tag tone={tone}>{typeLabel}</Tag>
        <span style={{ fontSize: 17, fontWeight: 800, flex: 1 }}>{c.theme || '수업'}</span>

      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>{dateRange}</div>

      <Section label="수련 날짜" empty="체크된 수련일이 없습니다">
        {trainedDates.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {trainedDates.map(ds => (
              <div key={ds} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 10,
              }}>
                <Icon name="check" size={15} color="var(--accent)" />
                <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{fmtFull(ds)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section label="전체 메모" empty="작성된 메모가 없습니다">
        {c.note && (
          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{c.note}</p>
        )}
      </Section>

      <Section label="코치 피드백" empty="코치 피드백이 없습니다">
        {c.feedback && (
          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{c.feedback}</p>
        )}
      </Section>

      <Section label="주요 포지션" empty="-">
        {drill.pos && <Tag tone="blue">{drill.pos}</Tag>}
      </Section>

      <Section label="주요 기술" empty="-">
        {drillTech.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {drillTech.map((t, i) => (
              <span key={i} style={{
                padding: '3px 9px', borderRadius: 6,
                background: 'var(--surface-hi)', color: 'var(--text2)', fontSize: 12, fontWeight: 500,
              }}>{t}</span>
            ))}
          </div>
        )}
      </Section>

      <Section label="난이도/만족도" empty="-">
        {stars > 0 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <Icon key={n} name="star" size={20}
                color={n <= stars ? 'var(--amber)' : 'var(--text3)'} filled={n <= stars} />
            ))}
          </div>
        )}
      </Section>

      <Section label={`관련 영상${linkedClips.length ? ` (${linkedClips.length})` : ''}`} empty="연결된 영상이 없습니다">
        {linkedClips.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {linkedClips.map(clip => {
              const thumb = getClipThumb(clip);
              return (
                <a key={clip.id} href={clip.video_file || clip.url} target="_blank" rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none',
                           padding: '6px 8px', background: 'var(--surface-up)',
                           border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{
                    width: 56, height: 36, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                    background: 'var(--surface-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {thumb
                      ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 16 }}>{getPlatformIcon(clip.platform)}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {clip.title}
                    </div>
                    {(clip.tech_names?.[0] || clip.tech_name) && (
                      <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 1 }}>
                        {clip.tech_names?.[0] || clip.tech_name}
                      </div>
                    )}
                  </div>
                  {clip.video_file && <span style={{ fontSize: 10, color: 'var(--accent)', flexShrink: 0 }}>📥</span>}
                </a>
              );
            })}
          </div>
        )}
      </Section>

      {sparCount > 0 && (
        <Section label={`스파링 (${sparCount})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sparDays.map(sd => (
              <div key={sd.id || sd.date} style={{
                padding: '10px 12px', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 10,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 6 }}>
                  ⚔ {fmtFull(sd.date)} · {(sd.sessions || []).length}세션
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(sd.sessions || []).map((s, i) => (
                    <div key={s.id || i} style={{ fontSize: 12, color: 'var(--text2)' }}>
                      <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                        {s.opponent || `세션 ${i + 1}`}
                      </span>
                      {(s.tap_got != null || s.tap_gave != null) && (
                        <span style={{ marginLeft: 6 }}>
                          탭 {s.tap_got || 0}/{s.tap_gave || 0}
                        </span>
                      )}
                      {s.time_min ? <span style={{ marginLeft: 6 }}>· {s.time_min}분</span> : null}
                      {s.note && (
                        <div style={{ marginTop: 2, color: 'var(--text2)', lineHeight: 1.4 }}>{s.note}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}


      <Section label="AI 영상">
        <VideoSection classId={c.id} />
      </Section>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button variant="primary" size="sm" onClick={onEdit}>수정</Button>
        <Button variant="outline" size="sm" onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  );
}
