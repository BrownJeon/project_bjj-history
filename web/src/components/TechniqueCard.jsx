import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import Card from './Card';
import Icon from './Icon';
import Tag from './Tag';
import TechniqueIllustration from './TechniqueIllustration';
import { sumUsage } from '../utils/clipUsage';
import { measureTechniqueCardPadding, TECHNIQUE_CARD_PADDING } from '../utils/techniqueCardLayout';

export default function TechniqueCard({ technique: t, onOpen, onStar }) {
  const rowRef = useRef(null);
  const contentRef = useRef(null);
  const [layout, setLayout] = useState({ paddingBlock: TECHNIQUE_CARD_PADDING, remainingHeight: 0 });
  const positions = t.positions?.length ? t.positions : (t.pos ? [t.pos] : []);
  const positionsKey = JSON.stringify(positions);
  const clipCount = (t.clips || []).length;
  const usage = sumUsage(t.clips);
  const applyLayout = useCallback(next => {
    if (!next) return;
    setLayout(previous => Math.abs(previous.paddingBlock - next.paddingBlock) < 0.05
      && Math.abs(previous.remainingHeight - next.remainingHeight) < 0.05 ? previous : next);
  }, []);
  const handleIllustrationAvailability = useCallback(available => {
    if (!available) {
      applyLayout({ paddingBlock: TECHNIQUE_CARD_PADDING, remainingHeight: 0 });
    } else if (rowRef.current && contentRef.current) {
      applyLayout(measureTechniqueCardPadding(rowRef.current, contentRef.current));
    }
  }, [applyLayout]);

  useLayoutEffect(() => {
    const row = rowRef.current, content = contentRef.current;
    if (!row || !content) return;
    const view = content.ownerDocument.defaultView;
    let stopped = false, frame = null;
    const measure = () => {
      if (stopped) return;
      applyLayout(measureTechniqueCardPadding(row, content));
    };
    const schedule = () => {
      if (stopped || frame !== null) return;
      if (!view.requestAnimationFrame) { measure(); return; }
      frame = view.requestAnimationFrame(() => { frame = null; measure(); });
    };
    measure();
    const observer = view.ResizeObserver ? new view.ResizeObserver(schedule) : null;
    observer?.observe(content);
    view.addEventListener('resize', schedule);
    const fonts = content.ownerDocument.fonts;
    fonts?.addEventListener?.('loadingdone', schedule);
    fonts?.ready?.then(schedule);
    return () => {
      stopped = true;
      observer?.disconnect();
      if (frame !== null) view.cancelAnimationFrame?.(frame);
      view.removeEventListener('resize', schedule);
      fonts?.removeEventListener?.('loadingdone', schedule);
    };
  }, [t.name, positionsKey, clipCount, usage.view, usage.used, applyLayout]);

  return (
    <Card onClick={() => onOpen?.(t)} style={{ paddingBlock: layout.paddingBlock }}>
      <div ref={rowRef} className="technique-card-row"
        data-illustration-unabsorbed-height={layout.remainingHeight > 0.1 ? layout.remainingHeight : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span onClick={event => { event.stopPropagation(); onStar?.(t.id); }}
          style={{ display: 'inline-flex', cursor: 'pointer', padding: 2 }}>
          <Icon name="star" size={18} color={t.starred ? 'var(--amber)' : 'var(--text3)'} filled={!!t.starred} />
        </span>
        <TechniqueIllustration name={t.name} onAvailabilityChange={handleIllustrationAvailability} />
        <div ref={contentRef} className="technique-card-content" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{t.name}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {positions.map((position, index) => <Tag key={index} tone="blue">{position}</Tag>)}
            {clipCount > 0 && <Tag tone="purple">영상 {clipCount}</Tag>}
            {clipCount > 0 && <Tag tone="neutral">👁 {usage.view} · 🥋 {usage.used}</Tag>}
          </div>
        </div>
        <Icon name="chevR" size={18} color="var(--text3)" />
      </div>
    </Card>
  );
}
