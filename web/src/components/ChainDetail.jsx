import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import Tag from './Tag';
import Icon from './Icon';
import Button from './Button';
import { generateChainVideo, getChainVideoJob } from '../api/chains';

/* ── 진행률 파싱 ──────────────────────────────────────────────────────────── */

function parseProgress(progressStr, totalSteps) {
  if (!progressStr || progressStr === 'AI 파이프라인 시작 중...')
    return { pct: 0, currentStep: 0, phase: 'init', label: '파이프라인 준비 중...' };

  if (progressStr.includes('인트로'))
    return { pct: 3, currentStep: 0, phase: 'intro', label: '인트로 슬라이드 생성 중...' };

  if (progressStr.includes('아웃트로'))
    return { pct: 93, currentStep: (totalSteps || 1) + 1, phase: 'outro', label: '아웃트로 슬라이드 생성 중...' };

  if (progressStr.includes('합치는'))
    return { pct: 97, currentStep: (totalSteps || 1) + 1, phase: 'concat', label: '클립 합치는 중...' };

  const m = progressStr.match(/스텝\s+(\d+)\/(\d+)/);
  if (m) {
    const n     = parseInt(m[1], 10);
    const total = parseInt(m[2], 10);
    let phaseOffset = 0, phase = 'prompt', phaseLabel = '프롬프트 생성';
    if (progressStr.includes('이미지')) { phaseOffset = 1; phase = 'image'; phaseLabel = 'AI 이미지 생성'; }
    else if (progressStr.includes('영상'))  { phaseOffset = 2; phase = 'video'; phaseLabel = 'AI 영상 생성'; }
    // 총 ops: intro(1) + total*3 + outro(1) + concat(1)
    const totalOps    = 1 + total * 3 + 2;
    const completedOps = 1 + (n - 1) * 3 + phaseOffset;
    return {
      pct: Math.min(96, Math.round((completedOps / totalOps) * 100)),
      currentStep: n,
      totalSteps: total,
      phase,
      label: `스텝 ${n}/${total} · ${phaseLabel} 중`,
    };
  }

  return { pct: 0, currentStep: 0, phase: 'init', label: progressStr };
}

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

/* ── 진행 패널 ──────────────────────────────────────────────────────────── */

const PHASE_META = {
  prompt: { icon: '✦', color: '#6C8EBD', label: '프롬프트' },
  image:  { icon: '◈', color: '#9C6FD6', label: 'AI 이미지' },
  video:  { icon: '▶', color: '#1D9E75', label: 'AI 영상' },
  intro:  { icon: '⬡', color: '#888',   label: '인트로' },
  outro:  { icon: '⬡', color: '#888',   label: '아웃트로' },
  concat: { icon: '⊕', color: '#E8A830', label: '합치기' },
  init:   { icon: '⟳', color: '#888',   label: '준비 중' },
};

