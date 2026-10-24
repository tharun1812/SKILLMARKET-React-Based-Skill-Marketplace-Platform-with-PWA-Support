import type { Skill } from './types';

const KEY = 'skillmarket:cache:skills';

/** Keeps the last successful marketplace listing so it can still be shown when the network is down. */
export function cacheSkills(skills: Skill[]): void {
  try { localStorage.setItem(KEY, JSON.stringify({ savedAt: new Date().toISOString(), skills })); } catch { /* storage full or blocked */ }
}

export function readCachedSkills(): { savedAt: string; skills: Skill[] } | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as { savedAt: string; skills: Skill[] }) : null;
  } catch {
    return null;
  }
}
