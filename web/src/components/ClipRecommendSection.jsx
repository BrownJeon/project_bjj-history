import React, { useState, useEffect, useRef } from 'react';
import * as clipsApi from '../api/clips';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';

/**
 * 연계 기술 AI 추천 섹션 (task-036) — ClipDetailModal 이 렌더한다.
 * 참고영상·기술트리·기술연구·편집기·픽미업 어디서 상세를 열어도 같은 섹션이 보인다.
 *
 * 표시 모양은 **서버 계약 그대로** (backend/src/utils/clipRecommend.js):
 *   { techniques: [{ name, reason }], combos: [{ title, steps: string[] }] }
 * 🔴 옛 PickDetailPanel 이 읽던 description / combinations / sequence / note 는 서버가 만든 적 없는 키다.
 *
 * Props:
 *   clip  VideoClip 객체(필수) — `id`, `ai_recommendation`(GET /api/clips 가 주는 JSON 문자열)
 */

// 진행률은 서버가 알려 주지 않는다(Claude 한 번 호출). 기다리는 동안 단계 문구만 보여 준다.
const PROGRESS_STEPS = [
  [1000, 15, 'Claude AI 연결 중...'],
  [2800, 32, 'BJJ 기술 패턴 분석 중...'],
  [5500, 52, '연계 기술 탐색 중...'],
  [8500, 68, '콤비네이션 설계 중...'],
  [12500, 83, '결과 정리 중...'],
  [18000, 92, '최종 검토 중...'],
];

