import React from 'react';
import Card from './Card';
import Tag from './Tag';
import { fmtMmSs, badgeFor } from './StudyChapterList';
import * as studyApi from '../api/studyVideos';
import { createTechnique } from '../api/techniques';
import { useUI } from '../contexts/UIContext';

// 챕터 카드 — task-008 (Phase 2) 프레임 스트립 + 요약 + 포인트, task-009 (Phase 3) 기술 태그를
// 실제 인터랙션으로 연결. 상태별 렌더링:
//   pending → "대기 중" (아직 이 챕터 차례가 안 옴)
//   running → 스피너 + "분석 중" (지금 이 챕터를 처리하고 있음 — longVideoPipeline.js가 루프 진입 시 표시)
//   error   → 에러 메시지 (그 챕터만 실패, 나머지는 계속 진행되므로 다른 카드는 정상 표시됨)
//   done    → 프레임 스트립 + 요약 + 포인트 + 포지션/기술 태그
//
// techniques prop: video.techniques(long_video_techniques 원본 행, GET /:id가 technique_name까지
// 조인해서 내려줌)를 이 챕터로 필터링한 배열. details.techniques(AI 추출 원본, Phase 2)는 더 이상
// 태그 렌더링에 쓰지 않는다 — S10 매칭 결과(long_video_techniques)가 tid·match_type·technique_id를
// 갖고 있는 유일한 소스라 그것만 신뢰한다(파이프라인이 S10까지 끝나야 태그가 뜬다는 뜻이지만,
// 이미 done인 챕터도 몇 초 안에 S10이 채워주므로 실사용상 체감 지연은 미미하다).
// active: task-010 A — 방금 클릭한(시간라벨 또는 프레임썸네일) 챕터인지, 부모(StudyVideoDetailPage)의
// activeChapterId와 비교해 전달됨. 강조 테두리/배경으로 "지금 뭘 보고 있는지" 짚어준다.
export default function StudyChapterCard({ chapter, techniques = [], videoId, onSeek, onChanged, active = false }) {
  const { showToast } = useUI();
  const badge = badgeFor(chapter);
  const details = chapter.details || {};
  const points = Array.isArray(details.points) ? details.points : [];
  const positions = Array.isArray(details.positions) ? details.positions : [];
  const frames = Array.isArray(chapter.frames) ? chapter.frames : [];

  // match_type 있고(confidence≥0.7) → "참고영상에 연동" 버튼(승인 시 apply API 호출)
  // match_type='none'이거나 confidence<0.7 → 회색 비활성(단, none이고 confidence≥0.7이면
  // "새 기술로 추가" 옵션은 계속 제공 — 설계서 §6-5 "confidence<0.7은 회색+버튼 비활성" 그대로,
  // 미매칭 자체가 비활성 사유는 아니다)
  async function handleApply(t) {
    if (!window.confirm(`"${t.technique_name || t.raw_name}" 기술의 참고영상으로 이 구간을 연동할까요?`)) return;
    try {
      const r = await studyApi.applyTechnique(videoId, t.id);
      showToast(r.alreadyLinked ? '이미 연동되어 있습니다' : '참고영상으로 연동했습니다');
      onChanged?.();
    } catch (e) {
      showToast(e.message || '연동 실패');
    }
  }

  async function handleCreateNew(t) {
    const name = window.prompt('새 기술로 추가할 이름', t.raw_name);
    if (!name || !name.trim()) return;
    try {
      const created = await createTechnique({ name: name.trim() });
      await studyApi.applyTechnique(videoId, t.id, { technique_id: created.id });
      showToast(created.existing ? '기존 기술에 연동했습니다' : '새 기술을 추가하고 연동했습니다');
      onChanged?.();
    } catch (e) {
      showToast(e.message || '추가 실패');
    }
  }

  return (
    <Card
      className="bjj-card-tap"
      padding={12}
      style={active ? { borderColor: 'var(--accent)', borderWidth: 2, background: 'var(--accent-dim)' } : undefined}
    >
      {/* 헤더: 시간 · 제목 · 출처 배지 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div
          onClick={() => onSeek?.(chapter.start_sec, chapter.id)}
          style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', flexShrink: 0, cursor: 'pointer' }}
        >
          {fmtMmSs(chapter.start_sec)}~{fmtMmSs(chapter.end_sec)}
        </div>
        <div style={{
          flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {chapter.title}
        </div>
        <Tag tone={badge.tone}>{badge.label}</Tag>
      </div>

      {chapter.status === 'pending' && (
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>구간 분석 대기 중</div>
      )}

      {chapter.status === 'running' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--amber)' }}>
          <div style={{
            width: 11, height: 11, borderRadius: '50%',
            border: '2px solid var(--amber)', borderTopColor: 'transparent',
            animation: 'chain-spin 0.8s linear infinite', flexShrink: 0,
          }} />
          <style>{'@keyframes chain-spin { to { transform: rotate(360deg); } }'}</style>
          구간 분석 중...
        </div>
      )}

      {chapter.status === 'error' && (
        <div style={{ fontSize: 12, color: 'var(--red)' }}>
          이 구간 분석 실패: {chapter.error || '알 수 없는 오류'}
        </div>
      )}

      {chapter.status === 'done' && (
        <>
          {frames.length > 0 && (
            <div style={{
              display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8,
              paddingBottom: 2, WebkitOverflowScrolling: 'touch',
            }}>
              {frames.map((f, i) => (
                <img
                  key={i}
                  src={f.path}
                  alt={`${fmtMmSs(f.t)} 프레임`}
                  onClick={() => onSeek?.(f.t, chapter.id)}
                  style={{
                    width: 96, height: 54, objectFit: 'cover', borderRadius: 6,
                    flexShrink: 0, cursor: 'pointer', border: '1px solid var(--border)',
                  }}
                />
              ))}
            </div>
          )}

          {chapter.summary && (
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.5 }}>
              {chapter.summary}
            </div>
          )}

          {points.length > 0 && (
            <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 12, color: 'var(--text2)' }}>
              {points.map((p, i) => <li key={i} style={{ marginBottom: 2 }}>{p}</li>)}
            </ul>
          )}

          {(positions.length > 0 || techniques.length > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {positions.map((p, i) => <Tag key={`pos-${i}`} tone="blue">{p}</Tag>)}
              {/* 기술 태그 — task-009 Phase 3: 실제 연동/신규추가 인터랙션 */}
              {techniques.map((t) => {
                const confidence = Number(t.confidence) || 0;
                const label = `${t.raw_name}${t.at_sec != null ? ` (${fmtMmSs(t.at_sec)})` : ''}`;
                if (confidence < 0.7) {
                  // 확신도 낮음 — 매칭 여부와 무관하게 회색 비활성(설계서 §6-5)
                  return (
                    <Tag key={t.id} tone="neutral" style={{ opacity: 0.5, cursor: 'default' }}>
                      {label}
                    </Tag>
                  );
                }
                if (t.technique_id) {
                  // 매칭됨(exact/alias/fuzzy) 또는 이미 승인·연동됨 — 클릭 시 (재)연동
                  return (
                    <Tag key={t.id} tone="purple" onClick={() => handleApply(t)}>
                      {t.technique_name || t.raw_name}{t.at_sec != null ? ` (${fmtMmSs(t.at_sec)})` : ''}
                    </Tag>
                  );
                }
                // match_type='none' — 새 기술로 추가 옵션 제공
                return (
                  <Tag key={t.id} tone="neutral" onClick={() => handleCreateNew(t)}>
                    + {label}
                  </Tag>
                );
              })}
            </div>
          )}

          {!chapter.summary && !points.length && !positions.length && !techniques.length && (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>분석 결과가 비어 있습니다</div>
          )}
        </>
      )}
    </Card>
  );
}
