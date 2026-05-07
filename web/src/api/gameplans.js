import client from './client';
export const listGameplans  = () => client.get('/gameplans').then(r => r.data);
export const createGameplan = (data) => client.post('/gameplans', data).then(r => r.data);
export const updateGameplan = (id, data) => client.put(`/gameplans/${id}`, data).then(r => r.data);
export const deleteGameplan = (id) => client.delete(`/gameplans/${id}`).then(r => r.data);
export const toggleGpStar   = (id) => client.patch(`/gameplans/${id}/star`).then(r => r.data);
