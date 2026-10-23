import { describe, expect, it } from 'vitest';
import { ago, compact, duration, hourLabel, localMidnightUtcHour, parseInvite, percent, plural, resetHourOptions, timeLabel } from './format.ts';

describe('format', () => {
  it('formats durations at the right grain', () => {
    expect(duration(45_000)).toBe('45s');
    expect(duration(125_000)).toBe('2m 05s');
    expect(duration(3 * 3600_000 + 12 * 60_000)).toBe('3h 12m');
    expect(duration(-5)).toBe('0s');
  });

  it('formats relative times', () => {
    expect(ago(10_000)).toBe('just now');
    expect(ago(4 * 60_000)).toBe('4m ago');
    expect(ago(2 * 3600_000)).toBe('2h ago');
    expect(ago(3 * 86400_000)).toBe('3d ago');
  });

  it('compacts large numbers', () => {
    expect(compact(1234)).toBe('1,234');
    expect(compact(12_345)).toBe('12.3k');
    expect(compact(2_000_000)).toBe('2M');
  });

  it('labels hours and plurals', () => {
    expect(hourLabel(0)).toBe('12am');
    expect(hourLabel(13)).toBe('1pm');
    expect(plural(1, 'platoon')).toBe('1 platoon');
    expect(plural(2, 'Legionary', 'Legionaries')).toBe('2 Legionaries');
    expect(percent(5, 0)).toBe(0);
    expect(percent(30, 20)).toBe(100);
  });

  it('parses invite links in several shapes', () => {
    expect(parseInvite('https://pushfront.fly.dev/r/night-owls-x7?invite=abc123')).toEqual({ slug: 'night-owls-x7', invite: 'abc123' });
    expect(parseInvite('/r/team-room')).toEqual({ slug: 'team-room', invite: null });
    expect(parseInvite('team-room')).toEqual({ slug: 'team-room', invite: null });
    expect(parseInvite('not a link at all!')).toBeNull();
    expect(parseInvite('')).toBeNull();
  });

  it('labels reset hours in the viewer zone, including half-hour zones, without rounding the UTC hour', () => {
    const tz = process.env.TZ;
    try {
      process.env.TZ = 'Asia/Kolkata';
      const now = new Date(Date.UTC(2026, 9, 23, 12));
      const opts = resetHourOptions(now);
      expect(opts).toHaveLength(24);
      expect(new Set(opts.map((o) => o.utc)).size).toBe(24);
      expect(opts.find((o) => o.utc === 0)!.label).toBe('5:30am (12am UTC)');
      // Sorted by local time: 18 UTC is 11:30pm in Kolkata, so the first choice after midnight is 19 UTC.
      expect(opts[0]).toEqual({ utc: 19, label: '12:30am (7pm UTC)' });
      expect(localMidnightUtcHour(now)).toBe(19);
      process.env.TZ = 'America/New_York';
      expect(resetHourOptions(now).find((o) => o.utc === 0)!.label).toBe('8pm (12am UTC)');
      expect(localMidnightUtcHour(now)).toBe(4);
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
    expect(timeLabel(330)).toBe('5:30am');
    expect(timeLabel(0)).toBe('12am');
    expect(timeLabel(13 * 60 + 45)).toBe('1:45pm');
  });
});
