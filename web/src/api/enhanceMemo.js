import client from './client';
export const enhanceMemo  = (data) => client.post('/enhance-memo/enhance', data).then(r => r.data);
export const searchVideos = (text) => client.post('/enhance-memo/videos', { text }).then(r => r.data);

// 영상 분석 — 비동기 작업 시작 + 폴링
export const startAnalyzeVideo = (url, clipId) =>
  client.post('/enhance-memo/analyze-video', { url, clipId: clipId || null }).then(r => r.data);
export const getAnalyzeJob = (jobId) =>
  client.get(`/enhance-memo/analyze-video/${jobId}`).then(r => r.data);

/**
 * 영상 분석 — 시작 + 폴링으로 결과 대기.
 * @param {string} url
 * @param {number|null} clipId  저장된 영상의 ID (있으면 프레임 영구 저장)
 * @param {(progress:number, stage:string)=>void} onProgress
 * @param {number} timeoutMs  최대 대기 시간 (기본 20분)
 */
export async function analyzeVideo(url, clipId, onProgress, timeoutMs = 1200000) {
  const { jobId } = await startAnalyzeVideo(url, clipId);
  const start = Date.now();
  while (true) {
    await new Promise(r => setTimeout(r, 4000));
    const job = await getAnalyzeJob(jobId);
    onProgress?.(job.progress ?? 0, job.stage ?? '');
    if (job.status === 'done')  return { description: job.description, method: job.method, frames: job.frames || [], videoFile: job.videoFile || null };
    if (job.status === 'error') throw new Error(job.error || 'AI 분석 실패');
    if (Date.now() - start > timeoutMs) throw new Error('AI 분석 시간 초과 (20분)');
  }
}
