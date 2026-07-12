import client from './client';
export const listChains      = () => client.get('/chains').then(r => r.data);
export const createChain     = (data) => client.post('/chains', data).then(r => r.data);
export const updateChain     = (id, data) => client.put(`/chains/${id}`, data).then(r => r.data);
export const deleteChain     = (id) => client.delete(`/chains/${id}`).then(r => r.data);
export const aiGenerateChain = (data) => client.post('/chains/ai-generate', data).then(r => r.data);
export const generateChainVideo = (id) =>
  client.post(`/chains/${id}/generate-video`, {}).then(r => r.data);
export const getChainVideoJob = (jobId) =>
  client.get(`/chains/video-jobs/${jobId}`).then(r => r.data);
