const DAY = 86_400_000;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function listTime(iso) {
  const d = new Date(iso);
  const today = startOfDay(Date.now());
  if (d.getTime() >= today) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.getTime() >= today - 6 * DAY) return d.toLocaleDateString([], { weekday: 'short' });
  if (d.getFullYear() === new Date().getFullYear()) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fullTime(iso) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function groupLabel(iso) {
  const t = new Date(iso).getTime();
  const today = startOfDay(Date.now());
  if (t >= today) return 'Today';
  if (t >= today - DAY) return 'Yesterday';
  if (t >= today - 6 * DAY) return 'This week';
  if (t >= today - 30 * DAY) return 'This month';
  return 'Older';
}

export function senderName(from) {
  return from?.name || from?.address || 'Unknown sender';
}

export function initials(from) {
  const s = (from?.name || from?.address || '?').replace(/["']/g, '').trim();
  const parts = s.split(/[\s.@_-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

export function domainOf(address = '') {
  return address.slice(address.lastIndexOf('@') + 1);
}

export function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export const RULE_COLORS = ['#4f8cff', '#2bb39a', '#e0a33a', '#d6587a', '#9a6bff', '#47b4d6', '#e2734a', '#7cb342'];
