/** Compact relative time, e.g. "just now", "5m", "3h", "2d", else a date. */
export function relativeTime(value: string | Date): string {
  const then = new Date(value).getTime();
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d`;
  return new Date(value).toLocaleDateString();
}
