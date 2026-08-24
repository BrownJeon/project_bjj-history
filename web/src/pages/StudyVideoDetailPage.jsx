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

// 상세 페이지 — 플레이어 + 클릭 이동 목차. 적응형 폴링: 진행 중이면 5초 간격, 아니면 정지,
// document.hidden이면 정지.
export default function StudyVideoDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useUI();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const iframeRef = useRef(null);
  const pollTimerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const v = await studyApi.getVideo(id);
      setVideo(v);
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

  // iframe postMessage 이벤트로 시점 이동 — 외부 API 스크립트 로드 불필요
  function seekTo(sec) {
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

      {embed ? (
        <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
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
