// Formatting helpers shared by the HUD and pages. Pure.

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3h 12m", "12m 05s", "45s". */
export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

/** "just now", "4m ago", "2h ago", "3d ago". */
export function ago(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** 1234 → "1,234"; 12345 → "12.3k". */
export function compact(n: number): string {
  const v = Math.round(n);
  if (Math.abs(v) < 10_000) return v.toLocaleString('en-US');
  if (Math.abs(v) < 1_000_000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** Clock time of a timestamp in the viewer's zone, "14:05". */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The viewer-local hour at which a UTC hour falls, for room reset times. */
export function localHourOfUtc(utcHour: number, now = new Date()): number {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour));
  return d.getHours();
}

export function utcHourOfLocal(localHour: number, now = new Date()): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), localHour);
  return d.getUTCHours();
}

/** Viewer-local minutes after midnight at which a whole UTC hour falls (zones like +5:30 land on the half hour). */
export function localMinutesOfUtcHour(utcHour: number, now = new Date()): number {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour));
  return d.getHours() * 60 + d.getMinutes();
}

/** Minutes after midnight as "5am" or "5:30am". */
export function timeLabel(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const mm = m % 60;
  const label = hourLabel(Math.floor(m / 60));
  return mm === 0 ? label : label.replace(/(am|pm)$/, `:${String(mm).padStart(2, '0')}$1`);
}

/**
 * Choices for a room's daily reset. Rooms reset on a whole UTC hour, so the value is the UTC hour and the label is
 * when that falls for the viewer, sorted by local time. Choosing by local hour instead would round a half-hour
 * zone's choice and drift the reset by an hour on every save.
 */
export function resetHourOptions(now = new Date()): { utc: number; label: string }[] {
  return Array.from({ length: 24 }, (_, utc) => ({ utc, local: localMinutesOfUtcHour(utc, now) }))
    .sort((a, b) => a.local - b.local)
    .map(({ utc, local }) => ({ utc, label: `${timeLabel(local)} (${hourLabel(utc)} UTC)` }));
}

/** The UTC hour whose local time is nearest the viewer's midnight: the default reset for a new room. */
export function localMidnightUtcHour(now = new Date()): number {
  return resetHourOptions(now)[0]!.utc;
}

export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? 'am' : 'pm';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${suffix}`;
}

export function percent(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.max(0, Math.min(100, (part / whole) * 100));
}

/** Slug and invite code from a pasted invite link or "slug?invite=code". */
export function parseInvite(text: string): { slug: string; invite: string | null } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed, 'https://pushfront.invalid');
  } catch {
    return null;
  }
  const m = /\/r\/([a-z0-9-]{3,48})\/?$/.exec(url.pathname) ?? /^([a-z0-9-]{3,48})$/.exec(url.pathname.replace(/^\//, ''));
  if (!m) return null;
  return { slug: m[1]!, invite: url.searchParams.get('invite') };
}
