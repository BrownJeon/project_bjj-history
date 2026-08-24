import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from './Button';
import * as studyApi from '../api/studyVideos';
import { useUI } from '../contexts/UIContext';
import { fmtMmSs } from './StudyChapterList';

// 챕터 편집 — task-009 Phase 3. 백엔드(PATCH /:id/chapters)는 Phase 1이 이미 구현·검증해뒀으므로
// (정렬·겹침 검증 + 트랜잭션 교체 + edited=1 저장) 이 컴포넌트는 프론트 UI만 담당한다.
//
// 설계서 §5 "챕터 편집" 행 구성은 [위와 병합] [시간(mm:ss)] [이름] [재분석] 이지만, 행 단위
// "재분석"은 백엔드에 대응하는 기능이 없다(파이프라인은 영상 전체 단위 재분석만 지원 — S1부터
// 전체 재수행, task-007/008 Developer 기록 참고). 챕터 하나만 다시 분석하는 API를 새로 만드는 건
// 이번 task 범위 밖(Phase 4의 "resume_from 진짜 단계별 재개"와 성격이 겹친다)이라, 행별 재분석
// 버튼은 넣지 않고 기존 페이지 상단의 "재분석"(영상 전체) 버튼을 그대로 안내 문구로 남겨둔다.
//
// 시간은 각 행의 시작 시각만 사용자가 입력한다(전형적인 "챕터 마커 목록" UX). 끝 시각은 다음 행의
// 시작 시각(마지막 행은 영상 길이)으로 자동 계산 — "위와 병합"으로 행을 지우면 그 구간이 자동으로
// 위 챕터에 합쳐지는 것과 같은 효과를 낸다.
function parseMmSsInput(str) {
  const m = String(str || '').trim().match(/^(\d+):([0-5]?\d)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export default function ChapterEditor({ open, onClose, chapters = [], durationSec, videoId, onSaved }) {
  const { showToast } = useUI();
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  // 모달이 열릴 때마다 최신 chapters로 편집 상태를 리셋한다(모달이 계속 마운트돼 있으므로
  // 첫 오픈 시점의 값으로 고정되지 않도록)
  useEffect(() => {
    if (!open) return;
    setRows(
      [...chapters]
        .sort((a, b) => a.start_sec - b.start_sec)
        .map(c => ({
          key: c.id ?? `${c.idx}-${c.start_sec}`,
          start_sec: c.start_sec,
          title: c.title,
          source: c.source,
          confidence: c.confidence,
        }))
    );
  }, [open, chapters]);

  function updateRow(i, patch) {
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function handleTimeBlur(i, value) {
    const sec = parseMmSsInput(value);
    if (sec == null) {
      showToast('시간 형식은 mm:ss 입니다');
      return;
    }
    updateRow(i, { start_sec: sec });
  }

  function mergeWithAbove(i) {
    if (i === 0) return;
    setRows(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!rows.length) {
      showToast('챕터가 최소 1개 필요합니다');
      return;
    }
    const sorted = [...rows].sort((a, b) => a.start_sec - b.start_sec);
    const payload = sorted.map((r, i) => ({
      start_sec: r.start_sec,
      end_sec: i < sorted.length - 1 ? sorted[i + 1].start_sec : Math.max(r.start_sec + 1, durationSec || r.start_sec + 60),
      title: r.title,
      source: r.source,
      confidence: r.confidence,
    }));
    setSaving(true);
    try {
      await studyApi.updateChapters(videoId, payload);
      showToast('챕터를 저장했습니다');
      onSaved?.();
      onClose?.();
    } catch (e) {
      showToast(e.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="챕터 편집"
      footer={
        <Button full onClick={handleSave} disabled={saving}>
          {saving ? '저장 중...' : '저장'}
        </Button>
      }
    >
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.5 }}>
        시간은 mm:ss 형식으로 입력하세요. 제목만 바꾼 챕터는 기존 요약·프레임·기술 태그가 그대로
        유지됩니다. 시간(경계)을 바꾼 챕터만 그 구간의 분석 결과가 초기화됩니다(다시 분석해야
        요약이 채워집니다). 저장한 챕터는 다시 분석해도(영상 전체 "재분석" 버튼) 제목이
        덮어써지지 않습니다.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, i) => (
          <div
            key={r.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 10px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 10,
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              disabled={i === 0}
              onClick={() => mergeWithAbove(i)}
              style={{ padding: '4px 8px', fontSize: 11, flexShrink: 0 }}
            >
              위와 병합
            </Button>
            <input
              type="text"
              defaultValue={fmtMmSs(r.start_sec)}
              onBlur={(e) => handleTimeBlur(i, e.target.value)}
              style={{
                width: 52, fontSize: 12, padding: '6px 4px', borderRadius: 6,
                border: '1px solid var(--border-med)', background: 'var(--surface-hi)',
                color: 'var(--text)', flexShrink: 0, textAlign: 'center',
              }}
            />
            <input
              type="text"
              value={r.title}
              onChange={(e) => updateRow(i, { title: e.target.value })}
              style={{
                flex: 1, minWidth: 0, fontSize: 13, padding: '6px 8px', borderRadius: 6,
                border: '1px solid var(--border-med)', background: 'var(--surface-hi)', color: 'var(--text)',
              }}
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}
