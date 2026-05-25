import client from './client';

export const getSettings = () => client.get('/api/settings').then(r => r.data);
export const saveSettings = (data) => client.post('/api/settings', data).then(r => r.data);
