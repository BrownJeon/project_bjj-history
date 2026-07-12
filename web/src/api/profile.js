import client from './client';

export const getProfile    = () => client.get('/profile').then(r => r.data);
export const updateProfile = (data) => client.put('/profile', data).then(r => r.data);
export const uploadAvatar  = (formData) => client.post('/profile/avatar', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
}).then(r => r.data);
export const deleteAvatar  = () => client.delete('/profile/avatar').then(r => r.data);

export const listBelts   = () => client.get('/belts').then(r => r.data);
export const createBelt  = (data) => client.post('/belts', data).then(r => r.data);
export const updateBelt  = (id, data) => client.put(`/belts/${id}`, data).then(r => r.data);
export const deleteBelt  = (id) => client.delete(`/belts/${id}`).then(r => r.data);

export const listMemberships   = () => client.get('/memberships').then(r => r.data);
export const createMembership  = (data) => client.post('/memberships', data).then(r => r.data);
export const deleteMembership  = (id) => client.delete(`/memberships/${id}`).then(r => r.data);
