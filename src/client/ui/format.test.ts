import { describe, expect, it } from 'vitest';
import { ago, compact, duration, hourLabel, parseInvite, percent, plural } from './format.ts';

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
});
