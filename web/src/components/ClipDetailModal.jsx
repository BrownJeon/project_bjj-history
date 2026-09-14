import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as enhanceApi from '../api/enhanceMemo';
import * as clipsApi from '../api/clips';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';
import { getStorageMode } from '../pages/ProfilePage';
import {
  usageOf, fmtMD, MANUAL_KINDS, USAGE_KIND_LABEL, MASTERY_STEP_LABEL,
} from '../utils/clipUsage';
import { getPlatformIcon, getPlatformLabel } from '../utils/videoThumb';
import { downloadFrames as downloadFramesToDevice } from '../utils/download';
import Modal from './Modal';
import Button from './Button';
import Tag from './Tag';
import Icon from './Icon';
import VideoPlayer from './VideoPlayer';
import ClipRecommendSection from './ClipRecommendSection';

/**
 * 영상 상세 모달 — 참고영상·기술트리·기술연구·편집기·픽미업이 **모두 이 컴포넌트 하나**를 연다(task-036).
 * 진입점별 차이는 props 로만 준다. 이 화면을 복제한 변형 컴포넌트를 만들지 말 것.
 *
 * onEdit / onDelete 를 넘기지 않으면 해당 버튼이 숨겨집니다 (읽기 전용 모드).
 * countView = true  — false 면 열 때 👁 게시물 조회를 기록하지 않는다(픽미업: 카드 넘기며 여는 건 조회가 아니다).
 *                     사용 기록 섹션 표시·🥋 +1 동작은 그대로다.
 * actions   = null  — ReactNode. 있으면 시트 하단에 **스크롤과 무관하게 항상 보이는** 고정 영역으로 렌더
 *                     (픽미업의 픽하기 / 픽 취소). Modal.jsx 는 건드리지 않고 이 안에서 sticky 로 푼다.
 */
// "최근 3건" 한 줄용 짧은 라벨 — 412px 폭에서 `포지션 스파링` 3번이면 줄이 넘친다
const RECENT_LABEL = { drill: '드릴', position_spar: '포지션', spar: '스파링' };

function masteryToast(items, verb) {
  // 한 응답의 항목은 모두 같은 단계다(드릴 +1 → drilled, 포지션 스파링 +1 → position_spar)
  const step = MASTERY_STEP_LABEL[items[0].step] || items[0].step;
  return `숙련도 '${step}' 단계 ${verb} — ${items.map((x) => x.name).join(', ')}`;
}

