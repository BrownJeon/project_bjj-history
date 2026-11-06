import { usageOf } from './clipUsage.js';

export const CLIP_FILTERS = [
  ['all', '전체'], ['recent', '최신순', 'clock'], ['star', '즐겨찾기', 'star'], ['pinned', '고정', 'pin'],
  ['unused', '안 써본 것'], ['mostUsed', '많이 쓴 순'],
];

const normalize = value => String(value || '').toLowerCase().normalize('NFC');
export const clipTechniqueNames = clip => clip.tech_names?.length ? clip.tech_names : (clip.tech_name ? [clip.tech_name] : []);

export function rankedClipTechniques(clips = []) {
  const counts = new Map();
  for (const clip of clips) for (const name of clipTechniqueNames(clip)) {
    const value = String(name || '').trim();
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

/** The existing ClipsPage semantics, shared by the five-item feedback picker. */
export function filterClips(clips = [], { search = '', filter = 'all', techFilter = '' } = {}) {
  let items = [...clips];
  if (filter === 'star') items = items.filter(c => c.starred);
  if (filter === 'pinned') items = items.filter(c => c.pinned);
  if (filter === 'recent') items.sort((a, b) => (b.pinned || 0) - (a.pinned || 0) || (b.id || 0) - (a.id || 0));
  if (filter === 'unused') items = items.filter(c => usageOf(c).used === 0);
  if (filter === 'mostUsed') items.sort((a, b) => usageOf(b).used - usageOf(a).used);
  if (techFilter) items = items.filter(c => clipTechniqueNames(c).includes(techFilter));
  if (search) {
    const query = normalize(search);
    items = items.filter(c => [c.title, c.tech_name, c.description, ...(c.tags || [])]
      .some(value => normalize(value).includes(query)));
  }
  return items;
}

export function paginateClips(items = [], requestedPage = 1, pageSize = 5) {
  const size = Math.max(1, Math.floor(Number(pageSize) || 5));
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(requestedPage) || 1)));
  return {
    items: items.slice((page - 1) * size, page * size), page, pages, total: items.length,
    from: items.length ? (page - 1) * size + 1 : 0, to: Math.min(items.length, page * size),
  };
}
