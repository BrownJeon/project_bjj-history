import client from './client';
export const listChains      = () => client.get('/chains').then(r => r.data);
export const createChain     = (data) => client.post('/chains', data).then(r => r.data);
export const updateChain     = (id, data) => client.put(`/chains/${id}`, data).then(r => r.data);
export const deleteChain     = (id) => client.delete(`/chains/${id}`).then(r => r.data);
export const aiGenerateChain = (data) => client.post('/chains/ai-generate', data).then(r => r.data);
export const downloadChainVideo = (id) =>
  client.get(`/chains/${id}/video`, { responseType: 'blob', timeout: 300000 }).then(r => r.data);
