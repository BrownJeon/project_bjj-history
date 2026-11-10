import React, { useLayoutEffect, useState } from 'react';
import manifest from '../data/techniqueIllustrations.json';
import { buildIllustrationIndex, findIllustration } from '../utils/techniqueIllustrationModel';
import '../styles/techniqueIllustration.css';

const illustrationIndex = buildIllustrationIndex(manifest);

function IllustrationImage({ illustration, name, large, onAvailabilityChange }) {
  const [failed, setFailed] = useState(false);
  useLayoutEffect(() => {
    onAvailabilityChange?.(!failed);
  }, [failed, onAvailabilityChange]);
  if (failed) return null;
  const size = large ? 224 : 48;
  const image = (
    <img
      className={`technique-illustration technique-illustration--${large ? 'detail' : 'list'}`}
      src={illustration.url}
      alt={`${name} 자세`}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
  if (large) return image;
  // The absolutely positioned image can use the card's existing padding while
  // the title, tags and star keep deciding the row's original height.
  return <span className="technique-illustration-slot">{image}</span>;
}

export default function TechniqueIllustration({ name, large = false, onAvailabilityChange }) {
  const illustration = findIllustration(illustrationIndex, name);
  useLayoutEffect(() => {
    if (!illustration) onAvailabilityChange?.(false);
  }, [illustration, onAvailabilityChange]);
  if (!illustration) return null;
  // A new asset gets its own failure state; a late error from the previous one
  // cannot hide the image of a connected technique opened in the same modal.
  return <IllustrationImage key={illustration.url} illustration={illustration} name={name} large={large}
    onAvailabilityChange={onAvailabilityChange} />;
}
