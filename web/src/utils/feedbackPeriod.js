const pad = n => String(n).padStart(2, '0');
const format = d => `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// A calendar date is assembled from components, never parsed as UTC midnight.
function calendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  return format(date) === value ? date : null;
}

export function todayKst(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export const isCalendarDate = value => calendarDate(value) !== null;

export function validatePeriod(from, to) {
  if (!isCalendarDate(from) || !isCalendarDate(to)) return '시작일과 종료일을 입력해 주세요.';
  if (from > to) return '종료일은 시작일보다 빠를 수 없습니다.';
  return '';
}

export function feedbackPeriod(mode = 'month', anchor = todayKst(), custom = {}) {
  if (mode === 'all') return { from: '', to: '', label: '전체 기간' };
  if (mode === 'custom') {
    const error = validatePeriod(custom.from, custom.to);
    if (error) throw new Error(error);
    return { from: custom.from, to: custom.to, label: '직접선택' };
  }
  const base = calendarDate(anchor);
  if (!base) throw new Error('기준 날짜를 확인해 주세요.');
  if (mode === 'month') {
    const first = new Date(base); first.setDate(1);
    const last = new Date(first); last.setMonth(first.getMonth() + 1); last.setDate(0);
    return { from: format(first), to: format(last), label: `${base.getFullYear()}년 ${base.getMonth() + 1}월` };
  }
  if (mode === 'week') {
    base.setDate(base.getDate() - (base.getDay() + 6) % 7);
    const last = new Date(base); last.setDate(base.getDate() + 6);
    return { from: format(base), to: format(last), label: '월요일부터 일요일' };
  }
  throw new Error('지원하지 않는 기간입니다.');
}

export function shiftPeriodAnchor(mode, anchor, direction) {
  const base = calendarDate(anchor);
  if (!base || ![-1, 1].includes(direction)) throw new Error('기간 이동 값을 확인해 주세요.');
  if (mode === 'month') { base.setDate(1); base.setMonth(base.getMonth() + direction); }
  else if (mode === 'week') base.setDate(base.getDate() + direction * 7);
  else return anchor;
  return format(base);
}
