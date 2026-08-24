import client from './client';

// 긴 영상(강의·세미나·스파링) 분석 — task-007 Phase 1

export const listVideos = () => client.get('/long-videos').then(r => r.data);

export const getStatus = () => client.get('/long-videos/status').then(r => r.data);

export const getVideo = (id) => client.get(`/long-videos/${id}`).then(r => r.data);

export const registerVideo = (url, kind) =>
  client.post('/long-videos', { url, kind }).then(r => r.data);

export const updateChapters = (id, chapters) =>
  client.patch(`/long-videos/${id}/chapters`, { chapters }).then(r => r.data);

export const reanalyze = (id) => client.post(`/long-videos/${id}/reanalyze`).then(r => r.data);

export const cancelJob = (id) => client.post(`/long-videos/${id}/cancel`).then(r => r.data);

export const deleteVideo = (id) => client.delete(`/long-videos/${id}`).then(r => r.data);

// body: {} 이면 기존 매칭(exact/alias/fuzzy)으로 연동, { technique_id } 를 넘기면 그 기술로
// 연동한다(match_type='none' 항목을 "새 기술로 추가" 후 연동할 때 사용 — task-009 Phase 3)
export const applyTechnique = (id, tid, body = {}) =>
  client.post(`/long-videos/${id}/techniques/${tid}/apply`, body).then(r => r.data);
