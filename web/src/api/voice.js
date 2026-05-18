import client from './client';

// 음성 파일 업로드 + 분석 잡 시작 (classId 필수)
// Content-Type 헤더를 직접 지정하지 않음 — axios가 FormData를 감지해 boundary 포함 헤더 자동 설정
export const startAnalyze = (formData) =>
  client.post('/voice/analyze', formData, { timeout: 1800000 }).then(r => r.data);

// 단일 잡 상태 조회
export const getJob = (jobId) =>
  client.get(`/voice/jobs/${jobId}`).then(r => r.data);

// 전체 잡 목록 (캘린더 배지용)
export const listJobs = () =>
  client.get('/voice/jobs').then(r => r.data);
