import client from './client';

// 실패 원인 태그 (task-022).
// 목록은 **비활성 태그까지 함께** 온다 — 과거 기록이 참조하는 태그가 비활성화돼도 이름을
// 보여 줘야 기록이 깨지지 않기 때문. 고르는 칩은 화면에서 active 로 걸러 쓴다.
export const listSparCauses  = ()         => client.get('/spar-causes').then(r => r.data);
export const createSparCause = (name)     => client.post('/spar-causes', { name }).then(r => r.data);
export const updateSparCause = (id, data) => client.put(`/spar-causes/${id}`, data).then(r => r.data);
// 삭제가 아니라 비활성화(active=0) — 기록이 id 를 참조 중이라 행을 지우면 끊긴 참조가 된다
export const deleteSparCause = (id)       => client.delete(`/spar-causes/${id}`).then(r => r.data);
