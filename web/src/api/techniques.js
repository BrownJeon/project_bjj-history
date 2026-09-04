import client from './client';

export const listTechniques  = () => client.get('/techniques').then(r => r.data);
export const createTechnique = (data) => client.post('/techniques', data).then(r => r.data);
export const updateTechnique = (id, data) => client.put(`/techniques/${id}`, data).then(r => r.data);
export const deleteTechnique = (id) => client.delete(`/techniques/${id}`).then(r => r.data);
export const toggleTechStar  = (id) => client.patch(`/techniques/${id}/star`).then(r => r.data);
export const getPositions    = () => client.get('/techniques/positions').then(r => r.data);
export const deletePosition  = (name) => client.delete(`/techniques/positions/${encodeURIComponent(name)}`).then(r => r.data);
export const renamePosition  = (name, newName) => client.put(`/techniques/positions/${encodeURIComponent(name)}`, { newName }).then(r => r.data);
