// 상대 시간 문구 — 관장실 대화 목록·홈 한 줄이 같은 값을 쓴다(task-030).
//
// 🔴 예전에는 `pages/MasterListPage.jsx` 가 이 함수를 export 했고 홈이 **페이지에서** 가져다 썼다.
//    대화 관리가 라우트에서 오버레이로 바뀌면서(D-3) 그 페이지가 사라졌으므로, 화면이 아니라
//    유틸에 둔다. 파싱 못 하는 값은 조용히 빈 문자열 — 홈·내비는 어떤 경우에도 깨지지 않는다.

export function relTime(v) {
  if (!v) return '';
  const t = Date.parse(v);
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 0) return '방금';
  if (diff < 60000) return '방금';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
  if (diff < 172800000) return '어제';
  const d = new Date(t);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default relTime;
