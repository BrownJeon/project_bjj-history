import client from './client';
export const enhanceMemo  = (data) => client.post('/enhance-memo/enhance', data).then(r => r.data);
export const searchVideos = (text) => client.post('/enhance-memo/videos', { text }).then(r => r.data);
export const analyzeVideo = (url)  => client.post('/enhance-memo/analyze-video', { url }).then(r => r.data);
