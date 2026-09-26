const numberFormat = new Intl.NumberFormat('en-US');
const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** "1 chunk", "12 chunks". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "yesterday", then a plain date after a week. */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  const elapsed = now - time;
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return relativeFormat.format(-Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return relativeFormat.format(-Math.floor(elapsed / HOUR), 'hour');
  if (elapsed < 7 * DAY) return relativeFormat.format(-Math.floor(elapsed / DAY), 'day');
  return dateFormat.format(time);
}

/** Full date and time, for tooltips and `title` attributes. */
export function formatDateTime(iso: string): string {
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? '' : dateTimeFormat.format(time);
}
