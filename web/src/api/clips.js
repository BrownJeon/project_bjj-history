import client from './client';

export const listClips     = () => client.get('/clips').then(r => r.data);
export const searchClips   = (q, techName) => client.get('/clips/search', { params: { q, tech_name: techName } }).then(r => r.data);
export const createClip    = (data) => client.post('/clips', data).then(r => r.data);
export const updateClip    = (id, data) => client.put(`/clips/${id}`, data).then(r => r.data);
export const deleteClip    = (id) => client.delete(`/clips/${id}`).then(r => r.data);
export const toggleStar    = (id) => client.patch(`/clips/${id}/star`).then(r => r.data);
export const togglePin     = (id) => client.patch(`/clips/${id}/pin`).then(r => r.data);
export const refreshThumb     = (id) => client.post(`/clips/${id}/refresh-thumb`).then(r => r.data);
export const getAnalyzeStatus = ()   => client.get('/clips/analyze-status').then(r => r.data);

// 참고영상 사용 기록 (task-035, backend/src/routes/clips.js)
// kind: 'view'(자동·하루 1회) | 'drill' | 'position_spar' | 'spar'
// → { created, log: {id, kind, used_on}|null, usage, masteryChecked: [{id, name, step}] }
export const logUsage  = (id, kind)  => client.post(`/clips/${id}/usage`, { kind }).then(r => r.data);
// "방금 기록 취소" — 그 clip 의 내 최신 수동 기록만(아니면 409) → { usage, masteryUnchecked }
export const undoUsage = (id, logId) => client.delete(`/clips/${id}/usage/${logId}`).then(r => r.data);
export const uploadVideo = (id, file, onUploadProgress) => {
  const fd = new FormData();
  fd.append('video', file);
  return client.post(`/clips/${id}/upload-video`, fd, {
    timeout: 30 * 60 * 1000, // 30분
    onUploadProgress,
  }).then(r => r.data);
};
