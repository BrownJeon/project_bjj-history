import client from './client';
export const enhanceMemo  = (data) => client.post('/enhance-memo/enhance', data).then(r => r.data);
export const searchVideos = (text) => client.post('/enhance-memo/videos', { text }).then(r => r.data);

// 영상 분석 — 비동기 작업 시작 + 폴링
export const startAnalyzeVideo = (url, clipId) =>
  client.post('/enhance-memo/analyze-video', { url, clipId: clipId || null }).then(r => r.data);
export const getAnalyzeJob = (jobId, signal) =>
  client.get(`/enhance-memo/analyze-video/${jobId}`, { signal }).then(r => r.data);

// AbortController 수동 취소 여부 판별
export function isAbortError(e) {
  return (
    e?.name === 'AbortError' ||
    e?.code === 'ERR_CANCELED' ||
    e?.message === 'canceled' ||
    e?.message === 'interrupted'
  );
}

/**
 * 영상 분석 — 시작 + 폴링으로 결과 대기.
 *
 * POST(job 생성) 실패 → 그대로 throw (백엔드 미도달, 진짜 에러)
 * GET(폴링) 중 ERR_NETWORK/ERR_CANCELED → AbortError로 변환하여 throw
 *   이유: 브라우저 닫기로 in-flight 요청이 끊겨도 백엔드 분석은 계속 실행됨
 *
 * @param {string} url
 * @param {number|null} clipId  저장된 영상의 ID (있으면 프레임 영구 저장)
 * @param {(progress:number, stage:string)=>void} onProgress
 * @param {number} timeoutMs  최대 대기 시간 (기본 20분)
 * @param {AbortSignal} [signal]  외부에서 폴링을 취소할 때 사용
 */
export async function analyzeVideo(url, clipId, onProgress, timeoutMs = 1200000, signal) {
  // POST 실패는 진짜 에러로 전파 (job이 만들어지지 않음)
  const { jobId } = await startAnalyzeVideo(url, clipId);

  const start = Date.now();
  const INTERRUPTED = Object.assign(new Error('interrupted'), { name: 'AbortError' });

  while (true) {
    await new Promise(r => setTimeout(r, 4000));
    if (signal?.aborted) throw INTERRUPTED;

    let job;
    try {
      job = await getAnalyzeJob(jobId, signal);
    } catch (e) {
      // 폴링 중 끊김(브라우저 닫기, 모달 닫기, 일시적 네트워크 끊김) →
      // 백엔드 분석은 계속 실행 중이므로 AbortError로 변환
      throw INTERRUPTED;
    }

    onProgress?.(job.progress ?? 0, job.stage ?? '');
    if (job.status === 'done')  return { description: job.description, method: job.method, frames: job.frames || [], videoFile: job.videoFile || null };
    if (job.status === 'error') throw new Error(job.error || 'AI 분석 실패');
    if (Date.now() - start > timeoutMs) throw new Error('AI 분석 시간 초과 (20분)');
  }
}
