import React from 'react';
import Card from './Card';
import Tag from './Tag';

// StudyChapterCard.jsx도 재사용하는 공용 헬퍼(task-008) — 여기서만 export하고 별도 파일로
// 승격하지 않은 이유: 이 두 파일이 유일한 사용처이며 각 10줄 내외라 굳이 utils/로 뺄 정도는 아님.
export function fmtMmSs(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

const SOURCE_LABEL = { youtube: '유튜브', ai: 'AI(자막)', visual: 'AI(화면)', single: '단일' };

// 출처 배지 — 기존 Tag tone 재사용 (설계서 §5):
// 유튜브→red / AI(자막)→purple / AI(화면)→blue / 낮은confidence→amber / 단일→neutral / 직접수정→accent(초록)
export function badgeFor(chapter) {
  if (chapter.edited) return { tone: 'accent', label: '직접수정' };
  if ((chapter.confidence ?? 100) < 60) return { tone: 'amber', label: '낮은 확신도' };
  if (chapter.source === 'youtube') return { tone: 'red', label: SOURCE_LABEL.youtube };
  if (chapter.source === 'ai')      return { tone: 'purple', label: SOURCE_LABEL.ai };
  if (chapter.source === 'visual')  return { tone: 'blue', label: SOURCE_LABEL.visual };
  return { tone: 'neutral', label: SOURCE_LABEL.single };
}

// 목차 렌더링만 담당 — 프레임 스트립·요약·기술 태그(StudyChapterCard 상당 기능)는
// Phase 2/3 소관이라 이번 컴포넌트에는 포함하지 않는다.
export default function StudyChapterList({ chapters = [], onSeek }) {
  if (!chapters.length) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 20, fontSize: 13 }}>
        아직 목차가 없습니다
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {chapters.map(c => {
        const badge = badgeFor(c);
        return (
          <Card
            key={c.id ?? c.idx}
            onClick={() => onSeek?.(c.start_sec)}
            className="bjj-card-tap"
            padding={10}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', minWidth: 44, flexShrink: 0 }}>
                {fmtMmSs(c.start_sec)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {c.title}
                </div>
              </div>
              <Tag tone={badge.tone}>{badge.label}</Tag>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
