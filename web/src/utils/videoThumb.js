// 영상 썸네일·임베드 헬퍼 (ClipsPage / TechniquesPage 공용)

export function getYtId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function getYtThumb(url) {
  const id = getYtId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

// opts: { start: 초 단위 시작 지점, jsapi: postMessage 시점 이동을 위한 enablejsapi }
// 기존 호출부(인자 1개)와 100% 동일한 결과를 유지한다 — task-007 StudyVideoDetailPage의
// 챕터 클릭 시점 이동(postMessage seekTo)을 위해 옵션만 추가.
export function getYtEmbed(url, opts = {}) {
  const id = getYtId(url);
  if (!id) return null;
  const { start, jsapi, mute } = opts;
  const params = new URLSearchParams({ rel: '0' });
  if (start) params.set('start', String(Math.max(0, Math.floor(start))));
  if (jsapi) params.set('enablejsapi', '1');
  if (mute) params.set('mute', '1'); // 음소거로 시작(사용자가 플레이어에서 켤 수 있다)
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

export function getClipThumb(c) {
  if (!c) return null;
  if (c.platform === 'youtube') return c.thumb_url || getYtThumb(c.url);
  return c.thumb_url || null;
}

export function getPlatformIcon(p) {
  return p === 'youtube' ? '▶' : p === 'instagram' ? '📷' : '🔗';
}

export function getPlatformLabel(p) {
  return p === 'youtube' ? 'YouTube' : p === 'instagram' ? 'Instagram' : '링크';
}
