import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUI } from '../contexts/UIContext';
import * as studyApi from '../api/studyVideos';
import Card from '../components/Card';
import Icon from '../components/Icon';
import Button from '../components/Button';
import StudyChapterCard from '../components/StudyChapterCard';
import StudyProgressPanel from '../components/StudyProgressPanel';
import ChapterEditor from '../components/ChapterEditor';
import { getYtEmbed } from '../utils/videoThumb';

function isActiveJob(job) {
  return !!job && (job.status === 'queued' || job.status === 'running');
}

// task-013 버그 B: activeChapterId는 챕터 DB id인데, ChapterEditor로 경계를 바꾸면 그 행은 지워지고
// 새 id로 다시 생기므로(longVideos.js의 keepId:null 경로) 재조회 후 유령 id가 남아 하이라이트가
// 조용히 사라졌다. 단순 null 초기화는 상태 정합성만 맞추고 증상은 그대로라서, 마지막으로 이동한
// 재생 지점(초)을 기준으로 "지금 그 지점을 담고 있는 챕터"로 하이라이트를 따라가게 한다.
//   - 기존 id가 아직 살아 있으면 그대로 둔다(경계가 그대로일 때만 id가 유지되므로 지점도 그 안이다)
//   - 없으면 seek 지점을 포함하는 챕터로 옮기고, 그런 챕터도 없으면 null (유령 id는 남기지 않는다)
function resolveActiveChapterId(chapters, seekSec, prevId) {
  const list = Array.isArray(chapters) ? chapters : [];
  if (prevId != null && list.some(c => c.id === prevId)) return prevId;
  if (seekSec == null) return null;
  const hit = list.find(c => seekSec >= c.start_sec && seekSec < c.end_sec);
  return hit?.id ?? null;
}

