export const TECHNIQUE_CARD_PADDING = 14;

export function paddingForContentHeights(currentHeight, baselineHeight) {
  if (![currentHeight, baselineHeight].every(n => Number.isFinite(n) && n >= 0)) return null;
  const extraHeight = Math.max(0, currentHeight - baselineHeight);
  return {
    paddingBlock: Math.max(0, TECHNIQUE_CARD_PADDING - extraHeight / 2),
    remainingHeight: Math.max(0, extraHeight - TECHNIQUE_CARD_PADDING * 2),
  };
}

// Measure the title/tags at the width they had without the image. The temporary
// clone is inert, hidden, outside normal flow and always removed.
export function measureTechniqueCardPadding(row, content) {
  const slot = row?.querySelector('.technique-illustration-slot');
  if (!slot) return { paddingBlock: TECHNIQUE_CARD_PADDING, remainingHeight: 0 };
  const document = content?.ownerDocument;
  const view = document?.defaultView;
  if (!view || !row.parentElement || !content.isConnected) return null;
  const rect = content.getBoundingClientRect();
  if (rect.width <= 0) return null;
  const gap = Number.parseFloat(view.getComputedStyle(row).columnGap) || 0;
  const baselineWidth = rect.width + slot.getBoundingClientRect().width + gap;
  let clone;
  try {
    clone = content.cloneNode(true);
    clone.removeAttribute('id');
    for (const node of clone.querySelectorAll('[id]')) node.removeAttribute('id');
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('inert', '');
    Object.assign(clone.style, {
      position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden',
      pointerEvents: 'none', flex: 'none', width: `${baselineWidth}px`,
      minWidth: '0', maxWidth: 'none', height: 'auto', minHeight: '0', maxHeight: 'none', margin: '0',
    });
    row.parentElement.appendChild(clone);
    const iconHeight = Math.max(0, ...[...row.children]
      .filter(child => child !== content && child !== slot)
      .map(child => child.getBoundingClientRect().height));
    const baselineHeight = Math.max(iconHeight, clone.getBoundingClientRect().height);
    return paddingForContentHeights(row.getBoundingClientRect().height, baselineHeight);
  } catch {
    return null;
  } finally {
    clone?.remove();
  }
}
