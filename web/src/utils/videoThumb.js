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

export function getYtEmbed(url) {
  const id = getYtId(url);
  return id ? `https://www.youtube.com/embed/${id}?rel=0` : null;
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