// 상세 페이지 — 플레이어 + 클릭 이동 목차. 적응형 폴링: 진행 중이면 5초 간격, 아니면 정지,
// document.hidden이면 정지.
export default function StudyVideoDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useUI();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState(null); // task-010 A: 방금 클릭한 챕터 하이라이트
  const iframeRef = useRef(null);
  const pollTimerRef = useRef(null);
  const lastSeekSecRef = useRef(null); // task-013 버그 B: 마지막으로 이동한 재생 지점(초)
  // task-048: 서버 보관 영상(video_path) 재생. 플레이어는 이 영상(id)을 처음 불러올 때 한 번 정한다 —
  // 첫 분석 도중 상세를 보고 있으면 S3.5 가 끝나는 순간 video_path 가 생기는데, 그때 iframe 을 <video> 로
  // 갈아 끼우면 보던 유튜브 재생이 끊긴다. 그래서 iframe → <video> 전환은 다음 진입부터, <video> → iframe
  // 전환(onError 폴백)은 즉시. id 별로 기록하므로 다른 영상으로 바뀌면 자연히 다시 정한다.
  const [playerPick, setPlayerPick] = useState({ id: null, mode: null }); // mode: 'local' | 'yt'
  const videoRef = useRef(null);
  const pendingSeekRef = useRef(null); // 메타데이터 로드 전(readyState 0)에 들어온 이동 지점(초)

  useEffect(() => { pendingSeekRef.current = null; }, [id]);

  // task-049: 저장본 <video> 의 poster(목록과 같은 썸네일)는 재생 전에만 칸을 꽉 채우고(cover), 재생이 시작되거나
  // seek 이 끝나 poster 가 사라지고 영상 프레임이 보이면(onPlay·onSeeked) 영상 본래 비율(contain)로 돌아간다.
  // 그 <video> 를 영상 id + 재생 주소 키로 기억하므로 영상이나 주소가 바뀌면 키가 달라져 자연히 처음 상태(cover)가 되고,
  // id 가 바뀔 때는 아래 effect 가 기록을 지워 A → B → A 로 돌아와도 이전 값이 남지 않는다. 일시정지해도 되돌리지 않는다.
  const [startedKey, setStartedKey] = useState(null);
  useEffect(() => { setStartedKey(null); }, [id]);

  // task-049: poster 는 썸네일을 new Image() 로 먼저 불러 **로드에 성공했을 때만** 붙인다. 유튜브에서 영상이 지워져 썸네일이
  // 404 가 되면, 깨진 poster 가 붙은 <video> 는 첫 프레임 대신 칸 전체가 검게 남기 때문이다(poster 속성이 없을 때만 첫 프레임이 보인다).
  // 성공한 URL 을 기억해 두고 현재 thumb_url 과 같을 때만 쓰므로, 영상(id)이나 thumb_url 이 바뀌면 옛 성공 기록은 쓰이지 않는다.
  const [posterReady, setPosterReady] = useState(null);
  const thumbUrl = video?.thumb_url || null;
  useEffect(() => {
    setPosterReady(null);
    if (!thumbUrl) return undefined;
    let alive = true;
    const img = new Image();
    img.onload = () => { if (alive) setPosterReady(thumbUrl); };
    img.onerror = () => { if (alive) setPosterReady(null); };
    img.src = thumbUrl;
    return () => { alive = false; img.onload = null; img.onerror = null; };
  }, [id, thumbUrl]);

  const load = useCallback(async () => {
    try {
      const v = await studyApi.getVideo(id);
      setVideo(v);
      setPlayerPick(prev => (prev.id === id ? prev : { id, mode: v?.video_path ? 'local' : 'yt' }));
      // task-013 버그 B: 챕터 편집/재분석으로 id가 새로 발급됐을 수 있으므로 재조회 때마다
      // 하이라이트를 다시 해석한다(유령 id 방지 + 보던 지점으로 하이라이트 이동)
      setActiveChapterId(prev => resolveActiveChapterId(v?.chapters, lastSeekSecRef.current, prev));
      return v;
    } catch (e) {
      console.error(e);
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (cancelled || document.hidden) return;
      const v = await load();
      if (cancelled || !v) return;
      if (isActiveJob(v.job) && !document.hidden) {
        pollTimerRef.current = setTimeout(tick, 5000);
      }
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

  // iframe postMessage 이벤트로 시점 이동 — 외부 API 스크립트 로드 불필요.
  // task-010 A: chapterId를 함께 받아 activeChapterId를 갱신 — 시간라벨/프레임썸네일 클릭
  // 둘 다 같은 챕터 소속이므로 동일하게 하이라이트된다(StudyChapterCard.jsx가 두 지점 모두 전달).
  function seekTo(sec, chapterId) {
    if (Number.isFinite(sec)) lastSeekSecRef.current = sec; // task-013 버그 B: 지점 기억
    if (chapterId != null) setActiveChapterId(chapterId);
    // task-048: 서버 보관 영상이면 <video> 를 직접 옮긴다. 메타데이터 전(readyState 0)이면 지점만 맡겨 두고
    // loadedmetadata 에서 적용한다 — play() 가 로드를 시작시킨다. 아래 iframe 경로는 그대로다.
    const videoEl = videoRef.current;
    if (videoEl) {
      if (!Number.isFinite(sec)) return;
      if (videoEl.readyState >= 1) {
        try { videoEl.currentTime = sec; } catch { /* ignore */ }
      } else {
        pendingSeekRef.current = sec;
      }
      const p = videoEl.play?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return;
    }
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    try {
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [sec, true] }), '*');
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
    } catch { /* ignore */ }
  }

  async function handleReanalyze() {
    try {
      await studyApi.reanalyze(id);
      showToast('재분석을 시작합니다');
      load();
    } catch (e) {
      showToast(e.message || '재분석 실패');
    }
  }

  async function handleCancel() {
    try {
      await studyApi.cancelJob(id);
      showToast('취소했습니다');
      load();
    } catch (e) {
      showToast(e.message || '취소 실패');
    }
  }

  async function handleDelete() {
    if (!window.confirm('이 영상 분석 결과를 삭제할까요?')) return;
    try {
      await studyApi.deleteVideo(id);
      showToast('삭제했습니다');
      navigate('/study');
    } catch (e) {
      showToast(e.message || '삭제 실패');
    }
  }

  if (loading) return <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>불러오는 중...</div>;
  if (!video) return <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>영상을 찾을 수 없습니다</div>;

  const job = video.job;
  const active = isActiveJob(job);
  const embed = getYtEmbed(video.url, { jsapi: true });
  const localSrc = playerPick.id === id && playerPick.mode === 'local' ? (video.video_path || null) : null;
  // task-049: 선로딩에 성공한 poster 가 있고 아직 재생이 시작되지 않은 동안만 cover. poster 가 없으면(thumb_url 없음·로드 실패·로딩 중)
  // 지금(task-048)과 같은 모양(contain 기본값 — 첫 프레임)을 유지한다.
  const playerKey = localSrc ? `${id}|${localSrc}` : null;
  const started = playerKey != null && startedKey === playerKey;
  const posterUrl = thumbUrl && posterReady === thumbUrl ? thumbUrl : undefined;

  // task-048: 보관 영상을 못 불러오면(옛 영상·NAS 장애·파일 없음) 이 영상은 유튜브 iframe 으로 돌아간다
  function handleLocalError() {
    pendingSeekRef.current = null;
    setPlayerPick({ id, mode: 'yt' });
  }

  function handleLocalMetadata(e) {
    const sec = pendingSeekRef.current;
    pendingSeekRef.current = null;
    if (sec != null) {
      try { e.currentTarget.currentTime = sec; } catch { /* ignore */ }
    }
  }

  return (
    <div className="page-fade">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div onClick={() => navigate('/study')} style={{ cursor: 'pointer', padding: 4 }}>
          <Icon name="chevL" size={20} />
        </div>
        <div style={{
          fontSize: 18, fontWeight: 800, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {video.title || '영상 분석'}
        </div>
      </div>

      {localSrc ? (
        <div style={{
          width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden', marginBottom: 12,
          position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg)',
        }}>
          <video
            ref={videoRef}
            src={localSrc}
            controls
            playsInline
            preload="metadata"
            poster={posterUrl}
            onPlay={() => setStartedKey(playerKey)}
            onSeeked={() => setStartedKey(playerKey)}
            onLoadedMetadata={handleLocalMetadata}
            onError={handleLocalError}
            style={{
              width: '100%', height: '100%', display: 'block', background: '#000',
              objectFit: posterUrl && !started ? 'cover' : 'contain',
            }}
          />
        </div>
      ) : embed ? (
        <div style={{
          width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden', marginBottom: 12,
          position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg)',
        }}>
          <iframe
            ref={iframeRef}
            src={embed}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div style={{
          width: '100%', aspectRatio: '16/9', borderRadius: 10, background: 'var(--surface)',
          border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 12,
          position: 'sticky', top: 0, zIndex: 5,
        }}>
          <span style={{ color: 'var(--text3)', fontSize: 12 }}>재생할 수 없는 URL입니다</span>
        </div>
      )}

      {active && <StudyProgressPanel job={job} chapters={video.chapters || []} />}

      {!active && video.status === 'error' && video.error && (
        <Card style={{ marginBottom: 12, borderColor: 'var(--red)' }}>
          <div style={{ fontSize: 12, color: 'var(--red)' }}>{video.error}</div>
        </Card>
      )}
      {!active && video.status === 'done' && video.error && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--amber)' }}>{video.error}</div>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {active ? (
          <Button variant="outline" size="sm" onClick={handleCancel}>분석 취소</Button>
        ) : (
          <Button variant="outline" size="sm" onClick={handleReanalyze}>재분석</Button>
        )}
        {!active && (video.chapters || []).length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}>챕터 편집</Button>
        )}
        <Button variant="danger" size="sm" onClick={handleDelete}>삭제</Button>
      </div>

      {/* S9 종합(reduce) 출력 — 챕터 분석이 끝나야 채워짐 */}
      {video.summary && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>전체 요약</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, marginBottom: video.key_points?.length ? 8 : 0 }}>
            {video.summary}
          </div>
          {video.key_points?.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text2)' }}>
              {video.key_points.map((k, i) => <li key={i} style={{ marginBottom: 2 }}>{k}</li>)}
            </ul>
          )}
        </Card>
      )}

      {(video.chapters || []).length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 20, fontSize: 13 }}>
          아직 목차가 없습니다
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {video.chapters.map(c => (
            <StudyChapterCard
              key={c.id ?? c.idx}
              chapter={c}
              techniques={(video.techniques || []).filter(t => t.chapter_id === c.id)}
              videoId={id}
              onSeek={seekTo}
              onChanged={load}
              active={c.id != null && c.id === activeChapterId}
            />
          ))}
        </div>
      )}

      <ChapterEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        chapters={video.chapters || []}
        durationSec={video.duration_sec}
        videoId={id}
        onSaved={load}
      />
    </div>
  );
}
