import React from 'react';

// ChainDetail.jsx:63-182의 ProgressPanel 패턴(스피너 헤더 + 진행 바 + 스텝 도트)을 이식했다 —
// 새로 설계하지 않고 이미 검증된 시각 언어를 재사용한다(task-008). 다만 체인 생성처럼
// "프롬프트→이미지→영상" 3단계 파이프라인이 아니라 "챕터 N개를 각각 분석"하는 구조라
// 단계 파이프라인 표시부는 대신 챕터별 진행 상태(대기/분석중/완료/실패) 도트로 대체했다.
const STAGE_LABEL = {
  S1: '메타데이터 조회', S2: '자막 조회', 'S2.5': '챕터 후보 저장',
  S3: '영상 다운로드', 'S3.5': '영상 서버 저장', S4: '프레임 추출', S5: '시각 챕터 판단', S6: '챕터 확정',
  S7: '챕터별 프레임 추출', S8: '구간 분석', S9: '전체 영상 종합',
};

export default function StudyProgressPanel({ job, chapters = [] }) {
  if (!job) return null;
  const pct = Math.max(0, Math.min(100, job.progress || 0));
  const stageLabel = STAGE_LABEL[job.stage] || job.stage || '';

  return (
    <div style={{
      borderRadius: 12,
      border: '1px solid var(--accent)',
      background: 'var(--accent-dim)',
      padding: '14px 16px',
      marginBottom: 12,
    }}>
      {/* 헤더: 제목 + 스피너 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 14, height: 14, borderRadius: '50%',
            border: '2px solid var(--accent)', borderTopColor: 'transparent',
            animation: 'sp-spin 0.8s linear infinite', flexShrink: 0,
          }} />
          <style>{'@keyframes sp-spin { to { transform: rotate(360deg); } }'}</style>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>긴 영상 분석 중</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{stageLabel}</span>
      </div>

      {/* 진행 바 */}
      <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', marginBottom: 8, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'linear-gradient(90deg, var(--accent), var(--amber))',
          borderRadius: 3, transition: 'width 0.6s ease',
        }} />
      </div>

      {/* 현재 상세 + 퍼센트 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: chapters.length ? 10 : 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{job.detail || '처리 중...'}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{pct}%</span>
      </div>

      {/* 챕터별 진행 상태 도트 (S7~S9 구간에서만 의미 있음 — 그 전엔 챕터 자체가 아직 없음) */}
      {chapters.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {chapters.map((c, i) => {
            const isDone = c.status === 'done';
            const isError = c.status === 'error';
            const isRunning = c.status === 'running';
            const bg = isDone ? '#1D9E75' : isError ? 'var(--red)' : isRunning ? 'var(--amber)' : 'var(--border)';
            return (
              <div key={c.id ?? i} title={c.title} style={{
                width: 22, height: 22, borderRadius: 6,
                background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 800, color: '#fff',
                border: isRunning ? '2px solid var(--amber)' : '2px solid transparent',
                boxShadow: isRunning ? '0 0 6px var(--amber)' : 'none',
              }}>
                {isDone ? '✓' : isError ? '!' : i + 1}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
