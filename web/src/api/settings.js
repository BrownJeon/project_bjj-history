import client from './client';

export const getSettings = () => client.get('/settings').then(r => r.data);
export const saveSettings = (data) => client.post('/settings', data).then(r => r.data);

export const getInstagramCookieStatus = () =>
  client.get('/settings/instagram-cookie').then(r => r.data);

export const uploadInstagramCookie = (file) => {
  const fd = new FormData();
  fd.append('cookie', file);
  return client.post('/settings/instagram-cookie', fd).then(r => r.data);
};

export const deleteInstagramCookie = () =>
  client.delete('/settings/instagram-cookie').then(r => r.data);
