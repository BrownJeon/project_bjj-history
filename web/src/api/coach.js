import client from './client';

export const getDiagnosis  = (days = 30) => client.get('/coach/diagnosis', { params: { days } }).then(r => r.data);
export const generateReport = (body) => client.post('/coach/report', body).then(r => r.data);
export const generatePlan   = (body) => client.post('/coach/plan', body).then(r => r.data);
export const askChat        = (body) => client.post('/coach/chat', body).then(r => r.data);
export const listReports    = (type = 'report', limit = 20) => client.get('/coach/reports', { params: { type, limit } }).then(r => r.data);
export const deleteReport   = (id) => client.delete(`/coach/reports/${id}`).then(r => r.data);
export const setFocusDone   = (id, focusIndex, done) => client.patch(`/coach/reports/${id}/focus-done`, { focusIndex, done }).then(r => r.data);
