import client from './client';

export const listPicks          = ()             => client.get('/picks').then(r => r.data);
export const createPick         = (data)         => client.post('/picks', data).then(r => r.data);
export const deletePick         = (id)           => client.delete(`/picks/${id}`).then(r => r.data);
export const recommendTechnique = (clipId)       => client.post(`/clips/${clipId}/recommend`).then(r => r.data);
export const updatePickFeedback = (id, data)     => client.patch(`/picks/${id}/feedback`, data).then(r => r.data);
