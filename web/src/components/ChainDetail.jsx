import React, { useState } from 'react';
import Modal from './Modal';
import Tag from './Tag';
import Icon from './Icon';
import Button from './Button';
import { downloadChainVideo } from '../api/chains';

// 체인 상세 (세로 타임라인) — 풀스크린 모달
export default function ChainDetail({ chain, techniques, onClose, onEdit, onDelete }) {
  const [videoState, setVideoState] = useState('idle'); // idle | generating | done | error
  const [videoError, setVideoError] = useState('');

  async function handleGenerateVideo() {
    setVideoState('generating');
    setVideoError('');
    try {
      const blob = await downloadChainVideo(chain.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${chain.name}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setVideoState('done');
      setTimeout(() => setVideoState('idle'), 3000);
    } catch (e) {
      setVideoError(e.message || '영상 생성 실패');
      setVideoState('error');
    }
  }
  const techMap = new Map(techniques.map(t => [t.id, t]));
  const steps = chain.steps || [];

  function stepTone(i) {
    if (i === 0) return { tone: 'blue',   color: 'var(--blue)',   bg: 'var(--blue-dim)' };
    if (i === steps.length - 1) return { tone: 'amber', color: 'var(--amber)', bg: 'var(--amber-dim)' };
    return { tone: 'accent', color: 'var(--accent)', bg: 'var(--accent-dim)' };
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
        {/* 좌측 수직 라인 */}
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
              {/* 번호 뱃지 */}
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
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
                    color: t.color,
                  }}>STEP {i + 1}</span>
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

      {/* 영상 생성 상태 */}
      {videoState === 'generating' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 10, marginBottom: 10,
          background: 'var(--accent-dim)', border: '1px solid var(--accent)',
          fontSize: 13,
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
            border: '2px solid var(--accent)', borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--accent)' }}>영상 생성 중...</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              슬라이드 렌더링 중 — 스텝 수에 따라 30~90초 소요됩니다
            </div>
          </div>
        </div>
      )}
      {videoState === 'done' && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 10,
          background: 'var(--accent-dim)', border: '1px solid var(--accent)',
          fontSize: 13, fontWeight: 700, color: 'var(--accent)',
        }}>
          ✓ 영상 다운로드 완료
        </div>
      )}
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
          {videoState === 'generating' ? '생성 중...' : '영상 생성'}
        </Button>
        <Button variant="danger" size="sm" onClick={onDelete}>삭제</Button>
        <Button variant="outline" size="sm" onClick={onEdit}>수정</Button>
        <Button variant="primary" size="sm" onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  );
}
