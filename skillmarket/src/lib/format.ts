export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const units: [number, string][] = [[60 * 60 * 24 * 30, 'mo'], [60 * 60 * 24 * 7, 'w'], [60 * 60 * 24, 'd'], [60 * 60, 'h'], [60, 'm']];
  for (const [size, label] of units) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${label} ago`;
  }
  return 'just now';
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function formatRating(avg: number | null, count: number): string {
  return avg === null || count === 0 ? 'No reviews yet' : `${avg.toFixed(1)} (${count})`;
}
