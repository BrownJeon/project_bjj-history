import client from './client';

export const listClips     = () => client.get('/clips').then(r => r.data);
export const searchClips   = (q, techName) => client.get('/clips/search', { params: { q, tech_name: techName } }).then(r => r.data);
export const createClip    = (data) => client.post('/clips', data).then(r => r.data);
export const updateClip    = (id, data) => client.put(`/clips/${id}`, data).then(r => r.data);
export const deleteClip    = (id) => client.delete(`/clips/${id}`).then(r => r.data);
export const toggleStar    = (id) => client.patch(`/clips/${id}/star`).then(r => r.data);
export const refreshThumb     = (id) => client.post(`/clips/${id}/refresh-thumb`).then(r => r.data);
export const getAnalyzeStatus = ()   => client.get('/clips/analyze-status').then(r => r.data);
