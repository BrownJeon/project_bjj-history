import client from './client';

export const generateVideo = (classId) =>
  client.post(`/classes/${classId}/generate-video`).then(r => r.data);

export const getVideoStatus = (classId) =>
  client.get(`/classes/${classId}/video-status`).then(r => r.data);

export const deleteVideo = (classId) =>
  client.delete(`/classes/${classId}/generated-video`).then(r => r.data);
