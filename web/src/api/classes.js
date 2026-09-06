import client from './client';

export const listClasses    = () => client.get('/classes').then(r => r.data);
// 수업 종류 프리셋 — 목록의 정본은 backend/src/utils/sessionTypes.js 하나뿐이라 서버에서 받아 쓴다
// (프론트가 따로 하드코딩하면 음성분석 테마 자동 채움 판정과 어긋난다, task-021)
export const listSessionTypes = () => client.get('/classes/session-types').then(r => r.data);
export const createClass    = (data) => client.post('/classes', data).then(r => r.data);
export const updateClass    = (id, data) => client.put(`/classes/${id}`, data).then(r => r.data);
export const deleteClass    = (id) => client.delete(`/classes/${id}`).then(r => r.data);
export const toggleTrainedDate = (id, date) => client.patch(`/classes/${id}/toggle-date`, { date }).then(r => r.data);

export const createSpar = (classId, data) => client.post(`/classes/${classId}/spar`, data).then(r => r.data);
export const updateSpar = (classId, sparId, data) => client.put(`/classes/${classId}/spar/${sparId}`, data).then(r => r.data);
export const deleteSpar = (classId, sparId) => client.delete(`/classes/${classId}/spar/${sparId}`).then(r => r.data);