/** 화면 방어용 모양 맞추기 — 서버가 이미 정규화하지만 캐시 문자열이 이상해도 섹션이 깨지지 않게. */
export function toRecommendation(value) {
  if (!value) return null;
  let obj = value;
  if (typeof value === 'string') {
    try { obj = JSON.parse(value); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const text = (v) => (typeof v === 'string' ? v : '');
  const techniques = (Array.isArray(obj.techniques) ? obj.techniques : [])
    .filter((t) => t && typeof t === 'object' && text(t.name))
    .map((t) => ({ name: text(t.name), reason: text(t.reason) }));
  const combos = (Array.isArray(obj.combos) ? obj.combos : [])
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({ title: text(x.title), steps: (Array.isArray(x.steps) ? x.steps : []).filter((s) => typeof s === 'string' && s) }))
    .filter((x) => x.title || x.steps.length);
  if (!techniques.length && !combos.length) return null;
  return { techniques, combos };
}

const sectionLabel = { fontSize: 12, color: 'var(--text2)', fontWeight: 600, marginBottom: 6 };

export default function ClipRecommendSection({ clip }) {
  const c = clip;
  const { reloadClips } = useCache();
  const { showToast } = useUI();

  const [recommendation, setRecommendation] = useState(() => toRecommendation(c?.ai_recommendation));
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, message: '' });
  const timerIdsRef = useRef([]);
  const seqRef = useRef(0);        // 영상이 바뀌었거나 닫힌 뒤 늦게 도착한 응답은 버린다
  const busyRef = useRef(false);   // 같은 틱의 연타 차단 — state 는 다음 렌더까지 안 바뀐다(task-035 와 같은 이유)

  function clearProgressTimers() {
    timerIdsRef.current.forEach((id) => clearTimeout(id));
    timerIdsRef.current = [];
  }

  // 영상이 바뀌면 그 영상의 캐시로 다시 시작
  useEffect(() => {
    seqRef.current += 1;
    busyRef.current = false;
    clearProgressTimers();
    setLoading(false);
    setProgress({ percent: 0, message: '' });
    setRecommendation(toRecommendation(c?.ai_recommendation));
  }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 언마운트(모달 닫기) — 진행 타이머 정리 + 진행 중 응답 무시
  useEffect(() => () => { seqRef.current += 1; clearProgressTimers(); }, []);

  async function handleRecommend(refresh) {
    if (c?.id == null || busyRef.current) return;
    busyRef.current = true;
    const my = ++seqRef.current;
    const previous = recommendation;
    clearProgressTimers();
    setRecommendation(null);
    setLoading(true);
    setProgress({ percent: 5, message: 'AI 분석 준비 중...' });
    PROGRESS_STEPS.forEach(([delay, percent, message]) => {
      timerIdsRef.current.push(setTimeout(() => {
        if (my === seqRef.current) setProgress({ percent, message });
      }, delay));
    });

    try {
      const result = await clipsApi.recommendClip(c.id, { refresh });
      if (my !== seqRef.current) return;
      clearProgressTimers();
      const rec = toRecommendation(result);
      if (!rec) throw new Error('추천 결과가 비어 있습니다');
      setRecommendation(rec);
      // 닫았다 다시 열어도(참고영상·픽미업 모두 clips 캐시에서 연다) 방금 결과가 바로 보이게
      reloadClips().catch((e) => console.warn('[clip-recommend] 목록 갱신 실패', e.message));
    } catch (e) {
      if (my !== seqRef.current) return;
      clearProgressTimers();
      setProgress({ percent: 0, message: '' });
      // 서버는 실패하면 저장하지 않는다 → 다시 추천이 실패했으면 이전 결과가 여전히 서버 캐시다
      setRecommendation(previous);
      // 🔴 alert 대신 toast — 조용히 삼키지 않는다(task-035 와 같은 방식)
      showToast(`AI 추천 실패 — ${e.message || '다시 시도해 주세요'}`, 4000);
    } finally {
      if (my === seqRef.current) { busyRef.current = false; setLoading(false); }
    }
  }

  if (c?.id == null) return null;

  return (
    <div
      data-testid="clip-recommend"
      style={{
        marginTop: 12, padding: 10,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
        🤖 연계 기술 AI 추천
      </div>

      {!recommendation && (
        <button
          type="button"
          onClick={() => handleRecommend(false)}
          disabled={loading}
          style={{
            width: '100%', padding: '10px 0',
            background: loading ? 'var(--surface-up)' : 'var(--purple-dim)',
            color: loading ? 'var(--text2)' : 'var(--purple)',
            border: `1px solid ${loading ? 'var(--border)' : 'var(--purple)'}`,
            borderRadius: 10, fontSize: 13, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '🤖 AI 추천 중...' : '🤖 AI 추천 받기'}
        </button>
      )}

      {loading && (
        <div style={{ padding: '8px 0 2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{progress.message}</span>
            <span style={{ fontSize: 12, color: 'var(--purple)', fontWeight: 700 }}>{progress.percent}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progress.percent}%`,
              background: 'var(--purple)', borderRadius: 2, transition: 'width 0.6s ease',
            }} />
          </div>
        </div>
      )}

      {recommendation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recommendation.techniques.length > 0 && (
            <div>
              <div style={sectionLabel}>📌 연계 기술</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recommendation.techniques.map((t, i) => (
                  <div key={i} style={{
                    background: 'var(--surface-up)', borderRadius: 8, padding: '8px 10px',
                    border: '1px solid var(--border)', minWidth: 0,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflowWrap: 'anywhere' }}>{t.name}</div>
                    {t.reason && (
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        {t.reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {recommendation.combos.length > 0 && (
            <div>
              <div style={sectionLabel}>🔗 콤비네이션</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recommendation.combos.map((combo, i) => (
                  <div key={i} style={{
                    background: 'var(--accent-dim)', borderRadius: 8, padding: '8px 10px',
                    border: '1px solid var(--accent-glow)', minWidth: 0,
                  }}>
                    {combo.title && (
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', overflowWrap: 'anywhere' }}>{combo.title}</div>
                    )}
                    {combo.steps.length > 0 && (
                      <ol style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
                        {combo.steps.map((s, j) => (
                          <li key={j} style={{ overflowWrap: 'anywhere' }}>{s}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => handleRecommend(true)}
            disabled={loading}
            style={{
              padding: '8px 0',
              background: 'var(--surface-up)', color: 'var(--text2)',
              border: '1px solid var(--border)', borderRadius: 8,
              fontSize: 12, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            🔄 다시 추천
          </button>
        </div>
      )}
    </div>
  );
}
