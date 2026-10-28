export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

export function formatDateTime(value) {
  if (!value) return '—';
  return dateTime.format(new Date(value));
}

export function formatDate(value) {
  if (!value) return '—';
  return dateOnly.format(new Date(value));
}

export function formatRelative(value, now = Date.now()) {
  if (!value) return '—';
  const diff = Math.round((new Date(value).getTime() - now) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(diff, 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return formatDate(value);
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}

export function humanize(value) {
  if (!value) return '';
  const text = String(value).replace(/[_.]/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