function ProgressPanel({ progress, steps, elapsed }) {
  const total = steps.length;
  const info  = parseProgress(progress, total);
  const meta  = PHASE_META[info.phase] || PHASE_META.init;

  return (
    <div style={{
      borderRadius: 12,
      border: '1px solid var(--accent)',
      background: 'var(--accent-dim)',
      padding: '14px 16px',
      marginBottom: 12,
    }}>
      {/* 헤더: 제목 + 경과시간 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 14, height: 14, borderRadius: '50%',
            border: '2px solid var(--accent)', borderTopColor: 'transparent',
            animation: 'chain-spin 0.8s linear infinite', flexShrink: 0,
          }} />
          <style>{`@keyframes chain-spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>AI 영상 생성 중</span>
        </div>
        <span style={{
          fontSize: 11, color: 'var(--text3)',
          fontVariantNumeric: 'tabular-nums',
        }}>⏱ {formatElapsed(elapsed)}</span>
      </div>

      {/* 진행 바 */}
      <div style={{
        height: 6, borderRadius: 3,
        background: 'var(--border)',
        marginBottom: 8, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${info.pct}%`,
          background: `linear-gradient(90deg, var(--accent), ${meta.color})`,
          borderRadius: 3,
          transition: 'width 0.6s ease',
        }} />
      </div>

      {/* 현재 작업 + 퍼센트 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: meta.color,
            background: meta.color + '22',
            padding: '2px 7px', borderRadius: 4,
          }}>{meta.icon} {meta.label}</span>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{info.label}</span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{info.pct}%</span>
      </div>

      {/* 스텝 도트 */}
      {total > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
          {steps.map((s, i) => {
            const stepNum = i + 1;
            const isDone    = info.currentStep > stepNum || (info.pct >= 97);
            const isCurrent = info.currentStep === stepNum;
            const dotColor  = isDone ? '#1D9E75' : isCurrent ? meta.color : 'var(--border)';
            const textColor = isDone || isCurrent ? '#fff' : 'var(--text3)';
            return (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: dotColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800, color: textColor,
                  border: isCurrent ? `2px solid ${meta.color}` : '2px solid transparent',
                  boxShadow: isCurrent ? `0 0 8px ${meta.color}66` : 'none',
                  transition: 'all 0.4s ease',
                }}>
                  {isDone ? '✓' : stepNum}
                </div>
                <span style={{
                  fontSize: 9, color: isCurrent ? meta.color : 'var(--text3)',
                  maxWidth: 32, textAlign: 'center', lineHeight: 1.2,
                  fontWeight: isCurrent ? 700 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {(s.tech_name || '').split(' ')[0] || stepNum}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 단계 파이프라인 표시 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 10, color: 'var(--text3)',
      }}>
        {['prompt', 'image', 'video'].map((p, i) => {
          const pm = PHASE_META[p];
          const active = info.phase === p;
          return (
            <React.Fragment key={p}>
              {i > 0 && <span style={{ opacity: 0.4 }}>→</span>}
              <span style={{
                color: active ? pm.color : 'var(--text3)',
                fontWeight: active ? 700 : 400,
              }}>{pm.icon} {pm.label}</span>
            </React.Fragment>
          );
        })}
        <span style={{ marginLeft: 'auto', opacity: 0.6 }}>SD + SVD · 30분~1시간 소요</span>
      </div>
    </div>
  );
}

/* ── 메인 컴포넌트 ──────────────────────────────────────────────────────────── */

const JOB_KEY = (chainId) => `bjj-chain-job-${chainId}`;

function saveJob(chainId, jobId, startTime) {
  localStorage.setItem(JOB_KEY(chainId), JSON.stringify({ jobId, startTime }));
}
function clearJob(chainId) {
  localStorage.removeItem(JOB_KEY(chainId));
}
function loadJob(chainId) {
  try { return JSON.parse(localStorage.getItem(JOB_KEY(chainId))); } catch { return null; }
}

export default function ChainDetail({ chain, techniques, onClose, onEdit, onDelete }) {
  const [videoReady, setVideoReady] = useState(!!chain.video_path);
  const [videoState, setVideoState] = useState('idle'); // idle | generating | error
  const [videoError, setVideoError] = useState('');
  const [videoTs, setVideoTs]       = useState(Date.now());
  const [jobId, setJobId]           = useState(null);
  const [progress, setProgress]     = useState('');
  const [elapsed, setElapsed]       = useState(0);
  const startTimeRef = useRef(null);

  // 마운트 시 localStorage에서 진행 중인 잡 복원
  useEffect(() => {
    const saved = loadJob(chain.id);
    if (!saved) return;
    // 즉시 DB 조회해서 아직 살아있는 잡인지 확인
    getChainVideoJob(saved.jobId).then(job => {
      if (job.status === 'pending' || job.status === 'generating') {
        startTimeRef.current = saved.startTime;
        setElapsed(Math.floor((Date.now() - saved.startTime) / 1000));
        setJobId(saved.jobId);
        setProgress(job.progress || 'AI 영상 생성 중...');
        setVideoState('generating');
      } else {
        clearJob(chain.id);
        if (job.status === 'done') { setVideoReady(true); setVideoTs(Date.now()); }
      }
    }).catch(() => clearJob(chain.id));
  }, [chain.id]);

  // 경과 시간 타이머
  useEffect(() => {
    if (videoState !== 'generating') return;
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [videoState]);

  // 잡 상태 폴링 (5초)
  useEffect(() => {
    if (!jobId) return;
    const iv = setInterval(async () => {
      try {
        const job = await getChainVideoJob(jobId);
        if (job.progress) setProgress(job.progress);
        if (job.status === 'done') {
          clearJob(chain.id);
          setVideoReady(true);
          setVideoTs(Date.now());
          setVideoState('idle');
          setJobId(null);
          clearInterval(iv);
        } else if (job.status === 'error') {
          clearJob(chain.id);
          setVideoError(job.error || 'AI 영상 생성 실패');
          setVideoState('error');
          setJobId(null);
          clearInterval(iv);
        }
      } catch (_) {}
    }, 5000);
    return () => clearInterval(iv);
  }, [jobId, chain.id]);

  async function handleGenerateVideo() {
    setVideoState('generating');
    setVideoError('');
    setProgress('AI 파이프라인 시작 중...');
    const startTime = Date.now();
    setElapsed(0);
    startTimeRef.current = startTime;
    try {
      const { job_id } = await generateChainVideo(chain.id);
      saveJob(chain.id, job_id, startTime);
      setJobId(job_id);
    } catch (e) {
      setVideoError(e.message || '영상 생성 요청 실패');
      setVideoState('error');
    }
  }

  const techMap = new Map(techniques.map(t => [t.id, t]));
  const steps   = chain.steps || [];

  function stepTone(i) {
    if (i === 0) return { color: 'var(--blue)',   bg: 'var(--blue-dim)' };
    if (i === steps.length - 1) return { color: 'var(--amber)', bg: 'var(--amber-dim)' };
    return { color: 'var(--accent)', bg: 'var(--accent-dim)' };
  }

  return (
    <Modal title={chain.name} onClose={onClose}>
      {chain.note && (
        <div style={{
          padding: 10,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          fontSize: 13,
          color: 'var(--text2)',
          marginBottom: 14,
          whiteSpace: 'pre-wrap',
        }}>
          {chain.note}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
        단계 {steps.length}
      </div>

      {/* 세로 타임라인 */}
      <div style={{ position: 'relative', paddingLeft: 28, marginBottom: 14 }}>
        {steps.length > 1 && (
          <div style={{
            position: 'absolute',
            left: 11, top: 8, bottom: 8,
            width: 2,
            background: 'linear-gradient(to bottom, var(--blue), var(--accent), var(--amber))',
            borderRadius: 1,
            opacity: 0.5,
          }} />
        )}
        {steps.map((s, i) => {
          const tech = techMap.get(s.technique_id);
          const t = stepTone(i);
          return (
            <div key={i} style={{ position: 'relative', marginBottom: 10 }}>
              <div style={{
                position: 'absolute',
                left: -28, top: 6,
                width: 24, height: 24, borderRadius: 8,
                background: t.bg,
                color: t.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 800,
                border: `1px solid ${t.color}`,
              }}>
                {i + 1}
              </div>
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: t.color }}>
                    STEP {i + 1}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    {s.tech_name || tech?.name || `#${s.technique_id}`}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {tech?.pos && <Tag tone="blue">{tech.pos}</Tag>}
                </div>
                {s.transition_note && (
                  <div style={{
                    marginTop: 6, padding: 6,
                    fontSize: 12, color: 'var(--text)',
                    background: 'var(--surface-up)', borderRadius: 6,
                    borderLeft: `2px solid ${t.color}`,
                  }}>
                    {s.transition_note}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {steps.length === 0 && (
          <div style={{ color: 'var(--text3)', fontSize: 12, textAlign: 'center', padding: 20 }}>
            단계가 없습니다
          </div>
        )}
      </div>

      {/* 인앱 영상 플레이어 */}
      {videoReady && (
        <div style={{ marginBottom: 14 }}>
          <video
            key={videoTs}
            controls
            playsInline
            style={{ width: '100%', maxHeight: 420, borderRadius: 10, background: '#000', display: 'block' }}
            src={`/api/chains/${chain.id}/video?t=${videoTs}`}
          />
        </div>
      )}

      {/* AI 영상 진행 패널 */}
      {videoState === 'generating' && (
        <ProgressPanel progress={progress} steps={steps} elapsed={elapsed} />
      )}

      {/* 에러 */}
      {videoState === 'error' && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 10,
          background: 'var(--red-dim)', border: '1px solid var(--red)',
          fontSize: 12, color: 'var(--red)',
        }}>
          영상 생성 실패: {videoError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Button variant="outline" size="sm"
          onClick={handleGenerateVideo}
          disabled={videoState === 'generating' || steps.length === 0}
        >
          {videoState === 'generating' ? 'AI 생성 중...' : videoReady ? 'AI 영상 재생성' : 'AI 영상 생성'}
        </Button>
        <Button variant="danger" size="sm" onClick={onDelete}>삭제</Button>
        <Button variant="outline" size="sm" onClick={onEdit}>수정</Button>
        <Button variant="primary" size="sm" onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  );
}
