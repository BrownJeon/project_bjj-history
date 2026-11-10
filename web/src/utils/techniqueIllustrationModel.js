// task-058: only names explicitly assigned to a ready illustration may resolve.
// No fuzzy matching or fallback illustration: showing another technique is misleading.
export function normalizeIllustrationName(value) {
  return typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
}

function isReadyIllustration(item) {
  if (!item || item.status !== 'ready' || !Array.isArray(item.names)) return false;
  if (typeof item.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) return false;
  if (item.url !== `/technique-illustrations/set-01/${item.slug}.webp`) return false;
  return Number.isInteger(item.width) && item.width > 0 && item.width === item.height;
}

export function buildIllustrationIndex(manifest) {
  const index = new Map();
  if (manifest?.version !== 1 || !Array.isArray(manifest.items)) return index;
  for (const item of manifest.items) {
    if (!isReadyIllustration(item)) continue;
    for (const name of new Set(item.names.map(normalizeIllustrationName).filter(Boolean))) {
      if (!index.has(name)) index.set(name, item);
      else if (index.get(name)?.url !== item.url) index.set(name, null);
    }
  }
  return index;
}

export function findIllustration(index, name) {
  return index.get(normalizeIllustrationName(name)) || null;
}