export default function ClipDetailModal({
  c, onClose, onEdit, onDelete, onRefresh, analyzeJob, countView = true, actions = null,
}) {
  const { igCookieConfigured, reloadClips, reloadTechniques, clips } = useCache();

  // 연계 기술 AI 추천 캐시(task-036) — 기술트리(GET /api/techniques 의 clips[])·편집기 유사 영상(검색 API)이 넘기는
  // 객체에는 ai_recommendation 필드 자체가 없다. 그대로 두면 캐시가 있어도 "AI 추천 받기"만 보이므로
  // 필드가 **없을 때만** clips 캐시의 같은 영상에서 보충한다(null 은 "추천 없음"으로 존중).
  const recClip = useMemo(() => {
    if (!c || c.ai_recommendation !== undefined) return c;
    const cached = (clips || []).find((x) => x.id === c.id);
    return cached ? { ...c, ai_recommendation: cached.ai_recommendation } : c;
  }, [c, clips]);
  const { showToast } = useUI();

  // ── 사용 기록 (task-035) ───────────────────────────────────────────────
  // 🔴 표시값은 **서버 응답이 정본**이다. 부모가 넘긴 `c` 는 스냅샷이라(ClipsPage·TechPlanPage 의
  //    detail state) +1 한 뒤에도 옛 숫자를 들고 있다 — 첫 값으로만 쓰고 이후엔 응답으로 덮는다.
  const [usage, setUsage]         = useState(() => usageOf(c));
  const [lastLog, setLastLog]     = useState(null);   // 이 모달에서 방금 누른 수동 기록 {id, kind, used_on}
  const [usageBusy, setUsageBusy] = useState(false);
  const usageBusyRef = useRef(false);   // 연타 차단 — state 는 다음 렌더까지 안 바뀌어서 같은 틱의 두 번째 탭을 못 막는다
  const usageSeqRef  = useRef(0);       // 늦게 도착한 옛 응답(예: 마운트 때 보낸 view)이 새 숫자를 덮지 않게

  const refreshCaches = () => {
    // 목록 카드(clips 캐시)와 기술 카드·기술 상세(techniques 캐시)가 둘 다 usage 를 보여 준다
    reloadClips().catch((e) => console.warn('[clip-usage] 목록 갱신 실패', e.message));
    reloadTechniques().catch((e) => console.warn('[clip-usage] 기술 목록 갱신 실패', e.message));
  };

  // 👁 봤음 — 상세를 열면 자동 기록. 하루 1회 규칙은 **서버**가 지킨다(StrictMode 이중 effect 도 거기서 흡수).
  //    조회는 보조 신호라 실패해도 화면을 막지 않는다(console.warn 만).
  useEffect(() => {
    if (c?.id == null || !countView) return undefined;   // task-036: 픽미업은 조회로 세지 않는다
    const my = ++usageSeqRef.current;
    clipsApi.logUsage(c.id, 'view')
      .then((d) => {
        if (d?.usage && my === usageSeqRef.current) setUsage(usageOf({ usage: d.usage }));
        if (d?.created) refreshCaches();
      })
      .catch((e) => console.warn('[clip-usage] 봤음 기록 실패', e.message));
    return undefined;
  }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUse(kind) {
    if (usageBusyRef.current || c?.id == null) return;
    usageBusyRef.current = true; setUsageBusy(true);
    const my = ++usageSeqRef.current;
    try {
      const d = await clipsApi.logUsage(c.id, kind);
      if (d?.usage && my === usageSeqRef.current) setUsage(usageOf({ usage: d.usage }));
      if (d?.log) setLastLog(d.log);
      const checked = Array.isArray(d?.masteryChecked) ? d.masteryChecked : [];
      if (checked.length) showToast(masteryToast(checked, '체크됨'), 3500);
      else showToast(`${USAGE_KIND_LABEL[kind]} +1 기록했어요`);
      refreshCaches();
    } catch (e) {
      // 🔴 수동 기록 실패는 **반드시** 보여 준다 — 조용히 삼키면 사용자는 기록된 줄 안다(음성 업로드 유실과 같은 종류)
      showToast(`${USAGE_KIND_LABEL[kind]} 기록 실패 — ${e.message || '다시 시도해 주세요'}`, 4000);
    } finally {
      usageBusyRef.current = false; setUsageBusy(false);
    }
  }

  async function handleUndo() {
    if (!lastLog || usageBusyRef.current) return;
    usageBusyRef.current = true; setUsageBusy(true);
    const target = lastLog;
    const my = ++usageSeqRef.current;
    try {
      const d = await clipsApi.undoUsage(c.id, target.id);
      if (d?.usage && my === usageSeqRef.current) setUsage(usageOf({ usage: d.usage }));
      setLastLog(null);
      const unchecked = Array.isArray(d?.masteryUnchecked) ? d.masteryUnchecked : [];
      if (unchecked.length) showToast(masteryToast(unchecked, '해제됨'), 3500);
      else showToast(`${USAGE_KIND_LABEL[target.kind]} 기록을 취소했어요`);
      refreshCaches();
    } catch (e) {
      showToast(`취소 실패 — ${e.message || '다시 시도해 주세요'}`, 4000);
    } finally {
      usageBusyRef.current = false; setUsageBusy(false);
    }
  }

  const [analyzing, setAnalyzing]             = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzeStage, setAnalyzeStage]       = useState('');
  const [uploading, setUploading]           = useState(false);
  const [uploadPct, setUploadPct]           = useState(0);
  const [uploadDone, setUploadDone]         = useState(false); // 업로드 완료, 분석 대기 중

  const [localDesc, setLocalDesc]           = useState(c.description || '');
  const [localVideoFile, setLocalVideoFile] = useState(c.video_file || '');
  const [localFrames, setLocalFrames]       = useState(() => {
    const f = c.frames;
    if (!f) return [];
    if (Array.isArray(f)) return f;
    try { return JSON.parse(f); } catch { return []; }
  });

  const fileInputRef  = useRef(null);
  const prevJobRef    = useRef(null);
  const abortRef      = useRef(null);

  // 컴포넌트 언마운트(모달 닫기) 시 폴링 중단
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // 분석 완료 감지 — analyzeJob이 진행 중이었다가 사라지면 refresh
  useEffect(() => {
    const wasRunning = prevJobRef.current && prevJobRef.current.progress >= 0;
    const isDone     = !analyzeJob;
    if (wasRunning && isDone) {
      setUploadDone(false);
      onRefresh?.();
    }
    prevJobRef.current = analyzeJob || null;
  }, [analyzeJob]);

  // localFrames를 다운로드하는 헬퍼 (device 모드용)
  // 웹: 기존 그대로 400ms 간격 `<a download>` · 앱: 폰 Download/BJJ 에 순차 저장 후 결과 토스트(task-039 A-5)
  function downloadFrames(frameList, title) {
    downloadFramesToDevice(frameList, title, { notify: showToast });
  }

  async function handleAiAnalyze() {
    if (!/(youtube\.com|youtu\.be|instagram\.com)/.test(c.url || '')) {
      alert('YouTube 또는 Instagram URL만 AI 분석 가능합니다'); return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAnalyzing(true); setAnalyzeProgress(0); setAnalyzeStage('');
    const mode = getStorageMode();
    try {
      const clipId = mode === 'device' ? null : c.id;
      const res = await enhanceApi.analyzeVideo(c.url, clipId, (pct, stg) => { setAnalyzeProgress(pct); setAnalyzeStage(stg); }, 1200000, ctrl.signal);
      if (res.description) setLocalDesc(res.description);
      if (res.videoFile)   setLocalVideoFile(res.videoFile);
      if (res.frames?.length) {
        setLocalFrames(res.frames);
        if (mode === 'device') downloadFrames(res.frames, c.title);
      }
      await onRefresh?.();
    } catch (e) {
      if (enhanceApi.isAbortError(e)) {
        // 모달 닫기 또는 브라우저 닫기 — 백엔드 분석은 계속 진행됨
        return;
      }
      alert('AI 분석 실패: ' + e.message);
    } finally { setAnalyzing(false); }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;

    setUploading(true); setUploadPct(0);
    try {
      await clipsApi.uploadVideo(c.id, file, (evt) => {
        if (evt.total) setUploadPct(Math.round((evt.loaded / evt.total) * 100));
      });
      setUploading(false); setUploadDone(true);
      // 분석은 백그라운드 진행 — analyzeJob 폴링이 완료 시 onRefresh 호출
    } catch (err) {
      setUploading(false);
      alert('업로드 실패: ' + (err.message || err));
    }
  }

  // AI 분석 결과(localVideoFile, localFrames)를 반영한 clip 객체를 VideoPlayer에 전달
  const clipForPlayer = { ...c, video_file: localVideoFile, frames: localFrames };

  return (
    <Modal title={c.title} onClose={onClose}>
      {/* 영상 플레이어 (VideoPlayer 컴포넌트) */}
      <VideoPlayer clip={clipForPlayer} />

      {/* 태그 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {(c.tech_names?.length ? c.tech_names : (c.tech_name ? [c.tech_name] : [])).map((t, i) => (
          <Tag key={i} tone="accent">{t}</Tag>
        ))}
        {(c.positions || []).map((p, i) => (
          <Tag key={`pos-${i}`} tone="blue">{p}</Tag>
        ))}
        <Tag tone="purple">{getPlatformLabel(c.platform)}</Tag>
        {c.starred ? <Tag tone="amber">즐겨찾기</Tag> : null}
        {c.pinned ? <Tag tone="accent">📌 고정됨</Tag> : null}
        {(c.tags || []).map((t, i) => (
          <Tag key={`tag-${i}`} tone="neutral">{t}</Tag>
        ))}
      </div>

      {/* 설명 */}
      {localDesc && (
        <div style={{
          fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap',
          marginBottom: 12, padding: 10,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        }}>{localDesc}</div>
      )}

      {/* 원본 링크 */}
      {c.url && (
        <a href={c.url} target="_blank" rel="noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            color: 'var(--accent)', textDecoration: 'none',
            marginBottom: 12, fontSize: 13, fontWeight: 600,
          }}>
          <Icon name="link" size={14} color="var(--accent)" /> 원본 영상 열기
        </a>
      )}

      {/* 사용 기록 (task-035) — 👁 봤음(자동) / 🥋 써봤음(수동 +1) */}
      {c?.id != null && (
        <div style={{
          marginBottom: 12, padding: 10,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
            👁 게시물 조회 <b style={{ color: 'var(--text)' }}>{usage.view}회</b>
            {usage.last_viewed_on ? ` · 마지막 ${fmtMD(usage.last_viewed_on)}` : ''}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            🥋 기술사용 횟수
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            {MANUAL_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => handleUse(k)}
                disabled={usageBusy}
                aria-label={`${USAGE_KIND_LABEL[k]} +1 (지금 ${usage[k]}회)`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  minWidth: 0, padding: '8px 4px',
                  background: 'var(--accent-dim)', color: 'var(--accent)',
                  border: '1px solid var(--accent)', borderRadius: 10,
                  cursor: usageBusy ? 'not-allowed' : 'pointer', opacity: usageBusy ? 0.55 : 1,
                }}
              >
                <span style={{
                  fontSize: 12, fontWeight: 700, maxWidth: '100%',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{USAGE_KIND_LABEL[k]}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  {usage[k]}회 · <b style={{ color: 'var(--accent)' }}>+1</b>
                </span>
              </button>
            ))}
          </div>
          <div style={{
            fontSize: 11, color: usage.recent.length ? 'var(--text3)' : 'var(--amber)', marginTop: 8,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {usage.recent.length
              ? `최근 ${usage.recent.map((r) => `${fmtMD(r.used_on)} ${RECENT_LABEL[r.kind] || r.kind}`).join(' · ')}`
              : '아직 안 써봄'}
          </div>
          {lastLog && (
            <button
              type="button"
              onClick={handleUndo}
              disabled={usageBusy}
              style={{
                marginTop: 8, padding: 0, background: 'transparent', border: 'none',
                color: 'var(--red)', fontSize: 12, fontWeight: 600, textDecoration: 'underline',
                cursor: usageBusy ? 'not-allowed' : 'pointer', opacity: usageBusy ? 0.55 : 1,
              }}
            >
              방금 기록 취소 ({USAGE_KIND_LABEL[lastLog.kind]} {fmtMD(lastLog.used_on)})
            </button>
          )}
        </div>
      )}

      {/* AI 분석 버튼 영역 */}
      {(() => {
        const bgRunning   = (analyzeJob && analyzeJob.progress >= 0) || uploadDone;
        const anyBusy     = analyzing || uploading || bgRunning;
        const isInstagram = /instagram\.com/.test(c.url || '');

        const uploadBtnLabel = uploading
          ? `📤 업로드 중... ${uploadPct}%`
          : bgRunning ? null : '📁 파일로 분석';

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, marginBottom: 4 }}>
            {/* 파일 업로드 버튼 — Instagram은 우선 표시, 나머지는 보조 */}
            <input ref={fileInputRef} type="file" accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
              style={{ display: 'none' }} onChange={handleFileUpload} />

            {isInstagram ? (
              <>
                {/* 쿠키 있으면 URL 분석 우선, 없으면 파일 업로드 우선 */}
                {igCookieConfigured ? (
                  <button onClick={handleAiAnalyze} disabled={anyBusy} style={{
                    width: '100%', padding: '10px 0',
                    background: anyBusy ? 'var(--surface-up)' : 'var(--purple-dim)',
                    color: anyBusy ? 'var(--text2)' : 'var(--purple)',
                    border: `1px solid ${anyBusy ? 'var(--border)' : 'var(--purple)'}`,
                    borderRadius: 10, fontSize: 13, fontWeight: 700,
                    cursor: anyBusy ? 'not-allowed' : 'pointer',
                  }}>
                    {bgRunning
                      ? `🔄 ${analyzeJob?.stage || '분석 중'} ${analyzeJob?.progress ?? ''}%`
                      : analyzing ? `✨ ${analyzeStage || 'AI 분석 중'} ${analyzeProgress}%` : '✨ URL로 AI 분석 (쿠키 인증)'}
                  </button>
                ) : (
                  <button
                    onClick={() => !anyBusy && fileInputRef.current?.click()}
                    disabled={anyBusy}
                    style={{
                      width: '100%', padding: '10px 0',
                      background: anyBusy ? 'var(--surface-up)' : 'var(--accent-dim)',
                      color: anyBusy ? 'var(--text2)' : 'var(--accent)',
                      border: `1px solid ${anyBusy ? 'var(--border)' : 'var(--accent)'}`,
                      borderRadius: 10, fontSize: 13, fontWeight: 700,
                      cursor: anyBusy ? 'not-allowed' : 'pointer',
                    }}>
                    {uploading ? uploadBtnLabel : bgRunning
                      ? `🔄 ${analyzeJob?.stage || '분석 중'} ${analyzeJob?.progress ?? ''}%`
                      : '📁 파일로 AI 분석 (Instagram 권장)'}
                  </button>
                )}
                {!anyBusy && (
                  igCookieConfigured ? (
                    <button onClick={() => fileInputRef.current?.click()} style={{
                      width: '100%', padding: '8px 0',
                      background: 'var(--surface-up)', color: 'var(--text2)',
                      border: '1px solid var(--border)', borderRadius: 10,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>📁 파일로 분석 (로컬 영상)</button>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '4px 0' }}>
                      쿠키 인증 시 URL 분석 가능 — 프로필 &gt; Instagram 쿠키 설정
                    </div>
                  )
                )}
              </>
            ) : (
              <>
                <button onClick={handleAiAnalyze} disabled={anyBusy} style={{
                  width: '100%', padding: '10px 0',
                  background: anyBusy ? 'var(--surface-up)' : 'var(--purple-dim)',
                  color: anyBusy ? 'var(--text2)' : 'var(--purple)',
                  border: `1px solid ${anyBusy ? 'var(--border)' : 'var(--purple)'}`,
                  borderRadius: 10, fontSize: 13, fontWeight: 700,
                  cursor: anyBusy ? 'not-allowed' : 'pointer',
                }}>
                  {bgRunning
                    ? `🔄 ${analyzeJob?.stage || '분석 중'} ${analyzeJob?.progress ?? ''}%`
                    : analyzing ? `✨ ${analyzeStage || 'AI 분석 중'} ${analyzeProgress}%` : '✨ URL로 AI 분석 (캡처 저장)'}
                </button>
                {!anyBusy && (
                  <button onClick={() => fileInputRef.current?.click()} style={{
                    width: '100%', padding: '8px 0',
                    background: 'var(--surface-up)', color: 'var(--text2)',
                    border: '1px solid var(--border)', borderRadius: 10,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>
                    📁 파일로 분석 (로컬 영상)
                  </button>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* AI 분석 진행 상태 바 */}
      {((analyzeJob && analyzeJob.progress >= 0) || uploadDone || analyzing) && (
        <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--surface-up)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>
              {(analyzeJob && analyzeJob.progress >= 0) || uploadDone
                ? (analyzeJob?.stage || '분석 준비 중...')
                : (analyzeStage || 'AI 분석 준비 중...')}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
              {analyzeJob && analyzeJob.progress >= 0
                ? `${analyzeJob.progress}%`
                : analyzing
                ? `${analyzeProgress}%`
                : ''}
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: analyzeJob && analyzeJob.progress >= 0
                ? `${analyzeJob.progress}%`
                : analyzing
                ? `${analyzeProgress}%`
                : '5%',
              background: 'var(--accent)', borderRadius: 2, transition: 'width 0.6s ease',
            }} />
          </div>
        </div>
      )}

      {/* 연계 기술 AI 추천 (task-036) — AI 분석 아래, 수정/삭제 위 */}
      <ClipRecommendSection clip={recClip} />

      {/* 수정/삭제 버튼 (onEdit/onDelete 없으면 숨김) */}
      {(onEdit || onDelete) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {onEdit   && <Button variant="outline" size="sm" onClick={onEdit}>수정</Button>}
          {onDelete && <Button variant="danger" size="sm" onClick={onDelete} style={{ marginLeft: 'auto' }}>삭제</Button>}
        </div>
      )}

      {/* 하단 고정 액션 (task-036) — Modal 시트(.bjj-modal-sheet)가 스크롤 컨테이너라 position:sticky 로
          스크롤 위치와 상관없이 시트 아래쪽에 붙인다. 🔴 bottom 이 0 이면 Chrome 이 시트 padding-bottom(30px)만큼
          위에 멈춰 그 틈으로 내용이 비친다(실측) → bottom:-30. 좌우·아래 음수 여백으로 시트 padding(20/20/30)까지
          배경을 채운다. Modal.jsx 의 footer 는 스크롤 안에 있어 쓰지 않았다(다른 화면 footer 동작 무변경). */}
      {actions && (
        <div
          data-testid="clip-detail-actions"
          style={{
            position: 'sticky', bottom: -30, zIndex: 2,
            margin: '12px -20px -30px',
            padding: '12px 20px calc(12px + env(safe-area-inset-bottom, 0px))',
            background: 'var(--surface-up)',
            borderTop: '1px solid var(--border)',
          }}
        >
          {actions}
        </div>
      )}
    </Modal>
  );
}
