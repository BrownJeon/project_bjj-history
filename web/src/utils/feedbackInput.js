export const SITUATION_LABELS = {
  class: '수업',
  spar: '스파링',
  video_review: '영상 복기',
  solo_practice: '개인 연습',
  technique_discussion: '기술토론',
  other: '기타',
};

export function situationSelectionOf(record) {
  return Array.isArray(record.situationOptions)
    ? { options: record.situationOptions.slice().sort(), other: record.situationOther ?? '' }
    : { options: null, other: record.situation ?? '' };
}

export function feedbackSituationLabels({ options, other }) {
  if (options === null) return other ? [other] : [];
  return Object.entries(SITUATION_LABELS).filter(([key]) => options.includes(key)).map(([key, label]) => key === 'other' && other ? `${label} · ${other}` : label);
}

export function savedSituationLabels(record) {
  const selection = situationSelectionOf(record);
  return selection.options === null ? [] : feedbackSituationLabels(selection);
}

export const feedbackTechniqueName = value => typeof value === 'string' ? value : value?.name ?? '';
