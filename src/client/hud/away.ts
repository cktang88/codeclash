import type { ChronicleEntry } from '../../sim/chronicle.ts';

export interface AwaySummary {
  entries: number;
  mustered: number;
  musteredSoldiers: number;
  wiped: number;
  routed: number;
  captured: number;
  lost: number;
  sacked: number;
  sackedBy: number;
  leaderChanges: number;
  monolithFell: boolean;
  /** The few biggest moments, oldest first. */
  moments: ChronicleEntry[];
}

const MOMENT_KINDS = new Set(['conquest', 'rising', 'victory', 'dragon', 'clash', 'leader', 'champion', 'cry']);

/** What happened while the viewer was away, from the chronicle since they left. */
export function summarizeAway(entries: readonly ChronicleEntry[], viewerP: number | null): AwaySummary {
  const s: AwaySummary = {
    entries: entries.length, mustered: 0, musteredSoldiers: 0, wiped: 0, routed: 0, captured: 0, lost: 0,
    sacked: 0, sackedBy: 0, leaderChanges: 0, monolithFell: false, moments: [],
  };
  for (const e of entries) {
    const mine = viewerP !== null && e.p === viewerP;
    const againstMe = viewerP !== null && e.q === viewerP;
    switch (e.kind) {
      case 'muster':
        if (mine) {
          s.mustered++;
          s.musteredSoldiers += (e.units ?? []).reduce((a, b) => a + b, 0);
        }
        break;
      case 'wiped':
        if (mine) s.wiped++;
        break;
      case 'rout':
        if (mine) s.routed++;
        break;
      case 'capture':
        if (mine) s.captured++;
        if (againstMe) s.lost++;
        break;
      case 'conquest':
        if (mine) s.sacked++;
        if (againstMe) s.sackedBy++;
        break;
      case 'leader':
        s.leaderChanges++;
        break;
      case 'victory':
        s.monolithFell = true;
        break;
    }
  }
  s.moments = entries.filter((e) => MOMENT_KINDS.has(e.kind)).slice(-5);
  return s;
}

export function lastSeenKey(slug: string): string {
  return `pf:lastSeen:${slug}`;
}

export function readNumber(key: string): number | null {
  try {
    const v = localStorage.getItem(key);
    return v !== null && /^\d+$/.test(v) ? Number(v) : null;
  } catch {
    return null;
  }
}

export function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // Private windows and blocked storage only lose the "while you were away" recap.
  }
}
