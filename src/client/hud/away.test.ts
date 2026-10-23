import { describe, expect, it } from 'vitest';
import type { ChronicleEntry } from '../../sim/chronicle.ts';
import { summarizeAway } from './away.ts';
import { filterChronicle } from './Chronicle.tsx';

function entry(kind: ChronicleEntry['kind'], p: number, q = -1, units?: number[]): ChronicleEntry {
  return { tick: 0, kind, p, q, site: -1, platoon: -1, x: 0, y: 0, text: kind, units };
}

describe('summarizeAway', () => {
  it('counts what happened to the viewer and to the war', () => {
    const s = summarizeAway(
      [
        entry('muster', 0, -1, [3, 2, 0, 0, 0, 0, 0, 0, 1]),
        entry('muster', 1, -1, [5]),
        entry('capture', 0, 1),
        entry('capture', 1, 0),
        entry('sack', 2, 0),
        entry('wiped', 0),
        entry('leader', 2, 0),
        entry('monolith', 1),
      ],
      0,
    );
    expect(s).toMatchObject({ mustered: 1, musteredSoldiers: 6, captured: 1, lost: 1, sackedBy: 1, sacked: 0, wiped: 1, leaderChanges: 1, monolithFell: true });
    expect(s.moments.map((e) => e.kind)).toEqual(['sack', 'leader', 'monolith']);
  });

  it('only counts war-wide events for a spectator', () => {
    const s = summarizeAway([entry('muster', 0, -1, [1]), entry('capture', 0, 1)], null);
    expect(s.mustered).toBe(0);
    expect(s.captured).toBe(0);
    expect(s.entries).toBe(2);
  });
});

describe('filterChronicle', () => {
  const log = [entry('muster', 0), entry('capture', 1, 0), entry('rout', 1), entry('sack', 2, 1)];
  it('returns newest first', () => {
    expect(filterChronicle(log, 'all', null).map((e) => e.kind)).toEqual(['sack', 'rout', 'capture', 'muster']);
  });
  it('keeps the viewer as actor or target for "mine"', () => {
    expect(filterChronicle(log, 'mine', 0).map((e) => e.kind)).toEqual(['capture', 'muster']);
    expect(filterChronicle(log, 'mine', null)).toEqual([]);
  });
  it('keeps big moments', () => {
    expect(filterChronicle(log, 'big', null).map((e) => e.kind)).toEqual(['sack', 'capture']);
  });
});
