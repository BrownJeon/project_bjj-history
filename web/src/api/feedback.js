import client from './client';

const clean = (params = {}) => Object.fromEntries(
  Object.entries(params).filter(([, value]) => value != null && value !== ''),
);

// Feedback is independent of class/spar records. Dates remain YYYY-MM-DD strings.
export const listFeedback = (params = {}, options = {}) =>
  client.get('/feedback', { ...options, params: clean(params) }).then(r => r.data);
export const getFeedback = (id, options = {}) =>
  client.get(`/feedback/${id}`, options).then(r => r.data);
export const createFeedback = (body) =>
  client.post('/feedback', body).then(r => r.data);
export const patchFeedback = (id, body) =>
  client.patch(`/feedback/${id}`, body).then(r => r.data);
export const answerFeedback = (id, body) =>
  client.post(`/feedback/${id}/answer`, body).then(r => r.data);
// ask/summarize return persisted pending DTOs; resume via getFeedback, not resubmission.
export const askFeedback = (id, body) =>
  client.post(`/feedback/${id}/ask`, body).then(r => r.data);
export const summarizeFeedback = (id, body) =>
  client.post(`/feedback/${id}/summarize`, body).then(r => r.data);
export const addFeedbackResult = (id, body) =>
  client.post(`/feedback/${id}/results`, body).then(r => r.data);
export const updateFeedbackResult = (id, resultId, body) =>
  client.patch(`/feedback/${id}/results/${encodeURIComponent(resultId)}`, body).then(r => r.data);
export const deleteFeedbackResult = (id, resultId, body) =>
  client.delete(`/feedback/${id}/results/${encodeURIComponent(resultId)}`, { data: body }).then(r => r.data);
export const setFeedbackStar = (id, starred) =>
  client.put(`/feedback/${id}/star`, { starred }).then(r => r.data);
export const getFeedbackRecap = (params = {}, options = {}) =>
  client.get('/feedback/recap', { ...options, params: clean(params) }).then(r => r.data);
// expectedTaskId must be freshly read from getTask; replacement requires an explicit click.
export const setFeedbackTask = (id, body) =>
  client.post(`/feedback/${id}/task`, body).then(r => r.data);
