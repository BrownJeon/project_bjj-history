import client from './client';

export const listClasses    = () => client.get('/classes').then(r => r.data);
export const createClass    = (data) => client.post('/classes', data).then(r => r.data);
export const updateClass    = (id, data) => client.put(`/classes/${id}`, data).then(r => r.data);
export const deleteClass    = (id) => client.delete(`/classes/${id}`).then(r => r.data);
export const toggleTrainedDate = (id, date) => client.patch(`/classes/${id}/toggle-date`, { date }).then(r => r.data);

export const createSpar = (classId, data) => client.post(`/classes/${classId}/spar`, data).then(r => r.data);
export const updateSpar = (classId, sparId, data) => client.put(`/classes/${classId}/spar/${sparId}`, data).then(r => r.data);
export const deleteSpar = (classId, sparId) => client.delete(`/classes/${classId}/spar/${sparId}`).then(r => r.data);
