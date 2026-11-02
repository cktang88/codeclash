import { afterEach, describe, expect, it } from 'vitest';
import { duration, n, weekLabel } from './format.ts';

describe('n', () => {
  it('groups thousands and rounds', () => {
    expect(n(1234.6)).toBe('1,235');
    expect(n(-1500)).toBe('-1,500');
  });
  it('never prints a negative zero', () => {
    expect(n(-0.4)).toBe('0');
    expect(n(-0)).toBe('0');
  });
});

describe('duration', () => {
  it('reads past and present as now', () => {
    expect(duration(0)).toBe('now');
    expect(duration(-5000)).toBe('now');
  });
  it('picks the two largest units', () => {
    expect(duration(59_000)).toBe('59s');
    expect(duration(61_000)).toBe('1m 1s');
    expect(duration(3_600_000 + 120_000)).toBe('1h 2m');
    expect(duration(2 * 86_400_000 + 3 * 3_600_000)).toBe('2d 3h');
  });
});

describe('weekLabel', () => {
  const tz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tz;
  });
  it('names the UTC Monday a week starts on, whatever the viewer’s zone', () => {
    // Monday 2 November 2026, 00:00 UTC: still Sunday the 1st in the Americas.
    const monday = Date.UTC(2026, 10, 2, 0);
    for (const zone of ['America/Los_Angeles', 'UTC', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      expect(weekLabel(monday)).toBe('Nov 2');
    }
  });
});
