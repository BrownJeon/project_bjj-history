import client from './client';

export const listTechniques  = () => client.get('/techniques').then(r => r.data);
export const createTechnique = (data) => client.post('/techniques', data).then(r => r.data);
export const updateTechnique = (id, data) => client.put(`/techniques/${id}`, data).then(r => r.data);
export const deleteTechnique = (id) => client.delete(`/techniques/${id}`).then(r => r.data);
export const toggleTechStar  = (id) => client.patch(`/techniques/${id}/star`).then(r => r.data);
// task-054 — 관장 설명·앞뒤 연결·함께 보는 기술(읽기 전용). 404 = 본인 기술 아님/없음.
export const getTechniqueReference = (id) => client.get(`/techniques/${encodeURIComponent(id)}/reference`).then(r => r.data);
export const getPositions    = ({ from, to } = {}) => client.get('/techniques/positions', {
  params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
}).then(r => r.data);
export const deletePosition  = (name) => client.delete(`/techniques/positions/${encodeURIComponent(name)}`).then(r => r.data);
export const renamePosition  = (name, newName) => client.put(`/techniques/positions/${encodeURIComponent(name)}`, { newName }).then(r => r.data);
export const getTags    = () => client.get('/techniques/tags').then(r => r.data);
export const deleteTag  = (name) => client.delete(`/techniques/tags/${encodeURIComponent(name)}`).then(r => r.data);
export const renameTag  = (name, newName) => client.put(`/techniques/tags/${encodeURIComponent(name)}`, { newName }).then(r => r.data);
